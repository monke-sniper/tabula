"""Forecast router — runs the selected forecaster against a session's data."""
from __future__ import annotations

import logging
import threading
import time
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import forecaster as fc

router = APIRouter()
logger = logging.getLogger("tabula.forecast")

_forecast_cancelled = False
_cancel_lock = threading.Lock()


def _get_df(session_id: str) -> pd.DataFrame:
    from routers.data import sessions
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found. Upload data first.")
    return sessions[session_id]


def _is_id_like_column(name: str) -> bool:
    n = name.lower()
    return n in {"id", "idx", "index"} or n.endswith("_id") or n.startswith("id_")


def _pick_target(df: pd.DataFrame, requested: Optional[str]) -> str:
    if requested and requested in df.columns:
        return requested
    numeric = [c for c in df.select_dtypes(include=["number"]).columns.tolist() if not _is_id_like_column(c)]
    if not numeric:
        # fall back to anything numeric
        numeric = df.select_dtypes(include=["number"]).columns.tolist()
    if not numeric:
        raise HTTPException(status_code=400, detail="No numeric columns found")
    return numeric[0]


def _get_timestamp_column(df: pd.DataFrame) -> Optional[str]:
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            return col
    return None


@router.post("/forecast/cancel")
def cancel_forecast():
    global _forecast_cancelled
    with _cancel_lock:
        _forecast_cancelled = True
    logger.info("Forecast cancellation requested")
    return {"status": "cancelled"}


class ForecastRequestBody(BaseModel):
    target_column: Optional[str] = None
    horizon: int = Field(24, ge=1, le=2000)
    num_samples: int = Field(50, ge=1, le=500)
    model_name: str = "amazon/chronos-t5-small"
    top_p: float = 0.9
    top_k: int = 50
    temperature: float = 1.0


@router.post("/forecast/{session_id}")
def run_forecast(session_id: str, body: ForecastRequestBody):
    global _forecast_cancelled
    with _cancel_lock:
        _forecast_cancelled = False

    df = _get_df(session_id)
    target_col = _pick_target(df, body.target_column)

    ts_col = _get_timestamp_column(df)
    if ts_col is not None:
        ts_values = df[ts_col].astype(str).tolist()
    else:
        ts_values = [str(i) for i in range(len(df))]

    series_full = df[target_col].astype(float)
    series_clean = series_full.dropna()
    # keep only the timestamps that correspond to non-null values
    keep_idx = series_full.notna().values
    timestamps = [t for t, k in zip(ts_values, keep_idx) if k]
    series_list = series_clean.tolist()

    if len(series_list) < 16:
        raise HTTPException(
            status_code=400,
            detail=f"not enough data points ({len(series_list)}); need at least 16",
        )
    if body.horizon >= len(series_list):
        raise HTTPException(
            status_code=400,
            detail=f"horizon ({body.horizon}) must be smaller than series length ({len(series_list)})",
        )

    split_point = len(series_list) - body.horizon
    history = series_list[:split_point]
    actuals = series_list[split_point:]

    # season detection happens on full timestamps; it's a structural property
    seasonality = fc._detect_seasonality(timestamps)

    # Validate model_name against the registry or known families
    from routers.finetune import _load_model_registry
    registry = _load_model_registry()
    registered_names = {m["name"] for m in registry.get("models", [])}
    known = (
        fc._is_chronos_family(body.model_name)
        or body.model_name in {"statistical-fallback", "fallback", "naive", "seasonal-naive"}
        or body.model_name in registered_names
        or body.model_name == registry.get("active", "")
    )
    if not known:
        raise HTTPException(
            status_code=400,
            detail=(
                f"unknown model '{body.model_name}'. "
                f"Use an amazon/chronos-* name, google/timesfm-*, "
                f"a registered custom model, or 'statistical-fallback'."
            ),
        )

    req = fc.ForecastRequest(
        series=history,
        timestamps=timestamps[:split_point],
        horizon=body.horizon,
        num_samples=body.num_samples,
        model_name=body.model_name,
        top_p=body.top_p,
        top_k=body.top_k,
        temperature=body.temperature,
        seasonality=seasonality,
    )

    try:
        engine = fc.get_forecaster(body.model_name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"unknown model: {body.model_name} ({e})")

    # cancellation poll during predict
    def _cancelled() -> bool:
        global _forecast_cancelled
        return _forecast_cancelled

    t0 = time.time()
    try:
        # cancellation is a soft best-effort — chronos doesn't yield mid-run
        if _cancelled():
            raise HTTPException(status_code=200, detail={"status": "cancelled"})
        result = engine.predict(req)
    except fc.InsufficientDataError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except fc.ForecastEngineError as e:
        logger.exception("forecast failed")
        raise HTTPException(status_code=500, detail=f"forecast engine error: {e}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("forecast crashed")
        raise HTTPException(status_code=500, detail=f"forecast failed: {e}")

    if _cancelled():
        raise HTTPException(status_code=200, detail={"status": "cancelled"})

    # build result rows — historical + forecast
    rows: list[dict] = []
    for i, ts in enumerate(timestamps[:split_point]):
        rows.append({
            "timestamp": str(ts),
            "actual": round(float(history[i]), 6),
            "is_forecast": False,
            "iteration_values": [],
            "median": round(float(history[i]), 6),
            "lower_2_5": round(float(history[i]), 6),
            "lower_10": round(float(history[i]), 6),
            "lower_25": round(float(history[i]), 6),
            "upper_75": round(float(history[i]), 6),
            "upper_90": round(float(history[i]), 6),
            "upper_97_5": round(float(history[i]), 6),
        })
    for h in range(body.horizon):
        actual = round(float(actuals[h]), 6) if h < len(actuals) else None
        rows.append({
            "timestamp": str(result.timestamps[h]) if h < len(result.timestamps) else f"t+{h+1}",
            "actual": actual,
            "is_forecast": True,
            "iteration_values": [round(float(v), 6) for v in result.iterations[h]],
            "median": round(float(result.median[h]), 6),
            "lower_2_5": round(float(result.lower_2_5[h]), 6),
            "lower_10": round(float(result.lower_10[h]), 6),
            "lower_25": round(float(result.lower_25[h]), 6),
            "upper_75": round(float(result.upper_75[h]), 6),
            "upper_90": round(float(result.upper_90[h]), 6),
            "upper_97_5": round(float(result.upper_97_5[h]), 6),
        })

    # metrics against held-out actuals
    med = np.array([r["median"] for r in rows if r["actual"] is not None], dtype=np.float64)
    act = np.array([r["actual"] for r in rows if r["actual"] is not None], dtype=np.float64)
    if act.size:
        mae = float(np.mean(np.abs(act - med)))
        rmse = float(np.sqrt(np.mean((act - med) ** 2)))
        mape = float(np.mean(np.abs((act - med) / (np.abs(act) + 1e-10))) * 100)
    else:
        mae = rmse = mape = 0.0

    elapsed = int((time.time() - t0) * 1000)
    logger.info(
        "forecast complete: engine=%s model=%s device=%s n=%d h=%d samples=%d in %dms",
        engine.name, result.model_used, result.device, len(series_list), body.horizon, body.num_samples, elapsed,
    )

    return {
        "results": rows,
        "metrics": {"mae": round(mae, 6), "rmse": round(rmse, 6), "mape": round(mape, 6)},
        "iterations": body.num_samples,
        "prediction_length": body.horizon,
        "model_used": result.model_used,
        "device": result.device,
        "inference_ms": result.inference_ms,
        "engine": engine.name,
        "seasonality": seasonality,
        "target_column": target_col,
        "elapsed_ms": elapsed,
    }

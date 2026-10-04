"""Forecast router — runs the selected forecaster against a session's data."""
from __future__ import annotations

import logging
import os
import time
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import forecaster as fc
from routers.data import get_session, pick_target
from routers.finetune import MODELS_DIR, _load_model_registry

router = APIRouter()
logger = logging.getLogger("tabula.forecast")

MIN_POINTS = 16
BANDS = ("median", "lower_2_5", "lower_10", "lower_25", "upper_75", "upper_90", "upper_97_5")


def _get_timestamp_column(df: pd.DataFrame) -> Optional[str]:
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            return col
    return None


def _resolve_engine(model_name: str) -> fc.Forecaster:
    """Validate the model name against built-ins and the fine-tune registry."""
    if fc._is_chronos_family(model_name) or model_name in fc.FALLBACK_NAMES:
        return fc.get_forecaster(model_name)
    registry = _load_model_registry()
    if any(m["name"] == model_name for m in registry.get("models", [])):
        return fc.get_forecaster(model_name, os.path.join(MODELS_DIR, model_name))
    raise HTTPException(
        status_code=400,
        detail=(
            f"unknown model '{model_name}'. Use an amazon/chronos-t5-* name, "
            f"a fine-tuned model from the registry, or 'statistical-fallback'."
        ),
    )


def _row(ts: str, actual: Optional[float], bands: dict[str, float], is_forecast: bool,
         iterations: list[float], is_anchor: bool = False) -> dict:
    return {
        "timestamp": str(ts),
        "actual": actual,
        "is_forecast": is_forecast,
        "is_anchor": is_anchor,
        "iteration_values": iterations,
        **{k: round(float(v), 6) for k, v in bands.items()},
    }


class ForecastRequestBody(BaseModel):
    target_column: Optional[str] = None
    horizon: int = Field(24, ge=1, le=2000)
    num_samples: int = Field(50, ge=1, le=500)
    model_name: str = "amazon/chronos-t5-small"
    top_p: float = Field(0.9, gt=0, le=1)
    top_k: int = Field(50, ge=0)
    temperature: float = Field(1.0, gt=0)


@router.post("/forecast/{session_id}")
def run_forecast(session_id: str, body: ForecastRequestBody):
    df = get_session(session_id)
    target_col = pick_target(df, body.target_column)

    ts_col = _get_timestamp_column(df)
    ts_values = df[ts_col].astype(str).tolist() if ts_col is not None else [str(i) for i in range(len(df))]

    series_full = df[target_col].astype(float)
    keep = series_full.notna().values
    # keep only the timestamps that correspond to non-null values
    timestamps = [t for t, k in zip(ts_values, keep) if k]
    series_list = series_full[keep].tolist()

    if len(series_list) < MIN_POINTS:
        raise HTTPException(
            status_code=400,
            detail=f"not enough data points ({len(series_list)}); need at least {MIN_POINTS}",
        )
    if body.horizon > len(series_list) - MIN_POINTS:
        raise HTTPException(
            status_code=400,
            detail=f"horizon ({body.horizon}) too large: at most {len(series_list) - MIN_POINTS} "
                   f"so {MIN_POINTS} points remain as history",
        )

    split_point = len(series_list) - body.horizon
    history = series_list[:split_point]
    actuals = series_list[split_point:]

    # season detection happens on full timestamps; it's a structural property
    seasonality = fc._detect_seasonality(timestamps)
    engine = _resolve_engine(body.model_name)

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

    t0 = time.time()
    try:
        result = engine.predict(req)
    except fc.InsufficientDataError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except fc.ForecastEngineError as e:
        logger.exception("forecast failed")
        raise HTTPException(status_code=500, detail=f"forecast engine error: {e}")
    except Exception as e:
        logger.exception("forecast crashed")
        raise HTTPException(status_code=500, detail=f"forecast failed: {e}")

    # historical rows: every band collapses onto the actual value
    rows = [
        _row(ts, round(float(v), 6), {k: v for k in BANDS}, False, [])
        for ts, v in zip(timestamps[:split_point], history)
    ]
    # anchor: synthetic t=0 forecast point at the last historical timestamp
    # with zero band width, so the fan emerges from the last actual and widens
    # outward (Bank of England / NYT fan-chart convention).
    last = round(float(history[-1]), 6)
    rows.append(_row(timestamps[split_point - 1], None, {k: last for k in BANDS}, True, [last], is_anchor=True))
    for h in range(body.horizon):
        rows.append(_row(
            result.timestamps[h] if h < len(result.timestamps) else f"t+{h+1}",
            round(float(actuals[h]), 6),
            {k: getattr(result, k)[h] for k in BANDS},
            True,
            [round(float(v), 6) for v in result.iterations[h]],
        ))

    # metrics against held-out actuals
    act = np.array(actuals, dtype=np.float64)
    med = np.array(result.median[:len(act)], dtype=np.float64)
    mae = float(np.mean(np.abs(act - med)))
    rmse = float(np.sqrt(np.mean((act - med) ** 2)))
    mape = float(np.mean(np.abs((act - med) / (np.abs(act) + 1e-10))) * 100)

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

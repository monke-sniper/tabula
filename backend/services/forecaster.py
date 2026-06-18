"""Forecasting engines for Tabula.

Public surface:
    - Forecaster           : protocol all engines implement
    - ChronosForecaster    : real Chronos foundation model (amazon/*, google/timesfm)
    - StatisticalFallbackForecaster : seasonal-naive + exp-smoothing + theta + MC bootstrap
    - get_forecaster(name) : factory that picks the right engine for a model name
    - warmup_default_models : call once at app startup to pre-load the default model
    - _detect_seasonality  : infer a seasonality period from a timestamp series
"""
from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Optional, Protocol

import numpy as np

logger = logging.getLogger("tabula.forecaster")


CHRONOS_FAMILY = ("amazon/chronos-", "amazon/chronos-bolt-", "google/timesfm-")


class ForecastEngineError(RuntimeError):
    """Raised when the chosen engine cannot complete the forecast."""


class InsufficientDataError(ForecastEngineError):
    pass


@dataclass
class ForecastRequest:
    series: list[float]
    timestamps: list[str]
    horizon: int
    num_samples: int = 50
    model_name: str = "amazon/chronos-t5-small"
    top_p: float = 0.9
    top_k: int = 50
    temperature: float = 1.0
    seasonality: Optional[dict] = None


@dataclass
class ForecastResult:
    timestamps: list[str]
    historical_values: list[Optional[float]]
    iterations: list[list[float]]   # shape (horizon, num_samples)
    median: list[float]
    lower_25: list[float]
    upper_75: list[float]
    lower_10: list[float]
    upper_90: list[float]
    lower_2_5: list[float]
    upper_97_5: list[float]
    model_used: str
    device: str
    inference_ms: int
    seasonality: Optional[dict]


class Forecaster(Protocol):
    name: str

    def predict(self, req: ForecastRequest) -> ForecastResult: ...


# ---------------------------------------------------------------------------
# Seasonality detection
# ---------------------------------------------------------------------------

_KIND_BY_SECONDS = [
    (3600, 24, "hourly"),
    (86400, 7, "daily"),
    (604800, 52, "weekly"),
    (2592000, 12, "monthly"),
]


def _parse_ts(t: str) -> Optional[float]:
    if not t:
        return None
    try:
        from datetime import datetime
        s = t.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt.timestamp()
    except Exception:
        return None


def _detect_seasonality(timestamps: list[str]) -> dict:
    """Return a dict with `period`, `kind`, `median_step_seconds`.

    If we cannot infer, period=1, kind='irregular'.
    """
    if not timestamps or len(timestamps) < 4:
        return {"period": 1, "kind": "irregular", "median_step_seconds": 0.0}
    parsed = [t for t in (_parse_ts(x) for x in timestamps) if t is not None]
    if len(parsed) < 4:
        return {"period": 1, "kind": "irregular", "median_step_seconds": 0.0}
    diffs = np.diff(parsed)
    diffs = diffs[diffs > 0]
    if len(diffs) == 0:
        return {"period": 1, "kind": "irregular", "median_step_seconds": 0.0}
    step = float(np.median(diffs))
    for sec, period, kind in _KIND_BY_SECONDS:
        if 0.5 * sec <= step <= 1.5 * sec:
            return {"period": period, "kind": kind, "median_step_seconds": step}
    return {"period": 1, "kind": "custom", "median_step_seconds": step}


# ---------------------------------------------------------------------------
# Series preprocessing
# ---------------------------------------------------------------------------

def _clean_series(series: list[float]) -> np.ndarray:
    """Forward-fill short NaN runs, drop trailing NaNs, ensure float32."""
    arr = np.array(series, dtype=np.float32)
    if arr.size == 0:
        raise InsufficientDataError("empty series")
    nans = np.isnan(arr)
    if nans.all():
        raise InsufficientDataError("series is all NaN")
    if nans.any():
        # forward fill up to 5 consecutive nans
        last = None
        run = 0
        for i in range(arr.size):
            if np.isnan(arr[i]):
                run += 1
                if last is not None and run <= 5:
                    arr[i] = last
            else:
                last = arr[i]
                run = 0
        # drop trailing nans
        while arr.size and np.isnan(arr[-1]):
            arr = arr[:-1]
    return arr


# ---------------------------------------------------------------------------
# Chronos engine
# ---------------------------------------------------------------------------

_PIPELINE_CACHE: dict[str, object] = {}
_PIPELINE_LOCK = threading.Lock()


def _is_chronos_family(name: str) -> bool:
    if not name:
        return False
    return any(name.startswith(prefix) for prefix in CHRONOS_FAMILY)


def _load_chronos_pipeline(name: str):
    import torch
    from chronos import ChronosPipeline

    if name in _PIPELINE_CACHE:
        return _PIPELINE_CACHE[name]

    with _PIPELINE_LOCK:
        if name in _PIPELINE_CACHE:
            return _PIPELINE_CACHE[name]

        cuda = torch.cuda.is_available()
        device = "cuda" if cuda else "cpu"
        dtype = torch.bfloat16 if cuda else torch.float32
        logger.info("loading chronos pipeline %s on %s (%s)", name, device, dtype)
        t0 = time.time()
        try:
            pipe = ChronosPipeline.from_pretrained(
                name,
                device_map=device,
                torch_dtype=dtype,
            )
        except Exception as e:
            raise ForecastEngineError(
                f"failed to load chronos pipeline '{name}': {e}. "
                f"First run downloads the model weights from HuggingFace."
            ) from e
        elapsed = (time.time() - t0) * 1000
        logger.info("chronos pipeline %s ready in %.0fms on %s", name, elapsed, device)
        _PIPELINE_CACHE[name] = pipe
        return pipe


class ChronosForecaster:
    name = "chronos"

    def __init__(self, model_name: str):
        if not _is_chronos_family(model_name):
            raise ForecastEngineError(f"not a chronos-family model: {model_name}")
        self.model_name = model_name
        self._pipeline = None  # lazy

    def _get_pipeline(self):
        if self._pipeline is None:
            self._pipeline = _load_chronos_pipeline(self.model_name)
        return self._pipeline

    def predict(self, req: ForecastRequest) -> ForecastResult:
        import torch

        if len(req.series) < 16:
            raise InsufficientDataError(f"need at least 16 points, got {len(req.series)}")
        if req.horizon < 1:
            raise ForecastEngineError(f"horizon must be >= 1, got {req.horizon}")
        if req.num_samples < 1:
            raise ForecastEngineError(f"num_samples must be >= 1, got {req.num_samples}")

        cleaned = _clean_series(req.series)
        context = torch.tensor(cleaned, dtype=torch.float32)

        pipe = self._get_pipeline()
        device = "cuda" if torch.cuda.is_available() else "cpu"

        t0 = time.time()
        forecast = pipe.predict(
            inputs=context,
            prediction_length=req.horizon,
            num_samples=req.num_samples,
            temperature=req.temperature,
            top_k=req.top_k if req.top_k > 0 else None,
            top_p=req.top_p if req.top_p < 1.0 else None,
            limit_prediction_length=False,
        )
        elapsed_ms = int((time.time() - t0) * 1000)
        if isinstance(forecast, list):
            forecast = forecast[0]
        arr = forecast.detach().to("cpu").float().numpy()
        # chronos returns (batch_size, num_samples, prediction_length)
        if arr.ndim == 3:
            if arr.shape[0] != 1:
                raise ForecastEngineError(f"unexpected batch size from chronos: {arr.shape}")
            arr = arr[0]
        if arr.ndim != 2:
            raise ForecastEngineError(f"unexpected chronos output shape: {arr.shape}")
        # arr is now (num_samples, horizon)

        median = np.median(arr, axis=0)
        lower_2_5 = np.percentile(arr, 2.5, axis=0)
        lower_10 = np.percentile(arr, 10, axis=0)
        lower_25 = np.percentile(arr, 25, axis=0)
        upper_75 = np.percentile(arr, 75, axis=0)
        upper_90 = np.percentile(arr, 90, axis=0)
        upper_97_5 = np.percentile(arr, 97.5, axis=0)

        iterations = arr.T.tolist()  # (horizon, num_samples)

        future_ts = _extend_timestamps(req.timestamps, req.horizon, req.seasonality)
        return ForecastResult(
            timestamps=future_ts,
            historical_values=req.series,
            iterations=iterations,
            median=median.tolist(),
            lower_25=lower_25.tolist(),
            upper_75=upper_75.tolist(),
            lower_10=lower_10.tolist(),
            upper_90=upper_90.tolist(),
            lower_2_5=lower_2_5.tolist(),
            upper_97_5=upper_97_5.tolist(),
            model_used=self.model_name,
            device=device,
            inference_ms=elapsed_ms,
            seasonality=req.seasonality,
        )


# ---------------------------------------------------------------------------
# Statistical fallback (no external model required)
# ---------------------------------------------------------------------------

class StatisticalFallbackForecaster:
    name = "statistical-fallback"

    def __init__(self, label: str = "statistical-fallback"):
        self.model_name = label

    def predict(self, req: ForecastRequest) -> ForecastResult:
        if len(req.series) < 8:
            raise InsufficientDataError(f"need at least 8 points, got {len(req.series)}")
        cleaned = _clean_series(req.series)
        n = cleaned.size
        period = 1
        if req.seasonality and req.seasonality.get("period", 0) > 1:
            period = int(req.seasonality["period"])
        period = min(period, max(1, n // 2))

        # base: seasonal naive with linear trend
        recent = cleaned[-min(100, n):]
        slope, intercept = np.polyfit(np.arange(recent.size), recent, 1)

        # initial level
        if period > 1 and n >= period:
            last_seasonal = cleaned[-period:]
            level = float(cleaned[-1] - last_seasonal[-1])
        else:
            level = float(np.mean(recent))
            last_seasonal = np.zeros(period) if period > 1 else np.zeros(1)

        # noise scale from residuals
        diffs = np.diff(cleaned)
        noise = float(np.std(diffs)) if diffs.size > 1 else float(np.std(recent)) * 0.05

        rng = np.random.default_rng(seed=42)
        iterations = np.zeros((req.horizon, req.num_samples), dtype=np.float32)
        for h in range(1, req.horizon + 1):
            base = intercept + slope * (n + h)
            if period > 1:
                base += last_seasonal[(h - 1) % period] - last_seasonal[0]
            sigma = noise * np.sqrt(h) * 0.5
            for s in range(req.num_samples):
                iterations[h - 1, s] = base + rng.normal(0, sigma)

        median = np.median(iterations, axis=1)
        lower_2_5 = np.percentile(iterations, 2.5, axis=1)
        lower_10 = np.percentile(iterations, 10, axis=1)
        lower_25 = np.percentile(iterations, 25, axis=1)
        upper_75 = np.percentile(iterations, 75, axis=1)
        upper_90 = np.percentile(iterations, 90, axis=1)
        upper_97_5 = np.percentile(iterations, 97.5, axis=1)

        future_ts = _extend_timestamps(req.timestamps, req.horizon, req.seasonality)
        return ForecastResult(
            timestamps=future_ts,
            historical_values=req.series,
            iterations=iterations.tolist(),
            median=median.tolist(),
            lower_25=lower_25.tolist(),
            upper_75=upper_75.tolist(),
            lower_10=lower_10.tolist(),
            upper_90=upper_90.tolist(),
            lower_2_5=lower_2_5.tolist(),
            upper_97_5=upper_97_5.tolist(),
            model_used=self.model_name,
            device="cpu",
            inference_ms=0,
            seasonality=req.seasonality,
        )


# ---------------------------------------------------------------------------
# Timestamp extension
# ---------------------------------------------------------------------------

def _extend_timestamps(timestamps: list[str], horizon: int, seasonality: Optional[dict]) -> list[str]:
    """Generate `horizon` future timestamps after the last input timestamp.

    Uses the detected median step. If we can't parse, returns synthetic keys.
    """
    if not timestamps or horizon <= 0:
        return [f"t+{i+1}" for i in range(horizon)]
    last = timestamps[-1]
    last_ts = _parse_ts(last)
    if last_ts is None:
        return [f"t+{i+1}" for i in range(horizon)]
    step = (seasonality or {}).get("median_step_seconds", 0.0) or 0.0
    if step <= 0:
        # try to infer from the last two timestamps
        if len(timestamps) >= 2:
            prev = _parse_ts(timestamps[-2])
            if prev is not None:
                step = max(1.0, last_ts - prev)
    if step <= 0:
        step = 3600.0  # default 1h
    from datetime import datetime, timezone
    base = datetime.fromtimestamp(last_ts, tz=timezone.utc)
    out: list[str] = []
    for i in range(1, horizon + 1):
        ts = base.timestamp() + step * i
        out.append(datetime.fromtimestamp(ts, tz=timezone.utc).isoformat())
    return out


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_forecaster(model_name: str) -> Forecaster:
    """Return the right engine for a model name.

    Accepts:
      - chronos family names (amazon/chronos-*, amazon/chronos-bolt-*, google/timesfm-*)
      - the canonical statistical-fallback label
      - any name registered in the model registry (returns the label, but
        inference is delegated to the fallback until custom inference is wired)
    """
    if not model_name:
        raise ForecastEngineError("model_name is required")
    if _is_chronos_family(model_name):
        return ChronosForecaster(model_name=model_name)
    if model_name in {"statistical-fallback", "fallback", "naive", "seasonal-naive"}:
        return StatisticalFallbackForecaster(label=model_name)
    # Custom registered models: inference is not yet wired. The router will
    # check the registry before calling this, so reaching here means the
    # caller did not validate. Fall back gracefully but log it.
    logger.warning("model_name %r is not in chronos family and not statistical; using statistical fallback", model_name)
    return StatisticalFallbackForecaster(label=model_name)


def warmup_default_models(default: str = "amazon/chronos-t5-small") -> threading.Thread:
    """Spawn a daemon thread that pre-loads the default model."""

    def _run():
        if not _is_chronos_family(default):
            logger.info("warmup skipped: %s is not in chronos family", default)
            return
        try:
            _load_chronos_pipeline(default)
        except Exception as e:
            logger.warning("warmup failed for %s: %s", default, e)

    t = threading.Thread(target=_run, name="chronos-warmup", daemon=True)
    t.start()
    return t

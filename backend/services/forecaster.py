"""Forecasting engines for Tabula.

Public surface:
    - Forecaster           : protocol all engines implement
    - ChronosForecaster    : real Chronos foundation model (amazon/chronos-t5-*)
    - LSTMForecaster       : LSTM trained on the Fine-Tune page (MC-dropout sampling)
    - StatisticalFallbackForecaster : linear trend + seasonal profile + noise paths
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
from datetime import datetime, timedelta
from typing import Optional, Protocol

import numpy as np

logger = logging.getLogger("tabula.forecaster")


# Only the T5 family loads through ChronosPipeline; bolt / chronos-2 need
# different pipelines with a quantile (not sample-path) output.
CHRONOS_FAMILY = ("amazon/chronos-t5-",)
FALLBACK_NAMES = {"statistical-fallback", "fallback", "naive", "seasonal-naive"}

LSTM_HIDDEN = 64
LSTM_LAYERS = 2
LSTM_DEFAULT_SEQ_LEN = 64


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


def _build_result(paths: np.ndarray, req: ForecastRequest, model_used: str, device: str, inference_ms: int) -> ForecastResult:
    """Summarise sample paths of shape (horizon, num_samples) into a ForecastResult."""
    pct = lambda q: np.percentile(paths, q, axis=1).tolist()  # noqa: E731
    return ForecastResult(
        timestamps=_extend_timestamps(req.timestamps, req.horizon, req.seasonality),
        historical_values=req.series,
        iterations=paths.tolist(),
        median=np.median(paths, axis=1).tolist(),
        lower_25=pct(25),
        upper_75=pct(75),
        lower_10=pct(10),
        upper_90=pct(90),
        lower_2_5=pct(2.5),
        upper_97_5=pct(97.5),
        model_used=model_used,
        device=device,
        inference_ms=inference_ms,
        seasonality=req.seasonality,
    )


# ---------------------------------------------------------------------------
# Seasonality detection
# ---------------------------------------------------------------------------

_KIND_BY_SECONDS = [
    (3600, 24, "hourly"),
    (86400, 7, "daily"),
    (604800, 52, "weekly"),
    (2592000, 12, "monthly"),
]


def _parse_dt(t: str) -> Optional[datetime]:
    if not t:
        return None
    try:
        return datetime.fromisoformat(t.replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_ts(t: str) -> Optional[float]:
    dt = _parse_dt(t)
    return dt.timestamp() if dt else None


def _detect_seasonality(timestamps: list[str]) -> dict:
    """Return a dict with `period`, `kind`, `median_step_seconds`.

    If we cannot infer, period=1, kind='irregular'.
    """
    irregular = {"period": 1, "kind": "irregular", "median_step_seconds": 0.0}
    if not timestamps or len(timestamps) < 4:
        return irregular
    parsed = [t for t in (_parse_ts(x) for x in timestamps) if t is not None]
    if len(parsed) < 4:
        return irregular
    diffs = np.diff(parsed)
    diffs = diffs[diffs > 0]
    if len(diffs) == 0:
        return irregular
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
    return bool(name) and any(name.startswith(prefix) for prefix in CHRONOS_FAMILY)


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

    def predict(self, req: ForecastRequest) -> ForecastResult:
        import torch

        if len(req.series) < 16:
            raise InsufficientDataError(f"need at least 16 points, got {len(req.series)}")

        context = torch.tensor(_clean_series(req.series), dtype=torch.float32)
        pipe = _load_chronos_pipeline(self.model_name)
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

        return _build_result(arr.T, req, self.model_name, device, elapsed_ms)


# ---------------------------------------------------------------------------
# Fine-tuned LSTM engine
# ---------------------------------------------------------------------------

def build_lstm(hidden_size: int = LSTM_HIDDEN, num_layers: int = LSTM_LAYERS):
    """One-step-ahead LSTM shared by the Fine-Tune trainer and inference."""
    import torch.nn as nn

    class TimeSeriesModel(nn.Module):
        def __init__(self):
            super().__init__()
            self.lstm = nn.LSTM(1, hidden_size, num_layers=num_layers, batch_first=True, dropout=0.1)
            self.fc = nn.Sequential(
                nn.Linear(hidden_size, 32),
                nn.ReLU(),
                nn.Dropout(0.1),
                nn.Linear(32, 1),
            )

        def forward(self, x):
            out, _ = self.lstm(x)
            return self.fc(out[:, -1, :]).squeeze(-1)

    return TimeSeriesModel()


class LSTMForecaster:
    """Autoregressive roll-out of a fine-tuned LSTM.

    Sample paths combine MC dropout (model uncertainty) with Gaussian noise
    scaled to the model's one-step residuals on the input history.
    """
    name = "lstm-finetuned"

    def __init__(self, model_name: str, model_dir: str):
        self.model_name = model_name
        self.model_path = os.path.join(model_dir, "model.pt")

    def predict(self, req: ForecastRequest) -> ForecastResult:
        import torch

        if not os.path.exists(self.model_path):
            raise ForecastEngineError(f"weights not found for '{self.model_name}' ({self.model_path})")
        ckpt = torch.load(self.model_path, map_location="cpu", weights_only=True)
        cfg = ckpt.get("config", {})
        model = build_lstm(cfg.get("hidden_size", LSTM_HIDDEN), cfg.get("num_layers", LSTM_LAYERS))
        model.load_state_dict(ckpt["model_state_dict"])

        values = _clean_series(req.series).astype(np.float64)
        mean, std = values.mean(), values.std() or 1.0
        z = torch.tensor((values - mean) / std, dtype=torch.float32)
        seq_len = max(2, min(cfg.get("seq_len", LSTM_DEFAULT_SEQ_LEN), z.numel() - 2))

        t0 = time.time()
        with torch.no_grad():
            model.eval()
            n_windows = min(200, z.numel() - seq_len)
            windows = torch.stack([z[-seq_len - i - 1:-i - 1] for i in range(n_windows)]).unsqueeze(-1)
            targets = torch.stack([z[-i - 1] for i in range(n_windows)])
            sigma = float((model(windows) - targets).std()) if n_windows > 1 else 0.1

            model.train()  # keep dropout on: MC dropout across sample paths
            ctx = z[-seq_len:].repeat(req.num_samples, 1).unsqueeze(-1)
            steps = []
            for _ in range(req.horizon):
                nxt = model(ctx) + torch.randn(req.num_samples) * sigma
                steps.append(nxt)
                ctx = torch.cat([ctx[:, 1:], nxt.view(-1, 1, 1)], dim=1)
        elapsed_ms = int((time.time() - t0) * 1000)

        paths = torch.stack(steps).numpy().astype(np.float64) * std + mean  # (horizon, samples)
        return _build_result(paths, req, self.model_name, "cpu", elapsed_ms)


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
        cleaned = _clean_series(req.series).astype(np.float64)
        n = cleaned.size
        period = int((req.seasonality or {}).get("period", 1) or 1)
        period = max(1, min(period, n // 2))

        # linear trend over a recent window covering at least two seasons
        recent = cleaned[-min(n, max(100, 2 * period)):]
        x = np.arange(recent.size)
        slope, intercept = np.polyfit(x, recent, 1)
        resid = recent - (intercept + slope * x)

        h = np.arange(1, req.horizon + 1)
        base = intercept + slope * (recent.size - 1 + h)
        if period > 1:
            season = resid[-period:]
            base = base + season[(h - 1) % period]

        # noise grows with sqrt(h), scaled from the one-step volatility
        diffs = np.diff(cleaned)
        noise = float(np.std(diffs)) if diffs.size > 1 else float(np.std(recent)) * 0.05
        sigma = noise * np.sqrt(h) * 0.5

        rng = np.random.default_rng(seed=42)
        paths = base[:, None] + rng.normal(0.0, 1.0, (req.horizon, req.num_samples)) * sigma[:, None]
        return _build_result(paths, req, self.model_name, "cpu", 0)


# ---------------------------------------------------------------------------
# Timestamp extension
# ---------------------------------------------------------------------------

def _extend_timestamps(timestamps: list[str], horizon: int, seasonality: Optional[dict]) -> list[str]:
    """Generate `horizon` future timestamps after the last input timestamp.

    Uses the detected median step and keeps the input's format (date-only vs
    datetime, naive vs tz-aware). If we can't parse, returns synthetic keys.
    """
    synthetic = [f"t+{i+1}" for i in range(horizon)]
    if not timestamps or horizon <= 0:
        return synthetic
    last = _parse_dt(timestamps[-1])
    if last is None:
        return synthetic
    step = (seasonality or {}).get("median_step_seconds", 0.0) or 0.0
    if step <= 0 and len(timestamps) >= 2:
        prev = _parse_dt(timestamps[-2])
        if prev is not None:
            step = (last - prev).total_seconds()
    if step <= 0:
        step = 3600.0  # default 1h
    date_only = len(timestamps[-1]) == 10
    out = []
    for i in range(1, horizon + 1):
        ts = last + timedelta(seconds=step * i)
        out.append(ts.date().isoformat() if date_only else ts.isoformat(sep=" "))
    return out


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_forecaster(model_name: str, model_dir: Optional[str] = None) -> Forecaster:
    """Return the right engine for a model name.

    Accepts:
      - chronos T5 names (amazon/chronos-t5-*)
      - the statistical-fallback labels
      - a fine-tuned model, when `model_dir` points at its saved weights
    """
    if not model_name:
        raise ForecastEngineError("model_name is required")
    if _is_chronos_family(model_name):
        return ChronosForecaster(model_name=model_name)
    if model_name in FALLBACK_NAMES:
        return StatisticalFallbackForecaster(label=model_name)
    if model_dir:
        return LSTMForecaster(model_name, model_dir)
    raise ForecastEngineError(f"unknown model '{model_name}'")


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

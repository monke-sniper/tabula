import logging
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from typing import Optional

router = APIRouter()
logger = logging.getLogger("tabula.forecast")

_forecast_cancelled = False


def _get_df(session_id: str) -> pd.DataFrame:
    from routers.data import sessions
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found. Upload data first.")
    return sessions[session_id]


@router.post("/forecast/cancel")
def cancel_forecast():
    global _forecast_cancelled
    _forecast_cancelled = True
    logger.info("Forecast cancellation requested")
    return {"status": "cancelled"}


@router.post("/forecast/{session_id}")
def run_forecast(
    session_id: str,
    iterations: int = 10,
    prediction_length: int = 24,
    target_column: Optional[str] = None,
):
    global _forecast_cancelled
    _forecast_cancelled = False

    df = _get_df(session_id)

    if target_column and target_column in df.columns:
        target_col = target_column
    else:
        numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
        if not numeric_cols:
            raise HTTPException(status_code=400, detail="No numeric columns found")
        target_col = numeric_cols[0]

    series = df[target_col].dropna().values
    if len(series) < prediction_length + 10:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough data points ({len(series)}) for prediction length {prediction_length}",
        )

    split_point = len(series) - prediction_length
    historical = series[:split_point]
    actual_forecast = series[split_point:]

    ts_col = None
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            ts_col = col
            break

    if ts_col:
        timestamps = df[ts_col].values
    else:
        timestamps = list(range(len(series)))

    window_size = min(48, len(historical) // 4)
    if window_size < 5:
        window_size = min(5, len(historical))

    recent = historical[-window_size:]
    mean_val = np.mean(recent)
    std_val = np.std(recent)
    trend = np.polyfit(range(len(historical[-min(100, len(historical)):])),
                       historical[-min(100, len(historical)):], 1)[0]

    residuals = np.diff(historical[-min(200, len(historical)):])
    noise_std = np.std(residuals) if len(residuals) > 1 else std_val * 0.1

    results = []

    # Historical points (actual values, no forecasts)
    for i in range(len(historical)):
        ts = str(timestamps[i]) if i < len(timestamps) else str(i)
        results.append({
            'timestamp': ts,
            'actual': round(float(historical[i]), 6),
            'is_forecast': False,
            'iteration_values': [],
            'median': round(float(historical[i]), 6),
            'lower_10': round(float(historical[i]), 6),
            'upper_90': round(float(historical[i]), 6),
            'lower_25': round(float(historical[i]), 6),
            'upper_75': round(float(historical[i]), 6),
        })

    # Forecast points
    for t in range(prediction_length):
        if _forecast_cancelled:
            logger.info("Forecast cancelled at step %d/%d", t + 1, prediction_length)
            raise HTTPException(status_code=499, detail="Forecast cancelled by user")

        step = t + 1
        base = mean_val + trend * step

        iteration_values = []
        for i in range(iterations):
            np.random.seed(42 + t * 1000 + i)
            noise = np.random.normal(0, noise_std * np.sqrt(step) * 0.5)
            seasonal = 0.1 * std_val * np.sin(2 * np.pi * t / min(24, prediction_length))
            iter_val = base + noise + seasonal
            iteration_values.append(round(float(iter_val), 6))

        iteration_values.sort()

        median_val = float(np.median(iteration_values))
        lower_10 = float(np.percentile(iteration_values, 10))
        upper_90 = float(np.percentile(iteration_values, 90))
        lower_25 = float(np.percentile(iteration_values, 25))
        upper_75 = float(np.percentile(iteration_values, 75))

        actual_val = float(actual_forecast[t]) if t < len(actual_forecast) else None
        ts = str(timestamps[split_point + t]) if split_point + t < len(timestamps) else str(t)

        results.append({
            'timestamp': ts,
            'actual': actual_val,
            'is_forecast': True,
            'iteration_values': iteration_values,
            'median': median_val,
            'lower_10': lower_10,
            'upper_90': upper_90,
            'lower_25': lower_25,
            'upper_75': upper_75,
        })

    actuals = np.array([r['actual'] for r in results if r['actual'] is not None])
    medians = np.array([r['median'] for r in results if r['actual'] is not None])

    if len(actuals) > 0:
        mae = float(np.mean(np.abs(actuals - medians)))
        rmse = float(np.sqrt(np.mean((actuals - medians) ** 2)))
        mape = float(np.mean(np.abs((actuals - medians) / (np.abs(actuals) + 1e-10))) * 100)
    else:
        mae = rmse = mape = 0.0

    logger.info("Forecast complete: %d iterations, %d steps", iterations, prediction_length)

    return {
        'results': results,
        'metrics': {
            'mae': round(mae, 6),
            'rmse': round(rmse, 6),
            'mape': round(mape, 6),
        },
        'iterations': iterations,
        'prediction_length': prediction_length,
    }

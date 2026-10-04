import io
import os
import sys

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app  # noqa: E402
from services import forecaster as fc  # noqa: E402

client = TestClient(app)  # no `with`: skips the chronos warmup lifespan


def _upload(df: pd.DataFrame, name: str = "data.csv") -> dict:
    buf = io.BytesIO(df.to_csv(index=False).encode())
    res = client.post("/upload", files={"file": (name, buf, "text/csv")})
    assert res.status_code == 200, res.text
    return res.json()


def _linear(n: int = 300) -> pd.DataFrame:
    return pd.DataFrame({
        "timestamp": pd.date_range("2024-01-01", periods=n, freq="h"),
        "value": np.arange(n, dtype=float) * 2.0 + 10.0,
        "label": ["a"] * n,
    })


def _forecast(session_id: str, **body) -> object:
    return client.post(f"/forecast/{session_id}", json={"model_name": "statistical-fallback", **body})


def test_upload_detects_timestamp_and_numeric_columns():
    data = _upload(_linear(50))
    assert data["rows"] == 50
    assert data["timestamp_column"] == "timestamp"
    assert data["numeric_columns"] == ["value"]
    assert len(data["preview"]) == 50


def test_eda_survives_constant_and_empty_numeric_columns():
    df = pd.DataFrame({"const": [1.0] * 20, "empty": [np.nan] * 20, "x": np.arange(20.0)})
    sid = _upload(df)["session_id"]
    res = client.get(f"/eda/{sid}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["correlations"]["const"]["x"] is None  # NaN correlation -> null, not a 500
    empty = next(c for c in body["column_info"] if c["name"] == "empty")
    assert empty["mean"] is None


def test_fallback_extrapolates_trend_on_long_series():
    sid = _upload(_linear(300))["session_id"]
    res = _forecast(sid, horizon=24, num_samples=20)
    assert res.status_code == 200, res.text
    body = res.json()
    # a perfectly linear series must be forecast (almost) exactly
    assert body["metrics"]["mae"] < 1e-3
    forecast = [r for r in body["results"] if r["is_forecast"] and not r["is_anchor"]]
    assert len(forecast) == 24


def test_future_timestamps_continue_naive_series():
    sid = _upload(_linear(100))["session_id"]
    body = _forecast(sid, horizon=4, num_samples=5).json()
    future = [r["timestamp"] for r in body["results"] if r["is_forecast"] and not r["is_anchor"]]
    # holdout rows start right after the history, same format, no tz shift
    assert future[0] == "2024-01-05 00:00:00"
    assert future[-1] == "2024-01-05 03:00:00"


def test_forecast_rejects_bad_input():
    sid = _upload(_linear(40))["session_id"]
    assert _forecast(sid, target_column="label").status_code == 400
    assert _forecast(sid, target_column="missing").status_code == 400
    assert _forecast(sid, horizon=30).status_code == 400  # leaves < 16 points of history
    assert _forecast(sid, model_name="amazon/chronos-bolt-small").status_code == 400
    assert client.post("/forecast/nope", json={}).status_code == 404


def test_clip_caps_outliers_to_tukey_fences():
    values = list(np.linspace(0, 10, 40)) + [1000.0]
    sid = _upload(pd.DataFrame({"v": values}))["session_id"]
    assert client.get(f"/eda/{sid}").json()["outliers"][0]["count"] == 1
    res = client.post(f"/sessions/{sid}/clean", json={"strategy": "clip", "columns": ["v"]})
    assert res.status_code == 200, res.text
    assert len(res.json()["preview"]) == 41
    assert client.get(f"/eda/{sid}").json()["outliers"] == []


def test_upload_path_reads_absolute_file(tmp_path):
    path = tmp_path / "series.csv"
    _linear(30).to_csv(path, index=False)
    res = client.post("/upload-path", json={"path": str(path)})
    assert res.status_code == 200, res.text
    assert res.json()["filename"] == "series.csv"
    assert client.post("/upload-path", json={"path": str(tmp_path / "nope.csv")}).status_code == 400


@pytest.mark.parametrize("origin,allowed", [
    ("http://localhost:5173", True),
    ("http://127.0.0.1:4173", True),
    ("https://evil.example.com", False),
])
def test_cors_only_allows_local_origins(origin, allowed):
    res = client.get("/health", headers={"Origin": origin})
    assert ("access-control-allow-origin" in res.headers) is allowed


def test_finetune_then_forecast_with_custom_model(tmp_path, monkeypatch):
    pytest.importorskip("torch")
    import time
    from routers import finetune, forecast
    monkeypatch.setattr(finetune, "MODELS_DIR", str(tmp_path))
    monkeypatch.setattr(forecast, "MODELS_DIR", str(tmp_path))

    df = _linear(120)
    df["value"] = np.sin(np.arange(120) / 5.0) * 10 + 50
    sid = _upload(df)["session_id"]
    res = client.post("/finetune/start", json={
        "session_id": sid, "custom_name": "test-lstm", "target_column": "value", "num_epochs": 2,
    })
    assert res.status_code == 200, res.text

    deadline = time.time() + 120
    while (status := client.get("/finetune/status").json())["status"] in ("starting", "training"):
        assert time.time() < deadline, "training timed out"
        time.sleep(0.2)
    assert status["status"] == "completed", status["message"]
    assert client.get("/models").json()["models"][0]["target_column"] == "value"

    res = client.post(f"/forecast/{sid}", json={"model_name": "test-lstm", "horizon": 12, "num_samples": 10})
    assert res.status_code == 200, res.text
    assert res.json()["engine"] == "lstm-finetuned"


def test_lstm_forecaster_rolls_out_saved_weights(tmp_path):
    torch = pytest.importorskip("torch")
    model = fc.build_lstm()
    torch.save({
        "model_state_dict": model.state_dict(),
        "config": {"hidden_size": fc.LSTM_HIDDEN, "num_layers": fc.LSTM_LAYERS, "seq_len": 16},
    }, tmp_path / "model.pt")

    series = list(np.sin(np.arange(80) / 4.0) * 5 + 20)
    req = fc.ForecastRequest(series=series, timestamps=[], horizon=6, num_samples=8)
    result = fc.LSTMForecaster("my-lstm", str(tmp_path)).predict(req)
    assert np.array(result.iterations).shape == (6, 8)
    assert np.isfinite(result.median).all()
    assert result.timestamps == [f"t+{i}" for i in range(1, 7)]

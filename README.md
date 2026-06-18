<div align="center">

# Tabula

**Model-agnostic forecasting app with a trading terminal aesthetic.**

[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.135-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Chronos](https://img.shields.io/badge/Chronos-2.2-FF8800)](https://github.com/amazon-science/chronos-forecasting)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.11-EE4C2C?logo=pytorch&logoColor=white)](https://pytorch.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

Upload data → Explore patterns → Forecast with probability-weighted fan charts → Fine-tune custom models.

</div>

---

## Features

| Feature | Description |
|---------|-------------|
| **File Upload** | Drag-and-drop or file picker for CSV, JSON, Excel, Parquet; keyboard shortcut `Ctrl+O` |
| **Load Sample** | One-click `test_data.csv` loader from the empty dashboard |
| **EDA Suite** | Stats, distributions (with mean/σ overlay), correlations, missing values, IQR outliers |
| **EDA Clean** | Per-column `FILL` / `DROP` / `FILL MEAN` actions wired to `/data/clean` |
| **Real Chronos forecasts** | `amazon/chronos-t5-*`, `amazon/chronos-bolt-*`, `google/timesfm-*` via `ChronosPipeline` |
| **Fan chart** | 50/80/95% nested cyan CI bands + Gaussian-opacity iteration fan + orange median |
| **Multiple views** | `FAN` (default), `BANDS`, `LINES` — switchable from the engine control bar |
| **Seasonality detection** | Auto-detects hourly (24), daily (7), weekly (52), monthly (12) periods |
| **Statistical fallback** | Seasonal-naive + linear trend + MC bootstrap, used when no Chronos model is selected |
| **Sampling controls** | `SAMPLES` (2–200), `HORIZON` (1–500), `T` (temperature), `TOP_P`, `TOP_K` |
| **Fine-Tuning** | PyTorch LSTM via background thread; loss curve chart, ETA, device display |
| **Model Registry** | Save, list, select, **use**, **delete** custom models; engine-tagged rows |
| **Active model sync** | Selecting a model on the Models page immediately updates the engine dropdown |
| **Session management** | `GET /sessions` lists active sessions; `DELETE /sessions/{id}` cleans file + memory |
| **Health probe** | `GET /health` polled every 10s; sidebar + top bar status dot driven by it |
| **Toast bus** | Dark terminal-styled toasts for upload / forecast / training / clean events |
| **Keyboard shortcuts** | `F1`/`F2`/`F3` to switch pages, `Ctrl+O` to open file picker |
| **Trading Terminal UI** | Dark interface with monospace data, amber/cyan accents, Bloomberg-style density |

## Quick Start

### Prerequisites

- **Node.js** 18+ and **npm**
- **Python** 3.10+ with pip
- A C++ build toolchain (needed by `tokenizers`/`safetensors` on first install)

### Install

```bash
git clone https://github.com/monke-sniper/tabula.git
cd tabula

# Frontend
npm install

# Backend (creates .venv automatically if missing)
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt     # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # Unix
cd ..
```

### Run

```bash
# One-shot dev launcher (handy on Windows)
npm start

# Or run them separately:
npm run backend        # uvicorn on :8420
npm run dev            # vite on :5173
npm run electron:dev   # electron desktop
```

Open **http://localhost:5173**.

> **First-run note:** the default Chronos model (`amazon/chronos-t5-small`) downloads
> from HuggingFace on first startup (~250MB cached in `~/.cache/huggingface/`).
> The backend pre-warms it in a daemon thread so the first request is fast.

## Usage

1. **Upload** — drag a CSV/JSON/Excel/Parquet file onto the upload zone, or `Ctrl+O`.
2. **Explore** — switch the EDA tabs (`STATS`, `DIST`, `CORR`, `NULL`, `OUT`).
3. **Clean** (optional) — in `NULL` or `OUT`, click `FILL` / `DROP` / `FILL MEAN` per column.
4. **Forecast** — set `TGT`, `MODEL`, `SAMPLES`, `HORIZON`, choose a `VIEW` (Fan/Bands/Lines), click `RUN`.
5. **Fine-Tune** — go to `Fine-Tune`, set a name, click `START TRAINING`. Watch the loss curve.
6. **Switch Models** — on `Models`, click `USE` to make a model active and bounce back to the dashboard.

## Architecture

```
tabula/
├── electron/                 Electron main + preload
├── scripts/                  Dev launcher + e2e tests
│   ├── start.mjs             unified backend+frontend launcher
│   ├── boot_test.ps1         boots uvicorn, dumps all OpenAPI routes
│   └── e2e_test.ps1          13-step E2E suite (multipart upload, EDA,
│                             statistical+chronos forecast, finetune, etc.)
├── backend/
│   ├── main.py               FastAPI app + lifespan warmup
│   ├── services/
│   │   └── forecaster.py     Chronos + statistical engines
│   └── routers/              data / forecast / finetune
└── src/                      React frontend
    ├── components/           Sidebar, FileUpload, DataTable, EDAPanel,
    │                          FanChart, ForecastChart, Toaster,
    │                          KeyboardShortcuts
    ├── pages/                Dashboard / FineTune / Models
    └── lib/                  api, context, toast, types
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Desktop** | Electron 33 |
| **Frontend** | React 19 · TypeScript 5.7 · Vite 6 · Tailwind 3 |
| **Charts** | Plotly.js (via react-plotly.js) |
| **Backend** | Python FastAPI · uvicorn |
| **Data** | pandas · pyarrow · openpyxl |
| **Forecast** | `chronos-forecasting` 2.2 (Amazon Chronos T5/Bolt + Google TimesFM) |
| **ML** | PyTorch · transformers · accelerate |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/` | service info |
| `GET`  | `/health` | liveness + loaded model list |
| `POST` | `/upload` | upload data file (multipart) |
| `POST` | `/upload-path` | upload by local file path (used by "Load Sample") |
| `GET`  | `/eda/{session_id}` | column info, distributions, correlations, missing, outliers |
| `POST` | `/forecast/{session_id}` | run N-sample forecast (body: model_name, horizon, num_samples, top_p, top_k, temperature) |
| `POST` | `/forecast/cancel` | cancel in-flight forecast (returns 200) |
| `POST` | `/finetune/start` | start training (LSTM in daemon thread) |
| `GET`  | `/finetune/status` | poll training status + loss |
| `GET`  | `/finetune/loss-history` | per-step loss history for the chart |
| `GET`  | `/models` | list registered custom models + active |
| `PUT`  | `/models/active` | set the active model name |
| `DELETE` | `/models/{name}` | delete a custom model + its directory |
| `GET`  | `/sessions` | list active sessions with age |
| `DELETE` | `/sessions/{id}` | clean session (file + memory) |
| `POST` | `/sessions/{id}/clean` | apply a cleaning strategy (`drop`/`mean`/`zero`/`ffill`) |

## License

MIT

# Tabula

Model-agnostic forecasting desktop app. Upload data, explore patterns, forecast with probability-weighted fan charts, fine-tune custom models.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)

## Features

- **File Upload** — Drag-and-drop CSV, JSON, Excel, Parquet
- **EDA Suite** — Summary stats, distributions, correlations, missing values, outlier detection
- **Fan Charts** — Multi-iteration forecasts with probability-weighted opacity (darker = more probable)
- **Confidence Bands** — 50% and 80% confidence intervals
- **Forecast Cancel** — Stop running forecasts with one click
- **Fine-Tuning** — LSTM-based training via PyTorch with configurable hyperparameters
- **Model Registry** — Save, list, and switch between fine-tuned models

## Quick Start

### Prerequisites

- **Node.js** 18+ and **npm**
- **Python** 3.10+ with pip

### Install

```bash
git clone https://github.com/monke-sniper/tabula.git
cd tabula
npm install
pip install -r backend/requirements.txt
```

### Run

```bash
# Terminal 1 — Python backend (port 8420)
npm run backend

# Terminal 2 — Vite dev server (port 5173)
npm run dev

# Optional — Electron desktop mode
npm run electron:dev
```

Open **http://localhost:5173**

## Usage

1. **Upload** — Drop a data file onto the upload zone
2. **Explore** — Use the EDA tabs (Stats, Distributions, Correlations, Missing, Outliers)
3. **Forecast** — Set iterations and prediction length, click RUN
4. **Fine-Tune** — Go to Fine-Tune page, configure hyperparameters, train
5. **Switch Models** — Visit Models page to select your active model

## Architecture

```
tabula/
├── electron/                  # Electron main process
│   ├── main.js               # Window management, Python subprocess bridge
│   └── preload.js            # Context bridge for renderer
├── src/                       # React frontend
│   ├── components/
│   │   ├── Sidebar.tsx       # Navigation + model status
│   │   ├── FileUpload.tsx    # Drag-drop file upload
│   │   ├── DataTable.tsx     # Paginated data preview
│   │   ├── EDAPanel.tsx      # 5-tab EDA analysis
│   │   └── ForecastChart.tsx # Fan chart + confidence bands
│   ├── pages/
│   │   ├── Dashboard.tsx     # Main view
│   │   ├── FineTune.tsx      # Training pipeline
│   │   └── Models.tsx        # Model registry
│   └── lib/
│       ├── api.ts            # API client
│       ├── context.tsx       # Global state
│       └── types.ts          # TypeScript types
├── backend/                   # Python FastAPI
│   ├── main.py               # App entry
│   ├── routers/
│   │   ├── data.py           # Upload + EDA
│   │   ├── forecast.py       # Multi-iteration forecast
│   │   └── finetune.py       # Training pipeline
│   └── models/               # Saved fine-tuned models
└── package.json
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Desktop** | Electron 33 |
| **Frontend** | React 19 · TypeScript 5.7 · Vite 6 · Tailwind CSS 3 |
| **Charts** | Plotly.js |
| **Backend** | Python FastAPI · uvicorn |
| **Data** | pandas · pyarrow · openpyxl |
| **ML** | PyTorch · Transformers |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/upload` | Upload and parse data file |
| `POST` | `/upload-path` | Upload by local file path |
| `GET` | `/eda/{session_id}` | Full EDA analysis |
| `POST` | `/forecast/{session_id}` | Run N-iteration forecast |
| `POST` | `/forecast/cancel` | Cancel running forecast |
| `POST` | `/finetune/start` | Start fine-tuning job |
| `GET` | `/finetune/status` | Poll training progress |
| `GET` | `/models` | List registered models |
| `PUT` | `/models/active` | Set active model |
| `GET` | `/health` | Health check |

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

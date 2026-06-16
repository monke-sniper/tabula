<div align="center">

# Tabula

**Model-agnostic forecasting desktop app with a trading terminal aesthetic.**

[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.135-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.11-EE4C2C?logo=pytorch&logoColor=white)](https://pytorch.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

Upload data → Explore patterns → Forecast with probability-weighted fan charts → Fine-tune custom models.

</div>

---

## Features

| Feature | Description |
|---------|-------------|
| **File Upload** | Drag-and-drop or file picker for CSV, JSON, Excel, Parquet |
| **EDA Suite** | Summary stats, distributions, correlations, missing values, outlier detection |
| **Fan Charts** | Multi-iteration forecasts with probability-weighted opacity (darker = more probable) |
| **Confidence Bands** | 50% and 80% confidence intervals with shaded regions |
| **Fine-Tuning** | LSTM-based training via PyTorch with configurable hyperparameters |
| **Model Registry** | Save, list, and switch between fine-tuned models |
| **Trading Terminal UI** | Bloomberg-inspired dark interface with monospace data and cyan accents |

## Screenshots

> Dashboard with candlestick-style forecast visualization, probability fan chart, and EDA analysis.

## Quick Start

### Prerequisites

- **Node.js** 18+ and **npm**
- **Python** 3.10+ with pip

### Install

```bash
# Clone the repo
git clone https://github.com/monke-sniper/tabula.git
cd tabula

# Install frontend dependencies
npm install

# Install backend dependencies
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

1. **Upload** — Drop a CSV/JSON/Excel/Parquet file onto the upload zone
2. **Explore** — Use the EDA tabs (Stats, Distributions, Correlations, Missing, Outliers)
3. **Forecast** — Set iterations and prediction length, click "Run Forecast"
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
| **Charts** | Plotly.js (via react-plotly.js) |
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
| `POST` | `/finetune/start` | Start fine-tuning job |
| `GET` | `/finetune/status` | Poll training progress |
| `GET` | `/models` | List registered models |
| `PUT` | `/models/active` | Set active model |

## License

MIT

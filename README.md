# Tabula

Model-agnostic time series forecasting desktop app. Upload any dataset, explore patterns with a built-in EDA suite, generate probability-weighted fan charts, and fine-tune your own models — all locally.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)

```
┌──────────────────────────────────────────────────────────────────┐
│  TABULA                         F1 DASHBOARD  F2 FINE-TUNE  F3 MODELS │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─── DATA PREVIEW ──────────────┐  ┌─── EDA ──────────────────┐│
│  │  timestamp  │  value          │  │  [STATS] [DIST] [CORR]   ││
│  │  2024-01-01 │  142.30         │  │  mean:  145.2            ││
│  │  2024-01-02 │  138.90         │  │  std:    12.4            ││
│  │  2024-01-03 │  151.20         │  │  min:    98.1            ││
│  │  ...        │  ...            │  │  max:   201.5            ││
│  └────────────────────────────────┘  └──────────────────────────┘│
│                                                                  │
│  ┌─── FORECAST ENGINE ──────────────────────────────────────────┐│
│  │  TGT [AUTO]  ITER [====o== 12]  HORIZON [====o== 24] [RUN]  ││
│  │                                                              ││
│  │        ╭───────── Fan chart: dashed iterations, solid median  ││
│  │   ─────┤                                                      ││
│  │        ╰───────── 50% and 80% confidence bands               ││
│  └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

## What it does

**Data ingestion** — Drop a CSV, JSON, Excel, or Parquet file. Tabula parses it, detects column types, and loads it into an in-memory session.

**Exploratory data analysis** — Five tabs of analysis on your data: summary statistics, distributions, correlation matrix, missing value audit, and outlier detection (IQR + Z-score).

**Forecasting** — Run N iterations of a probabilistic forecast (powered by [Chronos-2](https://github.com/AmazonScience/chronos-forecasting) by default). Each iteration is a separate sample from the model's predictive distribution. Iterations are ranked by distance from the median — least probable rendered first (faint), most probable on top (bright). Confidence bands at 50% and 80%.

**Fine-tuning** — Train an LSTM on your historical data with configurable hyperparameters (lookback, hidden size, dropout, learning rate, epochs). Models are saved to a local registry.

**Model registry** — List saved models, see metadata, and switch the active model with one click.

## Prerequisites

- **Node.js** 18+ and **npm**
- **Python** 3.10+ with `pip`
- **Git**

## Install

```bash
git clone https://github.com/monke-sniper/tabula.git
cd tabula
npm install
pip install -r backend/requirements.txt
```

## Running

You need two terminals — one for the Python backend, one for the frontend.

```bash
# Terminal 1 — Python backend (port 8420)
npm run backend

# Terminal 2 — Vite dev server (port 5173)
npm run dev
```

Then open **http://localhost:5173**.

Or run in Electron desktop mode:

```bash
# Single command — launches both backend and Electron window
npm run electron:dev
```

## Step-by-step walkthrough

### 1. Upload data

Drag and drop any CSV, JSON, Excel (.xlsx), or Parquet file onto the upload zone. Tabula will:

- Parse the file and detect column types (numeric, datetime, categorical)
- Show a data preview table
- Make columns available for EDA and forecasting

You can also upload by file path using the API:

```bash
curl -X POST http://127.0.0.1:8420/upload-path \
  -H "Content-Type: application/json" \
  -d '{"file_path": "/path/to/your/data.csv"}'
```

### 2. Explore the data

Switch between five EDA tabs to understand your data:

| Tab | What it shows |
|-----|---------------|
| **Stats** | Count, mean, std, min, quartiles, max for each numeric column |
| **Distributions** | Histograms with bin count sliders |
| **Correlations** | Heatmap of Pearson correlations between numeric columns |
| **Missing** | Per-column missing value counts and percentages |
| **Outliers** | IQR-based and Z-score outlier detection with counts |

### 3. Run a forecast

In the forecast panel:

1. **TGT** — Select a target column (or leave on AUTO to use the first numeric column)
2. **ITER** — Number of forecast iterations (2-50). More iterations = denser fan chart = better uncertainty quantification
3. **HORIZON** — How many steps ahead to predict
4. Click **RUN**

The chart shows:

- **Solid cyan line** — Historical data
- **Dashed amber lines** — Forecast iterations (opacity = probability)
- **Bright dashed amber line** — Median forecast
- **Cyan shaded regions** — 50% and 80% confidence intervals
- **Bottom bars** — Volume/change magnitude

To cancel a running forecast, click **STOP**.

### 4. Fine-tune a model

Navigate to the **Fine-Tune** page (F2). Configure:

| Parameter | Default | Description |
|-----------|---------|-------------|
| Lookback window | 30 | Number of historical steps the model sees |
| Hidden size | 64 | LSTM hidden layer dimension |
| Dropout | 0.1 | Regularization dropout rate |
| Learning rate | 0.001 | Adam optimizer learning rate |
| Epochs | 50 | Training iterations over the full dataset |
| Batch size | 32 | Samples per training step |

Click **START TRAINING** to begin. Progress updates in real time.

### 5. Switch models

Go to the **Models** page (F3) to:

- See all registered models with metadata
- Set any model as the **ACTIVE** model
- View model details

## API reference

The backend runs on `http://127.0.0.1:8420` by default.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/upload` | Upload a data file (multipart/form-data) |
| `POST` | `/upload-path` | Upload by local file path |
| `GET` | `/eda/{session_id}` | Run EDA analysis on uploaded data |
| `POST` | `/forecast/{session_id}` | Run multi-iteration forecast |
| `POST` | `/forecast/cancel` | Cancel a running forecast |
| `POST` | `/finetune/start` | Start a fine-tuning job |
| `GET` | `/finetune/status` | Poll training progress |
| `GET` | `/models` | List registered models |
| `PUT` | `/models/active` | Set the active model |
| `GET` | `/health` | Health check |

### Forecast parameters

```
POST /forecast/{session_id}?iterations=12&prediction_length=24&target_column=value
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `iterations` | int | 12 | Number of sample iterations |
| `prediction_length` | int | 24 | Forecast horizon (steps ahead) |
| `target_column` | string | first numeric column | Column to forecast |

### Forecast cancel

```bash
curl -X POST http://127.0.0.1:8420/forecast/cancel
```

Returns HTTP 499 when the forecast was cancelled.

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
│   │   └── ForecastChart.tsx # Fan chart + confidence bands + cancel
│   ├── pages/
│   │   ├── Dashboard.tsx     # Main view (fixed grid, no scroll)
│   │   ├── FineTune.tsx      # Training pipeline
│   │   └── Models.tsx        # Model registry
│   └── lib/
│       ├── api.ts            # API client
│       ├── context.tsx       # Global state
│       └── types.ts          # TypeScript types
├── backend/                   # Python FastAPI
│   ├── main.py               # App entry, CORS, health check
│   ├── routers/
│   │   ├── data.py           # Upload + EDA
│   │   ├── forecast.py       # Multi-iteration forecast + cancel
│   │   └── finetune.py       # Training pipeline + model registry
│   └── models/               # Saved fine-tuned models
└── package.json
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| **Desktop** | Electron 33 |
| **Frontend** | React 19 · TypeScript 5.7 · Vite 6 · Tailwind CSS 3 |
| **Charts** | Plotly.js |
| **Backend** | Python FastAPI · uvicorn |
| **Data** | pandas · pyarrow · openpyxl |
| **ML** | PyTorch · Transformers (Chronos-2) |

## Development

```bash
# Lint
npm run lint

# Type check
npx tsc --noEmit

# Build for production
npx vite build

# Run backend only (for API development)
cd backend && python -m uvicorn main:app --reload --port 8420
```

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

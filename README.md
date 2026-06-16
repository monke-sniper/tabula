# Tabula

Model-agnostic forecasting desktop application with EDA analysis, fan chart visualization, and fine-tuning pipeline.

## Features

- **File Upload** — Drag-and-drop or file picker for CSV, JSON, Excel, Parquet
- **EDA Suite** — Summary statistics, distributions, correlations, missing values, outlier detection
- **Fan Charts** — Multi-iteration forecasts with probability-weighted opacity (darker = more probable)
- **Fine-Tuning** — Train custom models using HuggingFace Trainer with configurable hyperparameters
- **Model Registry** — Manage and switch between fine-tuned models

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Charts | Plotly.js (via react-plotly.js) |
| Backend | Python FastAPI + uvicorn |
| Data | pandas, pyarrow, openpyxl |
| ML | PyTorch, Transformers |

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- pip packages: `pip install -r backend/requirements.txt`

### Development

```bash
# Install frontend dependencies
npm install

# Start the Python backend (port 8420)
npm run backend

# In another terminal, start the frontend dev server
npm run dev

# In another terminal, start Electron (optional, for desktop mode)
npm run electron:dev
```

### Production Build

```bash
npm run build
```

## Usage

1. **Upload Data** — Drag a CSV/JSON/Excel/Parquet file onto the upload zone
2. **Explore** — Use the EDA tabs to understand your data (statistics, distributions, correlations)
3. **Forecast** — Configure iterations and prediction length, then click "Run Forecast"
4. **Fine-Tune** — Go to the Fine-Tune page, configure hyperparameters, and train a custom model
5. **Switch Models** — Visit the Models page to select your active model

## Project Structure

```
tabula/
├── electron/          # Electron main process
├── src/               # React frontend
│   ├── components/    # Reusable UI components
│   ├── pages/         # Page components
│   └── lib/           # Types, API client, context
├── backend/           # Python FastAPI backend
│   ├── routers/       # API route handlers
│   ├── services/      # Business logic
│   └── models/        # Saved fine-tuned models
└── package.json
```

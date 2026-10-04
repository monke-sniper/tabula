import { useEffect } from 'react'

interface HelpModalProps {
  open: boolean
  onClose: () => void
}

const SECTIONS: Array<{ title: string; items: Array<{ label: string; text: string }> }> = [
  {
    title: 'KEYBOARD SHORTCUTS',
    items: [
      { label: 'F1', text: 'Switch to Dashboard' },
      { label: 'F2', text: 'Switch to Fine-Tune' },
      { label: 'F3', text: 'Switch to Models' },
      { label: 'Ctrl+O', text: 'Open the file picker (anywhere)' },
      { label: '?', text: 'Open this help modal' },
      { label: 'Esc', text: 'Close any open modal' },
    ],
  },
  {
    title: 'EDA PANEL',
    items: [
      {
        label: 'STATS',
        text: 'Per-column summary: type, null count, unique count, mean, std, min, max. Numeric columns get mean/std/min/max/median; non-numeric only get min/max as strings.',
      },
      {
        label: 'DIST',
        text: '20-bin histogram of the selected numeric column. Dashed cyan line = column mean; dotted lines = mean ± 1σ. Click another column name to switch.',
      },
      {
        label: 'CORR',
        text: 'Pairwise Pearson correlation between every pair of numeric columns. +1 = perfect positive, -1 = perfect negative, 0 = no linear relationship. Red = negative, green = positive.',
      },
      {
        label: 'NULL',
        text: 'Percentage of missing values per column. FILL forward-fills (then back-fills to handle leading nulls). DROP removes rows where that column is null.',
      },
      {
        label: 'OUT',
        text: 'Count of values outside Q1 - 1.5·IQR to Q3 + 1.5·IQR (Tukey fences). CAP clips those values to the fences; this is destructive.',
      },
    ],
  },
  {
    title: 'FORECAST ENGINE',
    items: [
      { label: 'TARGET', text: 'Which numeric column to forecast. AUTO picks the first non-id numeric column.' },
      {
        label: 'MODEL',
        text: 'Which forecaster to use. amazon/chronos-t5-* are pretrained foundation models (slow first run while weights download from Hugging Face). Fine-tuned LSTMs from the Models page are listed too. statistical-fallback is a fast linear-trend + seasonal baseline.',
      },
      {
        label: 'SAMPLES',
        text: 'Number of probabilistic forecast paths. More samples = smoother fan chart and better percentile estimates, but slower inference.',
      },
      {
        label: 'HORIZON',
        text: 'Number of future steps to predict. The last `horizon` rows are held out from the end of the series for back-testing metrics (MAE / RMSE / MAPE shown in the caption).',
      },
      {
        label: 'VIEW',
        text: 'FAN shows sample paths (faded by distance from the median) + 50/80/95% bands. BANDS shows confidence regions only. LINES shows just the median + actual. The fan starts at the last actual point with zero width and widens outward.',
      },
    ],
  },
  {
    title: 'ADVANCED SAMPLING',
    items: [
      { label: 'TEMP', text: 'Sampling temperature. Higher = more diverse forecast paths; lower = paths cluster tighter around the median. 1.0 is the default. Chronos only.' },
      { label: 'TOP_P', text: 'Nucleus sampling cutoff. The model only samples tokens whose cumulative probability is in the top TOP_P. 0.9 = top 90% of the distribution. Lower = more conservative.' },
      { label: 'TOP_K', text: 'Top-K sampling. The model only considers the K most likely next tokens. 0 disables. Lower = tighter, higher = more diverse.' },
    ],
  },
  {
    title: 'MODELS',
    items: [
      { label: 'USE', text: 'Sets the model as the active forecaster and jumps to the Dashboard.' },
      { label: 'SELECT', text: 'Sets the model as the active forecaster and stays on this page.' },
      { label: 'DEL', text: 'Removes the model from the registry and deletes its weights from disk. Cannot be undone. Deleting the active model resets it to amazon/chronos-t5-small.' },
    ],
  },
  {
    title: 'FINE-TUNE',
    items: [
      { label: 'What it does', text: 'Trains a small 2-layer LSTM from scratch to predict the target one step ahead. Forecasts roll it forward; sample paths come from MC dropout plus residual noise.' },
      { label: 'Model name', text: '3-40 characters, lowercase letters, digits, underscores, hyphens. Becomes the registered model name after training.' },
      { label: 'LR / Epochs / Batch', text: 'AdamW hyperparameters. Defaults: lr=1e-3, epochs=10, batch=16. Higher lr = faster but unstable; more epochs = better fit but risk overfitting.' },
    ],
  },
  {
    title: 'SUPPORTED FILE FORMATS',
    items: [
      { label: 'CSV', text: 'Comma-separated. UTF-8. First row is treated as header. Auto-detected: timestamp columns, numeric columns, id-like columns.' },
      { label: 'Parquet', text: 'Snappy-compressed columnar. Faster to load than CSV for large datasets.' },
      { label: 'JSON', text: 'Array of records. Each top-level key becomes a column.' },
      { label: 'XLSX', text: 'Excel. Only the first sheet is read. Dates are auto-coerced.' },
    ],
  },
  {
    title: 'API ENDPOINTS',
    items: [
      { label: 'GET /health', text: 'Returns status, version, and currently-loaded model names. Polled every 10s by the dashboard.' },
      { label: 'POST /upload', text: 'Upload a CSV/Parquet/JSON/XLSX file. Returns a session_id used for all subsequent calls.' },
      { label: 'GET /eda/{id}', text: 'Compute EDA summary: column info, distributions, correlations, missing values, outliers.' },
      { label: 'POST /forecast/{id}', text: 'Run a forecast. Body: target_column, horizon, num_samples, model_name, [top_p, top_k, temperature].' },
      { label: 'POST /finetune/start', text: 'Start fine-tuning. Returns a job handle. Poll /finetune/status for progress.' },
      { label: 'GET /finetune/loss-history', text: 'Returns per-step training/eval loss for the latest fine-tune job.' },
      { label: 'GET /sessions, DELETE /sessions/{id}', text: 'List and delete in-memory + on-disk sessions.' },
      { label: 'POST /sessions/{id}/clean', text: 'Apply a cleaning strategy (drop/mean/zero/ffill/clip) to selected columns.' },
      { label: 'GET /models, DELETE /models/{name}', text: 'List and delete registered fine-tuned models.' },
    ],
  },
]

export function HelpModal({ open, onClose }: HelpModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="help-modal__overlay" onClick={onClose}>
      <div className="help-modal" role="dialog" aria-modal="true" aria-label="Help" onClick={(e) => e.stopPropagation()}>
        <div className="help-modal__header">
          <div className="font-mono text-[11px] text-[var(--cyan)] tracking-widest">TABULA · HELP</div>
          <button type="button" onClick={onClose} className="help-modal__close" aria-label="Close help">
            ×
          </button>
        </div>
        <div className="help-modal__body">
          {SECTIONS.map((sec) => (
            <section key={sec.title} className="help-modal__section">
              <h2 className="help-modal__h2">{sec.title}</h2>
              <dl className="help-modal__dl">
                {sec.items.map((it) => (
                  <div key={it.label} className="help-modal__row">
                    <dt className="help-modal__dt">{it.label}</dt>
                    <dd className="help-modal__dd">{it.text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="help-modal__footer">
          <span className="font-mono text-[10px] text-[var(--grey)]">Press Esc or click outside to close</span>
        </div>
      </div>
    </div>
  )
}

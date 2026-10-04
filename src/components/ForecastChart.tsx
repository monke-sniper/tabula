import { useState, useRef, useEffect } from 'react'
import { apiPost, errorMessage } from '../lib/api'
import { useApp } from '../lib/context'
import { useToast } from '../lib/toast'
import type { ForecastResponse } from '../lib/types'
import { ForecastPlot, ForecastCaption, type ViewMode } from './FanChart'
import { HelpTip } from './HelpTip'

export const BUILTIN_MODELS = [
  'amazon/chronos-t5-tiny',
  'amazon/chronos-t5-mini',
  'amazon/chronos-t5-small',
  'amazon/chronos-t5-base',
  'amazon/chronos-t5-large',
  'statistical-fallback',
]

const MIN_HISTORY = 16 // backend keeps at least this many points as history
const ID_LIKE = /^(id|idx|index)$|^id_|_id$/i

function Label({ text, tip }: { text: string; tip: string }) {
  return <span className="blz-label">{text}<HelpTip text={tip} /></span>
}

function Slider({ value, min, max, step = 1, digits = 0, onChange }: {
  value: number; min: number; max: number; step?: number; digits?: number; onChange: (v: number) => void
}) {
  return (
    <>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-20 accent-[var(--amber)]" />
      <span className="font-mono text-[11px] text-[var(--amber)] w-9 text-right tabular-nums">{value.toFixed(digits)}</span>
    </>
  )
}

export default function ForecastChart() {
  const { uploadData, forecastResult, setForecastResult, activeModel, models } = useApp()
  const toast = useToast()
  const [iterations, setIterations] = useState(50)
  const [predLength, setPredLength] = useState(48)
  const [targetColumn, setTargetColumn] = useState('')
  const [modelName, setModelName] = useState(activeModel)
  const [view, setView] = useState<ViewMode>('fan')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [temperature, setTemperature] = useState(1.0)
  const [topP, setTopP] = useState(0.9)
  const [topK, setTopK] = useState(50)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { setModelName(activeModel) }, [activeModel])

  if (!uploadData) return null

  const maxHorizon = Math.max(1, Math.min(500, uploadData.rows - MIN_HISTORY))
  const horizon = Math.min(predLength, maxHorizon)
  const modelOptions = Array.from(new Set([modelName, activeModel, ...models.map((m) => m.name), ...BUILTIN_MODELS])).filter(Boolean)
  const targets = uploadData.numeric_columns.filter((c) => !ID_LIKE.test(c))

  const runForecast = async () => {
    setIsLoading(true)
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await apiPost<ForecastResponse>(
        `/forecast/${uploadData.session_id}`,
        {
          target_column: targetColumn || undefined,
          horizon,
          num_samples: iterations,
          model_name: modelName,
          top_p: topP,
          top_k: topK,
          temperature,
        },
        controller.signal,
      )
      setForecastResult(result)
      toast('success', 'Forecast complete', `${result.model_used} · MAE ${result.metrics.mae.toFixed(2)} · ${result.inference_ms}ms`)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast('warn', 'Forecast cancelled')
      } else {
        const msg = errorMessage(err, 'Forecast failed')
        setError(msg)
        toast('error', 'Forecast failed', msg)
      }
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }

  return (
    <div className="blz-panel border-0 flex flex-col h-full">
      <div className="blz-header">
        <span className="title">FORECAST ENGINE</span>
        <span className="meta font-mono">{uploadData.rows.toLocaleString()} pts</span>
      </div>

      <div className="px-2 py-1.5 flex items-center gap-x-4 gap-y-1.5 flex-wrap border-b border-[var(--border-dim)] shrink-0">
        <div className="flex items-center gap-1.5">
          <Label text="TARGET" tip="Which numeric column to forecast. AUTO picks the first non-id numeric column." />
          <select className="blz-select" value={targetColumn} onChange={(e) => setTargetColumn(e.target.value)}>
            <option value="">AUTO</option>
            {targets.map((col) => <option key={col} value={col}>{col}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <Label text="MODEL" tip="amazon/chronos-t5-* are pretrained foundation models (first run downloads weights from Hugging Face). Fine-tuned LSTMs from the Models page also appear here. statistical-fallback is a fast trend + seasonal baseline." />
          <select className="blz-select max-w-[220px]" value={modelName} onChange={(e) => setModelName(e.target.value)}>
            {modelOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <Label text="SAMPLES" tip="Number of probabilistic forecast paths. More samples = smoother fan chart and better percentile estimates, but slower inference." />
          <Slider value={iterations} min={2} max={200} onChange={setIterations} />
        </div>
        <div className="flex items-center gap-1.5">
          <Label text="HORIZON" tip="Number of future steps to predict. The last `horizon` rows are held out to back-test the forecast (MAE/RMSE/MAPE in the caption)." />
          <Slider value={horizon} min={1} max={maxHorizon} onChange={setPredLength} />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <div className="flex" role="group" aria-label="Chart view">
            {(['fan', 'bands', 'lines'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                title={{ fan: 'Sample paths + 50/80/95% bands', bands: 'Confidence bands only', lines: 'Median + actual only' }[v]}
                className={`blz-btn py-0.5 px-2 -ml-px first:ml-0 ${view === v ? 'active' : ''}`}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
          {isLoading ? (
            <button onClick={() => abortRef.current?.abort()} className="blz-btn blz-btn-danger min-w-[64px]">STOP</button>
          ) : (
            <button onClick={runForecast} className="blz-btn primary min-w-[64px]" title="Run forecast. The first Chronos run is slow while weights load.">RUN ▸</button>
          )}
        </div>
      </div>

      <div className="px-2 py-1 flex items-center gap-x-4 gap-y-1 flex-wrap border-b border-[var(--border-dim)] shrink-0">
        <button
          onClick={() => setShowAdvanced((s) => !s)}
          aria-expanded={showAdvanced}
          className="blz-label hover:text-[var(--white)]"
        >
          {showAdvanced ? '▾' : '▸'} ADVANCED
        </button>
        {showAdvanced && (
          <>
            <div className="flex items-center gap-1.5">
              <Label text="TEMP" tip="Sampling temperature (Chronos). Higher = more diverse forecast paths; lower = paths cluster tighter around the median." />
              <Slider value={temperature} min={0.1} max={2} step={0.05} digits={2} onChange={setTemperature} />
            </div>
            <div className="flex items-center gap-1.5">
              <Label text="TOP_P" tip="Nucleus sampling cutoff (Chronos). Only tokens in the top TOP_P cumulative probability are sampled. 1.0 disables." />
              <Slider value={topP} min={0.1} max={1} step={0.05} digits={2} onChange={setTopP} />
            </div>
            <div className="flex items-center gap-1.5">
              <Label text="TOP_K" tip="Top-K sampling (Chronos). Only the K most likely next tokens are considered. 0 disables." />
              <Slider value={topK} min={0} max={200} step={5} onChange={setTopK} />
            </div>
          </>
        )}
      </div>

      {forecastResult && <ForecastCaption data={forecastResult} />}
      {error && <div className="blz-error mx-2 mt-1.5 shrink-0">{error}</div>}

      <div className="flex-1 min-h-0 relative">
        {forecastResult ? (
          <ForecastPlot data={forecastResult} view={view} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <span className="font-mono text-[11px] text-[var(--grey)]">Pick a target and model, then press <span className="text-[var(--amber)]">RUN ▸</span></span>
          </div>
        )}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <span className="font-mono text-[11px] text-[var(--amber)] blink">RUNNING {modelName}…</span>
          </div>
        )}
      </div>
    </div>
  )
}

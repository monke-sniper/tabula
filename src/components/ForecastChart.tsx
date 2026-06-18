import { useState, useCallback, useRef, useEffect } from 'react'
import { apiPost, ApiError } from '../lib/api'
import { useApp } from '../lib/context'
import { useToast } from '../lib/toast'
import type { ForecastResponse } from '../lib/types'
import { FanChart, BandsChart, LinesChart, ForecastCaption } from './FanChart'
import { HelpTip } from './HelpTip'

const CHRONOS_FAMILY = [
  'amazon/chronos-t5-small',
  'amazon/chronos-t5-base',
  'amazon/chronos-t5-large',
  'amazon/chronos-bolt-small',
  'amazon/chronos-bolt-base',
  'amazon/chronos-bolt-mini',
  'google/timesfm-1.0-200m',
  'statistical-fallback',
]

type ViewMode = 'fan' | 'bands' | 'lines'

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

  const modelOptions = Array.from(new Set([
    modelName,
    activeModel,
    ...models.map((m) => m.name),
    ...CHRONOS_FAMILY,
  ])).filter(Boolean)

  const runForecast = useCallback(async () => {
    if (!uploadData) return
    setIsLoading(true)
    setError(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const result = await apiPost<ForecastResponse>(
        `/forecast/${uploadData.session_id}`,
        {
          target_column: targetColumn || undefined,
          horizon: predLength,
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
    } catch (err: any) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Cancelled')
        toast('warn', 'Forecast cancelled')
      } else if (err instanceof ApiError) {
        setError(err.detail)
        toast('error', 'Forecast failed', err.detail)
      } else {
        const msg = err?.message ?? 'Forecast failed'
        setError(msg)
        toast('error', 'Forecast failed', msg)
      }
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [uploadData, iterations, predLength, targetColumn, modelName, topP, topK, temperature, setForecastResult, toast])

  const stopForecast = useCallback(() => {
    abortRef.current?.abort()
    apiPost('/forecast/cancel', {}).catch(() => {})
  }, [])

  if (!uploadData) {
    return (
      <div className="blz-panel h-full flex items-center justify-center">
        <span className="font-mono text-[10px] text-[var(--grey)]">UPLOAD DATA TO INITIALIZE FORECAST ENGINE</span>
      </div>
    )
  }

  return (
    <div className="blz-panel flex flex-col h-full">
      <div className="blz-header">
        <span className="title">FORECAST ENGINE</span>
        <span className="meta font-mono">{uploadData.rows.toLocaleString()} pts</span>
      </div>

      {forecastResult && <ForecastCaption data={forecastResult} />}

      <div className="help-strip">
        Choose a target column and forecaster, then click RUN. The fan chart is anchored at the last actual value with zero band width and widens outward.
      </div>

      <div className="px-2 py-1.5 flex items-center gap-2 flex-wrap border-t border-[var(--border)] shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--grey)]">TGT<HelpTip text="Which numeric column to forecast. AUTO picks the first non-id numeric column." /></span>
          <select className="blz-select" value={targetColumn} onChange={(e) => setTargetColumn(e.target.value)}>
            <option value="">AUTO</option>
            {uploadData.numeric_columns
              .filter((c) => !/^(id|idx|index)$/i.test(c) && !/^id_|_id$/.test(c))
              .map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--grey)]">MODEL<HelpTip text="Which forecaster to use. amazon/chronos-* and google/timesfm-* are real ML foundation models. statistical-fallback is a fast seasonal-naive + linear-trend baseline." /></span>
          <select className="blz-select" value={modelName} onChange={(e) => setModelName(e.target.value)}>
            {modelOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--grey)]">SAMPLES<HelpTip text="Number of probabilistic forecast paths. More samples = smoother fan chart and better percentile estimates, but slower inference." /></span>
          <input type="range" min={2} max={200} value={iterations} onChange={(e) => setIterations(Number(e.target.value))} className="w-20 accent-[var(--amber)]" />
          <span className="font-mono text-[10px] text-[var(--amber)] w-7 text-right">{iterations}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--grey)]">HORIZON<HelpTip text="Number of future steps to predict. The last `horizon` rows are held out for back-testing metrics (MAE/RMSE/MAPE in the caption)." /></span>
          <input type="range" min={1} max={Math.min(500, uploadData.rows)} value={predLength} onChange={(e) => setPredLength(Number(e.target.value))} className="w-20 accent-[var(--amber)]" />
          <span className="font-mono text-[10px] text-[var(--amber)] w-7 text-right">{predLength}</span>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--grey)]">VIEW<HelpTip text="FAN = iterations + 50/80/95% bands (default, matches references). BANDS = confidence regions only. LINES = just median + actual." /></span>
          <div className="flex">
            {(['fan', 'bands', 'lines'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`blz-btn py-0 px-1.5 text-[8px] rounded-none border-r-0 last:border-r ${view === v ? 'active' : ''}`}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {isLoading ? (
          <button onClick={stopForecast} className="blz-btn" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
            STOP
          </button>
        ) : (
          <button onClick={runForecast} className="blz-btn primary">RUN<HelpTip text="Run the forecast with the current configuration. First Chronos invocation is slow while weights download from Hugging Face." className="ml-1" /></button>
        )}
      </div>

      <div className="px-2 py-1 flex items-center gap-2 flex-wrap border-t border-[var(--border-dim)] shrink-0">
        <button
          onClick={() => setShowAdvanced((s) => !s)}
          className="text-[8px] text-[var(--grey)] hover:text-[var(--grey-bright)] uppercase tracking-wider"
        >
          {showAdvanced ? '\u25be' : '\u25b8'} ADVANCED<HelpTip text="Sampling hyperparameters. T = temperature (higher = more diverse paths). TOP_P = nucleus sampling cutoff. TOP_K = top-K sampling. Lower values = more conservative." />
        </button>
        {showAdvanced && (
          <>
            <div className="flex items-center gap-1">
              <span className="text-[8px] uppercase text-[var(--grey)]">T<HelpTip text="Sampling temperature. Higher = more diverse forecast paths; lower = paths cluster tighter around the median. 1.0 is the default." /></span>
              <input type="range" min={0.1} max={2.0} step={0.05} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="w-16 accent-[var(--amber)]" />
              <span className="font-mono text-[9px] text-[var(--amber)] w-8 text-right">{temperature.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[8px] uppercase text-[var(--grey)]">TOP_P<HelpTip text="Nucleus sampling cutoff. The model only samples tokens whose cumulative probability is in the top TOP_P. 0.9 = top 90% of the distribution. Lower = more conservative." /></span>
              <input type="range" min={0.1} max={1.0} step={0.05} value={topP} onChange={(e) => setTopP(Number(e.target.value))} className="w-16 accent-[var(--amber)]" />
              <span className="font-mono text-[9px] text-[var(--amber)] w-8 text-right">{topP.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[8px] uppercase text-[var(--grey)]">TOP_K<HelpTip text="Top-K sampling. The model only considers the K most likely next tokens. 0 disables. Lower = tighter, higher = more diverse." /></span>
              <input type="range" min={0} max={200} step={5} value={topK} onChange={(e) => setTopK(Number(e.target.value))} className="w-16 accent-[var(--amber)]" />
              <span className="font-mono text-[9px] text-[var(--amber)] w-8 text-right">{topK}</span>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="mx-2 mb-1 mt-1 px-2 py-1 bg-[var(--red-dim)] border border-[rgba(255,23,68,0.3)] font-mono text-[9px] text-[var(--red)] shrink-0">{error}</div>
      )}

      <div className="flex-1 min-h-0 border-t border-[var(--border)]">
        {forecastResult ? (
          view === 'fan' ? <FanChart data={forecastResult} /> :
          view === 'bands' ? <BandsChart data={forecastResult} /> :
          <LinesChart data={forecastResult} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <span className="font-mono text-[10px] text-[var(--grey)]">CONFIGURE TARGETS AND CLICK RUN TO GENERATE FORECAST</span>
          </div>
        )}
      </div>
    </div>
  )
}

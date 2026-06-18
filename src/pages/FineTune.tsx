import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Plot from 'react-plotly.js'
import { apiGet, apiPost } from '../lib/api'
import { useApp } from '../lib/context'
import { useToast } from '../lib/toast'
import type { FineTuneConfig, FineTuneStatus, LossPoint } from '../lib/types'

const BASE_MODELS = [
  'amazon/chronos-t5-small',
  'amazon/chronos-t5-base',
  'amazon/chronos-t5-large',
  'amazon/chronos-bolt-small',
  'amazon/chronos-bolt-base',
  'amazon/chronos-bolt-mini',
  'google/timesfm-1.0-200m',
]

const NAME_RE = /^[a-z0-9_-]{3,40}$/

export default function FineTune() {
  const { uploadData, sessionId, refreshModels } = useApp()
  const toast = useToast()
  const [config, setConfig] = useState<FineTuneConfig>({
    model_name: 'amazon/chronos-t5-small',
    custom_name: '',
    learning_rate: 1e-4,
    num_epochs: 3,
    batch_size: 8,
    warmup_steps: 100,
    weight_decay: 0.01,
    train_split: 0.8,
    val_split: 0.1,
  })
  const [status, setStatus] = useState<FineTuneStatus>({
    status: 'idle', progress: 0, current_epoch: 0, total_epochs: 0,
    train_loss: 0, eval_loss: 0, message: '',
  })
  const [lossHistory, setLossHistory] = useState<LossPoint[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const nameValid = useMemo(() => NAME_RE.test(config.custom_name), [config.custom_name])

  const pollStatus = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        apiGet<FineTuneStatus>('/finetune/status'),
        apiGet<{ history: LossPoint[] }>('/finetune/loss-history'),
      ])
      setStatus(s)
      setLossHistory(h.history || [])
      if (s.status === 'completed' || s.status === 'error') {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }
    } catch {}
  }, [])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const startTraining = async () => {
    if (!sessionId || !config.custom_name.trim()) return
    if (!nameValid) {
      toast('error', 'Invalid name', 'lowercase letters, digits, _, -; 3-40 chars')
      return
    }
    setStatus(prev => ({ ...prev, status: 'training', message: 'Starting...' }))
    try {
      await apiPost('/finetune/start', { session_id: sessionId, ...config })
      pollRef.current = setInterval(pollStatus, 2000)
      toast('info', 'Training started', config.custom_name)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setStatus(prev => ({ ...prev, status: 'error', message: msg }))
      toast('error', 'Training failed', msg)
    }
  }

  useEffect(() => {
    if (status.status === 'completed') {
      refreshModels()
      toast('success', 'Training complete', `model saved: ${config.custom_name}`)
    } else if (status.status === 'error') {
      toast('error', 'Training error', status.message)
    }
  }, [status.status, refreshModels, toast, config.custom_name, status.message])

  const isTraining = status.status === 'training' || status.status === 'starting'
  const etaMs = isTraining && status.epoch_ms && status.total_epochs && status.current_epoch
    ? Math.max(0, (status.total_epochs - status.current_epoch) * status.epoch_ms)
    : 0

  return (
    <div className="h-full flex flex-col">
      <div className="h-[26px] flex items-center px-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-[var(--amber)]">Fine-Tune</span>
        <span className="ml-3 font-mono text-[8px] text-[var(--grey)]">TRAIN CUSTOM MODELS VIA PYTORCH</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 max-w-3xl space-y-3">
        {!uploadData && (
          <div className="blz-panel p-4 text-center">
            <span className="blz-tag blz-tag-red">NO DATA</span>
            <div className="font-mono text-[9px] text-[var(--grey)] mt-1">UPLOAD DATA ON DASHBOARD FIRST</div>
          </div>
        )}

        <div className="blz-panel">
          <div className="blz-header">
            <span className="title">CONFIGURATION</span>
            <span className="meta font-mono">LSTM FINE-TUNE</span>
          </div>
          <div className="p-3 space-y-3 border-t border-[var(--border)]">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-0.5">
                <label className="block text-[8px] font-bold tracking-[0.1em] uppercase text-[var(--grey)]">BASE MODEL</label>
                <select className="blz-select w-full" value={config.model_name} onChange={e => setConfig(c => ({ ...c, model_name: e.target.value }))}>
                  {BASE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="space-y-0.5">
                <label className="block text-[8px] font-bold tracking-[0.1em] uppercase text-[var(--grey)]">
                  CUSTOM NAME
                  {config.custom_name && !nameValid && <span className="ml-1 text-[var(--red)]">INVALID</span>}
                </label>
                <input
                  className="blz-input w-full"
                  placeholder="my-model-001"
                  value={config.custom_name}
                  onChange={e => setConfig(c => ({ ...c, custom_name: e.target.value }))}
                />
                <div className="font-mono text-[7px] text-[var(--grey-dim)]">
                  {config.custom_name.length}/40 · [a-z0-9_-]
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <ParamInput label="LR" value={config.learning_rate} step={0.00001} onChange={v => setConfig(c => ({ ...c, learning_rate: v }))} />
              <ParamInput label="EPOCHS" value={config.num_epochs} step={1} min={1} max={50} onChange={v => setConfig(c => ({ ...c, num_epochs: v }))} />
              <ParamInput label="BATCH" value={config.batch_size} step={1} min={1} max={64} onChange={v => setConfig(c => ({ ...c, batch_size: v }))} />
              <ParamInput label="WARMUP" value={config.warmup_steps} step={10} min={0} onChange={v => setConfig(c => ({ ...c, warmup_steps: v }))} />
              <ParamInput label="DECAY" value={config.weight_decay} step={0.001} onChange={v => setConfig(c => ({ ...c, weight_decay: v }))} />
              <div className="space-y-0.5">
                <label className="block text-[8px] font-bold tracking-[0.1em] uppercase text-[var(--grey)]">
                  SPLIT <span className="text-[var(--amber)]">{config.train_split}</span>
                </label>
                <input type="range" className="w-full accent-[var(--amber)]" min={0.5} max={0.95} step={0.05} value={config.train_split} onChange={e => setConfig(c => ({ ...c, train_split: Number(e.target.value) }))} />
              </div>
            </div>

            <button
              onClick={startTraining}
              disabled={!uploadData || isTraining || !nameValid}
              className="blz-btn primary w-full py-1.5"
            >
              {isTraining ? 'TRAINING...' : 'START TRAINING'}
            </button>
          </div>
        </div>

        {status.status !== 'idle' && (
          <div className="blz-panel">
            <div className="blz-header">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  isTraining ? 'bg-[var(--amber)] blink' :
                  status.status === 'completed' ? 'bg-[var(--green)]' : 'bg-[var(--red)]'
                }`} />
                <span className="title uppercase">{status.status}</span>
              </div>
              {isTraining && (
                <span className="meta font-mono">
                  EPOCH {status.current_epoch}/{status.total_epochs} · {status.progress.toFixed(0)}% · {etaMs ? `ETA ${(etaMs/1000).toFixed(0)}s` : ''}
                </span>
              )}
            </div>
            <div className="p-3 space-y-2 border-t border-[var(--border)]">
              {isTraining && (
                <div className="w-full bg-[var(--bg-primary)] h-1">
                  <div className="bg-[var(--amber)] h-1 transition-all duration-500" style={{ width: `${status.progress}%` }} />
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <Stat label="TRAIN" value={status.train_loss?.toFixed(4) ?? '—'} />
                <Stat label="EVAL" value={status.eval_loss?.toFixed(4) ?? '—'} />
                <Stat label="DEVICE" value={status.device ?? 'cpu'} />
                <Stat label="EPOCH_MS" value={status.epoch_ms ? `${status.epoch_ms}ms` : '—'} />
              </div>
              {status.message && (
                <div className="font-mono text-[9px] text-[var(--grey)] bg-[var(--bg-primary)] px-2 py-1 border border-[var(--border)]">{status.message}</div>
              )}
              {lossHistory.length > 0 && (
                <div className="h-[140px] border border-[var(--border-dim)]">
                  <Plot
                    data={[
                      {
                        x: lossHistory.map((p) => p.step),
                        y: lossHistory.map((p) => p.train_loss),
                        type: 'scatter',
                        mode: 'lines+markers',
                        name: 'train',
                        line: { color: '#00bcd4', width: 1.5 },
                        marker: { size: 4, color: '#00bcd4' },
                      },
                      {
                        x: lossHistory.map((p) => p.step),
                        y: lossHistory.map((p) => p.eval_loss),
                        type: 'scatter',
                        mode: 'lines+markers',
                        name: 'eval',
                        line: { color: '#ff8800', width: 1.5 },
                        marker: { size: 4, color: '#ff8800' },
                      },
                    ]}
                    layout={{
                      height: undefined,
                      margin: { t: 5, b: 25, l: 40, r: 5 },
                      paper_bgcolor: 'transparent',
                      plot_bgcolor: 'transparent',
                      font: { color: '#666', size: 7, family: 'IBM Plex Mono' },
                      xaxis: { gridcolor: '#1a1a1a', tickfont: { size: 7 }, title: { text: 'EPOCH', font: { size: 7, color: '#666' } } },
                      yaxis: { gridcolor: '#1a1a1a', tickfont: { size: 7 }, title: { text: 'LOSS', font: { size: 7, color: '#666' } } },
                      legend: { orientation: 'h', y: 1.1, x: 0.5, xanchor: 'center', font: { size: 7, color: '#666' }, bgcolor: 'transparent' },
                    }}
                    config={{ displayModeBar: false }}
                    style={{ width: '100%', height: '100%' }}
                    useResizeHandler
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ParamInput({ label, value, step, min, max, onChange }: {
  label: string; value: number; step: number; min?: number; max?: number; onChange: (v: number) => void
}) {
  return (
    <div className="space-y-0.5">
      <label className="block text-[8px] font-bold tracking-[0.1em] uppercase text-[var(--grey)]">{label}</label>
      <input type="number" className="blz-input w-full" value={value} step={step} min={min} max={max} onChange={e => onChange(Number(e.target.value))} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="font-mono text-[9px]">
      <span className="text-[var(--grey)]">{label}: </span>
      <span className="text-[var(--white)]">{value}</span>
    </div>
  )
}

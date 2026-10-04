import { useState, useEffect, useCallback, useRef } from 'react'
import Plot from 'react-plotly.js'
import { apiGet, apiPost, errorMessage } from '../lib/api'
import { useApp } from '../lib/context'
import { useToast } from '../lib/toast'
import { C, PLOT_CONFIG, PLOT_STYLE, plotLayout } from '../lib/chartTheme'
import type { FineTuneConfig, FineTuneStatus, LossPoint } from '../lib/types'
import { HelpTip } from '../components/HelpTip'

const NAME_RE = /^[a-z0-9_-]{3,40}$/
const POLL_MS = 1000
const IDLE: FineTuneStatus = {
  status: 'idle', progress: 0, current_epoch: 0, total_epochs: 0, train_loss: 0, eval_loss: 0, message: '',
}

export default function FineTune() {
  const { uploadData, sessionId, refreshModels } = useApp()
  const toast = useToast()
  const [config, setConfig] = useState<FineTuneConfig>({
    model_name: 'lstm',
    custom_name: '',
    target_column: '',
    learning_rate: 1e-3,
    num_epochs: 10,
    batch_size: 16,
    warmup_steps: 20,
    weight_decay: 0.01,
    train_split: 0.8,
    val_split: 0.1,
  })
  const [status, setStatus] = useState<FineTuneStatus>(IDLE)
  const [lossHistory, setLossHistory] = useState<LossPoint[]>([])
  const prevStatus = useRef<FineTuneStatus['status']>('idle')

  const nameValid = NAME_RE.test(config.custom_name)
  const isTraining = status.status === 'training' || status.status === 'starting'
  const set = <K extends keyof FineTuneConfig>(key: K, value: FineTuneConfig[K]) => setConfig((c) => ({ ...c, [key]: value }))

  const pollStatus = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        apiGet<FineTuneStatus>('/finetune/status'),
        apiGet<{ history: LossPoint[] }>('/finetune/loss-history'),
      ])
      setStatus(s)
      setLossHistory(h.history || [])
    } catch {}
  }, [])

  // Sync once on mount (training may already be running), then poll while active.
  useEffect(() => { pollStatus() }, [pollStatus])
  useEffect(() => {
    if (!isTraining) return
    const id = setInterval(pollStatus, POLL_MS)
    return () => clearInterval(id)
  }, [isTraining, pollStatus])

  // Toast only on transitions out of training, not on mount.
  useEffect(() => {
    const prev = prevStatus.current
    prevStatus.current = status.status
    if (prev !== 'training' && prev !== 'starting') return
    if (status.status === 'completed') {
      refreshModels()
      toast('success', 'Training complete', status.message)
    } else if (status.status === 'error') {
      toast('error', 'Training error', status.message)
    }
  }, [status.status, status.message, refreshModels, toast])

  const startTraining = async () => {
    if (!sessionId || !nameValid) return
    try {
      await apiPost('/finetune/start', { session_id: sessionId, ...config, target_column: config.target_column || null })
      setLossHistory([])
      setStatus({ ...IDLE, status: 'starting', total_epochs: config.num_epochs, message: 'Initializing...' })
      toast('info', 'Training started', config.custom_name)
    } catch (err) {
      toast('error', 'Could not start training', errorMessage(err))
    }
  }

  const etaMs = isTraining && status.epoch_ms && status.total_epochs
    ? Math.max(0, (status.total_epochs - status.current_epoch) * status.epoch_ms)
    : 0
  const statusColor = isTraining ? 'var(--amber)' : status.status === 'completed' ? 'var(--green)' : 'var(--red)'

  return (
    <div className="h-full flex flex-col">
      <header className="h-[30px] flex items-center px-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <h1 className="text-[11px] font-bold tracking-[0.1em] uppercase text-[var(--amber)]">Fine-Tune</h1>
        <span className="ml-3 text-[10px] text-[var(--grey)]">Train a custom LSTM forecaster on your data</span>
      </header>

      <div className="flex-1 overflow-y-auto p-4 max-w-3xl space-y-3">
        {!uploadData && (
          <div className="blz-panel p-4 text-center">
            <span className="blz-tag blz-tag-amber">NO DATA</span>
            <div className="font-mono text-[10px] text-[var(--grey)] mt-1.5">Load a dataset on the Dashboard first.</div>
          </div>
        )}

        <section className="blz-panel">
          <div className="blz-header">
            <span className="title">CONFIGURATION</span>
            <span className="meta font-mono normal-case tracking-normal">{uploadData ? uploadData.filename : '—'}</span>
          </div>
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="TARGET" tip="Column the LSTM learns to predict one step ahead. AUTO picks the first non-id numeric column.">
                <select className="blz-select w-full" value={config.target_column} onChange={(e) => set('target_column', e.target.value)}>
                  <option value="">AUTO</option>
                  {uploadData?.numeric_columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field
                label="MODEL NAME"
                tip="3-40 characters: lowercase letters, digits, underscores, hyphens. Becomes the registered model name, selectable in the forecast MODEL dropdown."
                extra={config.custom_name && !nameValid ? <span className="text-[var(--red)]">INVALID</span> : <span className="text-[var(--grey-dim)]">{config.custom_name.length}/40</span>}
              >
                <input
                  className="blz-input w-full"
                  placeholder="my-model-001"
                  value={config.custom_name}
                  onChange={(e) => set('custom_name', e.target.value.toLowerCase())}
                  aria-invalid={!!config.custom_name && !nameValid}
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <NumberField label="LR" tip="Learning rate. Higher = faster but unstable; lower = slower but more stable convergence." value={config.learning_rate} step={0.0001} onChange={(v) => set('learning_rate', v)} />
              <NumberField label="EPOCHS" tip="Passes through the training data. More = better fit, risk of overfitting." value={config.num_epochs} step={1} min={1} max={200} onChange={(v) => set('num_epochs', v)} />
              <NumberField label="BATCH" tip="Batch size. Larger = faster epochs, smoother gradients." value={config.batch_size} step={1} min={1} max={256} onChange={(v) => set('batch_size', v)} />
              <NumberField label="WARMUP" tip="Steps over which the learning rate ramps up from 0 to LR (capped at 25% of training)." value={config.warmup_steps} step={10} min={0} onChange={(v) => set('warmup_steps', v)} />
              <NumberField label="DECAY" tip="Weight decay (L2 regularization). Helps prevent overfitting." value={config.weight_decay} step={0.001} min={0} onChange={(v) => set('weight_decay', v)} />
              <Field label={<>SPLIT<span className="ml-1 text-[var(--amber)] tabular-nums">{config.train_split.toFixed(2)}</span></>} tip="Fraction of windows used for training; the rest (most recent data) is used for validation loss.">
                <input type="range" className="w-full accent-[var(--amber)]" min={0.5} max={0.95} step={0.05} value={config.train_split} onChange={(e) => set('train_split', Number(e.target.value))} />
              </Field>
            </div>

            <button onClick={startTraining} disabled={!uploadData || isTraining || !nameValid} className="blz-btn primary w-full py-1.5">
              {isTraining ? 'TRAINING…' : 'START TRAINING'}
            </button>
          </div>
        </section>

        {status.status !== 'idle' && (
          <section className="blz-panel">
            <div className="blz-header">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${isTraining ? 'blink' : ''}`} style={{ background: statusColor }} />
                <span className="title">{status.status}</span>
              </div>
              {isTraining && (
                <span className="meta font-mono tabular-nums">
                  EPOCH {status.current_epoch}/{status.total_epochs} · {status.progress.toFixed(0)}%{etaMs ? ` · ETA ${(etaMs / 1000).toFixed(0)}s` : ''}
                </span>
              )}
            </div>
            <div className="p-3 space-y-2">
              {isTraining && (
                <div className="w-full bg-[var(--bg-primary)] h-1" role="progressbar" aria-valuenow={status.progress} aria-valuemin={0} aria-valuemax={100}>
                  <div className="bg-[var(--amber)] h-1 transition-[width] duration-500" style={{ width: `${status.progress}%` }} />
                </div>
              )}
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <Stat label="TRAIN" value={status.train_loss ? status.train_loss.toFixed(4) : '—'} />
                <Stat label="EVAL" value={status.eval_loss ? status.eval_loss.toFixed(4) : '—'} />
                <Stat label="DEVICE" value={status.device ?? 'cpu'} />
                <Stat label="EPOCH" value={status.epoch_ms ? `${status.epoch_ms}ms` : '—'} />
              </div>
              {status.message && (
                <div className="font-mono text-[10px] text-[var(--grey-bright)] bg-[var(--bg-primary)] px-2 py-1 border border-[var(--border)]">{status.message}</div>
              )}
              {lossHistory.length > 0 && (
                <div className="h-[160px] border border-[var(--border-dim)]">
                  <Plot
                    data={[
                      { x: lossHistory.map((p) => p.step), y: lossHistory.map((p) => p.train_loss), type: 'scatter', mode: 'lines+markers', name: 'train', line: { color: C.cyan, width: 1.5 }, marker: { size: 4 } },
                      { x: lossHistory.map((p) => p.step), y: lossHistory.map((p) => p.eval_loss), type: 'scatter', mode: 'lines+markers', name: 'eval', line: { color: C.amber, width: 1.5 }, marker: { size: 4 } },
                    ]}
                    layout={plotLayout({
                      margin: { t: 8, b: 30, l: 48, r: 8 },
                      xaxis: { title: { text: 'EPOCH', font: { size: 9 } }, dtick: lossHistory.length <= 20 ? 1 : undefined },
                      yaxis: { title: { text: 'LOSS', font: { size: 9 } } },
                    })}
                    config={PLOT_CONFIG}
                    style={PLOT_STYLE}
                    useResizeHandler
                  />
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function Field({ label, tip, extra, children }: { label: React.ReactNode; tip: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="blz-label">{label}<HelpTip text={tip} /></span>
        {extra && <span className="font-mono text-[9px]">{extra}</span>}
      </div>
      {children}
    </div>
  )
}

function NumberField({ label, tip, value, step, min, max, onChange }: {
  label: string; tip: string; value: number; step: number; min?: number; max?: number; onChange: (v: number) => void
}) {
  return (
    <Field label={label} tip={tip}>
      <input
        type="number"
        className="blz-input w-full tabular-nums"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => { if (e.target.value !== '') onChange(Number(e.target.value)) }}
      />
    </Field>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="font-mono text-[10px]">
      <span className="text-[var(--grey)]">{label} </span>
      <span className="text-[var(--white)] tabular-nums">{value}</span>
    </div>
  )
}

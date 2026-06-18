import { useState, useEffect, useCallback, useRef } from 'react'
import { apiGet, apiPost } from '../lib/api'
import { useApp } from '../lib/context'
import { useToast } from '../lib/toast'
import type { FineTuneConfig, FineTuneStatus } from '../lib/types'

const BASE_MODELS = [
  'amazon/chronos-t5-small',
  'amazon/chronos-t5-base',
  'amazon/chronos-t5-large',
  'amazon/chronos-bolt-small',
  'amazon/chronos-bolt-base',
  'google/timesfm-1.0-200m',
]

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pollStatus = useCallback(async () => {
    try {
      const s = await apiGet<FineTuneStatus>('/finetune/status')
      setStatus(s)
      if (s.status === 'completed' || s.status === 'error') {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }
    } catch {}
  }, [])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const startTraining = async () => {
    if (!sessionId || !config.custom_name.trim()) return
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

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
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

        {/* Config */}
        <div className="blz-panel">
          <div className="blz-header">
            <span className="title">CONFIGURATION</span>
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
                <label className="block text-[8px] font-bold tracking-[0.1em] uppercase text-[var(--grey)]">CUSTOM NAME</label>
                <input className="blz-input w-full" placeholder="my-model" value={config.custom_name} onChange={e => setConfig(c => ({ ...c, custom_name: e.target.value }))} />
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

            <button onClick={startTraining} disabled={!uploadData || status.status === 'training'} className="blz-btn primary w-full py-1.5">
              {status.status === 'training' ? 'TRAINING...' : 'START TRAINING'}
            </button>
          </div>
        </div>

        {/* Status */}
        {status.status !== 'idle' && (
          <div className="blz-panel">
            <div className="blz-header">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  status.status === 'training' ? 'bg-[var(--amber)] blink' :
                  status.status === 'completed' ? 'bg-[var(--green)]' : 'bg-[var(--red)]'
                }`} />
                <span className="title uppercase">{status.status}</span>
              </div>
              {status.status === 'training' && (
                <span className="meta font-mono">
                  EPOCH {status.current_epoch}/{status.total_epochs} · {status.progress.toFixed(0)}%
                </span>
              )}
            </div>
            <div className="p-3 space-y-2 border-t border-[var(--border)]">
              {status.status === 'training' && (
                <div className="w-full bg-[var(--bg-primary)] h-1">
                  <div className="bg-[var(--amber)] h-1 transition-all duration-500" style={{ width: `${status.progress}%` }} />
                </div>
              )}
              <div className="flex gap-4">
                <div className="font-mono text-[9px]">
                  <span className="text-[var(--grey)]">TRAIN: </span>
                  <span className="text-[var(--white)]">{status.train_loss?.toFixed(4) ?? '—'}</span>
                </div>
                <div className="font-mono text-[9px]">
                  <span className="text-[var(--grey)]">EVAL: </span>
                  <span className="text-[var(--white)]">{status.eval_loss?.toFixed(4) ?? '—'}</span>
                </div>
              </div>
              {status.message && (
                <div className="font-mono text-[9px] text-[var(--grey)] bg-[var(--bg-primary)] px-2 py-1 border border-[var(--border)]">{status.message}</div>
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

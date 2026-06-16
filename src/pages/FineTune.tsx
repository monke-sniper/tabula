import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { useApp } from '../lib/context'
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
  const { uploadData, sessionId } = useApp()
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
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null)

  const pollStatus = useCallback(async () => {
    try {
      const s = await apiFetch<FineTuneStatus>('/finetune/status')
      setStatus(s)
      if (s.status === 'completed' || s.status === 'error') {
        if (pollInterval) { clearInterval(pollInterval); setPollInterval(null) }
      }
    } catch {}
  }, [pollInterval])

  useEffect(() => () => { if (pollInterval) clearInterval(pollInterval) }, [pollInterval])

  const startTraining = async () => {
    if (!sessionId || !config.custom_name.trim()) return
    setStatus(prev => ({ ...prev, status: 'training', message: 'Starting...' }))
    try {
      await apiFetch('/finetune/start', {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId, ...config }),
      })
      setInterval(setInterval(pollStatus, 2000))
    } catch (err: unknown) {
      setStatus(prev => ({ ...prev, status: 'error', message: err instanceof Error ? err.message : 'Failed' }))
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="h-[42px] flex items-center px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] shrink-0">
        <h1 className="text-[13px] font-bold tracking-wide text-[var(--text-primary)]">Fine-Tune</h1>
        <span className="ml-3 font-mono text-[9px] text-[var(--text-muted)]">Train custom models via HuggingFace Trainer</span>
      </div>

      <div className="p-4 max-w-3xl space-y-4">
        {!uploadData && (
          <div className="terminal-panel p-6 text-center">
            <div className="tag tag-warning inline-block mb-2">No Data</div>
            <div className="font-mono text-[11px] text-[var(--text-muted)]">Upload data on Dashboard first</div>
          </div>
        )}

        <div className="terminal-panel">
          <div className="terminal-header">
            <span className="active">Configuration</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block font-mono text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--text-muted)]">Base Model</label>
                <select className="select-terminal w-full" value={config.model_name} onChange={e => setConfig(c => ({ ...c, model_name: e.target.value }))}>
                  {BASE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block font-mono text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--text-muted)]">Custom Name</label>
                <input className="input-terminal w-full" placeholder="my-model" value={config.custom_name} onChange={e => setConfig(c => ({ ...c, custom_name: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <ParamInput label="Learning Rate" value={config.learning_rate} step={0.00001} onChange={v => setConfig(c => ({ ...c, learning_rate: v }))} />
              <ParamInput label="Epochs" value={config.num_epochs} step={1} min={1} max={50} onChange={v => setConfig(c => ({ ...c, num_epochs: v }))} />
              <ParamInput label="Batch Size" value={config.batch_size} step={1} min={1} max={64} onChange={v => setConfig(c => ({ ...c, batch_size: v }))} />
              <ParamInput label="Warmup Steps" value={config.warmup_steps} step={10} min={0} onChange={v => setConfig(c => ({ ...c, warmup_steps: v }))} />
              <ParamInput label="Weight Decay" value={config.weight_decay} step={0.001} onChange={v => setConfig(c => ({ ...c, weight_decay: v }))} />
              <div className="space-y-1">
                <label className="block font-mono text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--text-muted)]">
                  Train Split <span className="text-[var(--accent-cyan)]">{config.train_split}</span>
                </label>
                <input type="range" className="w-full accent-[var(--accent-cyan)]" min={0.5} max={0.95} step={0.05} value={config.train_split} onChange={e => setConfig(c => ({ ...c, train_split: Number(e.target.value) }))} />
              </div>
            </div>

            <button onClick={startTraining} disabled={!uploadData || status.status === 'training'} className="btn-terminal primary w-full py-2.5">
              {status.status === 'training' ? 'Training...' : 'Start Training'}
            </button>
          </div>
        </div>

        {status.status !== 'idle' && (
          <div className="terminal-panel">
            <div className="terminal-header">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  status.status === 'training' ? 'bg-[var(--accent-cyan)] animate-pulse' :
                  status.status === 'completed' ? 'bg-[var(--up)]' : 'bg-[var(--down)]'
                }`} />
                <span className="active capitalize">{status.status}</span>
              </div>
              {status.status === 'training' && (
                <span className="font-mono text-[10px] text-[var(--text-muted)]">
                  Epoch {status.current_epoch}/{status.total_epochs} · {status.progress.toFixed(0)}%
                </span>
              )}
            </div>
            <div className="p-4 space-y-3">
              {status.status === 'training' && (
                <div className="w-full bg-[var(--bg-primary)] rounded-full h-1.5">
                  <div className="bg-[var(--accent-cyan)] h-1.5 rounded-full transition-all duration-500" style={{ width: `${status.progress}%` }} />
                </div>
              )}
              <div className="flex gap-6">
                <div className="font-mono text-[10px]">
                  <span className="text-[var(--text-muted)]">Train Loss: </span>
                  <span className="text-[var(--text-primary)]">{status.train_loss?.toFixed(4) ?? '—'}</span>
                </div>
                <div className="font-mono text-[10px]">
                  <span className="text-[var(--text-muted)]">Eval Loss: </span>
                  <span className="text-[var(--text-primary)]">{status.eval_loss?.toFixed(4) ?? '—'}</span>
                </div>
              </div>
              {status.message && (
                <div className="font-mono text-[10px] text-[var(--text-muted)] bg-[var(--bg-primary)] rounded px-3 py-2 border border-[var(--border-subtle)]">{status.message}</div>
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
    <div className="space-y-1">
      <label className="block font-mono text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--text-muted)]">{label}</label>
      <input
        type="number"
        className="input-terminal w-full"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  )
}

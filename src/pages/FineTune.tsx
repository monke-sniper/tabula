import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { useApp } from '../lib/context'
import type { ModelInfo, FineTuneConfig, FineTuneStatus } from '../lib/types'

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
    status: 'idle',
    progress: 0,
    current_epoch: 0,
    total_epochs: 0,
    train_loss: 0,
    eval_loss: 0,
    message: '',
  })
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null)

  const pollStatus = useCallback(async () => {
    try {
      const s = await apiFetch<FineTuneStatus>('/finetune/status')
      setStatus(s)
      if (s.status === 'completed' || s.status === 'error') {
        if (pollInterval) {
          clearInterval(pollInterval)
          setPollInterval(null)
        }
      }
    } catch {
      // ignore polling errors
    }
  }, [pollInterval])

  useEffect(() => {
    return () => {
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [pollInterval])

  const startTraining = async () => {
    if (!sessionId) return
    if (!config.custom_name.trim()) {
      alert('Please enter a custom model name')
      return
    }

    setStatus(prev => ({ ...prev, status: 'training', message: 'Starting...' }))

    try {
      await apiFetch('/finetune/start', {
        method: 'POST',
        body: JSON.stringify({
          session_id: sessionId,
          ...config,
        }),
      })

      const interval = setInterval(pollStatus, 2000)
      setPollInterval(interval)
    } catch (err: unknown) {
      setStatus(prev => ({
        ...prev,
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to start',
      }))
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-text">Fine-Tune</h2>
        <p className="text-sm text-muted mt-1">Train a custom model on your data using HuggingFace Trainer</p>
      </div>

      {!uploadData && (
        <div className="card p-6 text-center text-muted text-sm">
          Upload data on the Dashboard first to enable fine-tuning
        </div>
      )}

      <div className="card p-5 space-y-5">
        <div>
          <label className="block text-xs text-muted mb-1.5">Base Model</label>
          <select
            className="input-field w-full"
            value={config.model_name}
            onChange={e => setConfig(c => ({ ...c, model_name: e.target.value }))}
          >
            {BASE_MODELS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1.5">Custom Model Name</label>
          <input
            className="input-field w-full"
            placeholder="e.g. my-custom-forecaster"
            value={config.custom_name}
            onChange={e => setConfig(c => ({ ...c, custom_name: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">Learning Rate</label>
            <input
              type="number"
              className="input-field w-full"
              value={config.learning_rate}
              step={0.00001}
              onChange={e => setConfig(c => ({ ...c, learning_rate: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Epochs</label>
            <input
              type="number"
              className="input-field w-full"
              value={config.num_epochs}
              min={1}
              max={50}
              onChange={e => setConfig(c => ({ ...c, num_epochs: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Batch Size</label>
            <input
              type="number"
              className="input-field w-full"
              value={config.batch_size}
              min={1}
              max={64}
              onChange={e => setConfig(c => ({ ...c, batch_size: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Warmup Steps</label>
            <input
              type="number"
              className="input-field w-full"
              value={config.warmup_steps}
              min={0}
              onChange={e => setConfig(c => ({ ...c, warmup_steps: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Weight Decay</label>
            <input
              type="number"
              className="input-field w-full"
              value={config.weight_decay}
              step={0.001}
              onChange={e => setConfig(c => ({ ...c, weight_decay: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Train Split: {config.train_split}</label>
            <input
              type="range"
              className="w-full accent-accent"
              min={0.5}
              max={0.95}
              step={0.05}
              value={config.train_split}
              onChange={e => setConfig(c => ({ ...c, train_split: Number(e.target.value) }))}
            />
          </div>
        </div>

        <button
          onClick={startTraining}
          disabled={!uploadData || status.status === 'training'}
          className="btn-success w-full"
        >
          {status.status === 'training' ? 'Training...' : 'Start Fine-Tuning'}
        </button>
      </div>

      {/* Training Status */}
      {status.status !== 'idle' && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${
              status.status === 'training' ? 'bg-accent animate-pulse' :
              status.status === 'completed' ? 'bg-success' :
              'bg-danger'
            }`} />
            <span className="text-sm font-medium capitalize">{status.status}</span>
          </div>

          {status.status === 'training' && (
            <div>
              <div className="flex justify-between text-xs text-muted mb-1">
                <span>Epoch {status.current_epoch}/{status.total_epochs}</span>
                <span>{status.progress.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-border rounded-full h-2">
                <div
                  className="bg-accent h-2 rounded-full transition-all duration-300"
                  style={{ width: `${status.progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-muted">Train Loss: </span>
              <span className="font-mono text-text">{status.train_loss?.toFixed(4) ?? '-'}</span>
            </div>
            <div>
              <span className="text-muted">Eval Loss: </span>
              <span className="font-mono text-text">{status.eval_loss?.toFixed(4) ?? '-'}</span>
            </div>
          </div>

          {status.message && (
            <div className="text-xs text-muted bg-bg rounded px-3 py-2 font-mono">{status.message}</div>
          )}
        </div>
      )}
    </div>
  )
}

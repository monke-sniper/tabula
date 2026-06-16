import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { useApp } from '../lib/context'
import type { ModelInfo } from '../lib/types'

export default function Models() {
  const { activeModel, setActiveModel, models, setModels } = useApp()
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadModels() }, [])

  const loadModels = async () => {
    try {
      const result = await apiFetch<{ models: ModelInfo[]; active: string }>('/models')
      setModels(result.models)
      setActiveModel(result.active)
    } catch {} finally { setLoading(false) }
  }

  const selectModel = async (name: string) => {
    try {
      await apiFetch('/models/active', { method: 'PUT', body: JSON.stringify({ model: name }) })
      setActiveModel(name)
    } catch (err: unknown) { alert(err instanceof Error ? err.message : 'Failed') }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="h-[42px] flex items-center justify-between px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-[13px] font-bold tracking-wide text-[var(--text-primary)]">Models</h1>
          <span className="font-mono text-[9px] text-[var(--text-muted)]">Registry & Selection</span>
        </div>
        <button onClick={loadModels} className="btn-terminal py-1">Refresh</button>
      </div>

      <div className="p-4 max-w-3xl space-y-4">
        {/* Active model */}
        <div className="terminal-panel">
          <div className="terminal-header">
            <span className="active">Active Model</span>
          </div>
          <div className="p-3">
            <div className="font-mono text-[12px] text-[var(--accent-cyan)] bg-[var(--bg-primary)] rounded px-3 py-2 border border-[var(--border-subtle)]">
              {activeModel}
            </div>
          </div>
        </div>

        {/* Model list */}
        <div className="terminal-panel">
          <div className="terminal-header">
            <span className="active">Available Models</span>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">{models.length} registered</span>
          </div>
          {loading ? (
            <div className="p-8 text-center font-mono text-[11px] text-[var(--text-muted)]">Loading...</div>
          ) : !models.length ? (
            <div className="p-8 text-center">
              <div className="font-mono text-[11px] text-[var(--text-muted)]">No custom models</div>
              <div className="font-mono text-[10px] text-[var(--text-muted)] mt-1">Fine-tune a model to register it here</div>
            </div>
          ) : (
            <div>
              {models.map(model => (
                <div
                  key={model.name}
                  className={`px-4 py-3 flex items-center justify-between border-b border-[var(--border-subtle)]/50 transition-colors ${
                    model.name === activeModel ? 'bg-[var(--accent-cyan-dim)]' : 'hover:bg-[var(--bg-tertiary)]/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-medium text-[var(--text-primary)]">{model.name}</span>
                      {model.name === activeModel && <div className="tag tag-cyan">Active</div>}
                    </div>
                    <div className="font-mono text-[9px] text-[var(--text-muted)] mt-1">
                      Base: {model.base_model} · {new Date(model.created_at).toLocaleDateString()}
                    </div>
                    {model.metrics && (
                      <div className="font-mono text-[9px] text-[var(--text-muted)] mt-0.5">
                        Loss: {model.metrics.loss?.toFixed(4) ?? '—'}
                        {model.metrics.eval_loss && ` · Eval: ${model.metrics.eval_loss.toFixed(4)}`}
                      </div>
                    )}
                  </div>
                  {model.name !== activeModel && (
                    <button onClick={() => selectModel(model.name)} className="btn-terminal">Select</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

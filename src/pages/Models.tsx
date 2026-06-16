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
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="h-[26px] flex items-center justify-between px-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-[var(--amber)]">Models</span>
          <span className="text-[8px] text-[var(--grey)]">REGISTRY</span>
        </div>
        <button onClick={loadModels} className="blz-btn py-0">REFRESH</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 max-w-3xl space-y-3">
        {/* Active model */}
        <div className="blz-panel">
          <div className="blz-header">
            <span className="title">ACTIVE MODEL</span>
          </div>
          <div className="p-2 border-t border-[var(--border)]">
            <div className="font-mono text-[11px] text-[var(--amber)] bg-[var(--bg-primary)] px-2 py-1.5 border border-[var(--border)]">
              {activeModel}
            </div>
          </div>
        </div>

        {/* Model list */}
        <div className="blz-panel">
          <div className="blz-header">
            <span className="title">AVAILABLE</span>
            <span className="meta font-mono">{models.length} registered</span>
          </div>
          {loading ? (
            <div className="p-6 text-center font-mono text-[9px] text-[var(--grey)]">LOADING...</div>
          ) : !models.length ? (
            <div className="p-6 text-center">
              <div className="font-mono text-[9px] text-[var(--grey)]">NO CUSTOM MODELS</div>
              <div className="font-mono text-[8px] text-[var(--grey-dim)] mt-1">FINE-TUNE A MODEL TO REGISTER IT</div>
            </div>
          ) : (
            <div>
              {models.map(model => (
                <div
                  key={model.name}
                  className={`px-3 py-2 flex items-center justify-between border-b border-[var(--border-dim)] transition-colors ${
                    model.name === activeModel ? 'bg-[var(--amber-dim)]' : 'hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-medium text-[var(--white)]">{model.name}</span>
                      {model.name === activeModel && <span className="blz-tag blz-tag-amber">ACTIVE</span>}
                    </div>
                    <div className="font-mono text-[8px] text-[var(--grey)] mt-0.5">
                      BASE: {model.base_model} · {new Date(model.created_at).toLocaleDateString()}
                    </div>
                    {model.metrics && (
                      <div className="font-mono text-[8px] text-[var(--grey-dim)] mt-0.5">
                        LOSS: {model.metrics.loss?.toFixed(4) ?? '—'}
                        {model.metrics.eval_loss && ` · EVAL: ${model.metrics.eval_loss.toFixed(4)}`}
                      </div>
                    )}
                  </div>
                  {model.name !== activeModel && (
                    <button onClick={() => selectModel(model.name)} className="blz-btn">SELECT</button>
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

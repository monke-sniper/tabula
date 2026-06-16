import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { useApp } from '../lib/context'
import type { ModelInfo } from '../lib/types'

export default function Models() {
  const { activeModel, setActiveModel, models, setModels } = useApp()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadModels()
  }, [])

  const loadModels = async () => {
    try {
      const result = await apiFetch<{ models: ModelInfo[]; active: string }>('/models')
      setModels(result.models)
      setActiveModel(result.active)
    } catch {
      // Models endpoint might not have any models yet
    } finally {
      setLoading(false)
    }
  }

  const selectModel = async (modelName: string) => {
    try {
      await apiFetch('/models/active', {
        method: 'PUT',
        body: JSON.stringify({ model: modelName }),
      })
      setActiveModel(modelName)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to set model')
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-text">Models</h2>
        <p className="text-sm text-muted mt-1">Manage your models and select the active one</p>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-medium text-accent mb-3">Active Model</h3>
        <div className="bg-bg border border-border rounded-md px-4 py-3 font-mono text-sm">
          {activeModel}
        </div>
      </div>

      <div className="card">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-medium text-text">Available Models</h3>
          <button onClick={loadModels} className="btn-ghost text-xs">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted text-sm">Loading models...</div>
        ) : !models.length ? (
          <div className="p-8 text-center text-muted text-sm">
            No custom models yet. Fine-tune a model on the Dashboard to get started.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {models.map(model => (
              <div
                key={model.name}
                className={`px-5 py-4 flex items-center justify-between transition-colors ${
                  model.name === activeModel ? 'bg-accent/5' : 'hover:bg-border/30'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-text">{model.name}</span>
                    {model.name === activeModel && (
                      <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full">Active</span>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-1">
                    Base: {model.base_model} &middot; Created: {new Date(model.created_at).toLocaleDateString()}
                  </div>
                  {model.metrics && (
                    <div className="text-xs text-muted mt-1 font-mono">
                      {model.metrics.loss && `Loss: ${model.metrics.loss.toFixed(4)}`}
                      {model.metrics.eval_loss && ` | Eval: ${model.metrics.eval_loss.toFixed(4)}`}
                    </div>
                  )}
                </div>
                {model.name !== activeModel && (
                  <button
                    onClick={() => selectModel(model.name)}
                    className="btn-ghost text-xs text-accent"
                  >
                    Select
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

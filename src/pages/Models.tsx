import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPut, apiDelete } from '../lib/api'
import { useApp } from '../lib/context'
import { useToast } from '../lib/toast'
import type { ModelListResponse } from '../lib/types'

export default function Models() {
  const { activeModel, models, refreshModels } = useApp()
  const navigate = useNavigate()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      await refreshModels()
    } finally {
      setLoading(false)
    }
  }, [refreshModels])

  useEffect(() => { load() }, [load])

  const selectModel = async (name: string) => {
    try {
      await apiPut('/models/active', { model: name })
      toast('success', 'Active model set', name)
      await refreshModels()
    } catch (err: any) {
      toast('error', 'Select failed', err?.message)
    }
  }

  const useModel = async (name: string) => {
    try {
      await apiPut('/models/active', { model: name })
      toast('success', 'Active', name)
      await refreshModels()
      navigate('/')
    } catch (err: any) {
      toast('error', 'Use failed', err?.message)
    }
  }

  const removeModel = async (name: string) => {
    try {
      await apiDelete<{ status: string }>(`/models/${encodeURIComponent(name)}`)
      toast('success', 'Deleted', name)
      setPendingDelete(null)
      await refreshModels()
    } catch (err: any) {
      toast('error', 'Delete failed', err?.message)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="h-[26px] flex items-center justify-between px-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-[var(--amber)]">Models</span>
          <span className="font-mono text-[8px] text-[var(--grey)]">REGISTRY</span>
        </div>
        <button onClick={load} className="blz-btn py-0">REFRESH</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 max-w-3xl space-y-3">
        <div className="blz-panel">
          <div className="blz-header">
            <span className="title">ACTIVE MODEL</span>
            {activeModel && <span className="meta font-mono">{activeModel.startsWith('amazon/') ? 'HF' : activeModel.startsWith('google/') ? 'HF' : 'LOCAL'}</span>}
          </div>
          <div className="p-2 border-t border-[var(--border)]">
            <div className="font-mono text-[11px] text-[var(--amber)] bg-[var(--bg-primary)] px-2 py-1.5 border border-[var(--border)]">
              {activeModel}
            </div>
          </div>
        </div>

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
              <button onClick={() => navigate('/finetune')} className="blz-btn mt-3">GO TO FINE-TUNE</button>
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
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-medium text-[var(--white)]">{model.name}</span>
                      {model.name === activeModel && <span className="blz-tag blz-tag-amber">ACTIVE</span>}
                      {model.engine && <span className="blz-tag blz-tag-cyan">{model.engine}</span>}
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
                  <div className="flex items-center gap-1.5 shrink-0">
                    {model.name !== activeModel && (
                      <button onClick={() => useModel(model.name)} className="blz-btn primary">USE</button>
                    )}
                    {model.name !== activeModel && (
                      <button onClick={() => selectModel(model.name)} className="blz-btn">SELECT</button>
                    )}
                    <button onClick={() => setPendingDelete(model.name)} className="blz-btn" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>DEL</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setPendingDelete(null)}>
          <div className="blz-panel w-[360px]" onClick={(e) => e.stopPropagation()}>
            <div className="blz-header"><span className="title">CONFIRM DELETE</span></div>
            <div className="p-3 space-y-3">
              <div className="font-mono text-[9px] text-[var(--grey)]">
                Delete model <span className="text-[var(--amber)]">{pendingDelete}</span>? This cannot be undone.
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setPendingDelete(null)} className="blz-btn">CANCEL</button>
                <button onClick={() => removeModel(pendingDelete)} className="blz-btn" style={{ background: 'var(--red-dim)', color: 'var(--red)', borderColor: 'var(--red)' }}>DELETE</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

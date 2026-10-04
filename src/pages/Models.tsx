import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiPut, apiDelete, errorMessage } from '../lib/api'
import { useApp } from '../lib/context'
import { useToast } from '../lib/toast'

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

  useEffect(() => {
    if (!pendingDelete) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPendingDelete(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pendingDelete])

  const activate = async (name: string, thenGoToDashboard: boolean) => {
    try {
      await apiPut('/models/active', { model: name })
      toast('success', 'Active model set', name)
      await refreshModels()
      if (thenGoToDashboard) navigate('/')
    } catch (err) {
      toast('error', 'Could not set active model', errorMessage(err))
    }
  }

  const removeModel = async (name: string) => {
    try {
      await apiDelete(`/models/${encodeURIComponent(name)}`)
      toast('success', 'Deleted', name)
      setPendingDelete(null)
      await refreshModels()
    } catch (err) {
      toast('error', 'Delete failed', errorMessage(err))
    }
  }

  const source = activeModel.includes('/') ? 'HUGGING FACE' : activeModel === 'statistical-fallback' ? 'BUILT-IN' : 'LOCAL'

  return (
    <div className="h-full flex flex-col">
      <header className="h-[30px] flex items-center justify-between px-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-[11px] font-bold tracking-[0.1em] uppercase text-[var(--amber)]">Models</h1>
          <span className="text-[10px] text-[var(--grey)]">Registry</span>
        </div>
        <button onClick={load} className="blz-btn py-0">REFRESH</button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 max-w-3xl space-y-3">
        <section className="blz-panel">
          <div className="blz-header">
            <span className="title">ACTIVE MODEL</span>
            <span className="meta font-mono">{source}</span>
          </div>
          <div className="p-2">
            <div className="font-mono text-[12px] text-[var(--amber)] bg-[var(--bg-primary)] px-2 py-1.5 border border-[var(--border)]">
              {activeModel}
            </div>
          </div>
        </section>

        <section className="blz-panel">
          <div className="blz-header">
            <span className="title">FINE-TUNED</span>
            <span className="meta font-mono">{models.length} registered</span>
          </div>
          {loading ? (
            <div className="p-6 text-center font-mono text-[10px] text-[var(--grey)]">LOADING…</div>
          ) : !models.length ? (
            <div className="p-6 text-center">
              <div className="font-mono text-[11px] text-[var(--grey-bright)]">No custom models yet</div>
              <div className="font-mono text-[10px] text-[var(--grey)] mt-1">Train one and it will appear here and in the forecast MODEL list.</div>
              <button onClick={() => navigate('/finetune')} className="blz-btn mt-3">GO TO FINE-TUNE</button>
            </div>
          ) : (
            <ul>
              {models.map((model) => {
                const isActive = model.name === activeModel
                return (
                  <li
                    key={model.name}
                    className={`px-3 py-2 flex items-center justify-between gap-3 border-b border-[var(--border-dim)] last:border-b-0 ${
                      isActive ? 'bg-[var(--amber-dim)]' : 'hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-medium text-[var(--white)] truncate">{model.name}</span>
                        {isActive && <span className="blz-tag blz-tag-amber">ACTIVE</span>}
                        {model.engine && <span className="blz-tag blz-tag-cyan">{model.engine}</span>}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--grey)] mt-0.5">
                        {model.target_column && <>TARGET {model.target_column} · </>}
                        {new Date(model.created_at).toLocaleString()}
                        {model.metrics?.loss != null && <> · LOSS {model.metrics.loss.toFixed(4)}</>}
                        {model.metrics?.eval_loss != null && <> · EVAL {model.metrics.eval_loss.toFixed(4)}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isActive && <button onClick={() => activate(model.name, true)} className="blz-btn primary" title="Set active and go to Dashboard">USE</button>}
                      {!isActive && <button onClick={() => activate(model.name, false)} className="blz-btn" title="Set active">SELECT</button>}
                      <button onClick={() => setPendingDelete(model.name)} className="blz-btn blz-btn-danger">DEL</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPendingDelete(null)}>
          <div className="blz-panel w-[380px] shadow-2xl" role="alertdialog" aria-modal="true" aria-label="Confirm delete" onClick={(e) => e.stopPropagation()}>
            <div className="blz-header"><span className="title">CONFIRM DELETE</span></div>
            <div className="p-3 space-y-3">
              <div className="font-mono text-[11px] text-[var(--grey-bright)]">
                Delete model <span className="text-[var(--amber)]">{pendingDelete}</span> and its weights? This cannot be undone.
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setPendingDelete(null)} className="blz-btn" autoFocus>CANCEL</button>
                <button onClick={() => removeModel(pendingDelete)} className="blz-btn blz-btn-danger">DELETE</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

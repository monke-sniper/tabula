import { useState, useEffect, useCallback } from 'react'
import FileUpload from '../components/FileUpload'
import DataTable from '../components/DataTable'
import EDAPanel from '../components/EDAPanel'
import ForecastChart from '../components/ForecastChart'
import { useApp } from '../lib/context'
import { useToast } from '../lib/toast'
import { apiPost, apiGet, ApiError } from '../lib/api'
import type { UploadResponse, EDAStats } from '../lib/types'
import { HelpModal } from '../components/HelpModal'

export default function Dashboard() {
  const { uploadData, forecastResult, sessionId, health, setUploadData, setSessionId, setEDAStats } = useApp()
  const toast = useToast()
  const [clock, setClock] = useState(new Date())
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      if (inField) return
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setHelpOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  const loadSample = useCallback(async () => {
    try {
      // Path-upload via /upload-path needs the backend to read the local file
      const r = await fetch('http://127.0.0.1:8420/upload-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'test_data.csv' }),
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body.detail || `status ${r.status}`)
      }
      const data: UploadResponse = await r.json()
      setUploadData(data)
      setSessionId(data.session_id)
      const eda = await apiGet<EDAStats>(`/eda/${data.session_id}`)
      setEDAStats(eda)
      toast('success', 'Sample loaded', `${data.rows.toLocaleString()} rows · ${data.filename}`)
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : (err as Error).message
      toast('error', 'Sample load failed', `${msg} — start backend from repo root so test_data.csv is reachable`)
    }
  }, [setUploadData, setSessionId, setEDAStats, toast])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="h-[26px] flex items-center justify-between px-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-[var(--amber)]">Dashboard</span>
          <span className="text-[8px] text-[var(--grey-dim)]">|</span>
          <span className="text-[8px] text-[var(--grey)]">EXPLORE</span>
          <span className="text-[8px] text-[var(--grey-dim)]">·</span>
          <span className="text-[8px] text-[var(--grey)]">FORECAST</span>
          <span className="text-[8px] text-[var(--grey-dim)]">·</span>
          <span className="text-[8px] text-[var(--grey)]">ANALYZE</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setHelpOpen(true)}
            className="w-4 h-4 inline-flex items-center justify-center border border-[var(--border-bright)] text-[var(--grey-bright)] hover:text-[var(--amber)] hover:border-[var(--amber)] font-mono text-[10px] font-bold"
            title="Open help (?)"
            aria-label="Open help"
          >
            ?
          </button>
          <span className="font-mono text-[9px] text-[var(--grey)]">{fmtDate(clock)}</span>
          <span className="font-mono text-[10px] text-[var(--amber)] font-semibold">{fmtTime(clock)}</span>
          <div className={`w-1.5 h-1.5 rounded-full ${health?.status === 'healthy' ? 'bg-[var(--green)] blink' : health ? 'bg-[var(--red)]' : 'bg-[var(--grey)]'} blink`} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full flex flex-col">
          <div className="shrink-0 border-b border-[var(--border)]">
            <FileUpload />
          </div>

          {!uploadData && (
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <div className="text-center space-y-2">
                <div className="font-mono text-[10px] text-[var(--grey)]">NO DATA LOADED</div>
                <div className="font-mono text-[8px] text-[var(--grey-dim)]">DROP A FILE ABOVE, OR</div>
                <button onClick={loadSample} className="blz-btn primary">LOAD SAMPLE · test_data.csv</button>
                <div className="font-mono text-[7px] text-[var(--grey-dim)] max-w-[280px] mx-auto pt-1">
                  backend must be started from the tabula/ repo root so the path resolves
                </div>
              </div>
            </div>
          )}

          {uploadData && (
            <>
              {forecastResult && (
                <div className="shrink-0 h-[20px] flex items-center px-3 gap-3 border-b border-[var(--border-dim)] bg-[var(--bg-secondary)] text-[8px] font-mono">
                  <span className="text-[var(--amber)]">{forecastResult.model_used}</span>
                  <span className="text-[var(--grey-dim)]">·</span>
                  <span>HORIZON <span className="text-[var(--white)]">{forecastResult.prediction_length}</span></span>
                  <span className="text-[var(--grey-dim)]">·</span>
                  <span>MAE <span className="text-[var(--white)]">{forecastResult.metrics.mae.toFixed(2)}</span></span>
                  <span className="text-[var(--grey-dim)]">·</span>
                  <span>RMSE <span className="text-[var(--white)]">{forecastResult.metrics.rmse.toFixed(2)}</span></span>
                  <span className="text-[var(--grey-dim)]">·</span>
                  <span>MAPE <span className="text-[var(--white)]">{forecastResult.metrics.mape.toFixed(1)}%</span></span>
                  <span className="text-[var(--grey-dim)]">·</span>
                  <span>INFER <span className="text-[var(--white)]">{forecastResult.inference_ms}ms</span></span>
                </div>
              )}
              <div className="flex-1 min-h-0 grid grid-cols-2 border-b border-[var(--border)]">
                <div className="border-r border-[var(--border)] overflow-hidden">
                  <DataTable />
                </div>
                <div className="overflow-hidden">
                  <EDAPanel />
                </div>
              </div>

              <div className="h-[45%] min-h-0 overflow-hidden">
                <ForecastChart />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="h-[22px] flex items-center justify-between px-3 border-t border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[8px] text-[var(--grey-dim)]">TABULA v1.1</span>
          <span className="text-[8px] text-[var(--grey-dim)]">·</span>
          <span className="text-[8px] text-[var(--grey)]">MODEL-AGNOSTIC FORECASTING</span>
        </div>
        <div className="flex items-center gap-3">
          {sessionId && (
            <span className="font-mono text-[8px] text-[var(--grey-dim)]">SES {sessionId.slice(0, 8)}</span>
          )}
          {uploadData && (
            <>
              <span className="text-[8px] text-[var(--grey)]">
                {uploadData.rows.toLocaleString()} rows · {uploadData.columns} cols
              </span>
              <span className="text-[8px] text-[var(--grey-dim)]">·</span>
            </>
          )}
          <span className={`text-[8px] ${health?.status === 'healthy' ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
            {health?.status === 'healthy' ? 'CONNECTED' : (health?.status || 'OFFLINE').toUpperCase()}
          </span>
        </div>
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

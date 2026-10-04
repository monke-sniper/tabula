import { useState, useEffect } from 'react'
import FileUpload from '../components/FileUpload'
import DataTable from '../components/DataTable'
import EDAPanel from '../components/EDAPanel'
import ForecastChart from '../components/ForecastChart'
import { useApp } from '../lib/context'
import { useToast } from '../lib/toast'
import { apiPost, errorMessage } from '../lib/api'
import type { UploadResponse } from '../lib/types'
import { HelpModal } from '../components/HelpModal'

const SAMPLE_FILE = 'test_data.csv'

/** Ticks on its own so the rest of the dashboard doesn't re-render every second. */
function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <>
      <span className="font-mono text-[10px] text-[var(--grey)]">
        {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
      </span>
      <span className="font-mono text-[11px] text-[var(--amber)] font-semibold tabular-nums">
        {now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </>
  )
}

export default function Dashboard() {
  const { uploadData, sessionId, health, openSession } = useApp()
  const toast = useToast()
  const [helpOpen, setHelpOpen] = useState(false)
  const [sampleLoading, setSampleLoading] = useState(false)
  const healthy = health?.status === 'healthy'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      if (inField) return
      if (e.key === '?') {
        e.preventDefault()
        setHelpOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const loadSample = async () => {
    setSampleLoading(true)
    try {
      const data = await apiPost<UploadResponse>('/upload-path', { path: SAMPLE_FILE })
      toast('success', 'Sample loaded', `${data.rows.toLocaleString()} rows · ${data.filename}`)
      await openSession(data).catch((e) => toast('warn', 'EDA unavailable', errorMessage(e)))
    } catch (err) {
      toast('error', 'Sample load failed', `${errorMessage(err)} — put ${SAMPLE_FILE} in the repo root`)
    } finally {
      setSampleLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="h-[30px] flex items-center justify-between px-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-[11px] font-bold tracking-[0.1em] uppercase text-[var(--amber)]">Dashboard</h1>
          <span className="text-[10px] text-[var(--grey)]">Explore · Forecast · Analyze</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setHelpOpen(true)} className="blz-icon-btn" title="Open help (?)" aria-label="Open help">?</button>
          <Clock />
          <span
            className={`w-1.5 h-1.5 rounded-full ${healthy ? 'bg-[var(--green)] blink' : health ? 'bg-[var(--red)]' : 'bg-[var(--grey)]'}`}
            title={healthy ? 'Backend connected' : 'Backend offline'}
          />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="shrink-0 border-b border-[var(--border)]">
          <FileUpload />
        </div>

        {uploadData ? (
          <>
            <div className="flex-1 min-h-0 grid grid-cols-2 border-b border-[var(--border)]">
              <div className="border-r border-[var(--border)] overflow-hidden">
                <DataTable key={sessionId} />
              </div>
              <div className="overflow-hidden">
                <EDAPanel key={sessionId} />
              </div>
            </div>
            <div className="h-[50%] min-h-0 overflow-hidden">
              <ForecastChart />
            </div>
          </>
        ) : (
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <div className="text-center space-y-3 max-w-[340px]">
              <div className="font-mono text-[12px] text-[var(--grey-bright)]">No data loaded</div>
              <div className="font-mono text-[10px] text-[var(--grey)]">
                Drop a CSV, JSON, XLSX or Parquet file above — or try the bundled sample.
              </div>
              <button onClick={loadSample} disabled={sampleLoading} className="blz-btn primary">
                {sampleLoading ? 'LOADING…' : `LOAD SAMPLE · ${SAMPLE_FILE}`}
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="h-[24px] flex items-center justify-between px-3 border-t border-[var(--border)] bg-[var(--bg-secondary)] shrink-0 text-[10px]">
        <div className="flex items-center gap-3 text-[var(--grey)]">
          <span>TABULA v1.1</span>
          <span className="text-[var(--grey-dim)]">·</span>
          <span>MODEL-AGNOSTIC FORECASTING</span>
        </div>
        <div className="flex items-center gap-3">
          {sessionId && <span className="font-mono text-[var(--grey)]">SES {sessionId.slice(0, 8)}</span>}
          {uploadData && (
            <span className="text-[var(--grey-bright)]">
              {uploadData.rows.toLocaleString()} rows · {uploadData.columns} cols
            </span>
          )}
          <span className={healthy ? 'text-[var(--green)]' : 'text-[var(--red)]'}>
            {healthy ? 'CONNECTED' : (health?.status || 'OFFLINE').toUpperCase()}
          </span>
        </div>
      </footer>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

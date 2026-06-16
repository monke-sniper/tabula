import { useState, useEffect } from 'react'
import FileUpload from '../components/FileUpload'
import DataTable from '../components/DataTable'
import EDAPanel from '../components/EDAPanel'
import ForecastChart from '../components/ForecastChart'
import { useApp } from '../lib/context'

export default function Dashboard() {
  const { uploadData } = useApp()
  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="h-full flex flex-col">
      {/* Top status bar */}
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
          <span className="font-mono text-[9px] text-[var(--grey)]">{fmtDate(clock)}</span>
          <span className="font-mono text-[10px] text-[var(--amber)] font-semibold">{fmtTime(clock)}</span>
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--green)] blink" />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Upload — full width, compact */}
        <div className="border-b border-[var(--border)]">
          <FileUpload />
        </div>

        {uploadData && (
          <>
            {/* Two-column: DataTable + EDA — split 50/50 */}
            <div className="grid grid-cols-2 border-b border-[var(--border)]">
              <div className="border-r border-[var(--border)]">
                <DataTable />
              </div>
              <div>
                <EDAPanel />
              </div>
            </div>

            {/* Forecast — full width */}
            <div>
              <ForecastChart />
            </div>
          </>
        )}
      </div>

      {/* Bottom status bar */}
      <div className="h-[22px] flex items-center justify-between px-3 border-t border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[8px] text-[var(--grey-dim)]">TABULA v1.0</span>
          <span className="text-[8px] text-[var(--grey-dim)]">·</span>
          <span className="text-[8px] text-[var(--grey)]">MODEL-AGNOSTIC FORECASTING</span>
        </div>
        <div className="flex items-center gap-3">
          {uploadData && (
            <>
              <span className="text-[8px] text-[var(--grey)]">
                {uploadData.rows.toLocaleString()} rows · {uploadData.columns} cols
              </span>
              <span className="text-[8px] text-[var(--grey-dim)]">·</span>
            </>
          )}
          <span className="text-[8px] text-[var(--green)]">CONNECTED</span>
        </div>
      </div>
    </div>
  )
}

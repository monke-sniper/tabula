import FileUpload from '../components/FileUpload'
import DataTable from '../components/DataTable'
import EDAPanel from '../components/EDAPanel'
import ForecastChart from '../components/ForecastChart'
import { useApp } from '../lib/context'

export default function Dashboard() {
  const { uploadData } = useApp()

  return (
    <div className="h-full overflow-y-auto">
      {/* Top bar */}
      <div className="h-[42px] flex items-center justify-between px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-[13px] font-bold tracking-wide text-[var(--text-primary)]">Dashboard</h1>
          <span className="font-mono text-[9px] text-[var(--text-muted)]">Explore · Forecast · Analyze</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <div className="live-dot" />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Upload */}
        <FileUpload />

        {uploadData && (
          <>
            {/* Two-column layout: Data + EDA */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-1 h-3 bg-[var(--accent-cyan)] rounded-full" />
                  <span className="font-mono text-[9px] font-bold tracking-[0.08em] uppercase text-[var(--text-muted)]">Data Preview</span>
                </div>
                <DataTable />
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-1 h-3 bg-[var(--accent-blue)] rounded-full" />
                  <span className="font-mono text-[9px] font-bold tracking-[0.08em] uppercase text-[var(--text-muted)]">Exploratory Analysis</span>
                </div>
                <EDAPanel />
              </div>
            </div>

            {/* Forecast */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <div className="w-1 h-3 bg-[var(--up)] rounded-full" />
                <span className="font-mono text-[9px] font-bold tracking-[0.08em] uppercase text-[var(--text-muted)]">Forecast</span>
              </div>
              <ForecastChart />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useApp } from '../lib/context'
import Plot from 'react-plotly.js'

type EDATab = 'stats' | 'dist' | 'corr' | 'missing' | 'outliers'

export default function EDAPanel() {
  const { edaStats } = useApp()
  const [tab, setTab] = useState<EDATab>('stats')

  if (!edaStats) {
    return (
      <div className="terminal-panel p-6 text-center">
        <span className="font-mono text-[11px] text-[var(--text-muted)]">No data loaded</span>
      </div>
    )
  }

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold tracking-wide uppercase transition-colors ${
                tab === t.key
                  ? 'bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-3">
        {tab === 'stats' && <StatsView stats={edaStats} />}
        {tab === 'dist' && <DistView stats={edaStats} />}
        {tab === 'corr' && <CorrView stats={edaStats} />}
        {tab === 'missing' && <MissingView stats={edaStats} />}
        {tab === 'outliers' && <OutlierView stats={edaStats} />}
      </div>
    </div>
  )
}

const tabs = [
  { key: 'stats' as EDATab, label: 'Stats' },
  { key: 'dist' as EDATab, label: 'Dist' },
  { key: 'corr' as EDATab, label: 'Corr' },
  { key: 'missing' as EDATab, label: 'Null' },
  { key: 'outliers' as EDATab, label: 'Out' },
]

function StatsView({ stats }: { stats: any }) {
  return (
    <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
      <table className="w-full">
        <thead className="sticky top-0 bg-[var(--bg-secondary)]">
          <tr>
            {['Column', 'Type', 'Nulls', 'Unique', 'Mean', 'Std', 'Min', 'Max'].map(h => (
              <th key={h} className="px-2 py-1 text-left font-mono text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.column_info.map((col: any) => (
            <tr key={col.name} className="border-b border-[var(--border-subtle)]/30 hover:bg-[var(--bg-tertiary)]/50">
              <td className="px-2 py-1 font-mono text-[10px] text-[var(--accent-cyan)] font-medium">{col.name}</td>
              <td className="px-2 py-1 font-mono text-[10px] text-[var(--text-muted)]">{col.dtype}</td>
              <td className="px-2 py-1 font-mono text-[10px] text-[var(--text-secondary)]">
                {col.null_count > 0 && <span className="text-[var(--warning)]">{col.null_count}</span>}
                {col.null_count === 0 && <span className="text-[var(--text-muted)]">0</span>}
              </td>
              <td className="px-2 py-1 font-mono text-[10px] text-[var(--text-secondary)]">{col.unique ?? '—'}</td>
              <td className="px-2 py-1 font-mono text-[10px] text-[var(--text-primary)]">{col.mean?.toFixed(2) ?? '—'}</td>
              <td className="px-2 py-1 font-mono text-[10px] text-[var(--text-muted)]">{col.std?.toFixed(2) ?? '—'}</td>
              <td className="px-2 py-1 font-mono text-[10px] text-[var(--text-muted)]">{col.min?.toString().slice(0, 10) ?? '—'}</td>
              <td className="px-2 py-1 font-mono text-[10px] text-[var(--text-muted)]">{col.max?.toString().slice(0, 10) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DistView({ stats }: { stats: any }) {
  const numericCols = stats.column_info.filter((c: any) => c.mean !== undefined)
  const [sel, setSel] = useState<string>(numericCols[0]?.name ?? '')
  const dist = stats.distributions[sel]

  return (
    <div>
      <div className="flex gap-1 mb-2 flex-wrap">
        {numericCols.map((col: any) => (
          <button
            key={col.name}
            onClick={() => setSel(col.name)}
            className={`px-2 py-0.5 font-mono text-[9px] rounded transition-colors ${
              sel === col.name
                ? 'bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {col.name}
          </button>
        ))}
      </div>
      {dist && (
        <Plot
          data={[{
            x: dist.bins.slice(0, -1),
            y: dist.counts,
            type: 'bar',
            marker: { color: 'rgba(0, 212, 170, 0.5)', line: { color: 'rgba(0, 212, 170, 0.8)', width: 1 } },
          }]}
          layout={{
            height: 240,
            margin: { t: 10, b: 35, l: 40, r: 10 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: '#5a6580', size: 9, family: 'JetBrains Mono' },
            xaxis: { gridcolor: '#1e2642', tickfont: { size: 8 } },
            yaxis: { gridcolor: '#1e2642', tickfont: { size: 8 } },
          }}
          config={{ displayModeBar: false }}
        />
      )}
    </div>
  )
}

function CorrView({ stats }: { stats: any }) {
  const cols = Object.keys(stats.correlations)
  if (!cols.length) return <div className="text-[11px] text-[var(--text-muted)] py-4 text-center">No numeric columns</div>

  return (
    <Plot
      data={[{
        z: cols.map((c1: string) => cols.map((c2: string) => stats.correlations[c1]?.[c2] ?? 0)),
        x: cols,
        y: cols,
        type: 'heatmap',
        colorscale: [[0, '#ff4d6a'], [0.5, '#0a0e17'], [1, '#00d4aa']],
        zmin: -1,
        zmax: 1,
      }]}
      layout={{
        height: 300,
        margin: { t: 10, b: 70, l: 70, r: 10 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#5a6580', size: 9, family: 'JetBrains Mono' },
        xaxis: { tickangle: -45, tickfont: { size: 8 } },
        yaxis: { tickfont: { size: 8 } },
      }}
      config={{ displayModeBar: false }}
    />
  )
}

function MissingView({ stats }: { stats: any }) {
  const missing = stats.missing_values.filter((m: any) => m.count > 0)
  if (!missing.length) {
    return (
      <div className="py-6 text-center">
        <div className="tag tag-up inline-block mb-2">Complete</div>
        <div className="font-mono text-[11px] text-[var(--text-muted)]">No missing values</div>
      </div>
    )
  }

  return (
    <Plot
      data={[{
        x: missing.map((m: any) => m.column),
        y: missing.map((m: any) => m.pct),
        type: 'bar',
        marker: { color: 'rgba(255, 170, 0, 0.6)', line: { color: '#ffaa00', width: 1 } },
        text: missing.map((m: any) => `${m.pct.toFixed(1)}%`),
        textposition: 'outside',
        textfont: { color: '#5a6580', size: 9, family: 'JetBrains Mono' },
      }]}
      layout={{
        height: 240,
        margin: { t: 10, b: 50, l: 40, r: 10 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#5a6580', size: 9, family: 'JetBrains Mono' },
        yaxis: { gridcolor: '#1e2642', title: '%', tickfont: { size: 8 } },
        xaxis: { tickangle: -45, tickfont: { size: 8 } },
      }}
      config={{ displayModeBar: false }}
    />
  )
}

function OutlierView({ stats }: { stats: any }) {
  const withOutliers = stats.outliers.filter((o: any) => o.count > 0)
  if (!withOutliers.length) {
    return (
      <div className="py-6 text-center">
        <div className="tag tag-up inline-block mb-2">Clean</div>
        <div className="font-mono text-[11px] text-[var(--text-muted)]">No outliers (IQR)</div>
      </div>
    )
  }

  return (
    <Plot
      data={[{
        x: withOutliers.map((o: any) => o.column),
        y: withOutliers.map((o: any) => o.count),
        type: 'bar',
        marker: { color: 'rgba(255, 77, 106, 0.5)', line: { color: '#ff4d6a', width: 1 } },
        text: withOutliers.map((o: any) => `${o.count}`),
        textposition: 'outside',
        textfont: { color: '#5a6580', size: 9, family: 'JetBrains Mono' },
      }]}
      layout={{
        height: 240,
        margin: { t: 10, b: 50, l: 40, r: 10 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#5a6580', size: 9, family: 'JetBrains Mono' },
        yaxis: { gridcolor: '#1e2642', tickfont: { size: 8 } },
        xaxis: { tickangle: -45, tickfont: { size: 8 } },
      }}
      config={{ displayModeBar: false }}
    />
  )
}

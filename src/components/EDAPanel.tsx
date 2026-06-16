import { useState } from 'react'
import { useApp } from '../lib/context'
import Plot from 'react-plotly.js'

type EDATab = 'stats' | 'dist' | 'corr' | 'missing' | 'outliers'

export default function EDAPanel() {
  const { edaStats } = useApp()
  const [tab, setTab] = useState<EDATab>('stats')

  if (!edaStats) {
    return (
      <div className="blz-panel h-full flex items-center justify-center">
        <span className="font-mono text-[10px] text-[var(--grey)]">NO DATA</span>
      </div>
    )
  }

  return (
    <div className="blz-panel h-full flex flex-col">
      <div className="blz-header">
        <div className="flex gap-0">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase transition-colors border-b ${
                tab === t.key
                  ? 'text-[var(--amber)] border-[var(--amber)] bg-[var(--amber-dim)]'
                  : 'text-[var(--grey)] border-transparent hover:text-[var(--grey-bright)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-2 flex-1 overflow-y-auto">
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
  { key: 'stats' as EDATab, label: 'STATS' },
  { key: 'dist' as EDATab, label: 'DIST' },
  { key: 'corr' as EDATab, label: 'CORR' },
  { key: 'missing' as EDATab, label: 'NULL' },
  { key: 'outliers' as EDATab, label: 'OUT' },
]

function StatsView({ stats }: { stats: any }) {
  return (
    <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
      <table className="w-full">
        <thead className="sticky top-0 bg-[var(--bg-secondary)]">
          <tr>
            {['COLUMN', 'TYPE', 'NULL', 'UNIQ', 'MEAN', 'STD', 'MIN', 'MAX'].map(h => (
              <th key={h} className="px-1.5 py-0.5 text-left font-mono text-[7px] font-bold tracking-[0.1em] uppercase text-[var(--amber)] border-b border-[var(--border)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.column_info.map((col: any) => (
            <tr key={col.name} className="border-b border-[var(--border-dim)] hover:bg-[var(--bg-tertiary)]">
              <td className="px-1.5 py-0.5 font-mono text-[9px] text-[var(--amber)] font-medium">{col.name}</td>
              <td className="px-1.5 py-0.5 font-mono text-[8px] text-[var(--grey)]">{col.dtype}</td>
              <td className="px-1.5 py-0.5 font-mono text-[9px]">
                {col.null_count > 0 ? (
                  <span className="text-[var(--amber)]">{col.null_count}</span>
                ) : (
                  <span className="text-[var(--grey-dim)]">0</span>
                )}
              </td>
              <td className="px-1.5 py-0.5 font-mono text-[9px] text-[var(--grey-bright)]">{col.unique ?? '—'}</td>
              <td className="px-1.5 py-0.5 font-mono text-[9px] text-[var(--white)]">{col.mean?.toFixed(2) ?? '—'}</td>
              <td className="px-1.5 py-0.5 font-mono text-[9px] text-[var(--grey)]">{col.std?.toFixed(2) ?? '—'}</td>
              <td className="px-1.5 py-0.5 font-mono text-[9px] text-[var(--grey)]">{col.min?.toString().slice(0, 10) ?? '—'}</td>
              <td className="px-1.5 py-0.5 font-mono text-[9px] text-[var(--grey)]">{col.max?.toString().slice(0, 10) ?? '—'}</td>
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
      <div className="flex gap-0 mb-1 flex-wrap">
        {numericCols.map((col: any) => (
          <button
            key={col.name}
            onClick={() => setSel(col.name)}
            className={`px-1.5 py-0.5 font-mono text-[8px] transition-colors border-b ${
              sel === col.name
                ? 'text-[var(--amber)] border-[var(--amber)]'
                : 'text-[var(--grey)] border-transparent hover:text-[var(--grey-bright)]'
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
            marker: { color: 'rgba(255,136,0,0.5)', line: { color: 'rgba(255,136,0,0.8)', width: 0.5 } },
          }]}
          layout={{
            height: 200,
            margin: { t: 5, b: 25, l: 35, r: 5 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: '#666', size: 8, family: 'IBM Plex Mono' },
            xaxis: { gridcolor: '#1a1a1a', tickfont: { size: 7 } },
            yaxis: { gridcolor: '#1a1a1a', tickfont: { size: 7 } },
          }}
          config={{ displayModeBar: false }}
        />
      )}
    </div>
  )
}

function CorrView({ stats }: { stats: any }) {
  const cols = Object.keys(stats.correlations)
  if (!cols.length) return <div className="text-[9px] text-[var(--grey)] py-4 text-center">NO NUMERIC COLUMNS</div>

  return (
    <Plot
      data={[{
        z: cols.map((c1: string) => cols.map((c2: string) => stats.correlations[c1]?.[c2] ?? 0)),
        x: cols,
        y: cols,
        type: 'heatmap',
        colorscale: [[0, '#ff1744'], [0.5, '#000000'], [1, '#00c853']],
        zmin: -1,
        zmax: 1,
      }]}
      layout={{
        height: 260,
        margin: { t: 5, b: 60, l: 60, r: 5 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#666', size: 8, family: 'IBM Plex Mono' },
        xaxis: { tickangle: -45, tickfont: { size: 7 } },
        yaxis: { tickfont: { size: 7 } },
      }}
      config={{ displayModeBar: false }}
    />
  )
}

function MissingView({ stats }: { stats: any }) {
  const missing = stats.missing_values.filter((m: any) => m.count > 0)
  if (!missing.length) {
    return (
      <div className="py-4 text-center">
        <span className="blz-tag blz-tag-green">COMPLETE</span>
        <div className="font-mono text-[9px] text-[var(--grey)] mt-1">NO MISSING VALUES</div>
      </div>
    )
  }

  return (
    <Plot
      data={[{
        x: missing.map((m: any) => m.column),
        y: missing.map((m: any) => m.pct),
        type: 'bar',
        marker: { color: 'rgba(255,136,0,0.5)', line: { color: '#ff8800', width: 0.5 } },
        text: missing.map((m: any) => `${m.pct.toFixed(1)}%`),
        textposition: 'outside',
        textfont: { color: '#666', size: 8, family: 'IBM Plex Mono' },
      }]}
      layout={{
        height: 200,
        margin: { t: 5, b: 45, l: 35, r: 5 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#666', size: 8, family: 'IBM Plex Mono' },
        yaxis: { gridcolor: '#1a1a1a', title: '%', tickfont: { size: 7 } },
        xaxis: { tickangle: -45, tickfont: { size: 7 } },
      }}
      config={{ displayModeBar: false }}
    />
  )
}

function OutlierView({ stats }: { stats: any }) {
  const withOutliers = stats.outliers.filter((o: any) => o.count > 0)
  if (!withOutliers.length) {
    return (
      <div className="py-4 text-center">
        <span className="blz-tag blz-tag-green">CLEAN</span>
        <div className="font-mono text-[9px] text-[var(--grey)] mt-1">NO OUTLIERS (IQR)</div>
      </div>
    )
  }

  return (
    <Plot
      data={[{
        x: withOutliers.map((o: any) => o.column),
        y: withOutliers.map((o: any) => o.count),
        type: 'bar',
        marker: { color: 'rgba(255,23,68,0.5)', line: { color: '#ff1744', width: 0.5 } },
        text: withOutliers.map((o: any) => `${o.count}`),
        textposition: 'outside',
        textfont: { color: '#666', size: 8, family: 'IBM Plex Mono' },
      }]}
      layout={{
        height: 200,
        margin: { t: 5, b: 45, l: 35, r: 5 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#666', size: 8, family: 'IBM Plex Mono' },
        yaxis: { gridcolor: '#1a1a1a', tickfont: { size: 7 } },
        xaxis: { tickangle: -45, tickfont: { size: 7 } },
      }}
      config={{ displayModeBar: false }}
    />
  )
}

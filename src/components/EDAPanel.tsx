import { useState, useEffect } from 'react'
import { useApp } from '../lib/context'
import { useToast } from '../lib/toast'
import Plot from 'react-plotly.js'
import { apiGet, apiPost, ApiError } from '../lib/api'
import type { EDAStats, ColumnInfo, CleanResponse } from '../lib/types'

type EDATab = 'stats' | 'dist' | 'corr' | 'missing' | 'outliers'

export default function EDAPanel() {
  const { edaStats, setEDAStats, sessionId, uploadData, setUploadData, setSessionId } = useApp()
  const toast = useToast()
  const [tab, setTab] = useState<EDATab>('stats')

  const refresh = async () => {
    if (!sessionId) return
    try {
      const eda = await apiGet<EDAStats>(`/eda/${sessionId}`)
      setEDAStats(eda)
    } catch (e) {
      toast('error', 'EDA refresh failed', (e as Error).message)
    }
  }

  const clean = async (strategy: 'drop' | 'mean' | 'zero' | 'ffill', columns: string[]) => {
    if (!sessionId) return
    try {
      const res = await apiPost<CleanResponse>(`/sessions/${sessionId}/clean`, { strategy, columns })
      toast('success', `Cleaned · ${strategy}`, `${res.rows_before} → ${res.rows_after} rows`)
      // refresh EDA + upload summary
      const eda = await apiGet<EDAStats>(`/eda/${sessionId}`)
      setEDAStats(eda)
      if (uploadData) {
        setUploadData({ ...uploadData, rows: res.rows_after })
      }
    } catch (e) {
      if (e instanceof ApiError) toast('error', `Clean failed`, e.detail)
      else toast('error', `Clean failed`, (e as Error).message)
    }
  }

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
        <button onClick={refresh} className="blz-btn py-0 text-[8px]">REFRESH</button>
      </div>
      <div className="p-2 flex-1 overflow-hidden">
        {tab === 'stats' && <StatsView stats={edaStats} />}
        {tab === 'dist' && <DistView stats={edaStats} />}
        {tab === 'corr' && <CorrView stats={edaStats} />}
        {tab === 'missing' && <MissingView stats={edaStats} onClean={(cols) => clean('ffill', cols)} onDrop={(cols) => clean('drop', cols)} />}
        {tab === 'outliers' && <OutlierView stats={edaStats} onCap={(cols) => clean('mean', cols)} />}
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

function StatsView({ stats }: { stats: EDAStats }) {
  return (
    <div className="overflow-auto h-full">
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
          {stats.column_info.map((col: ColumnInfo) => (
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

function DistView({ stats }: { stats: EDAStats }) {
  const numericCols = stats.column_info.filter((c) => c.mean !== undefined)
  const [sel, setSel] = useState<string>(numericCols[0]?.name ?? '')
  const dist = stats.distributions[sel]
  const col = numericCols.find((c) => c.name === sel)

  const overlay = col && dist
    ? {
        x: [col.min as number, col.max as number],
        // mean line
        meanX: [col.mean as number, col.mean as number],
        // ±1 std band
        stdLow: [(col.mean as number) - (col.std as number), (col.mean as number) - (col.std as number)],
        stdHigh: [(col.mean as number) + (col.std as number), (col.mean as number) + (col.std as number)],
      }
    : null

  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-0 mb-1 flex-wrap shrink-0">
        {numericCols.map((col) => (
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
      <div className="flex-1 min-h-0">
        {dist && (
          <Plot
            data={[
              {
                x: dist.bins.slice(0, -1),
                y: dist.counts,
                type: 'bar',
                marker: { color: 'rgba(255,136,0,0.5)', line: { color: 'rgba(255,136,0,0.8)', width: 0.5 } },
                name: 'count',
              },
              ...(overlay ? [
                {
                  x: overlay.meanX,
                  y: [0, Math.max(...dist.counts) * 0.95],
                  type: 'scatter',
                  mode: 'lines',
                  name: 'mean',
                  line: { color: '#00bcd4', width: 1.5, dash: 'dash' },
                  hoverinfo: 'skip',
                } as Partial<Plotly.Data>,
                {
                  x: overlay.stdLow,
                  y: [0, Math.max(...dist.counts) * 0.95],
                  type: 'scatter',
                  mode: 'lines',
                  name: 'mean ± 1σ',
                  line: { color: 'rgba(0,188,212,0.3)', width: 1, dash: 'dot' },
                  showlegend: false,
                  hoverinfo: 'skip',
                } as Partial<Plotly.Data>,
                {
                  x: overlay.stdHigh,
                  y: [0, Math.max(...dist.counts) * 0.95],
                  type: 'scatter',
                  mode: 'lines',
                  name: 'mean ± 1σ',
                  line: { color: 'rgba(0,188,212,0.3)', width: 1, dash: 'dot' },
                  showlegend: false,
                  hoverinfo: 'skip',
                } as Partial<Plotly.Data>,
              ] : []),
            ] as Plotly.Data[]}
            layout={{
              height: undefined,
              margin: { t: 5, b: 25, l: 35, r: 5 },
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              font: { color: '#666', size: 8, family: 'IBM Plex Mono' },
              xaxis: { gridcolor: '#1a1a1a', tickfont: { size: 7 } },
              yaxis: { gridcolor: '#1a1a1a', tickfont: { size: 7 } },
              legend: { orientation: 'h', y: 1.1, x: 0.5, xanchor: 'center', font: { size: 7, color: '#666' }, bgcolor: 'transparent' },
            }}
            config={{ displayModeBar: false }}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler
          />
        )}
      </div>
    </div>
  )
}

function CorrView({ stats }: { stats: EDAStats }) {
  const cols = Object.keys(stats.correlations)
  if (!cols.length) return <div className="text-[9px] text-[var(--grey)] py-4 text-center">NO NUMERIC COLUMNS</div>

  return (
    <div className="h-full">
      <Plot
        data={[{
          z: cols.map((c1) => cols.map((c2) => stats.correlations[c1]?.[c2] ?? 0)),
          x: cols,
          y: cols,
          type: 'heatmap',
          colorscale: [[0, '#ff1744'], [0.5, '#000000'], [1, '#00c853']],
          zmin: -1,
          zmax: 1,
        }]}
        layout={{
          height: undefined,
          margin: { t: 5, b: 60, l: 60, r: 5 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: '#666', size: 8, family: 'IBM Plex Mono' },
          xaxis: { tickangle: -45, tickfont: { size: 7 } },
          yaxis: { tickfont: { size: 7 } },
        }}
        config={{ displayModeBar: false }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
      />
    </div>
  )
}

function MissingView({ stats, onClean, onDrop }: { stats: EDAStats; onClean: (cols: string[]) => void; onDrop: (cols: string[]) => void }) {
  const missing = stats.missing_values.filter((m) => m.count > 0)
  if (!missing.length) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <span className="blz-tag blz-tag-green">COMPLETE</span>
          <div className="font-mono text-[9px] text-[var(--grey)] mt-1">NO MISSING VALUES</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <Plot
          data={[{
            x: missing.map((m) => m.column),
            y: missing.map((m) => m.pct),
            type: 'bar',
            marker: { color: 'rgba(255,136,0,0.5)', line: { color: '#ff8800', width: 0.5 } },
            text: missing.map((m) => `${m.pct.toFixed(1)}%`),
            textposition: 'outside',
            textfont: { color: '#666', size: 8, family: 'IBM Plex Mono' },
          }]}
          layout={{
            height: undefined,
            margin: { t: 10, b: 45, l: 35, r: 5 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: '#666', size: 8, family: 'IBM Plex Mono' },
            yaxis: { gridcolor: '#1a1a1a', title: { text: '%', font: { size: 8, color: '#666' } }, tickfont: { size: 7 } },
            xaxis: { tickangle: -45, tickfont: { size: 7 } },
          }}
          config={{ displayModeBar: false }}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler
        />
      </div>
      <div className="shrink-0 border-t border-[var(--border-dim)] p-1.5 flex flex-wrap gap-1.5">
        <span className="font-mono text-[8px] text-[var(--grey)] self-center">PER-COLUMN:</span>
        {missing.map((m) => (
          <div key={m.column} className="flex items-center gap-1 font-mono text-[8px] border border-[var(--border-dim)] px-1.5 py-0.5">
            <span className="text-[var(--amber)]">{m.column}</span>
            <button onClick={() => onClean([m.column])} className="text-[var(--cyan)] hover:underline">FILL</button>
            <span className="text-[var(--grey-dim)]">·</span>
            <button onClick={() => onDrop([m.column])} className="text-[var(--red)] hover:underline">DROP</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function OutlierView({ stats, onCap }: { stats: EDAStats; onCap: (cols: string[]) => void }) {
  const withOutliers = stats.outliers.filter((o) => o.count > 0)
  if (!withOutliers.length) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <span className="blz-tag blz-tag-green">CLEAN</span>
          <div className="font-mono text-[9px] text-[var(--grey)] mt-1">NO OUTLIERS (IQR)</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <Plot
          data={[{
            x: withOutliers.map((o) => o.column),
            y: withOutliers.map((o) => o.count),
            type: 'bar',
            marker: { color: 'rgba(255,23,68,0.5)', line: { color: '#ff1744', width: 0.5 } },
            text: withOutliers.map((o) => `${o.count}`),
            textposition: 'outside',
            textfont: { color: '#666', size: 8, family: 'IBM Plex Mono' },
          }]}
          layout={{
            height: undefined,
            margin: { t: 10, b: 45, l: 35, r: 5 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: '#666', size: 8, family: 'IBM Plex Mono' },
            yaxis: { gridcolor: '#1a1a1a', tickfont: { size: 7 } },
            xaxis: { tickangle: -45, tickfont: { size: 7 } },
          }}
          config={{ displayModeBar: false }}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler
        />
      </div>
      <div className="shrink-0 border-t border-[var(--border-dim)] p-1.5 flex flex-wrap gap-1.5">
        <span className="font-mono text-[8px] text-[var(--grey)] self-center">PER-COLUMN:</span>
        {withOutliers.map((o) => (
          <div key={o.column} className="flex items-center gap-1 font-mono text-[8px] border border-[var(--border-dim)] px-1.5 py-0.5">
            <span className="text-[var(--red)]">{o.column}</span>
            <span className="text-[var(--grey-dim)]">({o.count})</span>
            <button onClick={() => onCap([o.column])} className="text-[var(--amber)] hover:underline">FILL MEAN</button>
          </div>
        ))}
      </div>
    </div>
  )
}

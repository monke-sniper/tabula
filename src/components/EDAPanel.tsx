import { memo, useCallback, useState } from 'react'
import Plot from 'react-plotly.js'
import { useApp } from '../lib/context'
import { useToast } from '../lib/toast'
import { apiGet, apiPost, errorMessage } from '../lib/api'
import { C, PLOT_CONFIG, PLOT_STYLE, plotLayout } from '../lib/chartTheme'
import type { EDAStats, ColumnInfo, CleanRequest, CleanResponse } from '../lib/types'

type EDATab = 'stats' | 'dist' | 'corr' | 'missing' | 'outliers'
type CleanStrategy = CleanRequest['strategy']
type OnClean = (strategy: CleanStrategy, columns: string[]) => void

export default function EDAPanel() {
  const { edaStats, setEDAStats, sessionId, setUploadData } = useApp()
  const toast = useToast()
  const [tab, setTab] = useState<EDATab>('stats')

  const refresh = async () => {
    if (!sessionId) return
    try {
      setEDAStats(await apiGet<EDAStats>(`/eda/${sessionId}`))
    } catch (e) {
      toast('error', 'EDA refresh failed', errorMessage(e))
    }
  }

  const clean = useCallback<OnClean>(async (strategy, columns) => {
    if (!sessionId) return
    try {
      const res = await apiPost<CleanResponse>(`/sessions/${sessionId}/clean`, { strategy, columns })
      toast('success', `Cleaned · ${strategy}`, `${columns.join(', ')} · ${res.rows_before} → ${res.rows_after} rows`)
      setUploadData((prev) => prev && { ...prev, rows: res.rows_after, preview: res.preview })
      setEDAStats(await apiGet<EDAStats>(`/eda/${sessionId}`))
    } catch (e) {
      toast('error', 'Clean failed', errorMessage(e))
    }
  }, [sessionId, setEDAStats, setUploadData, toast])

  if (!edaStats) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="font-mono text-[11px] text-[var(--grey)]">COMPUTING STATS…</span>
      </div>
    )
  }

  const currentTab = TABS.find((t) => t.key === tab)!

  return (
    <div className="blz-panel border-0 h-full flex flex-col">
      <div className="blz-header">
        <div className="flex gap-0" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              aria-label={t.label}
              title={t.description}
              onClick={() => setTab(t.key)}
              className={`blz-tab ${tab === t.key ? 'active' : ''}`}
            >
              {t.label}
              {t.badge?.(edaStats) ? <span className="blz-tab-badge">{t.badge(edaStats)}</span> : null}
            </button>
          ))}
        </div>
        <button onClick={refresh} className="blz-btn py-0">REFRESH</button>
      </div>
      <div className="help-strip">{currentTab.description}</div>
      <div className="p-2 flex-1 min-h-0 overflow-hidden">
        {tab === 'stats' && <StatsView stats={edaStats} />}
        {tab === 'dist' && <DistView stats={edaStats} />}
        {tab === 'corr' && <CorrView stats={edaStats} />}
        {tab === 'missing' && <MissingView stats={edaStats} onClean={clean} />}
        {tab === 'outliers' && <OutlierView stats={edaStats} onClean={clean} />}
      </div>
    </div>
  )
}

const TABS: Array<{ key: EDATab; label: string; description: string; badge?: (s: EDAStats) => number }> = [
  {
    key: 'stats',
    label: 'STATS',
    description: 'Per-column summary — type, null count, unique count, mean, std, min, max. Click REFRESH to recompute after a clean.',
  },
  {
    key: 'dist',
    label: 'DIST',
    description: 'Histogram of the selected column. Dashed cyan line = column mean; dotted lines = mean ± 1σ. Click a column name to switch.',
  },
  {
    key: 'corr',
    label: 'CORR',
    description: 'Pairwise Pearson correlation between every numeric column. Range -1..+1. Red = negative, green = positive, black = no linear relation.',
  },
  {
    key: 'missing',
    label: 'NULL',
    description: 'Missing-value percentage per column. FILL forward-fills then back-fills; DROP removes rows where that column is null. Both are destructive.',
    badge: (s) => s.missing_values.length,
  },
  {
    key: 'outliers',
    label: 'OUT',
    description: 'Count of values outside Q1 - 1.5·IQR to Q3 + 1.5·IQR (Tukey fences). CAP clips those values to the fences. Destructive.',
    badge: (s) => s.outliers.length,
  },
]

const fmt = (v: number | string | null | undefined, digits = 2) =>
  v === null || v === undefined ? '—' : typeof v === 'number' ? v.toFixed(digits) : v.slice(0, 10)

const StatsView = memo(function StatsView({ stats }: { stats: EDAStats }) {
  return (
    <div className="overflow-auto h-full">
      <table className="w-full">
        <thead className="sticky top-0 bg-[var(--bg-secondary)]">
          <tr>
            {['COLUMN', 'TYPE', 'NULL', 'UNIQ', 'MEAN', 'STD', 'MIN', 'MAX'].map((h, i) => (
              <th key={h} className={`px-1.5 py-1 font-mono text-[9px] font-bold tracking-[0.1em] uppercase text-[var(--amber)] border-b border-[var(--border)] ${i > 1 ? 'text-right' : 'text-left'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-[10px] tabular-nums">
          {stats.column_info.map((col: ColumnInfo) => (
            <tr key={col.name} className="border-b border-[var(--border-dim)] hover:bg-[var(--bg-tertiary)]">
              <td className="px-1.5 py-0.5 text-[var(--white)] font-medium">{col.name}</td>
              <td className="px-1.5 py-0.5 text-[var(--grey)]">{col.dtype}</td>
              <td className={`px-1.5 py-0.5 text-right ${col.null_count > 0 ? 'text-[var(--amber)]' : 'text-[var(--grey-dim)]'}`}>{col.null_count}</td>
              <td className="px-1.5 py-0.5 text-right text-[var(--grey-bright)]">{col.unique ?? '—'}</td>
              <td className="px-1.5 py-0.5 text-right text-[var(--white)]">{fmt(col.mean)}</td>
              <td className="px-1.5 py-0.5 text-right text-[var(--grey-bright)]">{fmt(col.std)}</td>
              <td className="px-1.5 py-0.5 text-right text-[var(--grey-bright)]">{fmt(col.min)}</td>
              <td className="px-1.5 py-0.5 text-right text-[var(--grey-bright)]">{fmt(col.max)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})

const DistView = memo(function DistView({ stats }: { stats: EDAStats }) {
  const numericCols = stats.column_info.filter((c) => stats.distributions[c.name])
  const [sel, setSel] = useState<string>(numericCols[0]?.name ?? '')
  const dist = stats.distributions[sel]
  const col = numericCols.find((c) => c.name === sel)
  if (!dist || !col) return <Empty tag="N/A" text="NO NUMERIC COLUMNS" />

  const top = Math.max(...dist.counts) * 0.95
  const vline = (x: number, name: string, line: Partial<Plotly.ScatterLine>, showlegend = true): Plotly.Data => ({
    x: [x, x], y: [0, top], type: 'scatter', mode: 'lines', name, line, showlegend, hoverinfo: 'skip',
  })
  const overlays: Plotly.Data[] = []
  if (typeof col.mean === 'number') {
    overlays.push(vline(col.mean, 'mean', { color: C.cyan, width: 1.5, dash: 'dash' }))
    if (typeof col.std === 'number') {
      const band = { color: 'rgba(0,188,212,0.4)', width: 1, dash: 'dot' } as const
      overlays.push(vline(col.mean - col.std, 'mean ± 1σ', band), vline(col.mean + col.std, 'mean ± 1σ', band, false))
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-0 mb-1 flex-wrap shrink-0">
        {numericCols.map((c) => (
          <button key={c.name} onClick={() => setSel(c.name)} className={`blz-tab ${sel === c.name ? 'active' : ''}`}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <Plot
          data={[
            {
              x: dist.bins.slice(0, -1),
              y: dist.counts,
              type: 'bar',
              offset: 0,
              width: dist.bins.slice(1).map((b, i) => b - dist.bins[i]),
              marker: { color: 'rgba(255,136,0,0.45)', line: { color: 'rgba(255,136,0,0.9)', width: 0.5 } },
              name: 'count',
            },
            ...overlays,
          ]}
          layout={plotLayout({ margin: { t: 26, b: 26, l: 36, r: 8 } })}
          config={PLOT_CONFIG}
          style={PLOT_STYLE}
          useResizeHandler
        />
      </div>
    </div>
  )
})

const CorrView = memo(function CorrView({ stats }: { stats: EDAStats }) {
  const cols = Object.keys(stats.correlations)
  if (!cols.length) return <Empty tag="N/A" text="NEED 2+ NUMERIC COLUMNS" />
  const z = cols.map((c1) => cols.map((c2) => stats.correlations[c1]?.[c2] ?? null))

  return (
    <div className="h-full">
      <Plot
        data={[{
          z, x: cols, y: cols,
          type: 'heatmap',
          colorscale: [[0, C.red], [0.5, '#000000'], [1, C.green]],
          zmin: -1,
          zmax: 1,
          xgap: 1,
          ygap: 1,
          texttemplate: cols.length <= 8 ? '%{z:.2f}' : '',
          hovertemplate: '%{y} × %{x}: %{z:.3f}<extra></extra>',
          colorbar: { thickness: 8, tickfont: { size: 9 } },
        } as Plotly.Data]}
        layout={plotLayout({ margin: { t: 8, b: 60, l: 70, r: 8 }, xaxis: { tickangle: -45 }, yaxis: { autorange: 'reversed' } })}
        config={PLOT_CONFIG}
        style={PLOT_STYLE}
        useResizeHandler
      />
    </div>
  )
})

function BarView({ x, y, labels, color, fill, yTitle, actions }: {
  x: string[]; y: number[]; labels: string[]; color: string; fill: string; yTitle?: string; actions: React.ReactNode
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <Plot
          data={[{
            x, y,
            type: 'bar',
            marker: { color: fill, line: { color, width: 0.5 } },
            text: labels,
            textposition: 'outside',
            textfont: { color: C.text, size: 9, family: C.font },
            cliponaxis: false,
          } as Plotly.Data]}
          layout={plotLayout({ margin: { t: 16, b: 50, l: 40, r: 8 }, bargap: 0.5, xaxis: { tickangle: -45 }, yaxis: { title: { text: yTitle ?? '' } } })}
          config={PLOT_CONFIG}
          style={PLOT_STYLE}
          useResizeHandler
        />
      </div>
      <div className="shrink-0 border-t border-[var(--border-dim)] pt-1.5 flex flex-wrap gap-1.5">{actions}</div>
    </div>
  )
}

const MissingView = memo(function MissingView({ stats, onClean }: { stats: EDAStats; onClean: OnClean }) {
  const missing = stats.missing_values
  if (!missing.length) return <Empty tag="COMPLETE" text="NO MISSING VALUES" ok />
  return (
    <BarView
      x={missing.map((m) => m.column)}
      y={missing.map((m) => m.pct)}
      labels={missing.map((m) => `${m.pct.toFixed(1)}%`)}
      color={C.amber}
      fill="rgba(255,136,0,0.45)"
      yTitle="% null"
      actions={missing.map((m) => (
        <div key={m.column} className="blz-chip">
          <span className="text-[var(--amber)]">{m.column}</span>
          <button onClick={() => onClean('ffill', [m.column])} className="blz-link text-[var(--cyan)]">FILL</button>
          <button onClick={() => onClean('drop', [m.column])} className="blz-link text-[var(--red)]">DROP</button>
        </div>
      ))}
    />
  )
})

const OutlierView = memo(function OutlierView({ stats, onClean }: { stats: EDAStats; onClean: OnClean }) {
  const outliers = stats.outliers
  if (!outliers.length) return <Empty tag="CLEAN" text="NO OUTLIERS (IQR)" ok />
  return (
    <BarView
      x={outliers.map((o) => o.column)}
      y={outliers.map((o) => o.count)}
      labels={outliers.map((o) => `${o.count}`)}
      color={C.red}
      fill="rgba(255,23,68,0.45)"
      yTitle="count"
      actions={outliers.map((o) => (
        <div key={o.column} className="blz-chip">
          <span className="text-[var(--red)]">{o.column}</span>
          <span className="text-[var(--grey)]">({o.count})</span>
          <button onClick={() => onClean('clip', [o.column])} className="blz-link text-[var(--amber)]">CAP</button>
        </div>
      ))}
    />
  )
})

function Empty({ tag, text, ok = false }: { tag: string; text: string; ok?: boolean }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <span className={`blz-tag ${ok ? 'blz-tag-green' : 'blz-tag-amber'}`}>{tag}</span>
        <div className="font-mono text-[10px] text-[var(--grey)] mt-1.5">{text}</div>
      </div>
    </div>
  )
}

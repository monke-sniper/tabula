import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import type { ForecastResponse, ForecastResult } from '../lib/types'
import { C, PLOT_STYLE, plotLayout } from '../lib/chartTheme'

export type ViewMode = 'fan' | 'bands' | 'lines'

const FAN_LEVELS = 6
const MAX_TICKS = 10
const CONFIG: Partial<Plotly.Config> = { displayModeBar: false, scrollZoom: true }

/** "2024-01-03 05:00:00" -> "01-03 05:00"; midnight / date-only -> "2024-01-03". */
function shortTs(ts: string): string {
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/)
  if (!m) return ts
  const [, y, mo, d, hm] = m
  return hm && hm !== '00:00' ? `${mo}-${d} ${hm}` : `${y}-${mo}-${d}`
}

/**
 * Split results into history / forecast on a shared integer x axis. The
 * anchor row reuses the last historical x so the fan starts on the last actual.
 */
function splitSeries(data: ForecastResponse) {
  const labels: string[] = []
  const hist = { x: [] as number[], y: [] as number[] }
  const fc = { x: [] as number[], rows: [] as ForecastResult[] }
  for (const r of data.results) {
    if (r.is_anchor) {
      fc.x.push(labels.length - 1)
      fc.rows.push(r)
      continue
    }
    if (r.is_forecast) {
      fc.x.push(labels.length)
      fc.rows.push(r)
    } else {
      hist.x.push(labels.length)
      hist.y.push(r.actual ?? NaN)
    }
    labels.push(r.timestamp)
  }
  return { labels, hist, fc }
}

function band(x: number[], rows: ForecastResult[], hi: keyof ForecastResult, lo: keyof ForecastResult, name: string, alpha: number): Plotly.Data {
  return {
    x: [...x, ...[...x].reverse()],
    y: [...rows.map((r) => r[hi] as number), ...rows.map((r) => r[lo] as number).reverse()],
    type: 'scatter',
    fill: 'toself',
    fillcolor: `rgba(0,188,212,${alpha})`,
    line: { color: `rgba(0,188,212,${Math.min(1, alpha * 3)})`, width: 0.8 },
    name,
    hoverinfo: 'skip',
  }
}

/**
 * Sample paths, faded by mean distance from the median. Paths are bucketed
 * into a few opacity levels so Plotly draws ~6 traces instead of hundreds.
 */
function iterationFan(rows: ForecastResult[], x: number[]): Plotly.Data[] {
  const paths = rows.filter((r) => !r.is_anchor)
  const n = paths[0]?.iteration_values.length ?? 0
  if (n < 2) return []
  const scores = Array.from({ length: n }, (_, i) =>
    paths.reduce((s, r) => s + Math.abs(r.iteration_values[i] - r.median), 0) / paths.length,
  )
  const maxScore = Math.max(...scores) || 1
  const buckets = Array.from({ length: FAN_LEVELS }, () => ({ x: [] as (number | null)[], y: [] as (number | null)[] }))
  scores.forEach((s, i) => {
    const level = Math.min(FAN_LEVELS - 1, Math.floor((1 - s / maxScore) * FAN_LEVELS))
    buckets[level].x.push(...x, null)
    buckets[level].y.push(...rows.map((r) => (r.is_anchor ? r.median : r.iteration_values[i])), null)
  })
  // faint (far from median) first, so the closest paths sit on top
  return buckets
    .map((b, level): Plotly.Data | null => b.x.length ? {
      x: b.x,
      y: b.y,
      type: 'scatter',
      mode: 'lines',
      line: { color: `rgba(255,136,0,${(0.05 + 0.6 * (level + 1) / FAN_LEVELS).toFixed(2)})`, width: 0.7 },
      connectgaps: false,
      showlegend: false,
      hoverinfo: 'skip',
    } : null)
    .filter((t): t is Plotly.Data => t !== null)
}

/** Forecast chart: FAN = sample paths + bands, BANDS = 50/80/95% regions, LINES = median only. */
export function ForecastPlot({ data, view }: { data: ForecastResponse; view: ViewMode }) {
  const { labels, hist, fc } = useMemo(() => splitSeries(data), [data])

  const traces = useMemo<Plotly.Data[]>(() => {
    const holdout = fc.rows.map((r, i) => ({ r, x: fc.x[i] })).filter(({ r }) => r.actual !== null && !r.is_anchor)
    return [
      ...(view !== 'lines' && fc.rows.length ? [
        band(fc.x, fc.rows, 'upper_97_5', 'lower_2_5', '95%', 0.06),
        band(fc.x, fc.rows, 'upper_90', 'lower_10', '80%', 0.1),
        band(fc.x, fc.rows, 'upper_75', 'lower_25', '50%', 0.16),
      ] : []),
      ...(view === 'fan' ? iterationFan(fc.rows, fc.x) : []),
      {
        x: hist.x, y: hist.y, type: 'scatter', mode: 'lines', name: 'Actual',
        line: { color: C.cyan, width: 1.4 },
        text: labels.slice(0, hist.x.length),
        hovertemplate: '%{text}<br>Actual %{y:.2f}<extra></extra>',
      },
      {
        x: fc.x, y: fc.rows.map((r) => r.median), type: 'scatter', mode: 'lines', name: 'Median',
        line: { color: C.amber, width: 2 },
        text: fc.rows.map((r) => r.timestamp),
        hovertemplate: '%{text}<br>Median %{y:.2f}<extra></extra>',
      },
      {
        x: holdout.map((h) => h.x), y: holdout.map((h) => h.r.actual), type: 'scatter', mode: 'markers', name: 'Holdout',
        marker: { color: C.cyan, size: 5, symbol: 'diamond', line: { color: '#000', width: 1 } },
        text: holdout.map((h) => h.r.timestamp),
        hovertemplate: '%{text}<br>Holdout %{y:.2f}<extra></extra>',
      },
    ] as Plotly.Data[]
  }, [view, labels, hist, fc])

  const layout = useMemo<Partial<Plotly.Layout>>(() => {
    const step = Math.max(1, Math.ceil(labels.length / MAX_TICKS))
    const tickvals = labels.map((_, i) => i).filter((i) => i % step === 0)
    const origin = fc.x[0]
    return plotLayout({
      margin: { t: 22, b: 28, l: 12, r: 52 },
      xaxis: { tickmode: 'array', tickvals, ticktext: tickvals.map((i) => shortTs(labels[i])), tickangle: 0 },
      yaxis: { side: 'right' },
      legend: { orientation: 'h', y: 1.0, yanchor: 'bottom', x: 0, xanchor: 'left', font: { size: 9, color: C.text }, bgcolor: 'transparent' },
      hovermode: 'x unified',
      shapes: origin === undefined ? [] : [
        { type: 'rect', x0: origin, x1: labels.length - 1, y0: 0, y1: 1, yref: 'paper', fillcolor: 'rgba(255,136,0,0.035)', line: { width: 0 }, layer: 'below' },
        { type: 'line', x0: origin, x1: origin, y0: 0, y1: 1, yref: 'paper', line: { color: 'rgba(255,136,0,0.45)', width: 1, dash: 'dot' } },
      ],
      annotations: origin === undefined ? [] : [
        { x: origin, y: 1, yref: 'paper', yanchor: 'bottom', xanchor: 'left', text: ' FORECAST', showarrow: false, font: { size: 9, color: C.amber } },
      ],
    })
  }, [labels, fc])

  return <Plot data={traces} layout={layout} config={CONFIG} style={PLOT_STYLE} useResizeHandler />
}

/** Compact meta caption shown above the chart. */
export function ForecastCaption({ data }: { data: ForecastResponse }) {
  const season = data.seasonality
  const items: Array<[string, string, string?]> = [
    ['MODEL', data.model_used, 'var(--amber)'],
    ...(data.target_column ? [['TARGET', data.target_column, 'var(--cyan)'] as [string, string, string]] : []),
    ['DEVICE', data.device],
    ['SAMPLES', String(data.iterations)],
    ['HORIZON', String(data.prediction_length)],
    ['INFER', `${data.inference_ms}ms`],
    ...(season ? [['PERIOD', `${season.kind}/${season.period}`] as [string, string]] : []),
    ['MAE', data.metrics.mae.toFixed(3)],
    ['RMSE', data.metrics.rmse.toFixed(3)],
    ['MAPE', `${data.metrics.mape.toFixed(2)}%`],
  ]
  return (
    <div className="font-mono text-[10px] px-2 py-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-[var(--border-dim)] bg-[var(--bg-secondary)]">
      {items.map(([k, v, color]) => (
        <span key={k}>
          <span className="text-[var(--grey)]">{k}</span>{' '}
          <span className="tabular-nums" style={{ color: color ?? 'var(--white)' }}>{v}</span>
        </span>
      ))}
    </div>
  )
}

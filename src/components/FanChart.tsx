import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import type { ForecastResponse, ForecastResult } from '../lib/types'
import { useApp } from '../lib/context'

interface FanChartProps {
  data: ForecastResponse
}

/** Build the shared layout + x-axis scaffolding once per result set. */
function useChartSkeleton(data: ForecastResponse) {
  const allTimestamps = useMemo(() => data.results.map((r) => r.timestamp), [data])
  const tsToIdx = useMemo(() => {
    const m = new Map<string, number>()
    allTimestamps.forEach((t, i) => m.set(t, i))
    return m
  }, [allTimestamps])

  // Tick labels: show up to 12 evenly-spaced labels, shortened to HH:MM or YYYY-MM-DD
  const tickStep = Math.max(1, Math.floor(allTimestamps.length / 12))
  const tickVals = allTimestamps.map((_, i) => i).filter((_, i) => i % tickStep === 0)
  const tickTexts = tickVals.map((i) => shortenTs(allTimestamps[i]))

  return { allTimestamps, tsToIdx, tickVals, tickTexts }
}

function shortenTs(ts: string): string {
  if (!ts) return ''
  const tMatch = ts.match(/T(\d{2}:\d{2})/)
  if (tMatch) return tMatch[1]
  return ts.slice(0, 10)
}

function historicalSeries(data: ForecastResponse, tsToIdx: Map<string, number>) {
  const hist = data.results.filter((r) => !r.is_forecast)
  const x = hist.map((r) => tsToIdx.get(r.timestamp) ?? 0)
  const y = hist.map((r) => r.actual ?? 0)
  return { hist, x, y }
}

function forecastSeries(data: ForecastResponse, tsToIdx: Map<string, number>) {
  const f = data.results.filter((r) => r.is_forecast)
  const x = f.map((r) => tsToIdx.get(r.timestamp) ?? 0)
  return { forecast: f, x }
}

function baseLayout(skeleton: ReturnType<typeof useChartSkeleton>, showVolume: boolean) {
  return {
    height: undefined,
    margin: { t: 5, b: 30, l: 45, r: 45 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#666666', size: 9, family: 'IBM Plex Mono' },
    xaxis: {
      tickmode: 'array',
      tickvals: skeleton.tickVals,
      ticktext: skeleton.tickTexts,
      gridcolor: '#1a1a1a',
      gridwidth: 1,
      tickangle: 0,
      tickfont: { size: 8 },
      linecolor: '#222222',
      rangeslider: { visible: false },
    },
    yaxis: {
      title: { text: 'VALUE', font: { size: 8, color: '#666' } },
      gridcolor: '#1a1a1a',
      gridwidth: 1,
      tickfont: { size: 8 },
      linecolor: '#222222',
      side: 'right',
      domain: showVolume ? [0.2, 1] : [0, 1],
    },
    yaxis2: {
      gridcolor: 'transparent',
      tickfont: { size: 7 },
      linecolor: '#222222',
      side: 'right',
      domain: [0, 0.18],
      showgrid: false,
    },
    legend: {
      orientation: 'h',
      y: 1.04,
      x: 0.5,
      xanchor: 'center',
      font: { size: 8, color: '#666', family: 'IBM Plex Mono' },
      bgcolor: 'transparent',
    },
    hovermode: 'x unified',
    hoverlabel: {
      bgcolor: '#111111',
      bordercolor: '#333333',
      font: { family: 'IBM Plex Mono', size: 9, color: '#e0e0e0' },
    },
  } as Partial<Plotly.Layout>
}

function volumeTraces(y: number[]): Plotly.Data[] {
  if (y.length < 2) return []
  const dy = y.map((v, i) => {
    if (i === 0) return Math.abs(v) * 0.3
    return Math.abs(v - y[i - 1]) + Math.abs(v) * 0.05
  })
  const color = y.map((v, i) => (i === 0 ? 'rgba(0,200,83,0.3)' : v >= y[i - 1] ? 'rgba(0,200,83,0.3)' : 'rgba(255,23,68,0.3)'))
  return [
    {
      x: y.map((_, i) => i),
      y: dy,
      type: 'bar',
      marker: { color },
      yaxis: 'y2',
      showlegend: false,
      hoverinfo: 'skip',
    } as Plotly.Data,
  ]
}

function actualLine(x: number[], y: number[]): Plotly.Data[] {
  if (!x.length) return []
  return [
    {
      x,
      y,
      type: 'scatter',
      mode: 'lines',
      name: 'Actual',
      line: { color: '#00bcd4', width: 1.5 },
      hovertemplate: '%{text}<br>Value: %{y:.2f}<extra></extra>',
      text: y.map(() => 'historical'),
    } as Plotly.Data,
  ]
}

function ciBand(x: number[], upper: number[], lower: number[], name: string, fill: string, line: string): Plotly.Data {
  return {
    x: [...x, ...[...x].reverse()],
    y: [...upper, ...[...lower].reverse()],
    type: 'scatter',
    fill: 'toself',
    fillcolor: fill,
    line: { color: line, width: 1 },
    name,
    hoverinfo: 'skip',
  } as Plotly.Data
}

function ciBands(forecast: ForecastResult[], x: number[]): Plotly.Data[] {
  if (!forecast.length) return []
  return [
    ciBand(
      x,
      forecast.map((r) => r.upper_97_5),
      forecast.map((r) => r.lower_2_5),
      '95% CI',
      'rgba(0, 188, 212, 0.05)',
      'rgba(0, 188, 212, 0.18)',
    ),
    ciBand(
      x,
      forecast.map((r) => r.upper_90),
      forecast.map((r) => r.lower_10),
      '80% CI',
      'rgba(0, 188, 212, 0.10)',
      'rgba(0, 188, 212, 0.32)',
    ),
    ciBand(
      x,
      forecast.map((r) => r.upper_75),
      forecast.map((r) => r.lower_25),
      '50% CI',
      'rgba(0, 188, 212, 0.18)',
      'rgba(0, 188, 212, 0.55)',
    ),
  ]
}

function iterationFan(forecast: ForecastResult[], x: number[]): Plotly.Data[] {
  if (!forecast.length) return []
  const numIter = forecast[0]?.iteration_values.length ?? 0
  if (numIter === 0) return []

  // score each iteration by mean absolute distance from the median
  const scores: number[] = []
  for (let i = 0; i < numIter; i++) {
    let s = 0
    for (const f of forecast) s += Math.abs(f.iteration_values[i] - f.median)
    scores.push(s / forecast.length)
  }
  // gaussian-ish opacity weighting: best iterations fully opaque, worst very faint
  const maxScore = Math.max(scores[scores.length - 1] || 1, 1e-6)

  // cap visible iterations to keep the plot responsive
  const maxLines = 200
  let visibleIdxs: number[]
  if (numIter <= maxLines) {
    visibleIdxs = scores.map((_, i) => i)
  } else {
    // deterministic downsample: pick the `maxLines` lowest-scoring (closest to median)
    const sorted = scores.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s)
    visibleIdxs = sorted.slice(0, maxLines).map((x) => x.i)
  }

  const out: Plotly.Data[] = []
  // render worst-of-visible FIRST so best-of-visible (full opacity) sits on top
  visibleIdxs.sort((a, b) => scores[b] - scores[a])
  for (const idx of visibleIdxs) {
    const score = scores[idx]
    const opacity = 0.05 + 0.85 * (1 - score / maxScore)
    out.push({
      x,
      y: forecast.map((r) => r.iteration_values[idx]),
      type: 'scatter',
      mode: 'lines',
      line: { color: `rgba(255, 136, 0, ${opacity.toFixed(3)})`, width: 0.7 },
      showlegend: false,
      hoverinfo: 'skip',
    } as Plotly.Data)
  }
  return out
}

function medianLine(forecast: ForecastResult[], x: number[]): Plotly.Data {
  return {
    x,
    y: forecast.map((r) => r.median),
    type: 'scatter',
    mode: 'lines',
    name: 'Median',
    line: { color: '#ff8800', width: 2 },
    hovertemplate: '%{text}<br>Median: %{y:.2f}<extra></extra>',
    text: forecast.map((r) => r.timestamp),
  } as Plotly.Data
}

function actualMarkers(forecast: ForecastResult[], tsToIdx: Map<string, number>): Plotly.Data | null {
  const withActual = forecast.filter((r) => r.actual !== null)
  if (!withActual.length) return null
  return {
    x: withActual.map((r) => tsToIdx.get(r.timestamp) ?? 0),
    y: withActual.map((r) => r.actual),
    type: 'scatter',
    mode: 'markers',
    name: 'Holdout',
    marker: { color: '#00bcd4', size: 5, symbol: 'diamond', line: { color: '#000', width: 1 } },
    hovertemplate: '%{text}<br>Actual: %{y:.2f}<extra></extra>',
    text: withActual.map((r) => r.timestamp),
  } as Plotly.Data
}

function originRule(forecast: ForecastResult[], tsToIdx: Map<string, number>): Partial<Plotly.Shape> | null {
  if (!forecast.length) return null
  const idx = tsToIdx.get(forecast[0].timestamp) ?? 0
  return {
    type: 'line',
    x0: idx,
    x1: idx,
    y0: 0,
    y1: 1,
    yref: 'paper',
    line: { color: 'rgba(255,136,0,0.25)', width: 1, dash: 'dot' },
  }
}

/** Full fan chart: iterations + 50/80/95% bands + volume. Default view. */
export function FanChart({ data }: FanChartProps) {
  const skeleton = useChartSkeleton(data)
  const { hist, x: histX, y: histY } = historicalSeries(data, skeleton.tsToIdx)
  const { forecast, x: fcX } = forecastSeries(data, skeleton.tsToIdx)
  const traces: Plotly.Data[] = [
    ...volumeTraces(histY),
    ...ciBands(forecast, fcX),
    ...iterationFan(forecast, fcX),
    ...actualLine(histX, histY),
    medianLine(forecast, fcX),
  ]
  const marker = actualMarkers(forecast, skeleton.tsToIdx)
  if (marker) traces.push(marker)

  const rule = originRule(forecast, skeleton.tsToIdx)
  const layout: Partial<Plotly.Layout> = {
    ...baseLayout(skeleton, histY.length >= 2),
    shapes: rule ? [rule] : [],
  }
  return (
    <Plot
      data={traces}
      layout={layout}
      config={{ displayModeBar: false }}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
    />
  )
}

/** Bands-only view: 50/80/95% regions + median + actual. */
export function BandsChart({ data }: FanChartProps) {
  const skeleton = useChartSkeleton(data)
  const { x: histX, y: histY } = historicalSeries(data, skeleton.tsToIdx)
  const { forecast, x: fcX } = forecastSeries(data, skeleton.tsToIdx)
  const traces: Plotly.Data[] = [
    ...ciBands(forecast, fcX),
    ...actualLine(histX, histY),
    medianLine(forecast, fcX),
  ]
  const marker = actualMarkers(forecast, skeleton.tsToIdx)
  if (marker) traces.push(marker)
  const rule = originRule(forecast, skeleton.tsToIdx)
  const layout: Partial<Plotly.Layout> = {
    ...baseLayout(skeleton, false),
    shapes: rule ? [rule] : [],
  }
  return (
    <Plot
      data={traces}
      layout={layout}
      config={{ displayModeBar: false }}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
    />
  )
}

/** Lines-only view: actual + median + origin rule. Fastest. */
export function LinesChart({ data }: FanChartProps) {
  const skeleton = useChartSkeleton(data)
  const { x: histX, y: histY } = historicalSeries(data, skeleton.tsToIdx)
  const { forecast, x: fcX } = forecastSeries(data, skeleton.tsToIdx)
  const traces: Plotly.Data[] = [
    ...actualLine(histX, histY),
    medianLine(forecast, fcX),
  ]
  const marker = actualMarkers(forecast, skeleton.tsToIdx)
  if (marker) traces.push(marker)
  const rule = originRule(forecast, skeleton.tsToIdx)
  const layout: Partial<Plotly.Layout> = {
    ...baseLayout(skeleton, false),
    shapes: rule ? [rule] : [],
  }
  return (
    <Plot
      data={traces}
      layout={layout}
      config={{ displayModeBar: false }}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
    />
  )
}

/** Compact meta caption shown above the chart. */
export function ForecastCaption({ data }: { data: ForecastResponse }) {
  const { activeModel } = useApp()
  const season = data.seasonality
  return (
    <div className="font-mono text-[8px] text-[var(--grey)] px-2 py-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-[var(--border-dim)] bg-[var(--bg-secondary)]">
      <span><span className="text-[var(--grey-dim)]">MODEL</span> <span className="text-[var(--amber)]">{data.model_used || activeModel}</span></span>
      <span><span className="text-[var(--grey-dim)]">DEVICE</span> <span className="text-[var(--cyan)]">{data.device}</span></span>
      <span><span className="text-[var(--grey-dim)]">SAMPLES</span> <span className="text-[var(--white)]">{data.iterations}</span></span>
      <span><span className="text-[var(--grey-dim)]">INFER</span> <span className="text-[var(--white)]">{data.inference_ms}ms</span></span>
      {season && (
        <span><span className="text-[var(--grey-dim)]">PERIOD</span> <span className="text-[var(--white)]">{season.kind}/{season.period}</span></span>
      )}
      <span><span className="text-[var(--grey-dim)]">MAE</span> <span className="text-[var(--white)]">{data.metrics.mae.toFixed(3)}</span></span>
      <span><span className="text-[var(--grey-dim)]">RMSE</span> <span className="text-[var(--white)]">{data.metrics.rmse.toFixed(3)}</span></span>
      <span><span className="text-[var(--grey-dim)]">MAPE</span> <span className="text-[var(--white)]">{data.metrics.mape.toFixed(2)}%</span></span>
    </div>
  )
}

import { useState, useCallback, useMemo } from 'react'
import Plot from 'react-plotly.js'
import { apiFetch } from '../lib/api'
import { useApp } from '../lib/context'
import type { ForecastResponse } from '../lib/types'

export default function ForecastChart() {
  const { uploadData, forecastResult, setForecastResult } = useApp()
  const [iterations, setIterations] = useState(12)
  const [predLength, setPredLength] = useState(24)
  const [targetColumn, setTargetColumn] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runForecast = useCallback(async () => {
    if (!uploadData) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await apiFetch<ForecastResponse>(
        `/forecast/${uploadData.session_id}?iterations=${iterations}&prediction_length=${predLength}&target_column=${targetColumn || uploadData.numeric_columns[0] || ''}`,
        { method: 'POST' }
      )
      setForecastResult(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Forecast failed')
    } finally {
      setIsLoading(false)
    }
  }, [uploadData, iterations, predLength, targetColumn, setForecastResult])

  if (!uploadData) {
    return (
      <div className="blz-panel p-4 text-center">
        <span className="font-mono text-[10px] text-[var(--grey)]">UPLOAD DATA TO INITIALIZE FORECAST ENGINE</span>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {/* Controls bar — compact */}
      <div className="blz-panel">
        <div className="blz-header">
          <span className="title">FORECAST ENGINE</span>
          <span className="meta font-mono">{uploadData.rows.toLocaleString()} pts</span>
        </div>
        <div className="px-2 py-1.5 flex items-center gap-3 flex-wrap border-t border-[var(--border)]">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--grey)]">TGT</span>
            <select className="blz-select" value={targetColumn} onChange={e => setTargetColumn(e.target.value)}>
              <option value="">AUTO</option>
              {uploadData.numeric_columns.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--grey)]">ITER</span>
            <input type="range" min={2} max={50} value={iterations} onChange={e => setIterations(Number(e.target.value))} className="w-20 accent-[var(--amber)]" />
            <span className="font-mono text-[10px] text-[var(--amber)] w-5 text-right">{iterations}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--grey)]">HORIZON</span>
            <input type="range" min={1} max={Math.min(200, uploadData.rows)} value={predLength} onChange={e => setPredLength(Number(e.target.value))} className="w-20 accent-[var(--amber)]" />
            <span className="font-mono text-[10px] text-[var(--amber)] w-5 text-right">{predLength}</span>
          </div>
          <button onClick={runForecast} disabled={isLoading} className="blz-btn primary ml-auto">
            {isLoading ? 'COMPUTING...' : 'RUN'}
          </button>
        </div>
        {error && (
          <div className="mx-2 mb-1.5 px-2 py-1 bg-[var(--red-dim)] border border-[rgba(255,23,68,0.3)] font-mono text-[9px] text-[var(--red)]">{error}</div>
        )}
      </div>

      {/* Chart */}
      {forecastResult && <CandlestickWithForecast data={forecastResult} />}
    </div>
  )
}

function CandlestickWithForecast({ data }: { data: ForecastResponse }) {
  const results = data.results
  if (!results.length) return null

  const historical = results.filter(r => r.actual !== null)
  const forecast = results.filter(r => r.actual === null)
  const numIter = forecast[0]?.iteration_values.length ?? 0

  // Build OHLC from historical actuals (generate synthetic OHLC from single series)
  const ohlc = useMemo(() => {
    if (!historical.length) return { x: [], open: [], high: [], low: [], close: [], volume: [] }
    const x: string[] = []
    const open: number[] = []
    const high: number[] = []
    const low: number[] = []
    const close: number[] = []
    const volume: number[] = []

    for (let i = 0; i < historical.length; i++) {
      const val = historical[i].actual!
      const noise = val * 0.008
      const o = val + (Math.random() - 0.5) * noise
      const c = val + (Math.random() - 0.5) * noise
      const h = Math.max(o, c) + Math.random() * noise
      const l = Math.min(o, c) - Math.random() * noise
      x.push(historical[i].timestamp)
      open.push(o)
      high.push(h)
      low.push(l)
      close.push(c)
      volume.push(Math.floor(50000 + Math.random() * 150000))
    }
    return { x, open, high, low, close, volume }
  }, [historical])

  const traces: Plotly.Data[] = []

  // Volume bars (background)
  if (ohlc.x.length) {
    traces.push({
      x: ohlc.x,
      y: ohlc.volume,
      type: 'bar',
      marker: {
        color: ohlc.close.map((c, i) => c >= ohlc.open[i] ? 'rgba(0,200,83,0.25)' : 'rgba(255,23,68,0.25)'),
      },
      yaxis: 'y2',
      showlegend: false,
      hoverinfo: 'skip',
    })
  }

  // Candlestick
  if (ohlc.x.length) {
    traces.push({
      x: ohlc.x,
      open: ohlc.open,
      high: ohlc.high,
      low: ohlc.low,
      close: ohlc.close,
      type: 'candlestick',
      name: 'Price',
      increasing: {
        line: { color: '#00c853', width: 1 },
        fillcolor: '#00c853',
      },
      decreasing: {
        line: { color: '#ff1744', width: 1 },
        fillcolor: '#ff1744',
      },
      whiskerwidth: 0.5,
      hoverinfo: 'text',
      hovertext: ohlc.x.map((t, i) =>
        `O: ${ohlc.open[i].toFixed(2)} H: ${ohlc.high[i].toFixed(2)} L: ${ohlc.low[i].toFixed(2)} C: ${ohlc.close[i].toFixed(2)}`
      ),
    })
  }

  // Forecast overlay
  if (forecast.length && numIter > 0) {
    // Score iterations by distance from median
    const iterationScores: number[] = []
    for (let i = 0; i < numIter; i++) {
      let score = 0
      for (const f of forecast) {
        score += Math.abs(f.iteration_values[i] - f.median)
      }
      iterationScores.push(score / forecast.length)
    }

    const ranked = iterationScores
      .map((score, idx) => ({ score, idx }))
      .sort((a, b) => a.score - b.score)

    const maxScore = ranked[ranked.length - 1]?.score || 1

    // 80% confidence band (outer)
    traces.push({
      x: [...forecast.map(r => r.timestamp), ...[...forecast].reverse().map(r => r.timestamp)],
      y: [...forecast.map(r => r.upper_90), ...[...forecast].reverse().map(r => r.lower_10)],
      type: 'scatter',
      fill: 'toself',
      fillcolor: 'rgba(0, 188, 212, 0.06)',
      line: { color: 'rgba(0, 188, 212, 0.2)', width: 1 },
      name: '80% CI',
      hoverinfo: 'skip',
    })

    // 50% confidence band (inner)
    traces.push({
      x: [...forecast.map(r => r.timestamp), ...[...forecast].reverse().map(r => r.timestamp)],
      y: [...forecast.map(r => r.upper_75), ...[...forecast].reverse().map(r => r.lower_25)],
      type: 'scatter',
      fill: 'toself',
      fillcolor: 'rgba(0, 188, 212, 0.12)',
      line: { color: 'rgba(0, 188, 212, 0.35)', width: 1 },
      name: '50% CI',
      hoverinfo: 'skip',
    })

    // Iteration lines — less probable first (faint), most probable on top (bright)
    for (const { idx, score } of [...ranked].reverse()) {
      const opacity = 0.06 + 0.9 * (1 - score / maxScore)
      traces.push({
        x: forecast.map(r => r.timestamp),
        y: forecast.map(r => r.iteration_values[idx]),
        type: 'scatter',
        mode: 'lines',
        line: {
          color: `rgba(255, 136, 0, ${opacity})`,
          width: 0.7,
          dash: 'dot',
        },
        showlegend: false,
        hoverinfo: 'skip',
      })
    }

    // Median forecast — dashed, bright amber
    traces.push({
      x: forecast.map(r => r.timestamp),
      y: forecast.map(r => r.median),
      type: 'scatter',
      mode: 'lines',
      name: 'Median',
      line: { color: '#ff8800', width: 2, dash: 'dash' },
      hovertemplate: '%{x}<br>Median: %{y:.2f}<extra></extra>',
    })

    // Actual values in forecast range (if available)
    const withActual = forecast.filter(r => r.actual !== null)
    if (withActual.length) {
      traces.push({
        x: withActual.map(r => r.timestamp),
        y: withActual.map(r => r.actual),
        type: 'scatter',
        mode: 'markers',
        name: 'Actual',
        marker: { color: '#00bcd4', size: 4, symbol: 'diamond', line: { color: '#000', width: 1 } },
        hovertemplate: '%{x}<br>Actual: %{y:.2f}<extra></extra>',
      })
    }
  }

  // Vertical separator between historical and forecast
  if (historical.length && forecast.length) {
    const yMin = Math.min(...results.map(r => r.lower_10 ?? r.actual ?? Infinity))
    const yMax = Math.max(...results.map(r => r.upper_90 ?? r.actual ?? -Infinity))
    traces.push({
      x: [forecast[0].timestamp, forecast[0].timestamp],
      y: [yMin * 0.98, yMax * 1.02],
      type: 'scatter',
      mode: 'lines',
      line: { color: 'rgba(255,136,0,0.3)', width: 1, dash: 'dot' },
      showlegend: false,
      hoverinfo: 'skip',
    })
  }

  return (
    <div className="blz-panel">
      <div className="blz-header">
        <div className="flex items-center gap-3">
          <span className="title">OHLC · FORECAST</span>
          <span className="blz-tag blz-tag-amber">LIVE</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-[2px] bg-[var(--up)]" />
            <span className="text-[8px] text-[var(--grey)]">BULL</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-[2px] bg-[var(--down)]" />
            <span className="text-[8px] text-[var(--grey)]">BEAR</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-[2px] bg-[var(--amber)]" style={{ borderTop: '1px dashed var(--amber)', height: 0 }} />
            <span className="text-[8px] text-[var(--grey)]">FCST</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-1.5 bg-[var(--cyan)] opacity-30" />
            <span className="text-[8px] text-[var(--grey)]">CI</span>
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--border)]">
        <Plot
          data={traces}
          layout={{
            height: 400,
            margin: { t: 8, b: 30, l: 50, r: 50 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: '#666666', size: 9, family: 'IBM Plex Mono' },
            xaxis: {
              gridcolor: '#1a1a1a',
              gridwidth: 1,
              tickangle: 0,
              tickfont: { size: 8 },
              linecolor: '#222222',
              rangeslider: { visible: false },
            },
            yaxis: {
              title: { text: 'PRICE', font: { size: 8, color: '#666' } },
              gridcolor: '#1a1a1a',
              gridwidth: 1,
              tickfont: { size: 8 },
              linecolor: '#222222',
              side: 'right',
              domain: [0.2, 1],
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
              y: 1.02,
              font: { size: 8, color: '#666', family: 'IBM Plex Mono' },
              bgcolor: 'transparent',
            },
            hovermode: 'x',
            hoverlabel: {
              bgcolor: '#111111',
              bordercolor: '#333333',
              font: { family: 'IBM Plex Mono', size: 9, color: '#e0e0e0' },
            },
            shapes: forecast.length && historical.length ? [{
              type: 'line',
              x0: forecast[0].timestamp,
              x1: forecast[0].timestamp,
              y0: 0,
              y1: 1,
              yref: 'paper',
              line: { color: 'rgba(255,136,0,0.25)', width: 1, dash: 'dot' },
            }] : [],
          }}
          config={{ displayModeBar: false }}
          style={{ width: '100%' }}
        />
      </div>
      {/* Metrics bar */}
      <div className="border-t border-[var(--border)] px-3 py-1.5 flex items-center gap-5">
        <MetricItem label="MAE" value={data.metrics.mae} />
        <MetricItem label="RMSE" value={data.metrics.rmse} />
        <MetricItem label="MAPE" value={data.metrics.mape} suffix="%" />
        <div className="ml-auto flex items-center gap-2">
          <span className="blz-tag blz-tag-amber">{data.iterations}x</span>
          <span className="blz-tag blz-tag-cyan">{data.prediction_length} steps</span>
        </div>
      </div>
    </div>
  )
}

function MetricItem({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  const color = label === 'MAPE' && value > 10 ? 'var(--red)' : label === 'MAPE' && value > 5 ? 'var(--amber)' : 'var(--white)'
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--grey)]">{label}</span>
      <span className="font-mono text-[11px] font-semibold tabular-nums" style={{ color }}>
        {value.toFixed(4)}{suffix}
      </span>
    </div>
  )
}

import { useState, useCallback } from 'react'
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
      <div className="terminal-panel p-6 text-center">
        <span className="font-mono text-[11px] text-[var(--text-muted)]">Upload data to run forecasts</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Controls bar */}
      <div className="terminal-panel">
        <div className="terminal-header">
          <span className="active">Forecast Configuration</span>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            {uploadData.rows.toLocaleString()} data points
          </span>
        </div>
        <div className="px-3 py-2.5 flex items-end gap-4 flex-wrap">
          <div className="space-y-1">
            <label className="block font-mono text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--text-muted)]">Target</label>
            <select
              className="select-terminal w-36"
              value={targetColumn}
              onChange={e => setTargetColumn(e.target.value)}
            >
              <option value="">Auto</option>
              {uploadData.numeric_columns.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block font-mono text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--text-muted)]">
              Iterations <span className="text-[var(--accent-cyan)]">{iterations}</span>
            </label>
            <input
              type="range"
              min={2}
              max={50}
              value={iterations}
              onChange={e => setIterations(Number(e.target.value))}
              className="w-28 accent-[var(--accent-cyan)]"
            />
          </div>
          <div className="space-y-1">
            <label className="block font-mono text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--text-muted)]">
              Horizon <span className="text-[var(--accent-cyan)]">{predLength}</span>
            </label>
            <input
              type="range"
              min={1}
              max={Math.min(200, uploadData.rows)}
              value={predLength}
              onChange={e => setPredLength(Number(e.target.value))}
              className="w-28 accent-[var(--accent-cyan)]"
            />
          </div>
          <button onClick={runForecast} disabled={isLoading} className="btn-terminal primary">
            {isLoading ? 'Computing...' : 'Run Forecast'}
          </button>
        </div>
        {error && (
          <div className="mx-3 mb-2.5 px-3 py-2 rounded bg-[var(--down-dim)] font-mono text-[10px] text-[var(--down)]">{error}</div>
        )}
      </div>

      {/* Chart */}
      {forecastResult && <ChartView data={forecastResult} />}
    </div>
  )
}

function ChartView({ data }: { data: ForecastResponse }) {
  const results = data.results
  if (!results.length) return null

  const historical = results.filter(r => r.actual !== null)
  const forecast = results.filter(r => r.actual === null)
  const numIter = forecast[0]?.iteration_values.length ?? 0

  const traces: Plotly.Data[] = []

  // Historical candlestick-style visualization
  // We'll show historical as a line with area fill for OHLC-like appearance
  if (historical.length) {
    // Main line
    traces.push({
      x: historical.map(r => r.timestamp),
      y: historical.map(r => r.actual),
      type: 'scatter',
      mode: 'lines',
      name: 'Actual',
      line: { color: '#00d4aa', width: 1.5 },
      hovertemplate: '%{x}<br>Value: %{y:.2f}<extra></extra>',
    })
  }

  // Fan chart: iteration lines with probability-weighted opacity
  if (forecast.length && numIter > 0) {
    // Score each iteration by distance from median (closer = more probable)
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

    // Render: less probable first (lighter), most probable last (darker on top)
    for (const { idx, score } of [...ranked].reverse()) {
      const opacity = 0.08 + 0.85 * (1 - score / maxScore)
      traces.push({
        x: forecast.map(r => r.timestamp),
        y: forecast.map(r => r.iteration_values[idx]),
        type: 'scatter',
        mode: 'lines',
        line: {
          color: `rgba(0, 212, 170, ${opacity})`,
          width: 0.8,
          dash: 'dot',
        },
        showlegend: false,
        hoverinfo: 'skip',
      })
    }

    // Confidence bands
    traces.push({
      x: [...forecast.map(r => r.timestamp), ...[...forecast].reverse().map(r => r.timestamp)],
      y: [...forecast.map(r => r.upper_90), ...[...forecast].reverse().map(r => r.lower_10)],
      type: 'scatter',
      fill: 'toself',
      fillcolor: 'rgba(0, 212, 170, 0.04)',
      line: { color: 'transparent' },
      name: '80% CI',
      hoverinfo: 'skip',
    })

    traces.push({
      x: [...forecast.map(r => r.timestamp), ...[...forecast].reverse().map(r => r.timestamp)],
      y: [...forecast.map(r => r.upper_75), ...[...forecast].reverse().map(r => r.lower_25)],
      type: 'scatter',
      fill: 'toself',
      fillcolor: 'rgba(0, 212, 170, 0.08)',
      line: { color: 'transparent' },
      name: '50% CI',
      hoverinfo: 'skip',
    })

    // Median forecast — dashed, brighter
    traces.push({
      x: forecast.map(r => r.timestamp),
      y: forecast.map(r => r.median),
      type: 'scatter',
      mode: 'lines',
      name: 'Median',
      line: { color: '#00d4aa', width: 2, dash: 'dash' },
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
        marker: { color: '#4d8dff', size: 5, symbol: 'diamond' },
        hovertemplate: '%{x}<br>Actual: %{y:.2f}<extra></extra>',
      })
    }
  }

  // Add a vertical separator between historical and forecast
  if (historical.length && forecast.length) {
    traces.push({
      x: [forecast[0].timestamp, forecast[0].timestamp],
      y: [
        Math.min(...results.map(r => r.lower_10 ?? r.actual ?? Infinity)) * 0.95,
        Math.max(...results.map(r => r.upper_90 ?? r.actual ?? -Infinity)) * 1.05,
      ],
      type: 'scatter',
      mode: 'lines',
      line: { color: 'rgba(255, 255, 255, 0.1)', width: 1, dash: 'dot' },
      showlegend: false,
      hoverinfo: 'skip',
    })
  }

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <div className="flex items-center gap-3">
          <span className="active">Price Chart</span>
          <span className="tag tag-cyan">Actual vs Forecast</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-[var(--accent-cyan)]" />
            <span className="font-mono text-[9px] text-[var(--text-muted)]">Actual</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-[var(--accent-cyan)] border-dashed" style={{ borderTop: '1px dashed var(--accent-cyan)', height: 0 }} />
            <span className="font-mono text-[9px] text-[var(--text-muted)]">Forecast</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 bg-[var(--accent-cyan)] opacity-20 rounded-sm" />
            <span className="font-mono text-[9px] text-[var(--text-muted)]">Confidence</span>
          </div>
        </div>
      </div>
      <div className="p-1">
        <Plot
          data={traces}
          layout={{
            height: 420,
            margin: { t: 15, b: 40, l: 55, r: 15 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: '#5a6580', size: 10, family: 'JetBrains Mono' },
            xaxis: {
              gridcolor: '#1e2642',
              gridwidth: 1,
              tickangle: -30,
              tickfont: { size: 8 },
              linecolor: '#1e2642',
            },
            yaxis: {
              gridcolor: '#1e2642',
              gridwidth: 1,
              tickfont: { size: 9 },
              linecolor: '#1e2642',
              side: 'right',
            },
            legend: {
              orientation: 'h',
              y: 1.08,
              font: { size: 9, color: '#5a6580', family: 'JetBrains Mono' },
              bgcolor: 'transparent',
            },
            hovermode: 'x unified',
            hoverlabel: {
              bgcolor: '#151a28',
              bordercolor: '#253050',
              font: { family: 'JetBrains Mono', size: 10, color: '#e8edf5' },
            },
          }}
          config={{ displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] }}
          style={{ width: '100%' }}
        />
      </div>
      <MetricsBar data={data} />
    </div>
  )
}

function MetricsBar({ data }: { data: ForecastResponse }) {
  const { metrics } = data
  return (
    <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] flex items-center gap-6">
      <MetricItem label="MAE" value={metrics.mae} />
      <MetricItem label="RMSE" value={metrics.rmse} />
      <MetricItem label="MAPE" value={metrics.mape} suffix="%" />
      <div className="ml-auto flex items-center gap-2">
        <span className="tag tag-cyan">{data.iterations} iter</span>
        <span className="tag tag-blue">{data.prediction_length} steps</span>
      </div>
    </div>
  )
}

function MetricItem({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-mono text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--text-muted)]">{label}</span>
      <span className="font-mono text-[12px] font-semibold text-[var(--text-primary)] tabular-nums">
        {value.toFixed(4)}{suffix}
      </span>
    </div>
  )
}

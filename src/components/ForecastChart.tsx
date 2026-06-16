import { useState, useCallback } from 'react'
import Plot from 'react-plotly.js'
import { apiFetch } from '../lib/api'
import { useApp } from '../lib/context'
import type { ForecastResponse, ForecastResult } from '../lib/types'

export default function ForecastChart() {
  const { uploadData, forecastResult, setForecastResult } = useApp()
  const [iterations, setIterations] = useState(10)
  const [predLength, setPredLength] = useState(24)
  const [targetColumn, setTargetColumn] = useState<string>('')
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
      <div className="card p-8 text-center text-muted text-sm">
        Upload data to run forecasts
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card p-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs text-muted mb-1">Target Column</label>
            <select
              className="input-field"
              value={targetColumn}
              onChange={e => setTargetColumn(e.target.value)}
            >
              <option value="">Auto-detect</option>
              {uploadData.numeric_columns.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Iterations: {iterations}</label>
            <input
              type="range"
              min={1}
              max={50}
              value={iterations}
              onChange={e => setIterations(Number(e.target.value))}
              className="w-32 accent-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Prediction Length: {predLength}</label>
            <input
              type="range"
              min={1}
              max={Math.min(200, uploadData.rows)}
              value={predLength}
              onChange={e => setPredLength(Number(e.target.value))}
              className="w-32 accent-accent"
            />
          </div>
          <button
            onClick={runForecast}
            disabled={isLoading}
            className="btn-primary"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                Running...
              </span>
            ) : 'Run Forecast'}
          </button>
        </div>
        {error && (
          <div className="mt-2 text-xs text-danger bg-danger/10 rounded px-3 py-2">{error}</div>
        )}
      </div>

      {/* Chart */}
      {forecastResult && (
        <div className="card p-4">
          <FanChart data={forecastResult} />
          <MetricsBar data={forecastResult} />
        </div>
      )}
    </div>
  )
}

function FanChart({ data }: { data: ForecastResponse }) {
  const results = data.results
  if (!results.length) return null

  // Historical points (where actual is not null)
  const historical = results.filter(r => r.actual !== null)
  // Forecast points
  const forecast = results.filter(r => r.actual === null)

  // Get all iteration values for each forecast point
  const numIterations = forecast[0]?.iteration_values.length ?? 0

  // Sort iterations by their median distance from the median to rank probability
  const medians = forecast.map(r => r.median)

  // Build traces: historical actual line
  const traces: Plotly.Data[] = []

  if (historical.length) {
    traces.push({
      x: historical.map(r => r.timestamp),
      y: historical.map(r => r.actual),
      type: 'scatter',
      mode: 'lines',
      name: 'Historical',
      line: { color: '#58a6ff', width: 2 },
    })
  }

  // Fan chart: render iteration lines with opacity based on proximity to median
  if (forecast.length && numIterations > 0) {
    // For each iteration, compute its mean distance from the median across all forecast points
    const iterationScores: number[] = []
    for (let i = 0; i < numIterations; i++) {
      let score = 0
      for (const f of forecast) {
        score += Math.abs(f.iteration_values[i] - f.median)
      }
      iterationScores.push(score / forecast.length)
    }

    // Rank iterations: lower score = more probable = darker
    const ranked = iterationScores
      .map((score, idx) => ({ score, idx }))
      .sort((a, b) => a.score - b.score)

    const maxScore = ranked[ranked.length - 1]?.score || 1

    // Render less probable first (lighter), most probable last (darker on top)
    for (const { idx, score } of ranked.reverse()) {
      const opacity = 0.1 + 0.9 * (1 - score / maxScore)
      traces.push({
        x: forecast.map(r => r.timestamp),
        y: forecast.map(r => r.iteration_values[idx]),
        type: 'scatter',
        mode: 'lines',
        name: `Iteration ${idx + 1}`,
        line: { color: `rgba(88, 166, 255, ${opacity})`, width: 1 },
        showlegend: false,
        hoverinfo: 'skip',
      })
    }

    // Median line (most probable)
    traces.push({
      x: forecast.map(r => r.timestamp),
      y: forecast.map(r => r.median),
      type: 'scatter',
      mode: 'lines',
      name: 'Median Forecast',
      line: { color: '#3fb950', width: 3 },
    })

    // Confidence bands
    traces.push({
      x: [...forecast.map(r => r.timestamp), ...forecast.map(r => r.timestamp).reverse()],
      y: [...forecast.map(r => r.upper_90), ...forecast.map(r => r.lower_10).reverse()],
      type: 'scatter',
      fill: 'toself',
      fillcolor: 'rgba(63, 185, 80, 0.08)',
      line: { color: 'transparent' },
      name: '80% Interval',
      showlegend: true,
    })

    traces.push({
      x: [...forecast.map(r => r.timestamp), ...forecast.map(r => r.timestamp).reverse()],
      y: [...forecast.map(r => r.upper_75), ...forecast.map(r => r.lower_25).reverse()],
      type: 'scatter',
      fill: 'toself',
      fillcolor: 'rgba(63, 185, 80, 0.15)',
      line: { color: 'transparent' },
      name: '50% Interval',
      showlegend: true,
    })

    // Actual values if available in forecast range
    const withActual = forecast.filter(r => r.actual !== null)
    if (withActual.length) {
      traces.push({
        x: withActual.map(r => r.timestamp),
        y: withActual.map(r => r.actual),
        type: 'scatter',
        mode: 'markers',
        name: 'Actual',
        marker: { color: '#f85149', size: 6 },
      })
    }
  }

  return (
    <Plot
      data={traces}
      layout={{
        height: 400,
        margin: { t: 30, b: 50, l: 60, r: 20 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { gridcolor: '#30363d', tickangle: -45 },
        yaxis: { gridcolor: '#30363d' },
        legend: { orientation: 'h', y: 1.12, font: { size: 10 } },
        hovermode: 'x unified',
      }}
      config={{ displayModeBar: true, displaylogo: false }}
    />
  )
}

function MetricsBar({ data }: { data: ForecastResponse }) {
  const { metrics } = data
  return (
    <div className="flex gap-6 mt-4 pt-4 border-t border-border">
      <MetricCard label="MAE" value={metrics.mae} color="#3fb950" />
      <MetricCard label="RMSE" value={metrics.rmse} color="#f85149" />
      <MetricCard label="MAPE" value={metrics.mape} color="#58a6ff" suffix="%" />
      <div className="ml-auto text-xs text-muted self-center">
        {data.iterations} iterations &middot; {data.prediction_length} steps
      </div>
    </div>
  )
}

function MetricCard({ label, value, color, suffix = '' }: {
  label: string
  value: number
  color: string
  suffix?: string
}) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-bold font-mono" style={{ color }}>
        {value.toFixed(4)}{suffix}
      </div>
    </div>
  )
}

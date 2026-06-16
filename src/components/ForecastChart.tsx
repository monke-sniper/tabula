import { useState, useCallback, useRef, useMemo } from 'react'
import Plot from 'react-plotly.js'
import { API_BASE } from '../lib/api'
import { useApp } from '../lib/context'
import type { ForecastResponse } from '../lib/types'

export default function ForecastChart() {
  const { uploadData, forecastResult, setForecastResult } = useApp()
  const [iterations, setIterations] = useState(12)
  const [predLength, setPredLength] = useState(24)
  const [targetColumn, setTargetColumn] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const runForecast = useCallback(async () => {
    if (!uploadData) return
    setIsLoading(true)
    setError(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(
        `${API_BASE}/forecast/${uploadData.session_id}?iterations=${iterations}&prediction_length=${predLength}&target_column=${targetColumn || uploadData.numeric_columns[0] || ''}`,
        {
          method: 'POST',
          signal: controller.signal,
        }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail || `API error: ${res.status}`)
      }
      const result: ForecastResponse = await res.json()
      setForecastResult(result)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Cancelled')
      } else {
        setError(err instanceof Error ? err.message : 'Forecast failed')
      }
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [uploadData, iterations, predLength, targetColumn, setForecastResult])

  const stopForecast = useCallback(() => {
    abortRef.current?.abort()
    fetch(`${API_BASE}/forecast/cancel`, { method: 'POST' }).catch(() => {})
  }, [])

  if (!uploadData) {
    return (
      <div className="blz-panel h-full flex items-center justify-center">
        <span className="font-mono text-[10px] text-[var(--grey)]">UPLOAD DATA TO INITIALIZE FORECAST ENGINE</span>
      </div>
    )
  }

  return (
    <div className="blz-panel flex flex-col h-full">
      <div className="blz-header">
        <span className="title">FORECAST ENGINE</span>
        <span className="meta font-mono">{uploadData.rows.toLocaleString()} pts</span>
      </div>
      <div className="px-2 py-1.5 flex items-center gap-3 flex-wrap border-t border-[var(--border)] shrink-0">
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
        {isLoading ? (
          <button onClick={stopForecast} className="blz-btn ml-auto" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
            STOP
          </button>
        ) : (
          <button onClick={runForecast} className="blz-btn primary ml-auto">
            RUN
          </button>
        )}
      </div>
      {error && (
        <div className="mx-2 mb-1 px-2 py-1 bg-[var(--red-dim)] border border-[rgba(255,23,68,0.3)] font-mono text-[9px] text-[var(--red)] shrink-0">{error}</div>
      )}
      <div className="flex-1 min-h-0 border-t border-[var(--border)]">
        {forecastResult && <ForecastPlot data={forecastResult} />}
      </div>
    </div>
  )
}

function ForecastPlot({ data }: { data: ForecastResponse }) {
  const results = data.results
  if (!results.length) return null

  const historical = results.filter(r => r.actual !== null)
  const forecast = results.filter(r => r.actual === null)
  const numIter = forecast[0]?.iteration_values.length ?? 0

  const historicalX = useMemo(() => historical.map(r => r.timestamp), [historical])
  const historicalY = useMemo(() => historical.map(r => r.actual!), [historical])

  const volumeY = useMemo(() => {
    return historicalY.map((_, i) => {
      if (i === 0) return Math.abs(historicalY[0]) * 0.3
      return Math.abs(historicalY[i] - historicalY[i - 1]) + Math.abs(historicalY[i]) * 0.05
    })
  }, [historicalY])

  const volumeColor = useMemo(() => {
    return historicalY.map((v, i) => {
      if (i === 0) return 'rgba(0,200,83,0.3)'
      return v >= historicalY[i - 1] ? 'rgba(0,200,83,0.3)' : 'rgba(255,23,68,0.3)'
    })
  }, [historicalY])

  const traces: Plotly.Data[] = []

  if (historicalX.length) {
    traces.push({
      x: historicalX,
      y: volumeY,
      type: 'bar',
      marker: { color: volumeColor },
      yaxis: 'y2',
      showlegend: false,
      hoverinfo: 'skip',
    })
  }

  if (historicalX.length) {
    traces.push({
      x: historicalX,
      y: historicalY,
      type: 'scatter',
      mode: 'lines',
      name: 'Actual',
      line: { color: '#00bcd4', width: 1.5 },
      hovertemplate: '%{x}<br>Value: %{y:.2f}<extra></extra>',
    })
  }

  if (forecast.length && numIter > 0) {
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

    for (const { idx, score } of [...ranked].reverse()) {
      const opacity = 0.06 + 0.9 * (1 - score / maxScore)
      traces.push({
        x: forecast.map(r => r.timestamp),
        y: forecast.map(r => r.iteration_values[idx]),
        type: 'scatter',
        mode: 'lines',
        line: { color: `rgba(255, 136, 0, ${opacity})`, width: 0.7, dash: 'dot' },
        showlegend: false,
        hoverinfo: 'skip',
      })
    }

    traces.push({
      x: forecast.map(r => r.timestamp),
      y: forecast.map(r => r.median),
      type: 'scatter',
      mode: 'lines',
      name: 'Median',
      line: { color: '#ff8800', width: 2, dash: 'dash' },
      hovertemplate: '%{x}<br>Median: %{y:.2f}<extra></extra>',
    })

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

  return (
    <Plot
      data={traces}
      layout={{
        height: undefined,
        margin: { t: 5, b: 25, l: 45, r: 45 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#666666', size: 9, family: 'IBM Plex Mono' },
        xaxis: {
          type: 'category',
          gridcolor: '#1a1a1a',
          gridwidth: 1,
          tickangle: 0,
          tickfont: { size: 8 },
          linecolor: '#222222',
          rangeslider: { visible: false },
          categoryorder: 'array',
          categoryarray: results.map(r => r.timestamp),
        },
        yaxis: {
          title: { text: 'VALUE', font: { size: 8, color: '#666' } },
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
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
    />
  )
}

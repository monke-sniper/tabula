import { useState } from 'react'
import { useApp } from '../lib/context'
import Plot from 'react-plotly.js'

type EDATab = 'stats' | 'distributions' | 'correlations' | 'missing' | 'outliers'

export default function EDAPanel() {
  const { edaStats } = useApp()
  const [activeTab, setActiveTab] = useState<EDATab>('stats')

  if (!edaStats) {
    return (
      <div className="card p-6 text-center text-muted text-sm">
        Upload a file to see EDA analysis
      </div>
    )
  }

  const tabs: { key: EDATab; label: string }[] = [
    { key: 'stats', label: 'Statistics' },
    { key: 'distributions', label: 'Distributions' },
    { key: 'correlations', label: 'Correlations' },
    { key: 'missing', label: 'Missing' },
    { key: 'outliers', label: 'Outliers' },
  ]

  return (
    <div className="card">
      <div className="flex border-b border-border overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'text-accent border-b-2 border-accent'
                : 'text-muted hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {activeTab === 'stats' && <StatsTab stats={edaStats} />}
        {activeTab === 'distributions' && <DistributionsTab stats={edaStats} />}
        {activeTab === 'correlations' && <CorrelationsTab stats={edaStats} />}
        {activeTab === 'missing' && <MissingTab stats={edaStats} />}
        {activeTab === 'outliers' && <OutliersTab stats={edaStats} />}
      </div>
    </div>
  )
}

function StatsTab({ stats }: { stats: NonNullable<ReturnType<typeof useApp>['edaStats']> }) {
  return (
    <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr>
            <th className="px-3 py-2 text-left text-muted font-medium border-b border-border">Column</th>
            <th className="px-3 py-2 text-right text-muted font-medium border-b border-border">Type</th>
            <th className="px-3 py-2 text-right text-muted font-medium border-b border-border">Non-Null</th>
            <th className="px-3 py-2 text-right text-muted font-medium border-b border-border">Unique</th>
            <th className="px-3 py-2 text-right text-muted font-medium border-b border-border">Mean</th>
            <th className="px-3 py-2 text-right text-muted font-medium border-b border-border">Std</th>
            <th className="px-3 py-2 text-right text-muted font-medium border-b border-border">Min</th>
            <th className="px-3 py-2 text-right text-muted font-medium border-b border-border">Max</th>
          </tr>
        </thead>
        <tbody>
          {stats.column_info.map(col => (
            <tr key={col.name} className="border-b border-border/50 hover:bg-border/20">
              <td className="px-3 py-1.5 font-medium text-accent">{col.name}</td>
              <td className="px-3 py-1.5 text-right text-muted">{col.dtype}</td>
              <td className="px-3 py-1.5 text-right">{col.non_null.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right text-muted">{col.unique ?? '-'}</td>
              <td className="px-3 py-1.5 text-right font-mono">{col.mean?.toFixed(4) ?? '-'}</td>
              <td className="px-3 py-1.5 text-right font-mono">{col.std?.toFixed(4) ?? '-'}</td>
              <td className="px-3 py-1.5 text-right font-mono text-xs">{col.min?.toString().slice(0, 12) ?? '-'}</td>
              <td className="px-3 py-1.5 text-right font-mono text-xs">{col.max?.toString().slice(0, 12) ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DistributionsTab({ stats }: { stats: NonNullable<ReturnType<typeof useApp>['edaStats']> }) {
  const numericCols = stats.column_info.filter(c => c.mean !== undefined)
  const [selected, setSelected] = useState<string>(numericCols[0]?.name ?? '')

  const dist = stats.distributions[selected]
  if (!dist) return <div className="text-sm text-muted">No distribution data available</div>

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {numericCols.map(col => (
          <button
            key={col.name}
            onClick={() => setSelected(col.name)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              selected === col.name
                ? 'bg-accent text-bg'
                : 'bg-border/50 text-muted hover:text-text'
            }`}
          >
            {col.name}
          </button>
        ))}
      </div>
      <Plot
        data={[{
          x: dist.bins.slice(0, -1),
          y: dist.counts,
          type: 'bar',
          marker: { color: '#58a6ff' },
        }]}
        layout={{
          width: 500,
          height: 280,
          margin: { t: 20, b: 40, l: 50, r: 20 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: '#8b949e', size: 10 },
          xaxis: { gridcolor: '#30363d', title: selected },
          yaxis: { gridcolor: '#30363d', title: 'Count' },
        }}
        config={{ displayModeBar: false }}
      />
    </div>
  )
}

function CorrelationsTab({ stats }: { stats: NonNullable<ReturnType<typeof useApp>['edaStats']> }) {
  const cols = Object.keys(stats.correlations)
  if (!cols.length) return <div className="text-sm text-muted">No numeric columns for correlation</div>

  const z = cols.map(c1 => cols.map(c2 => stats.correlations[c1]?.[c2] ?? 0))

  return (
    <Plot
      data={[{
        z,
        x: cols,
        y: cols,
        type: 'heatmap',
        colorscale: [[0, '#f85149'], [0.5, '#161b22'], [1, '#3fb950']],
        zmin: -1,
        zmax: 1,
        hoverongaps: false,
      }]}
      layout={{
        width: 500,
        height: 350,
        margin: { t: 20, b: 80, l: 80, r: 20 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 10 },
        xaxis: { tickangle: -45 },
      }}
      config={{ displayModeBar: false }}
    />
  )
}

function MissingTab({ stats }: { stats: NonNullable<ReturnType<typeof useApp>['edaStats']> }) {
  const missing = stats.missing_values.filter(m => m.count > 0)

  if (!missing.length) {
    return (
      <div className="text-center py-8">
        <div className="text-success text-2xl mb-2">&#10003;</div>
        <div className="text-sm text-muted">No missing values</div>
      </div>
    )
  }

  return (
    <Plot
      data={[{
        x: missing.map(m => m.column),
        y: missing.map(m => m.pct),
        type: 'bar',
        marker: { color: '#f85149' },
        text: missing.map(m => `${m.count} (${m.pct.toFixed(1)}%)`),
        textposition: 'outside',
        textfont: { color: '#8b949e', size: 10 },
      }]}
      layout={{
        width: 500,
        height: 280,
        margin: { t: 20, b: 60, l: 50, r: 20 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 10 },
        yaxis: { gridcolor: '#30363d', title: '% Missing' },
        xaxis: { tickangle: -45 },
      }}
      config={{ displayModeBar: false }}
    />
  )
}

function OutliersTab({ stats }: { stats: NonNullable<ReturnType<typeof useApp>['edaStats']> }) {
  const withOutliers = stats.outliers.filter(o => o.count > 0)

  if (!withOutliers.length) {
    return (
      <div className="text-center py-8">
        <div className="text-success text-2xl mb-2">&#10003;</div>
        <div className="text-sm text-muted">No significant outliers detected (IQR method)</div>
      </div>
    )
  }

  return (
    <Plot
      data={[{
        x: withOutliers.map(o => o.column),
        y: withOutliers.map(o => o.count),
        type: 'bar',
        marker: { color: '#d29922' },
        text: withOutliers.map(o => `${o.count} outliers (IQR: ${o.iqr.toFixed(2)})`),
        textposition: 'outside',
        textfont: { color: '#8b949e', size: 10 },
      }]}
      layout={{
        width: 500,
        height: 280,
        margin: { t: 20, b: 60, l: 50, r: 20 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 10 },
        yaxis: { gridcolor: '#30363d', title: 'Outlier Count' },
        xaxis: { tickangle: -45 },
      }}
      config={{ displayModeBar: false }}
    />
  )
}

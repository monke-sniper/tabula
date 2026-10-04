// Plotly can't read CSS variables, so chart colors mirror the tokens in index.css.
export const C = {
  amber: '#ff8800',
  cyan: '#00bcd4',
  green: '#00c853',
  red: '#ff1744',
  text: '#8a8a8a',
  grid: '#1c1c1c',
  axis: '#2a2a2a',
  font: 'IBM Plex Mono, monospace',
}

export const PLOT_CONFIG: Partial<Plotly.Config> = { displayModeBar: false }
export const PLOT_STYLE = { width: '100%', height: '100%' }

/** Base layout shared by every chart; pass overrides for axes/margins. */
export function plotLayout(overrides: Partial<Plotly.Layout> = {}): Partial<Plotly.Layout> {
  const { xaxis, yaxis, ...rest } = overrides
  return {
    margin: { t: 8, b: 30, l: 40, r: 8 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: C.text, size: 10, family: C.font },
    xaxis: { gridcolor: C.grid, linecolor: C.axis, zeroline: false, tickfont: { size: 9 }, ...xaxis },
    yaxis: { gridcolor: C.grid, linecolor: C.axis, zeroline: false, tickfont: { size: 9 }, ...yaxis },
    legend: { orientation: 'h', y: 1.08, x: 0.5, xanchor: 'center', font: { size: 9, color: C.text }, bgcolor: 'transparent' },
    hoverlabel: { bgcolor: '#141414', bordercolor: '#3a3a3a', font: { family: C.font, size: 10, color: '#e6e6e6' } },
    ...rest,
  }
}

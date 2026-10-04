import { useState } from 'react'
import { useApp } from '../lib/context'

const ROWS_PER_PAGE = 15

export default function DataTable() {
  const { uploadData } = useApp()
  const [page, setPage] = useState(0)

  if (!uploadData) return null

  const { preview, column_names: columns, timestamp_column: tsCol, numeric_columns: numeric } = uploadData
  const totalPages = Math.max(1, Math.ceil(preview.length / ROWS_PER_PAGE))
  const current = Math.min(page, totalPages - 1)
  const visibleRows = preview.slice(current * ROWS_PER_PAGE, (current + 1) * ROWS_PER_PAGE)

  return (
    <div className="blz-panel border-0 h-full flex flex-col">
      <div className="blz-header shrink-0">
        <span className="title">
          DATA <span className="meta normal-case tracking-normal">first {preview.length} of {uploadData.rows.toLocaleString()} rows</span>
        </span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setPage(current - 1)} disabled={current === 0} className="blz-btn py-0 px-1.5" aria-label="Previous page">‹</button>
          <span className="font-mono text-[10px] text-[var(--grey-bright)] tabular-nums">{current + 1}/{totalPages}</span>
          <button onClick={() => setPage(current + 1)} disabled={current >= totalPages - 1} className="blz-btn py-0 px-1.5" aria-label="Next page">›</button>
        </div>
      </div>
      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full">
          <thead className="sticky top-0 bg-[var(--bg-secondary)] z-[1]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className={`px-2 py-1 font-mono text-[9px] font-bold tracking-[0.08em] uppercase border-b border-[var(--border)] whitespace-nowrap ${
                    numeric.includes(col) ? 'text-right' : 'text-left'
                  } ${col === tsCol ? 'text-[var(--cyan)]' : 'text-[var(--amber)]'}`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr key={i} className="border-b border-[var(--border-dim)] hover:bg-[var(--bg-tertiary)]">
                {columns.map((col) => (
                  <td
                    key={col}
                    className={`px-2 py-0.5 font-mono text-[11px] whitespace-nowrap text-[var(--grey-bright)] tabular-nums ${
                      numeric.includes(col) ? 'text-right' : ''
                    }`}
                  >
                    {formatCell(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatCell(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'number') return Number.isInteger(val) ? String(val) : val.toFixed(2)
  const s = String(val).replace(/^(\d{4}-\d{2}-\d{2})T/, '$1 ')
  return s.length > 28 ? s.slice(0, 25) + '…' : s
}

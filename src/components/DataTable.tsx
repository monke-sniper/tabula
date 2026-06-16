import { useState } from 'react'
import { useApp } from '../lib/context'

export default function DataTable() {
  const { uploadData } = useApp()
  const [page, setPage] = useState(0)
  const rowsPerPage = 20

  if (!uploadData) return null

  const preview = uploadData.preview
  const totalPages = Math.ceil(preview.length / rowsPerPage)
  const visibleRows = preview.slice(page * rowsPerPage, (page + 1) * rowsPerPage)
  const columns = uploadData.column_names

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span className="active">Data Preview</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="btn-terminal py-0.5 px-1.5 text-[9px]"
          >
            ‹
          </button>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">{page + 1}/{totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="btn-terminal py-0.5 px-1.5 text-[9px]"
          >
            ›
          </button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
            <tr>
              {columns.map(col => (
                <th
                  key={col}
                  className="px-3 py-1.5 text-left font-mono text-[9px] font-semibold tracking-[0.06em] uppercase text-[var(--text-muted)] border-b border-[var(--border-subtle)] whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr key={i} className="border-b border-[var(--border-subtle)]/50 hover:bg-[var(--bg-tertiary)]/50 transition-colors">
                {columns.map(col => (
                  <td key={col} className="px-3 py-1 font-mono text-[11px] whitespace-nowrap text-[var(--text-secondary)] tabular-nums">
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
  if (typeof val === 'number') return val % 1 === 0 ? val.toLocaleString() : val.toFixed(2)
  if (typeof val === 'string' && val.length > 32) return val.slice(0, 29) + '…'
  return String(val)
}

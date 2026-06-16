import { useState } from 'react'
import { useApp } from '../lib/context'

export default function DataTable() {
  const { uploadData } = useApp()
  const [page, setPage] = useState(0)
  const rowsPerPage = 15

  if (!uploadData) return null

  const preview = uploadData.preview
  const totalPages = Math.ceil(preview.length / rowsPerPage)
  const visibleRows = preview.slice(page * rowsPerPage, (page + 1) * rowsPerPage)
  const columns = uploadData.column_names

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs text-muted">Data Preview ({preview.length} rows shown)</span>
        <div className="flex gap-1">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="btn-ghost text-xs px-2 py-1"
          >
            &laquo;
          </button>
          <span className="text-xs text-muted px-2 py-1">{page + 1}/{totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="btn-ghost text-xs px-2 py-1"
          >
            &raquo;
          </button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card z-10">
            <tr>
              {columns.map(col => (
                <th key={col} className="px-3 py-2 text-left text-muted font-medium border-b border-border whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-border/20 transition-colors">
                {columns.map(col => (
                  <td key={col} className="px-3 py-1.5 font-mono whitespace-nowrap text-text/80">
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
  if (val === null || val === undefined) return '-'
  if (typeof val === 'number') return val % 1 === 0 ? val.toLocaleString() : val.toFixed(4)
  if (typeof val === 'string' && val.length > 40) return val.slice(0, 37) + '...'
  return String(val)
}

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
    <div className="blz-panel h-full flex flex-col">
      <div className="blz-header">
        <span className="title">DATA</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="blz-btn py-0 px-1 text-[8px]">{"<"}</button>
          <span className="font-mono text-[9px] text-[var(--grey)]">{page + 1}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="blz-btn py-0 px-1 text-[8px]}">{">"}</button>
        </div>
      </div>
      <div className="overflow-x-auto flex-1 overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-[var(--bg-secondary)]">
            <tr>
              {columns.map(col => (
                <th
                  key={col}
                  className="px-2 py-1 text-left font-mono text-[8px] font-bold tracking-[0.08em] uppercase text-[var(--amber)] border-b border-[var(--border)] whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr key={i} className="border-b border-[var(--border-dim)] hover:bg-[var(--bg-tertiary)] transition-colors">
                {columns.map(col => (
                  <td key={col} className="px-2 py-0.5 font-mono text-[10px] whitespace-nowrap text-[var(--grey-bright)] tabular-nums">
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
  if (typeof val === 'string' && val.length > 28) return val.slice(0, 25) + '...'
  return String(val)
}

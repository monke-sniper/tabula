import { useState, useCallback, useRef } from 'react'
import { apiUpload, apiFetch } from '../lib/api'
import { useApp } from '../lib/context'
import type { UploadResponse } from '../lib/types'

export default function FileUpload() {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { setUploadData, setSessionId, setEDAStats, uploadData } = useApp()

  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await apiUpload<UploadResponse>('/upload', file)
      setUploadData(result)
      setSessionId(result.session_id)
      const eda = await apiFetch<any>(`/eda/${result.session_id}`)
      setEDAStats(eda)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsLoading(false)
    }
  }, [setUploadData, setSessionId, setEDAStats])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  if (uploadData) {
    return (
      <div className="terminal-panel">
        <div className="terminal-header">
          <div className="flex items-center gap-2">
            <div className="tag tag-up">Loaded</div>
            <span className="text-[var(--text-primary)] normal-case tracking-normal font-semibold text-[11px]">{uploadData.filename}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              {uploadData.rows.toLocaleString()} rows × {uploadData.columns} cols
            </span>
            <button
              onClick={() => { setUploadData(null); setSessionId(null); setEDAStats(null) }}
              className="text-[10px] text-[var(--down)] hover:text-[var(--down)] font-semibold uppercase tracking-wider"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
          {uploadData.numeric_columns.map(col => (
            <span key={col} className="font-mono text-[10px] text-[var(--text-muted)]">
              <span className="text-[var(--text-secondary)]">{col}</span>
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`terminal-panel border-dashed transition-all duration-200 cursor-pointer ${
        isDragOver
          ? 'border-[var(--accent-cyan)] bg-[var(--accent-cyan-dim)]'
          : 'border-[var(--border-default)] hover:border-[var(--border-bright)]'
      } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".csv,.json,.xlsx,.xls,.parquet"
        onChange={onFileSelect}
      />
      <div className="px-6 py-8 flex flex-col items-center gap-3">
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
            <span className="font-mono text-[11px] text-[var(--text-muted)]">Processing...</span>
          </>
        ) : (
          <>
            <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <div className="text-center">
              <p className="text-[12px] font-medium text-[var(--text-secondary)]">Drop data file</p>
              <p className="font-mono text-[10px] text-[var(--text-muted)] mt-1">CSV · JSON · Excel · Parquet</p>
            </div>
          </>
        )}
      </div>
      {error && (
        <div className="mx-3 mb-3 px-3 py-2 rounded bg-[var(--down-dim)] font-mono text-[10px] text-[var(--down)]">{error}</div>
      )}
    </div>
  )
}

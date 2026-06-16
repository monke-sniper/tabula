import { useState, useCallback, useRef } from 'react'
import { apiUpload } from '../lib/api'
import { useApp } from '../lib/context'
import type { UploadResponse } from '../lib/types'

export default function FileUpload() {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { setUploadData, setSessionId, setEDAStats, sessionId, uploadData } = useApp()

  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await apiUpload<UploadResponse>('/upload', file)
      setUploadData(result)
      setSessionId(result.session_id)

      const eda = await fetch(`http://127.0.0.1:8420/eda/${result.session_id}`)
        .then(r => r.json())
      setEDAStats(eda)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setError(msg)
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

  const openDialog = async () => {
    if (window.electronAPI) {
      const filePath = await window.electronAPI.openFileDialog()
      if (filePath) {
        const fileName = filePath.split(/[/\\]/).pop() || 'file'
        const blob = new Blob(['dummy'])
        const file = new File([blob], fileName)
        try {
          setIsLoading(true)
          setError(null)
          const result = await apiUpload<UploadResponse>('/upload', file)
          setUploadData(result)
          setSessionId(result.session_id)
          const eda = await fetch(`http://127.0.0.1:8420/eda/${result.session_id}`)
            .then(r => r.json())
          setEDAStats(eda)
        } catch {
          const ext = fileName.split('.').pop()
          const mimeMap: Record<string, string> = {
            csv: 'text/csv',
            json: 'application/json',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            parquet: 'application/octet-stream',
          }
          const resp = await fetch(`http://127.0.0.1:8420/upload-path`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath }),
          })
          if (resp.ok) {
            const result = await resp.json()
            setUploadData(result)
            setSessionId(result.session_id)
            const eda = await fetch(`http://127.0.0.1:8420/eda/${result.session_id}`)
              .then(r => r.json())
            setEDAStats(eda)
          } else {
            const err = await resp.json().catch(() => ({ detail: 'Failed' }))
            setError(err.detail || 'Upload failed')
          }
        } finally {
          setIsLoading(false)
        }
      }
    } else {
      inputRef.current?.click()
    }
  }

  if (uploadData) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-success text-lg">&#10003;</span>
              <span className="font-medium text-text">{uploadData.filename}</span>
            </div>
            <div className="text-xs text-muted mt-1">
              {uploadData.rows.toLocaleString()} rows &middot; {uploadData.columns} columns &middot; Session {uploadData.session_id.slice(0, 8)}
            </div>
          </div>
          <button
            onClick={() => {
              setUploadData(null)
              setSessionId(null)
              setEDAStats(null)
            }}
            className="btn-ghost text-xs text-danger"
          >
            Clear
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`card border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
        isDragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-muted'
      } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={openDialog}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".csv,.json,.xlsx,.xls,.parquet"
        onChange={onFileSelect}
      />

      {isLoading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted">Processing file...</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <svg className="w-10 h-10 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <div>
            <p className="text-sm text-text font-medium">Drop your data file here</p>
            <p className="text-xs text-muted mt-1">CSV, JSON, Excel, or Parquet</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 text-xs text-danger bg-danger/10 rounded px-3 py-2">{error}</div>
      )}
    </div>
  )
}

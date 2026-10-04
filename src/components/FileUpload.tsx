import { useState, useCallback, useRef, useEffect } from 'react'
import { apiUpload, errorMessage } from '../lib/api'
import { useApp } from '../lib/context'
import { useToast } from '../lib/toast'
import type { UploadResponse } from '../lib/types'
import { HelpTip } from './HelpTip'

const ACCEPT = '.csv,.json,.xlsx,.xls,.parquet'

export default function FileUpload() {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { uploadData, openSession, closeSession } = useApp()
  const toast = useToast()

  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await apiUpload<UploadResponse>('/upload', file)
      toast('success', 'Loaded', `${result.rows.toLocaleString()} rows · ${result.columns} cols`)
      await openSession(result).catch((e) => toast('warn', 'EDA unavailable', errorMessage(e)))
    } catch (err) {
      const msg = errorMessage(err, 'Upload failed')
      setError(msg)
      toast('error', 'Upload failed', msg)
    } finally {
      setIsLoading(false)
    }
  }, [openSession, toast])

  // Ctrl+O (KeyboardShortcuts) dispatches the picked file here
  useEffect(() => {
    const onShortcut = (e: Event) => {
      const file = (e as CustomEvent<File>).detail
      if (file) handleFile(file)
    }
    window.addEventListener('tabula:file-shortcut', onShortcut)
    return () => window.removeEventListener('tabula:file-shortcut', onShortcut)
  }, [handleFile])

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (file) handleFile(file)
  }

  const clear = () => {
    closeSession()
    toast('info', 'Session cleared')
  }

  const input = <input ref={inputRef} type="file" className="hidden" accept={ACCEPT} onChange={onFileSelect} />

  if (uploadData) {
    return (
      <div className="blz-panel border-0">
        <div className="blz-header">
          <div className="flex items-center gap-2 min-w-0">
            <span className="blz-tag blz-tag-green">LOADED</span>
            <span className="text-[var(--white)] normal-case tracking-normal font-semibold text-[11px] truncate">{uploadData.filename}</span>
            <span className="font-mono text-[10px] text-[var(--grey)] normal-case tracking-normal shrink-0">
              {uploadData.rows.toLocaleString()} rows · {uploadData.columns} cols
              {uploadData.timestamp_column && <> · time <span className="text-[var(--cyan)]">{uploadData.timestamp_column}</span></>}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => inputRef.current?.click()} disabled={isLoading} className="blz-btn py-0">
              {isLoading ? 'LOADING…' : 'REPLACE'}
            </button>
            <button onClick={clear} className="blz-btn blz-btn-danger py-0">CLEAR</button>
          </div>
        </div>
        {input}
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload a data file"
      className={`blz-panel border-dashed transition-colors duration-100 cursor-pointer ${
        isDragOver
          ? 'border-[var(--amber)] bg-[var(--amber-dim)]'
          : 'border-[var(--border-bright)] hover:border-[var(--grey)] hover:bg-[var(--bg-tertiary)]'
      } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
    >
      {input}
      <div className="px-4 py-4 flex items-center gap-4">
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-[var(--amber)] border-t-transparent rounded-full animate-spin" />
            <span className="font-mono text-[11px] text-[var(--grey-bright)]">PROCESSING…</span>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--amber)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-[11px] font-semibold text-[var(--white)]">DROP DATA FILE<HelpTip text="Drop or browse for a CSV, JSON, XLSX, or Parquet file. The first row is treated as the header. The first datetime column is auto-detected as the timestamp axis." /></span>
            </div>
            <span className="font-mono text-[10px] text-[var(--grey)]">CSV · JSON · XLSX · PARQUET — or click to browse</span>
            <kbd className="blz-kbd ml-auto">Ctrl+O</kbd>
          </>
        )}
      </div>
      {error && <div className="blz-error mx-2 mb-2">{error}</div>}
    </div>
  )
}

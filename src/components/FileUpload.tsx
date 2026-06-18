import { useState, useCallback, useRef } from 'react'
import { apiUpload, apiGet } from '../lib/api'
import { useApp } from '../lib/context'
import { useToast } from '../lib/toast'
import type { UploadResponse, EDAStats } from '../lib/types'
import { HelpTip } from './HelpTip'

export default function FileUpload() {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { setUploadData, setSessionId, setEDAStats, uploadData } = useApp()
  const toast = useToast()

  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await apiUpload<UploadResponse>('/upload', file)
      setUploadData(result)
      setSessionId(result.session_id)
      try {
        const eda = await apiGet<EDAStats>(`/eda/${result.session_id}`)
        setEDAStats(eda)
      } catch (e: any) {
        toast('warn', 'EDA partial', e?.message ?? 'EDA fetch failed')
      }
      toast('success', 'Loaded', `${result.rows.toLocaleString()} rows · ${result.columns} cols`)
    } catch (err: any) {
      const msg = err?.message ?? 'Upload failed'
      setError(msg)
      toast('error', 'Upload failed', msg)
    } finally {
      setIsLoading(false)
    }
  }, [setUploadData, setSessionId, setEDAStats, toast])

  useEffectBridge(handleFile)

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

  const clear = useCallback(() => {
    setUploadData(null)
    setSessionId(null)
    setEDAStats(null)
    toast('info', 'Session cleared')
  }, [setUploadData, setSessionId, setEDAStats, toast])

  if (uploadData) {
    return (
      <div className="blz-panel">
        <div className="blz-header">
          <div className="flex items-center gap-2">
            <span className="blz-tag blz-tag-green">LOADED</span>
            <span className="text-[var(--white)] normal-case tracking-normal font-semibold text-[10px]">{uploadData.filename}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[9px] text-[var(--grey)]">
              {uploadData.rows.toLocaleString()} rows · {uploadData.columns} cols
            </span>
            <button
              onClick={() => inputRef.current?.click()}
              className="font-mono text-[9px] text-[var(--cyan)] hover:text-[var(--cyan)] font-bold uppercase tracking-wider"
            >
              + ADD
            </button>
            <button
              onClick={clear}
              className="text-[9px] text-[var(--red)] hover:text-[var(--red)] font-bold uppercase tracking-wider"
            >
              CLR
            </button>
          </div>
        </div>
        <div className="px-2 py-1 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-[var(--border)]">
          {uploadData.numeric_columns.map(col => (
            <span key={col} className="font-mono text-[9px]">
              <span className="text-[var(--amber)]">{col}</span>
            </span>
          ))}
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".csv,.json,.xlsx,.xls,.parquet"
          onChange={onFileSelect}
        />
      </div>
    )
  }

  return (
    <div
      className={`blz-panel border-dashed transition-all duration-100 cursor-pointer ${
        isDragOver
          ? 'border-[var(--amber)] bg-[var(--amber-dim)]'
          : 'border-[var(--border)] hover:border-[var(--border-bright)]'
      } ${isLoading ? 'opacity-40 pointer-events-none' : ''}`}
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
      <div className="px-4 py-4 flex items-center gap-4">
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-[var(--amber)] border-t-transparent animate-spin" />
            <span className="font-mono text-[10px] text-[var(--grey)]">PROCESSING...</span>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--amber)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-[10px] font-semibold text-[var(--white)]">DROP DATA FILE<HelpTip text="Drop or browse for a CSV, JSON, XLSX, or Parquet file. The first row is treated as the header. The first datetime column is auto-detected as the timestamp axis." /></span>
            </div>
            <span className="text-[8px] text-[var(--grey-dim)]">|</span>
            <span className="font-mono text-[9px] text-[var(--grey)]">CSV · JSON · XLSX · PARQUET</span>
            <span className="text-[8px] text-[var(--grey-dim)]">|</span>
            <span className="font-mono text-[9px] text-[var(--grey)]">OR CLICK TO BROWSE</span>
            <span className="text-[8px] text-[var(--grey-dim)] ml-auto">Ctrl+O</span>
          </>
        )}
      </div>
      {error && (
        <div className="mx-2 mb-2 px-2 py-1 bg-[var(--red-dim)] border border-[rgba(255,23,68,0.3)] font-mono text-[9px] text-[var(--red)]">{error}</div>
      )}
    </div>
  )
}

import { useEffect } from 'react'
function useEffectBridge(handle: (f: File) => void) {
  useEffect(() => {
    const onShortcut = (e: Event) => {
      const ce = e as CustomEvent<File>
      if (ce.detail) handle(ce.detail)
    }
    window.addEventListener('tabula:file-shortcut', onShortcut)
    return () => window.removeEventListener('tabula:file-shortcut', onShortcut)
  }, [handle])
}

import { createContext, useContext, useState, useCallback, useEffect, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { UploadResponse, EDAStats, ForecastResponse, ModelInfo, ModelListResponse, HealthResponse } from './types'
import { apiGet, apiDelete } from './api'

interface AppState {
  sessionId: string | null
  uploadData: UploadResponse | null
  edaStats: EDAStats | null
  forecastResult: ForecastResponse | null
  activeModel: string
  models: ModelInfo[]
  health: HealthResponse | null
}

interface AppContextType extends AppState {
  /** Make `data` the current session: fetches EDA, clears the old forecast. */
  openSession: (data: UploadResponse) => Promise<void>
  closeSession: () => void
  setUploadData: Dispatch<SetStateAction<UploadResponse | null>>
  setEDAStats: (stats: EDAStats | null) => void
  setForecastResult: (result: ForecastResponse | null) => void
  setActiveModel: (model: string) => void
  refreshModels: () => Promise<void>
  refreshHealth: () => Promise<void>
}

const AppContext = createContext<AppContextType | null>(null)

const HEALTH_POLL_MS = 10_000

export function AppProvider({ children }: { children: ReactNode }) {
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null)
  const [edaStats, setEDAStats] = useState<EDAStats | null>(null)
  const [forecastResult, setForecastResult] = useState<ForecastResponse | null>(null)
  const [activeModel, setActiveModel] = useState<string>('amazon/chronos-t5-small')
  const [models, setModels] = useState<ModelInfo[]>([])
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const sessionId = uploadData?.session_id ?? null

  // Free the previous backend session (fire-and-forget) whenever it changes.
  useEffect(() => {
    if (!sessionId) return
    return () => { apiDelete(`/sessions/${sessionId}`).catch(() => {}) }
  }, [sessionId])

  const openSession = useCallback(async (data: UploadResponse) => {
    setUploadData(data)
    setForecastResult(null)
    setEDAStats(null)
    setEDAStats(await apiGet<EDAStats>(`/eda/${data.session_id}`))
  }, [])

  const closeSession = useCallback(() => {
    setUploadData(null)
    setEDAStats(null)
    setForecastResult(null)
  }, [])

  const refreshModels = useCallback(async () => {
    try {
      const r = await apiGet<ModelListResponse>('/models')
      setModels(r.models || [])
      if (r.active) setActiveModel(r.active)
    } catch {}
  }, [])

  const refreshHealth = useCallback(async () => {
    let next: HealthResponse
    try {
      next = await apiGet<HealthResponse>('/health')
    } catch {
      next = { status: 'down', version: '?' }
    }
    // keep the old object when nothing changed so consumers don't re-render
    setHealth((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [])

  useEffect(() => {
    refreshModels()
    refreshHealth()
    const id = setInterval(refreshHealth, HEALTH_POLL_MS)
    return () => clearInterval(id)
  }, [refreshModels, refreshHealth])

  return (
    <AppContext.Provider
      value={{
        sessionId,
        uploadData, setUploadData,
        edaStats, setEDAStats,
        forecastResult, setForecastResult,
        activeModel, setActiveModel,
        models,
        health,
        openSession,
        closeSession,
        refreshModels,
        refreshHealth,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { UploadResponse, EDAStats, ForecastResponse, ModelInfo, ModelListResponse, HealthResponse } from './types'
import { apiGet } from './api'

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
  setSessionId: (id: string | null) => void
  setUploadData: (data: UploadResponse | null) => void
  setEDAStats: (stats: EDAStats | null) => void
  setForecastResult: (result: ForecastResponse | null) => void
  setActiveModel: (model: string) => void
  setModels: (models: ModelInfo[]) => void
  refreshModels: () => Promise<void>
  refreshHealth: () => Promise<void>
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null)
  const [edaStats, setEDAStats] = useState<EDAStats | null>(null)
  const [forecastResult, setForecastResult] = useState<ForecastResponse | null>(null)
  const [activeModel, setActiveModel] = useState<string>('amazon/chronos-t5-small')
  const [models, setModels] = useState<ModelInfo[]>([])
  const [health, setHealth] = useState<HealthResponse | null>(null)

  const refreshModels = useCallback(async () => {
    try {
      const r = await apiGet<ModelListResponse>('/models')
      setModels(r.models || [])
      if (r.active) setActiveModel(r.active)
    } catch {}
  }, [])

  const refreshHealth = useCallback(async () => {
    try {
      const r = await apiGet<HealthResponse>('/health')
      setHealth(r)
    } catch {
      setHealth({ status: 'down', version: '?' })
    }
  }, [])

  useEffect(() => {
    refreshModels()
    refreshHealth()
    const id = setInterval(refreshHealth, 10000)
    return () => clearInterval(id)
  }, [refreshModels, refreshHealth])

  return (
    <AppContext.Provider
      value={{
        sessionId, setSessionId,
        uploadData, setUploadData,
        edaStats, setEDAStats,
        forecastResult, setForecastResult,
        activeModel, setActiveModel,
        models, setModels,
        health,
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

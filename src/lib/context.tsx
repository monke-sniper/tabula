import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { UploadResponse, EDAStats, ForecastResponse, ModelInfo } from './types'

interface AppState {
  sessionId: string | null
  uploadData: UploadResponse | null
  edaStats: EDAStats | null
  forecastResult: ForecastResponse | null
  activeModel: string
  models: ModelInfo[]
}

interface AppContextType extends AppState {
  setSessionId: (id: string | null) => void
  setUploadData: (data: UploadResponse | null) => void
  setEDAStats: (stats: EDAStats | null) => void
  setForecastResult: (result: ForecastResponse | null) => void
  setActiveModel: (model: string) => void
  setModels: (models: ModelInfo[]) => void
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null)
  const [edaStats, setEDAStats] = useState<EDAStats | null>(null)
  const [forecastResult, setForecastResult] = useState<ForecastResponse | null>(null)
  const [activeModel, setActiveModel] = useState<string>('amazon/chronos-t5-small')
  const [models, setModels] = useState<ModelInfo[]>([])

  return (
    <AppContext.Provider
      value={{
        sessionId, setSessionId,
        uploadData, setUploadData,
        edaStats, setEDAStats,
        forecastResult, setForecastResult,
        activeModel, setActiveModel,
        models, setModels,
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

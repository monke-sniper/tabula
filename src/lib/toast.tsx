import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ToastKind = 'info' | 'success' | 'error' | 'warn'

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  body?: string
  ttl: number
  createdAt: number
}

interface ToastContextValue {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id' | 'createdAt' | 'ttl'> & { ttl?: number }) => string
  dismiss: (id: string) => void
  clear: () => void
}

const Ctx = createContext<ToastContextValue | null>(null)

let counter = 0
const nextId = () => `t_${Date.now().toString(36)}_${(counter++).toString(36)}`

export function ToastProvider({ children, max = 4 }: { children: ReactNode; max?: number }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts((cur) => cur.filter((t) => t.id !== id))
    const tm = timers.current.get(id)
    if (tm) {
      clearTimeout(tm)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback<ToastContextValue['push']>((t) => {
    const id = nextId()
    const ttl = t.ttl ?? 4000
    const toast: Toast = {
      id,
      kind: t.kind,
      title: t.title,
      body: t.body,
      ttl,
      createdAt: Date.now(),
    }
    setToasts((cur) => {
      const next = [...cur, toast]
      return next.length > max ? next.slice(next.length - max) : next
    })
    const tm = setTimeout(() => dismiss(id), ttl)
    timers.current.set(id, tm)
    return id
  }, [dismiss, max])

  const clear = useCallback(() => {
    timers.current.forEach((tm) => clearTimeout(tm))
    timers.current.clear()
    setToasts([])
  }, [])

  useEffect(() => () => {
    timers.current.forEach((tm) => clearTimeout(tm))
    timers.current.clear()
  }, [])

  const value = useMemo<ToastContextValue>(() => ({ toasts, push, dismiss, clear }), [toasts, push, dismiss, clear])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useToasts() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToasts must be used within ToastProvider')
  return ctx
}

export function useToast() {
  const { push } = useToasts()
  return useCallback(
    (kind: ToastKind, title: string, body?: string, ttl?: number) =>
      push({ kind, title, body, ttl }),
    [push],
  )
}

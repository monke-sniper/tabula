export class ApiError extends Error {
  status: number
  detail: string
  code: string
  constructor(status: number, detail: string, code = 'API_ERROR') {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.code = code
  }
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || 'http://127.0.0.1:8420'
export const API_BASE = BASE

/** Human-readable message for anything thrown by fetch / the API helpers. */
export function errorMessage(err: unknown, fallback = 'Request failed'): string {
  if (err instanceof ApiError) return err.detail
  if (err instanceof Error) return err.message
  return fallback
}

async function toApiError(res: Response): Promise<ApiError> {
  let detail = res.statusText
  let code = 'API_ERROR'
  try {
    const body = await res.json()
    // FastAPI validation errors (422) arrive as a list of { loc, msg }
    if (Array.isArray(body?.detail)) detail = body.detail.map((d: { msg?: string }) => d.msg ?? String(d)).join('; ')
    else if (body?.detail) detail = String(body.detail)
    if (body?.code) code = String(body.code)
  } catch {}
  return new ApiError(res.status, detail, code)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) throw await toApiError(res)
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return (await res.json()) as T
  return (await res.text()) as unknown as T
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' })
}

export function apiPost<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined })
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}

export async function apiUpload<T>(path: string, file: File, signal?: AbortSignal): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: form, signal })
  if (!res.ok) throw await toApiError(res)
  return (await res.json()) as T
}

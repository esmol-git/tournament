import { API_BASE_URL } from '../config/appConfig'
import * as sessionStore from '../auth/sessionStore'
import { ApiError } from './errors'

type RequestOptions = RequestInit & {
  /** По умолчанию true: подставляет Bearer из SecureStore. */
  auth?: boolean
  /** JSON-тело; если передан, выставит Content-Type и сериализует. */
  json?: unknown
}

function parseBackendMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Ошибка запроса'
  const o = data as Record<string, unknown>
  const msg = o.message
  if (typeof msg === 'string') return msg
  if (msg && typeof msg === 'object' && 'message' in msg && typeof (msg as { message: unknown }).message === 'string') {
    return (msg as { message: string }).message
  }
  if (typeof o.error === 'string') return o.error
  return 'Ошибка запроса'
}

function parseCode(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const c = (data as Record<string, unknown>).code
  return typeof c === 'string' ? c : undefined
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, json, ...init } = options
  const headers = new Headers(init.headers)

  if (json !== undefined) headers.set('Content-Type', 'application/json')

  if (auth) {
    const token = await sessionStore.getAccessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const body = json !== undefined ? JSON.stringify(json) : init.body
  const url = `${API_BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, { ...init, headers, body })

  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    const message = typeof data === 'object' && data !== null ? parseBackendMessage(data) : text || res.statusText
    throw new ApiError(message || 'Ошибка запроса', res.status, parseCode(data))
  }

  return data as T
}

import { useTenantStore } from '~/stores/tenant'

export type ApiClientErrorOperation =
  | 'authFetch'
  | 'authFetchBlob'
  | 'fetchMe'
  | 'authRefresh'
  /** Ошибки публичных запросов к API (без Authorization), см. `api-fetch-observability.client.ts`. */
  | 'publicFetch'

/** Структура одной записи (консоль + опционально `window.__TP_REPORT_API_ERROR__`). */
export type ApiClientErrorPayload = {
  op: ApiClientErrorOperation
  method: string
  path: string
  status: number | null
  code: string | null
  tenant: string | null
}

/**
 * Есть ли заголовок Authorization (запросы `authFetch` не дублируем глобальным перехватчиком).
 */
export function fetchOptionsHasAuthorization(options: unknown): boolean {
  const o = options as { headers?: Headers | Record<string, string> }
  const h = o?.headers
  if (!h) return false
  if (typeof Headers !== 'undefined' && h instanceof Headers) {
    return h.has('Authorization')
  }
  if (typeof h === 'object' && h !== null) {
    return Object.keys(h as Record<string, unknown>).some((k) => k.toLowerCase() === 'authorization')
  }
  return false
}

/**
 * Интеграция с Sentry / своим бэкендом: выставить в рантайме
 * `window.__TP_REPORT_API_ERROR__ = (payload) => { ... }` — без PII, только поля {@link ApiClientErrorPayload}.
 */
function reportApiClientPayload(payload: ApiClientErrorPayload): void {
  if (!import.meta.client) return
  try {
    const w = window as unknown as { __TP_REPORT_API_ERROR__?: (p: ApiClientErrorPayload) => void }
    w.__TP_REPORT_API_ERROR__?.(payload)
  } catch {
    /* ignore */
  }
}

/**
 * HTTP-статус и стабильный `code` из тела ответа API (без текста сообщений — там может быть ввод пользователя).
 */
export function parseApiFailureMeta(error: unknown): {
  httpStatus?: number
  apiCode?: string
} {
  const err = error as {
    statusCode?: number
    data?: { code?: unknown }
    response?: { status?: number; _data?: { code?: unknown } }
  }
  const httpStatus = err.statusCode ?? err.response?.status
  const raw = err.data?.code ?? err.response?._data?.code
  const apiCode = typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
  return { httpStatus, apiCode }
}

/**
 * Путь запроса без query (в query иногда бывают чувствительные параметры).
 */
export function apiPathForLog(fullUrl: string, apiBase: string): string {
  try {
    const base = apiBase.replace(/\/$/, '')
    const u = /^https?:\/\//i.test(fullUrl) ? new URL(fullUrl) : new URL(fullUrl.replace(/^\//, ''), `${base}/`)
    return u.pathname || '/'
  } catch {
    return '/'
  }
}

function readTenantSlugSafe(): string | null {
  if (!import.meta.client) return null
  try {
    return useTenantStore().slug ?? null
  } catch {
    return null
  }
}

const LOG_PREFIX = '[api-client-error]'

/**
 * Единый клиентский лог сбойных запросов к API: метод, путь, статус, код ошибки, slug тенанта (контекст сайта).
 * Не пишет токены, тела ответов и текстовые message (риск PII / утечек).
 */
export function logApiClientFailure(params: {
  operation: ApiClientErrorOperation
  method: string
  url: string
  apiBase: string
  error: unknown
  /** Переопределить slug (например, если стор ещё недоступен). */
  tenantSlug?: string | null
}): void {
  if (!import.meta.client) return

  const { httpStatus, apiCode } = parseApiFailureMeta(params.error)
  const path = apiPathForLog(params.url, params.apiBase)
  const tenant = params.tenantSlug !== undefined ? params.tenantSlug : readTenantSlugSafe()

  const payload: ApiClientErrorPayload = {
    op: params.operation,
    method: params.method.toUpperCase(),
    path,
    status: httpStatus ?? null,
    code: apiCode ?? null,
    tenant,
  }

  console.warn(LOG_PREFIX, JSON.stringify(payload))
  reportApiClientPayload(payload)
}

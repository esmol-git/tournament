function codeFromUnknownBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const c = (body as Record<string, unknown>).code
  return typeof c === 'string' && c.trim() ? c.trim() : undefined
}

function messageFromUnknownBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  const msg = o.message
  if (typeof msg === 'string' && msg.trim()) return msg.trim()
  if (Array.isArray(msg) && msg.length && typeof msg[0] === 'string') return msg.join(', ')
  return null
}

/**
 * Текст ошибки из ответа API ($fetch / ofetch) или общее сообщение.
 */
export function getApiErrorMessage(error: unknown, fallback = 'Произошла ошибка'): string {
  if (error == null) return fallback

  if (typeof error === 'object') {
    const e = error as Record<string, unknown>
    const fromData = messageFromUnknownBody(e.data)
    if (fromData) return fromData
    const response = e.response as Record<string, unknown> | undefined
    const fromResponseData = messageFromUnknownBody(response?._data)
    if (fromResponseData) return fromResponseData
    if (typeof e.message === 'string' && e.message.trim()) return e.message
    if (typeof e.statusMessage === 'string' && e.statusMessage.trim()) return e.statusMessage
  }

  if (error instanceof Error && error.message.trim()) return error.message

  return fallback
}

/**
 * Список текстов ошибок из ответа API ($fetch / ofetch).
 * Нужен для показа нескольких валидационных ошибок по отдельности.
 */
export function getApiErrorMessages(error: unknown, fallback = 'Произошла ошибка'): string[] {
  if (error == null) return [fallback]

  if (typeof error === 'object') {
    const e = error as Record<string, unknown>
    const tryBody = (body: unknown): string[] | null => {
      if (!body || typeof body !== 'object') return null
      const msg = (body as Record<string, unknown>).message
      if (typeof msg === 'string' && msg.trim()) return [msg.trim()]
      if (Array.isArray(msg)) {
        const list = msg
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter(Boolean)
        if (list.length) return list
      }
      return null
    }
    const fromData = tryBody(e.data)
    if (fromData) return fromData
    const response = e.response as Record<string, unknown> | undefined
    const fromRd = tryBody(response?._data)
    if (fromRd) return fromRd
    if (typeof e.message === 'string' && e.message.trim()) return [e.message]
    if (typeof e.statusMessage === 'string' && e.statusMessage.trim()) return [e.statusMessage]
  }

  if (error instanceof Error && error.message.trim()) return [error.message]
  return [fallback]
}

/** HTTP-статус из ошибки $fetch / ofetch (если есть). */
export function getApiErrorHttpStatus(error: unknown): number | undefined {
  if (error == null || typeof error !== 'object') return undefined
  const e = error as Record<string, unknown>
  const direct = e.statusCode ?? e.status
  if (typeof direct === 'number') return direct
  const response = e.response as Record<string, unknown> | undefined
  const fromResp = response?.status
  return typeof fromResp === 'number' ? fromResp : undefined
}

/** Стабильный `code` из тела ответа API ($fetch / ofetch). */
export function getApiErrorCode(error: unknown): string | undefined {
  if (error == null || typeof error !== 'object') return undefined
  const e = error as Record<string, unknown>
  const fromData = codeFromUnknownBody(e.data)
  if (fromData) return fromData
  const response = e.response as Record<string, unknown> | undefined
  return codeFromUnknownBody(response?._data)
}

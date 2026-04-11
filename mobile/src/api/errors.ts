export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function messageFromHttpStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Некорректный запрос'
    case 401:
      return 'Требуется вход'
    case 403:
      return 'Недостаточно прав для этого действия'
    case 404:
      return 'Данные не найдены'
    case 409:
      return 'Конфликт данных (возможно, данные уже изменились)'
    case 422:
      return 'Данные не прошли проверку'
    case 429:
      return 'Слишком много запросов. Подождите немного.'
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Сервер временно недоступен. Попробуйте позже.'
    default:
      return `Ошибка запроса (${status})`
  }
}

function looksLikeNetworkFailure(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('network request failed') ||
    m.includes('failed to fetch') ||
    m.includes('load failed') ||
    m.includes('internet connection') ||
    m.includes('the internet connection appears') ||
    m.includes('network error')
  )
}

/**
 * Текст для пользователя: сеть, HTTP, тело ответа API.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const msg = err.message?.trim()
    if (msg) return msg
    return messageFromHttpStatus(err.status)
  }
  if (err instanceof TypeError && looksLikeNetworkFailure(String(err.message))) {
    return 'Нет соединения с сервером. Проверьте интернет и настройки API.'
  }
  if (err instanceof Error) {
    const msg = err.message?.trim()
    if (msg && looksLikeNetworkFailure(msg)) {
      return 'Нет соединения с сервером. Проверьте интернет и настройки API.'
    }
    if (msg) return msg
  }
  return 'Произошла неизвестная ошибка. Попробуйте ещё раз.'
}

/** Подпись под ошибкой списка, если сработал {@link isTransientApiError}. */
export const TRANSIENT_ERROR_DETAIL =
  'Похоже на временный сбой сети или сервера — обновите экран чуть позже.'

/** Ошибки, при которых имеет смысл автоматический повтор запроса. */
export function isTransientApiError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status >= 500 || err.status === 429
  }
  if (err instanceof TypeError && looksLikeNetworkFailure(String(err.message))) {
    return true
  }
  if (err instanceof Error) {
    const msg = err.message?.trim()
    if (msg && looksLikeNetworkFailure(msg)) return true
  }
  return false
}

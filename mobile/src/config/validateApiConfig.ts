import { API_BASE_URL } from './appConfig'

/**
 * Возвращает текст проблемы или null, если базовый URL API выглядит допустимым.
 */
export function getApiConfigIssue(): string | null {
  const raw = API_BASE_URL?.trim()
  if (!raw) {
    return 'Пустой адрес API. Задайте EXPO_PUBLIC_API_BASE_URL в файле .env (см. .env.example).'
  }
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return 'Адрес API должен начинаться с http:// или https://.'
    }
    if (!u.hostname) {
      return 'В адресе API не указан хост (например api.example.com).'
    }
    return null
  } catch {
    return 'Некорректный адрес API. Проверьте EXPO_PUBLIC_API_BASE_URL в .env.'
  }
}

/**
 * Публичные переменные окружения Expo: префикс EXPO_PUBLIC_ (см. .env.example).
 * Пустая строка и пробелы считаем «не задано» — тогда локальный бэкенд по умолчанию.
 */
const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '').trim()
export const API_BASE_URL =
  fromEnv && fromEnv.length > 0 ? fromEnv : 'http://127.0.0.1:4000'

/**
 * Базовый HTTPS-оригин для universal links (`https://example.com` без слэша).
 * Пустая строка в .env — не добавлять https в prefixes линкинга (только custom scheme).
 * По умолчанию — основной сайт организации.
 */
export function getUniversalLinkOrigin(): string | null {
  const raw = process.env.EXPO_PUBLIC_UNIVERSAL_LINK_ORIGIN
  if (raw === '') return null
  const base = (raw ?? 'https://tournament-platform.ru').replace(/\/$/, '').trim()
  if (!base) return null
  try {
    const u = new URL(base)
    if (u.protocol !== 'https:') return null
    return u.origin
  } catch {
    return null
  }
}

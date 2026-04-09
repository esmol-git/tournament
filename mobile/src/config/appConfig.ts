/**
 * Публичные переменные окружения Expo: префикс EXPO_PUBLIC_ (см. .env.example).
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:4000'

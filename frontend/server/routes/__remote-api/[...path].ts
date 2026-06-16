import { createError, getRequestURL, proxyRequest } from 'h3'

/**
 * Локальная разработка: браузер ходит на тот же origin (`/__remote-api/...`),
 * Nitro проксирует на удалённый API (см. NUXT_REMOTE_API_TARGET).
 */
export default defineEventHandler((event) => {
  const remoteBase = String(useRuntimeConfig().remoteApiTarget ?? '').replace(/\/$/, '')
  if (!remoteBase) {
    throw createError({ statusCode: 404, statusMessage: 'Remote API proxy is disabled' })
  }

  const url = getRequestURL(event)
  const suffix = url.pathname.replace(/^\/__remote-api/, '') || '/'
  const target = `${remoteBase}${suffix}${url.search}`

  return proxyRequest(event, target)
})

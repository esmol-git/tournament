import {
  apiPathForLog,
  fetchOptionsHasAuthorization,
  logApiClientFailure,
} from '~/utils/apiClientErrorLog'

function requestUrlString(request: unknown): string {
  if (typeof request === 'string') return request
  if (request instanceof URL) return request.href
  if (typeof Request !== 'undefined' && request instanceof Request) return request.url
  return String(request)
}

/**
 * Расширяет глобальный `$fetch` через `previous.create({ onResponseError })`, не теряя дефолты Nuxt/ofetch.
 * Логирует только сбои публичных запросов к `apiBase` (без Authorization).
 * Пропускает `/auth/refresh` — его логирует `stores/auth.ts`.
 */
export default defineNuxtPlugin({
  name: 'api-fetch-observability',
  enforce: 'post',
  setup(nuxtApp) {
    const config = useRuntimeConfig()
    const apiBase = String(config.public.apiBase ?? '').replace(/\/$/, '')
    if (!apiBase) return

    const previous = globalThis.$fetch
    const wrapped = previous.create({
      onResponseError(ctx) {
        const url = requestUrlString(ctx.request)
        if (!url.startsWith(apiBase)) return
        if (fetchOptionsHasAuthorization(ctx.options)) return
        if (apiPathForLog(url, apiBase) === '/auth/refresh') return

        const status = ctx.response?.status
        const _data = (ctx.response as { _data?: unknown } | undefined)?._data

        logApiClientFailure({
          operation: 'publicFetch',
          method: String(ctx.options.method ?? 'GET'),
          url,
          apiBase,
          error: {
            statusCode: status,
            data: _data,
            response: { status, _data },
          },
        })
      },
    })

    globalThis.$fetch = wrapped
    nuxtApp.$fetch = wrapped
  },
})

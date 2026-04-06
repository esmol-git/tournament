import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useApiUrl } from '~/composables/useApiUrl'
import { serializeAuthUserForCookie } from '~/utils/authUserCookie'
import { logApiClientFailure } from '~/utils/apiClientErrorLog'

/**
 * Сессия и все авторизованные запросы к API — единая точка через Pinia.
 * Refresh-токен: HttpOnly-кука `tp_refresh_token` (ставит бэкенд), в JS не читается.
 * Access-токен и полный `auth_user` — в localStorage на текущем origin.
 * Между поддоменами — компактный `auth_user` в cookie + refresh по HttpOnly при `credentials: 'include'`.
 */
export const useAuthStore = defineStore('auth', () => {
  const { apiUrl, apiBase } = useApiUrl()

  const token = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const user = ref<unknown | null>(null)
  /** Один раз за жизнь страницы пробуем восстановить сессию по HttpOnly refresh (новый поддомен). */
  const sessionRestoreAttempted = ref(false)

  const loggedIn = computed(() => !!token.value)

  function getCookie(name: string): string | null {
    if (!process.client) return null
    const v = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
    return v ? decodeURIComponent(v[1]!) : null
  }

  function cookieDomainForCurrentHost(hostname?: string): string | undefined {
    if (!process.client) return undefined
    const h = (hostname ?? window.location.hostname).toLowerCase()
    const parts = h.split('.').filter(Boolean)
    if (parts.length < 2) return undefined
    return `.${parts.slice(-2).join('.')}`
  }

  function setAuthCookie(name: string, value: string) {
    if (!process.client) return
    const domain = cookieDomainForCurrentHost()
    const secure = window.location.protocol === 'https:'
    const domainAttr = domain ? `; Domain=${domain}` : ''
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/${domainAttr}; SameSite=Lax${secure ? '; Secure' : ''}`
  }

  function clearAuthCookie(name: string) {
    if (!process.client) return
    const domain = cookieDomainForCurrentHost()
    const domainAttr = domain ? `; Domain=${domain}` : ''
    document.cookie = `${name}=; Path=/${domainAttr}; SameSite=Lax; Max-Age=0`
  }

  /** Убрать устаревшие читаемые куки с токенами (миграция на HttpOnly refresh). */
  function clearLegacyReadableTokenCookies() {
    clearAuthCookie('auth_token')
    clearAuthCookie('auth_refresh_token')
  }

  /**
   * @param refresh — если `null`, refresh только в HttpOnly-куке; иначе legacy из localStorage.
   */
  function setSession(accessToken: string, refresh: string | null, u: unknown) {
    token.value = accessToken
    refreshToken.value = refresh
    user.value = u
    if (process.client) {
      localStorage.setItem('auth_token', accessToken)
      if (refresh) localStorage.setItem('auth_refresh_token', refresh)
      else localStorage.removeItem('auth_refresh_token')
      localStorage.setItem('auth_user', JSON.stringify(u))

      clearLegacyReadableTokenCookies()
      const slim = serializeAuthUserForCookie(u)
      if (slim) setAuthCookie('auth_user', slim)
    }
  }

  async function clearSessionWithServerLogout() {
    const t = token.value
    if (process.client && t) {
      try {
        await $fetch(apiUrl('/auth/logout'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}` },
          credentials: 'include',
        })
      } catch {
        // игнор: сессия на клиенте всё равно сбрасывается
      }
    }
    clearSession()
  }

  function clearSession() {
    token.value = null
    refreshToken.value = null
    user.value = null
    sessionRestoreAttempted.value = false
    if (process.client) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_refresh_token')
      localStorage.removeItem('auth_user')

      clearLegacyReadableTokenCookies()
      clearAuthCookie('auth_user')
    }
  }

  function syncWithStorage() {
    if (!process.client) return

    const storedToken = localStorage.getItem('auth_token')
    const storedRefresh = localStorage.getItem('auth_refresh_token')
    const fromLs = localStorage.getItem('auth_user')
    const fromCookie = getCookie('auth_user')

    token.value = storedToken || null
    refreshToken.value = storedRefresh || null
    if (fromLs) user.value = JSON.parse(fromLs)
    else if (fromCookie) user.value = JSON.parse(fromCookie)
    else user.value = null
  }

  /**
   * Когда access/refresh в LS пусты (другой поддомен), пробуем POST /auth/refresh с HttpOnly-кукой.
   */
  async function restoreSessionViaRefreshCookieIfNeeded() {
    if (!process.client) return
    if (token.value) return
    if (refreshToken.value) return
    if (sessionRestoreAttempted.value) return
    sessionRestoreAttempted.value = true
    try {
      const res = await $fetch<{
        accessToken: string
        refreshToken: string
        user: unknown
      }>(apiUrl('/auth/refresh'), {
        method: 'POST',
        body: {},
        credentials: 'include',
      })
      setSession(res.accessToken, null, res.user)
    } catch {
      // нет валидной куки или сессия недоступна
    }
  }

  async function refreshAccessToken() {
    const bodyRefresh = refreshToken.value?.trim()
    try {
      const res = await $fetch<{
        accessToken: string
        refreshToken: string
        user: unknown
      }>(apiUrl('/auth/refresh'), {
        method: 'POST',
        body: bodyRefresh ? { refreshToken: bodyRefresh } : {},
        credentials: 'include',
      })
      setSession(res.accessToken, null, res.user)
      return res
    } catch (e: unknown) {
      try {
        await handleAuthFetchClientForbidden(e)
      } catch {
        // 403 с редиректом — сессия уже очищена внутри
        return null
      }
      logApiClientFailure({
        operation: 'authRefresh',
        method: 'POST',
        url: apiUrl('/auth/refresh'),
        apiBase: apiBase.value,
        error: e,
      })
      if (token.value) await clearSessionWithServerLogout()
      else clearSession()
      return null
    }
  }

  function subscriptionOrTenantBlockFromError(e: unknown): string | null {
    const err = e as {
      statusCode?: number
      data?: { code?: string }
      response?: { status?: number; _data?: { code?: string } }
    }
    const status = err.statusCode ?? err.response?.status
    const code =
      err.data?.code ?? (err.response as { _data?: { code?: string } } | undefined)?._data?.code
    if (status !== 403) return null
    if (code === 'SUBSCRIPTION_EXPIRED' || code === 'TENANT_BLOCKED') return code
    return null
  }

  function adminStaffRoleBlockFromError(e: unknown): boolean {
    const err = e as {
      statusCode?: number
      data?: { code?: string }
      response?: { status?: number; _data?: { code?: string } }
    }
    const status = err.statusCode ?? err.response?.status
    const code = err.data?.code ?? err.response?._data?.code
    return status === 403 && code === 'ADMIN_STAFF_ROLE_REQUIRED'
  }

  function insufficientRoleBlockFromError(e: unknown): boolean {
    const err = e as {
      statusCode?: number
      data?: { code?: string }
      response?: { status?: number; _data?: { code?: string } }
    }
    const status = err.statusCode ?? err.response?.status
    const code = err.data?.code ?? err.response?._data?.code
    return status === 403 && code === 'INSUFFICIENT_ROLE'
  }

  async function handleAuthFetchClientForbidden(e: unknown): Promise<void> {
    const block = subscriptionOrTenantBlockFromError(e)
    if (block && process.client) {
      await clearSessionWithServerLogout()
      await navigateTo({
        path: '/admin/subscription-expired',
        query: block === 'TENANT_BLOCKED' ? { reason: 'blocked' } : {},
      })
      throw e
    }
    if (adminStaffRoleBlockFromError(e) && process.client) {
      await navigateTo('/admin/access-denied')
      throw e
    }
    if (insufficientRoleBlockFromError(e) && process.client) {
      await navigateTo({
        path: '/admin/feature-unavailable',
        query: { reason: 'tenant_admin_only' },
      })
      throw e
    }
  }

  async function authFetch<T = unknown>(
    url: string,
    options: Record<string, unknown> = {},
    retried = false,
  ): Promise<T> {
    if (!token.value) {
      throw new Error('Not authenticated')
    }
    const access = token.value
    const headers = {
      ...(options.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${access}`,
    }
    const method = String(options.method ?? 'GET')
    try {
      return await $fetch<T>(url, { ...options, headers })
    } catch (e: unknown) {
      const err = e as { response?: { status?: number }; statusCode?: number }
      const status = err?.response?.status ?? err?.statusCode
      if (status === 401 && !retried) {
        const refreshed = await refreshAccessToken()
        if (!refreshed?.accessToken) {
          logApiClientFailure({
            operation: 'authFetch',
            method,
            url,
            apiBase: apiBase.value,
            error: e,
          })
          throw e
        }
        return await authFetch<T>(url, options, true)
      }
      logApiClientFailure({
        operation: 'authFetch',
        method,
        url,
        apiBase: apiBase.value,
        error: e,
      })
      await handleAuthFetchClientForbidden(e)
      throw e
    }
  }

  async function authFetchBlob(
    url: string,
    options: Record<string, unknown> = {},
    retried = false,
  ): Promise<Blob> {
    if (!token.value) {
      throw new Error('Not authenticated')
    }
    const access = token.value
    const headers = {
      ...(options.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${access}`,
    }
    const method = String(options.method ?? 'GET')
    try {
      return await $fetch<Blob>(url, {
        ...options,
        headers,
        responseType: 'blob',
      })
    } catch (e: unknown) {
      const err = e as { response?: { status?: number }; statusCode?: number }
      const status = err?.response?.status ?? err?.statusCode
      if (status === 401 && !retried) {
        const refreshed = await refreshAccessToken()
        if (!refreshed?.accessToken) {
          logApiClientFailure({
            operation: 'authFetchBlob',
            method,
            url,
            apiBase: apiBase.value,
            error: e,
          })
          throw e
        }
        return await authFetchBlob(url, options, true)
      }
      logApiClientFailure({
        operation: 'authFetchBlob',
        method,
        url,
        apiBase: apiBase.value,
        error: e,
      })
      await handleAuthFetchClientForbidden(e)
      throw e
    }
  }

  async function fetchMe() {
    if (!token.value) return null
    try {
      const me = await $fetch(apiUrl('/auth/me'), {
        headers: { Authorization: `Bearer ${token.value}` },
      })
      user.value = me
      if (process.client) {
        const serialized = JSON.stringify(me)
        localStorage.setItem('auth_user', serialized)
        const slim = serializeAuthUserForCookie(me)
        if (slim) setAuthCookie('auth_user', slim)
      }
      return me
    } catch (e: unknown) {
      const err = e as { response?: { status?: number }; statusCode?: number }
      const status = err?.response?.status ?? err?.statusCode
      if (status === 401) {
        const refreshed = await refreshAccessToken()
        return (refreshed?.user as unknown) ?? null
      }
      logApiClientFailure({
        operation: 'fetchMe',
        method: 'GET',
        url: apiUrl('/auth/me'),
        apiBase: apiBase.value,
        error: e,
      })
      throw e
    }
  }

  return {
    token,
    refreshToken,
    user,
    loggedIn,
    setSession,
    clearSession,
    clearSessionWithServerLogout,
    syncWithStorage,
    restoreSessionViaRefreshCookieIfNeeded,
    fetchMe,
    authFetch,
    authFetchBlob,
  }
})

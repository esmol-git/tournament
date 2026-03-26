import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useApiUrl } from '~/composables/useApiUrl'

/**
 * Сессия и все авторизованные запросы к API — единая точка через Pinia.
 * В компонентах удобнее по-прежнему вызывать `useAuth()` (обёртка над стором).
 */
export const useAuthStore = defineStore('auth', () => {
  const { apiUrl } = useApiUrl()

  const token = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const user = ref<unknown | null>(null)

  const loggedIn = computed(() => !!token.value)

  function getCookie(name: string): string | null {
    if (!process.client) return null
    const v = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
    return v ? decodeURIComponent(v[1]!) : null
  }

  function cookieDomainForCurrentHost(hostname?: string): string | undefined {
    if (!process.client) return undefined
    const h = (hostname ?? window.location.hostname).toLowerCase()
    // cookie Domain подходит для любых поддоменов того же registrable domain.
    // Например: impuls.lvh.me -> .lvh.me; tenant.localhost -> .localhost
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

  function setSession(accessToken: string, refresh: string, u: unknown) {
    token.value = accessToken
    refreshToken.value = refresh
    user.value = u
    if (process.client) {
      localStorage.setItem('auth_token', accessToken)
      localStorage.setItem('auth_refresh_token', refresh)
      localStorage.setItem('auth_user', JSON.stringify(u))

      // Чтобы сессия сохранялась при редиректе между поддоменами (root -> tenant.*).
      // localStorage изолирован по origin, а cookie — может шариться по Domain.
      setAuthCookie('auth_token', accessToken)
      setAuthCookie('auth_refresh_token', refresh)
      setAuthCookie('auth_user', JSON.stringify(u))
    }
  }

  function clearSession() {
    token.value = null
    refreshToken.value = null
    user.value = null
    if (process.client) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_refresh_token')
      localStorage.removeItem('auth_user')

      clearAuthCookie('auth_token')
      clearAuthCookie('auth_refresh_token')
      clearAuthCookie('auth_user')
    }
  }

  function syncWithStorage() {
    if (!process.client) return

    // Предпочитаем cookie (между поддоменами), а localStorage — fallback.
    const storedToken = getCookie('auth_token') ?? localStorage.getItem('auth_token')
    const storedRefresh =
      getCookie('auth_refresh_token') ?? localStorage.getItem('auth_refresh_token')
    const storedUser = getCookie('auth_user') ?? localStorage.getItem('auth_user')

    token.value = storedToken || null
    refreshToken.value = storedRefresh || null
    user.value = storedUser ? JSON.parse(storedUser) : null
  }

  async function refreshAccessToken() {
    if (!refreshToken.value) return null
    try {
      const res = await $fetch<{
        accessToken: string
        refreshToken: string
        user: unknown
      }>(apiUrl('/auth/refresh'), {
        method: 'POST',
        body: { refreshToken: refreshToken.value },
      })
      setSession(res.accessToken, res.refreshToken, res.user)
      return res
    } catch {
      clearSession()
      return null
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
    try {
      return await $fetch<T>(url, { ...options, headers })
    } catch (e: unknown) {
      const err = e as { response?: { status?: number }; statusCode?: number }
      const status = err?.response?.status ?? err?.statusCode
      if (status === 401 && !retried) {
        const refreshed = await refreshAccessToken()
        if (!refreshed?.accessToken) throw e
        return await authFetch<T>(url, options, true)
      }
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
        if (!refreshed?.accessToken) throw e
        return await authFetchBlob(url, options, true)
      }
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
        localStorage.setItem('auth_user', JSON.stringify(me))
      }
      return me
    } catch (e: unknown) {
      const err = e as { response?: { status?: number }; statusCode?: number }
      const status = err?.response?.status ?? err?.statusCode
      if (status === 401) {
        const refreshed = await refreshAccessToken()
        return (refreshed?.user as unknown) ?? null
      }
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
    syncWithStorage,
    fetchMe,
    authFetch,
    authFetchBlob,
  }
})

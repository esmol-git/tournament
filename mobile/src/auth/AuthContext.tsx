import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import * as authApi from '../api/authApi'
import { ApiError } from '../api/errors'
import type { SessionUser, TenantBrief } from '../types/user'
import * as sessionStore from './sessionStore'

type AuthContextValue = {
  user: SessionUser | null
  tenant: TenantBrief | null
  isReady: boolean
  isLoggingIn: boolean
  login: (params: { tenantSlug: string; username: string; password: string }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [tenant, setTenant] = useState<TenantBrief | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const bootstrap = useCallback(async () => {
    setIsReady(false)
    try {
      const access = await sessionStore.getAccessToken()
      const refresh = await sessionStore.getRefreshToken()
      const meta = await sessionStore.getSessionMeta()
      if (!access || !meta?.tenantSlug) {
        setUser(null)
        setTenant(null)
        return
      }

      try {
        const u = await authApi.me()
        setUser(u)
        setTenant({
          id: u.tenantId,
          slug: meta.tenantSlug,
          name: meta.tenantName || meta.tenantSlug,
        })
      } catch {
        if (refresh) {
          try {
            const r = await authApi.refreshSession(refresh)
            await sessionStore.saveSession({
              accessToken: r.accessToken,
              refreshToken: r.refreshToken,
              meta,
            })
            const u = await authApi.me()
            setUser(u)
            setTenant({
              id: u.tenantId,
              slug: meta.tenantSlug,
              name: meta.tenantName || meta.tenantSlug,
            })
          } catch {
            await sessionStore.clearSession()
            setUser(null)
            setTenant(null)
          }
        } else {
          await sessionStore.clearSession()
          setUser(null)
          setTenant(null)
        }
      }
    } finally {
      setIsReady(true)
    }
  }, [])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  const login = useCallback(async (params: { tenantSlug: string; username: string; password: string }) => {
    setIsLoggingIn(true)
    try {
      const res = await authApi.login({
        tenantSlug: params.tenantSlug,
        username: params.username,
        password: params.password,
      })
      await sessionStore.saveSession({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        meta: { tenantSlug: res.tenant.slug, tenantName: res.tenant.name },
      })
      setUser(res.user)
      setTenant(res.tenant)
    } catch (e) {
      if (e instanceof ApiError) throw e
      throw e
    } finally {
      setIsLoggingIn(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      const token = await sessionStore.getAccessToken()
      if (token) await authApi.logout()
    } catch {
      // сеть / 401 — всё равно чистим локально
    }
    await sessionStore.clearSession()
    setUser(null)
    setTenant(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      tenant,
      isReady,
      isLoggingIn,
      login,
      logout,
    }),
    [user, tenant, isReady, isLoggingIn, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

import { useAuthStore } from '~/stores/auth'

function readRole(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null
  const role = (user as { role?: unknown }).role
  return typeof role === 'string' ? role : null
}

function tenantFromHost(hostname: string): string | null {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1') return null
  const parts = host.split('.')
  if (parts.length < 3) return null
  const sub = parts[0]
  if (!sub || sub === 'www') return null
  return sub
}

export default defineNuxtRouteMiddleware((to) => {
  if (!process.client) return
  const auth = useAuthStore()
  auth.syncWithStorage()

  const role = readRole(auth.user)
  const isLoggedIn = auth.loggedIn
  const isPlatformRoute = to.path.startsWith('/platform')
  const isAdminRoute = to.path.startsWith('/admin')
  const isPlatformLogin = to.path === '/platform/login'
  const isAdminLogin = to.path === '/admin/login'
  const hostTenant = tenantFromHost(window.location.hostname)

  // На production-домене админка доступна только с tenant-поддомена.
  // На root-домене нельзя показывать tenant-данные даже из сохранённой сессии.
  if (isAdminRoute && !hostTenant) {
    return navigateTo('/')
  }

  if (isPlatformRoute) {
    if (isPlatformLogin) {
      if (isLoggedIn && role === 'SUPER_ADMIN') {
        return navigateTo('/platform/tenants')
      }
      return
    }
    if (!isLoggedIn) {
      return navigateTo('/platform/login')
    }
    if (role !== 'SUPER_ADMIN') {
      return navigateTo('/admin/login')
    }
    return
  }

  if (isAdminRoute) {
    if (isAdminLogin) {
      if (isLoggedIn && role === 'SUPER_ADMIN') {
        return navigateTo('/platform/tenants')
      }
      return
    }
    if (!isLoggedIn) {
      return navigateTo('/admin/login')
    }
    if (role === 'SUPER_ADMIN') {
      return navigateTo('/platform/tenants')
    }
  }
})

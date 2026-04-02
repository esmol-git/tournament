import { useAuthStore } from '~/stores/auth'
import { isTenantAdminExcludedRole } from '~/constants/tenantAdminStaff'

function readRole(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null
  const role = (user as { role?: unknown }).role
  return typeof role === 'string' ? role : null
}

function tenantFromHost(hostname: string): string | null {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1') return null

  // Dev: tenant.localhost -> tenant
  if (host.endsWith('.localhost')) {
    const parts = host.split('.')
    return parts.length === 2 ? parts[0]! : null
  }

  const parts = host.split('.')
  if (parts.length < 3) return null
  const sub = parts[0]
  if (!sub || sub === 'www') return null
  return sub
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1'
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
  const isAdminSubscriptionExpired = to.path === '/admin/subscription-expired'
  const isAdminAccessDenied = to.path === '/admin/access-denied'
  const hostName = window.location.hostname
  const hostTenant = tenantFromHost(hostName)

  // На production root-домене закрытые /admin/* доступны только с tenant-поддомена.
  // Но /admin/login всегда разрешаем (вход/регистрация), а на localhost разрешаем весь /admin.
  if (
    isAdminRoute &&
    !isAdminLogin &&
    !isAdminSubscriptionExpired &&
    !isAdminAccessDenied &&
    !hostTenant &&
    !isLocalHost(hostName)
  ) {
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
    if (isAdminSubscriptionExpired) {
      return
    }
    if (!isLoggedIn) {
      return navigateTo('/admin/login')
    }
    if (role === 'SUPER_ADMIN') {
      return navigateTo('/platform/tenants')
    }
    if (isTenantAdminExcludedRole(role)) {
      if (isAdminAccessDenied) return
      return navigateTo('/admin/access-denied')
    }
    if (isAdminAccessDenied) {
      return navigateTo('/admin')
    }
  }
})

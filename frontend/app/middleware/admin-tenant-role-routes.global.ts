import { useAuthStore } from '~/stores/auth'
import { isTenantAdminOnlyAdminRoute } from '~/utils/adminTenantRoleRouteGate'

function readRole(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null
  const role = (user as { role?: unknown }).role
  return typeof role === 'string' && role.trim() ? role : null
}

/**
 * Маршруты только для TENANT_ADMIN (пользователи, соцссылки и т.д.).
 */
export default defineNuxtRouteMiddleware((to) => {
  if (!process.client) return
  const p = to.path
  if (!p.startsWith('/admin')) return
  if (
    p === '/admin/login' ||
    p === '/admin/subscription-expired' ||
    p === '/admin/access-denied' ||
    p === '/admin/feature-unavailable'
  )
    return

  if (!isTenantAdminOnlyAdminRoute(p)) return

  const auth = useAuthStore()
  auth.syncWithStorage()
  if (!auth.loggedIn) return

  const role = readRole(auth.user)
  if (role === 'TENANT_ADMIN') return

  return navigateTo({
    path: '/admin/feature-unavailable',
    query: { reason: 'tenant_admin_only' },
  })
})

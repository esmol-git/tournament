import { useAuthStore } from '~/stores/auth'
import { isModeratorForbiddenAdminRoute } from '~/utils/moderatorAdminRouteGate'
import { isTenantAdminOnlyAdminRoute } from '~/utils/adminTenantRoleRouteGate'
import { readTenantStaffRole } from '~/utils/tenantStaffRole'

/**
 * Роли: маршруты только для TENANT_ADMIN; для MODERATOR — закрыты справочники и часть разделов.
 */
export default defineNuxtRouteMiddleware(async (to) => {
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

  const tabRaw = to.query.tab
  const tabOne = Array.isArray(tabRaw) ? tabRaw[0] : tabRaw
  const moderatorBlockedTemplatesTab = p === '/admin/tournaments' && tabOne === 'templates'

  const needsAuthRoleCheck =
    isModeratorForbiddenAdminRoute(p) ||
    isTenantAdminOnlyAdminRoute(p) ||
    moderatorBlockedTemplatesTab

  if (!needsAuthRoleCheck) return

  const auth = useAuthStore()
  auth.syncWithStorage()
  await auth.restoreSessionViaRefreshCookieIfNeeded()
  if (!auth.loggedIn) return

  const role = readTenantStaffRole(auth.user)

  if (role === 'MODERATOR') {
    if (isModeratorForbiddenAdminRoute(p)) {
      return navigateTo({
        path: '/admin/feature-unavailable',
        query: { reason: 'moderator_scope' },
      })
    }
    if (moderatorBlockedTemplatesTab) {
      const { tab: _omit, ...rest } = to.query
      return navigateTo({ path: '/admin/tournaments', query: rest })
    }
  }

  if (!isTenantAdminOnlyAdminRoute(p)) return

  if (role === 'TENANT_ADMIN') return

  return navigateTo({
    path: '/admin/feature-unavailable',
    query: { reason: 'tenant_admin_only' },
  })
})

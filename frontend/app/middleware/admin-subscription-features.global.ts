import { useAuthStore } from '~/stores/auth'
import {
  hasSubscriptionFeature,
  subscriptionPlanFromAuthUser,
} from '~/utils/subscriptionFeatures'
import { adminRouteRequiredFeature } from '~/utils/adminSubscriptionRouteGate'

/**
 * Блокирует прямой заход на страницы, скрытые в меню из‑за тарифа организации.
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

  const required = adminRouteRequiredFeature(p)
  if (!required) return

  const auth = useAuthStore()
  auth.syncWithStorage()
  await auth.restoreSessionViaRefreshCookieIfNeeded()
  if (!auth.loggedIn) return

  const plan = subscriptionPlanFromAuthUser(auth.user)
  if (hasSubscriptionFeature(plan, required)) return

  return navigateTo({
    path: '/admin/feature-unavailable',
    query: { feature: required },
  })
})

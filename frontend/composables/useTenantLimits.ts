import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useAuth } from '~/composables/useAuth'
import {
  SUBSCRIPTION_PLANS,
  subscriptionPlanFromAuthUser,
  subscriptionPlanIndex,
  tenantPlanLimitsFromAuthUser,
  maxTournamentsForSubscriptionPlan,
} from '~/utils/subscriptionFeatures'

/** Лимиты тарифа (как в `tenantSubscription.limits` / fallback по плану). */
export type TenantLimitsSnapshot = {
  maxTournaments: number | null
  maxTeams: number | null
  maxUsers: number | null
  maxNews: number | null
}

export type UseTenantLimitsOptions = {
  /**
   * Текущее число турниров организации.
   * Без значения `tournamentsLeft` и `usagePercent` возвращают `null` (неизвестно).
   */
  tournamentsCount?: MaybeRefOrGetter<number | null | undefined>
}

export function useTenantLimits(options?: UseTenantLimitsOptions) {
  const { user } = useAuth()

  /** Есть снимок из сессии (`/me`) или fallback по плану — отличие от «ещё не знаем лимиты». */
  const limitsResolved = computed(
    () => tenantPlanLimitsFromAuthUser(user.value) !== null,
  )

  const limits = computed((): TenantLimitsSnapshot => {
    const snap = tenantPlanLimitsFromAuthUser(user.value)
    if (!snap) {
      return {
        maxTournaments: null,
        maxTeams: null,
        maxUsers: null,
        maxNews: null,
      }
    }
    return {
      maxTournaments: snap.tournaments,
      maxTeams: snap.teamsPerTenant,
      maxUsers: snap.users,
      maxNews: snap.newsPerTournament,
    }
  })

  const resolvedTournamentsCount = computed((): number | null => {
    if (options?.tournamentsCount === undefined) return null
    const raw = toValue(options.tournamentsCount)
    if (raw === null || raw === undefined) return null
    const n = Number(raw)
    if (!Number.isFinite(n)) return null
    return Math.max(0, Math.floor(n))
  })

  const tournamentsLeft = computed((): number | null => {
    const max = limits.value.maxTournaments
    const count = resolvedTournamentsCount.value
    if (max === null || count === null) return null
    return Math.max(0, max - count)
  })

  const usagePercent = computed((): number => {
    const max = limits.value.maxTournaments
    const count = resolvedTournamentsCount.value
    if (!max || count === null) return 0
    return Math.min(100, Math.round((count / max) * 100))
  })

  const nextPlanTournaments = computed((): number | null => {
    const plan = subscriptionPlanFromAuthUser(user.value)
    if (!plan) return null
    const idx = subscriptionPlanIndex(plan)
    const next = SUBSCRIPTION_PLANS[idx + 1]
    if (!next) return null
    return maxTournamentsForSubscriptionPlan(next)
  })

  return {
    limits,
    limitsResolved,
    tournamentsLeft,
    usagePercent,
    nextPlanTournaments,
  }
}

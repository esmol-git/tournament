/**
 * Снимок лимитов тарифа — дублирует `PLAN_LIMITS` на бэкенде.
 * Нужен для fallback в login и до обновления сессии; основной источник — `user.tenantSubscription.limits` из API.
 */
import type { SubscriptionPlanCode } from '~/utils/subscriptionFeatures'

export type TenantPlanLimitsSnapshot = {
  tournaments: number | null
  teamsPerTournament: number | null
  teamsPerTenant: number | null
  users: number | null
  newsPerTournament: number | null
}

export const TENANT_PLAN_LIMITS_BY_PLAN: Record<
  SubscriptionPlanCode,
  TenantPlanLimitsSnapshot
> = {
  FREE: {
    tournaments: 1,
    teamsPerTournament: 8,
    teamsPerTenant: 8,
    users: 5,
    newsPerTournament: 10,
  },
  AMATEUR: {
    tournaments: 3,
    teamsPerTournament: 16,
    teamsPerTenant: 48,
    users: 20,
    newsPerTournament: 50,
  },
  PREMIER: {
    tournaments: 10,
    teamsPerTournament: 64,
    teamsPerTenant: 640,
    users: 100,
    newsPerTournament: 200,
  },
  CHAMPIONS: {
    tournaments: 50,
    teamsPerTournament: 128,
    teamsPerTenant: 6400,
    users: 500,
    newsPerTournament: 1000,
  },
  WORLD_CUP: {
    tournaments: null,
    teamsPerTournament: null,
    teamsPerTenant: null,
    users: null,
    newsPerTournament: null,
  },
}

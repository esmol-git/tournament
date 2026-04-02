/**
 * Тарифы и доступный функционал (до появления реального биллинга — ручной выбор в настройках).
 * Порядок: FREE < AMATEUR < PREMIER < CHAMPIONS < WORLD_CUP.
 */

export const SUBSCRIPTION_PLANS = [
  'FREE',
  'AMATEUR',
  'PREMIER',
  'CHAMPIONS',
  'WORLD_CUP',
] as const

export type SubscriptionPlanCode = (typeof SUBSCRIPTION_PLANS)[number]

/** Опечатки / старые коды → каноническое значение из `SUBSCRIPTION_PLANS`. */
const SUBSCRIPTION_PLAN_ALIASES: Record<string, SubscriptionPlanCode> = {
  WORLD_CLUB: 'WORLD_CUP',
}

export function normalizeSubscriptionPlanCode(
  raw: string | null | undefined,
): SubscriptionPlanCode {
  const p = String(raw ?? 'FREE')
    .trim()
    .toUpperCase()
  const mapped = SUBSCRIPTION_PLAN_ALIASES[p]
  if (mapped) return mapped
  const i = SUBSCRIPTION_PLANS.indexOf(p as SubscriptionPlanCode)
  return i >= 0 ? (p as SubscriptionPlanCode) : 'FREE'
}

export type SubscriptionFeature =
  | 'core_tournaments'
  | 'public_site_basic'
  | 'public_custom_branding'
  | 'news_and_media'
  | 'advanced_playoff_formats'
  | 'broadcasts_and_integrations'
  /** Сводный календарь по организации в админке. */
  | 'org_wide_calendar'
  /** Справочники: сезоны, возрасты, категории команд — с Amateur. */
  | 'reference_directory_basic'
  /** Справочники: регионы, стадионы, судьи, соревнования — с Premier. */
  | 'reference_directory_standard'
  /** Справочники: документы, протокол, причины переносов — с Champions. */
  | 'reference_directory_advanced'
  /** Лимит турниров: один (Free). */
  | 'tournament_limit_1'
  /** Лимит: до 3 турниров (Amateur). */
  | 'tournament_limit_3'
  /** Лимит: до 10 (Premier). */
  | 'tournament_limit_10'
  /** Лимит: до 50 (Champions). */
  | 'tournament_limit_50'
  /** Без лимита (World Cup). */
  | 'tournament_limit_unlimited'
  /** Автогенерация календаря / плей-офф, шаблоны. */
  | 'tournament_automation'
  /** Массовый импорт (напр. bulk игроков), экспорт/обмен данными. */
  | 'data_import_export'
  /** Редактор публичного бренда в админке (вкладка «Публичные страницы» в настройках). */
  | 'public_site_admin_settings'

/** Минимальный индекс тарифа в SUBSCRIPTION_PLANS, с которого доступна возможность. */
const FEATURE_MIN_PLAN_INDEX: Record<SubscriptionFeature, number> = {
  core_tournaments: 0,
  public_site_basic: 0,
  /** Бренд, SEO, соцссылки — с Premier. */
  public_custom_branding: 2,
  news_and_media: 2,
  advanced_playoff_formats: 3,
  broadcasts_and_integrations: 4,
  org_wide_calendar: 2,
  reference_directory_basic: 1,
  reference_directory_standard: 2,
  reference_directory_advanced: 3,
  tournament_limit_1: 0,
  tournament_limit_3: 1,
  tournament_limit_10: 2,
  tournament_limit_50: 3,
  tournament_limit_unlimited: 4,
  tournament_automation: 2,
  data_import_export: 3,
  public_site_admin_settings: 2,
}

/**
 * Тариф из объекта пользователя после сессии: `tenantSubscription` (как в `/auth/me`)
 * или устаревший ответ login с полем `tenant` рядом с `user`.
 */
export function subscriptionPlanFromAuthUser(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null
  const o = user as Record<string, unknown>
  const ts = o.tenantSubscription
  if (ts && typeof ts === 'object') {
    const p = (ts as { plan?: unknown }).plan
    if (typeof p === 'string' && p.trim()) return p
  }
  const t = o.tenant
  if (t && typeof t === 'object') {
    const p = (t as { subscriptionPlan?: unknown }).subscriptionPlan
    if (typeof p === 'string' && p.trim()) return p
  }
  return null
}

export function subscriptionPlanIndex(plan: string | null | undefined): number {
  const canonical = normalizeSubscriptionPlanCode(plan ?? 'FREE')
  return SUBSCRIPTION_PLANS.indexOf(canonical)
}

export function hasSubscriptionFeature(
  plan: string | null | undefined,
  feature: SubscriptionFeature,
): boolean {
  return subscriptionPlanIndex(plan) >= FEATURE_MIN_PLAN_INDEX[feature]
}

export function allSubscriptionFeatures(): SubscriptionFeature[] {
  return Object.keys(FEATURE_MIN_PLAN_INDEX) as SubscriptionFeature[]
}

/** null — без ограничения (WORLD_CUP). */
export function maxTournamentsForSubscriptionPlan(plan: string | null | undefined): number | null {
  const idx = subscriptionPlanIndex(plan)
  const limits: (number | null)[] = [1, 3, 10, 50, null]
  return limits[idx] ?? 1
}

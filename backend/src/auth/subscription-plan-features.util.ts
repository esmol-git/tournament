import { SubscriptionPlan } from '@prisma/client';

/**
 * Совпадает по смыслу с `SubscriptionFeature` во фронтенде (индексы тарифов).
 * FREE = 0, AMATEUR = 1, …
 */
export type SubscriptionPlanFeatureKey =
  | 'reference_directory_basic'
  | 'reference_directory_standard'
  | 'reference_directory_advanced'
  | 'tournament_automation'
  | 'data_import_export'
  | 'public_site_admin_settings';

const PLAN_ORDER: SubscriptionPlan[] = [
  'FREE',
  'AMATEUR',
  'PREMIER',
  'CHAMPIONS',
  'WORLD_CUP',
];

/** Строки вне Prisma-enum (опечатка в БД, старый код) → канонический план. */
const PLAN_ALIASES: Record<string, SubscriptionPlan> = {
  WORLD_CLUB: 'WORLD_CUP',
};

export function canonicalSubscriptionPlan(plan: string | SubscriptionPlan): SubscriptionPlan {
  const raw = String(plan).trim().toUpperCase();
  const aliased = PLAN_ALIASES[raw];
  if (aliased) return aliased;
  if (PLAN_ORDER.includes(raw as SubscriptionPlan)) return raw as SubscriptionPlan;
  return 'FREE';
}

const FEATURE_MIN_INDEX: Record<SubscriptionPlanFeatureKey, number> = {
  /** Сезоны, возрасты, категории команд — с Amateur. */
  reference_directory_basic: 1,
  /** Регионы, соревнования, стадионы, судьи, руководство — с Premier. */
  reference_directory_standard: 2,
  /** Документы, типы событий протокола, причины переносов — с Champions. */
  reference_directory_advanced: 3,
  /** Автогенерация календаря / плей-офф — с Premier. */
  tournament_automation: 2,
  /** Массовый импорт / обмен данными — с Champions. */
  data_import_export: 3,
  /** Редактор публичного бренда в админке — с Premier. */
  public_site_admin_settings: 2,
};

export function subscriptionPlanIndex(plan: SubscriptionPlan): number {
  const i = PLAN_ORDER.indexOf(plan);
  return i >= 0 ? i : 0;
}

export function tenantHasSubscriptionPlanFeature(
  plan: SubscriptionPlan | string,
  feature: SubscriptionPlanFeatureKey,
): boolean {
  return (
    subscriptionPlanIndex(canonicalSubscriptionPlan(plan)) >= FEATURE_MIN_INDEX[feature]
  );
}

/** null — без ограничения (WORLD_CUP). */
export function maxTournamentsForPlan(plan: SubscriptionPlan | string): number | null {
  const idx = subscriptionPlanIndex(canonicalSubscriptionPlan(plan));
  const limits: (number | null)[] = [1, 3, 10, 50, null];
  return limits[idx] ?? 1;
}

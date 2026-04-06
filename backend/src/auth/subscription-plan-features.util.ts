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
  | 'public_site_admin_settings'
  /** Журнал действий в админ-API — только тариф «Чемпионат мира». */
  | 'audit_log';

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

export function canonicalSubscriptionPlan(
  plan: string | SubscriptionPlan,
): SubscriptionPlan {
  const raw = String(plan).trim().toUpperCase();
  const aliased = PLAN_ALIASES[raw];
  if (aliased) return aliased;
  if (PLAN_ORDER.includes(raw as SubscriptionPlan))
    return raw as SubscriptionPlan;
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
  /** Просмотр аудит-лога — только WORLD_CUP (индекс 4). */
  audit_log: 4,
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
    subscriptionPlanIndex(canonicalSubscriptionPlan(plan)) >=
    FEATURE_MIN_INDEX[feature]
  );
}

/** Ключи фич, доступные на тарифе (для публичного прайса и лендинга). */
export function subscriptionPlanIncludedFeatures(
  plan: SubscriptionPlan | string,
): SubscriptionPlanFeatureKey[] {
  const idx = subscriptionPlanIndex(canonicalSubscriptionPlan(plan));
  return (
    Object.entries(FEATURE_MIN_INDEX) as [SubscriptionPlanFeatureKey, number][]
  )
    .filter(([, minIdx]) => idx >= minIdx)
    .sort(
      (a, b) =>
        FEATURE_MIN_INDEX[a[0]] - FEATURE_MIN_INDEX[b[0]] ||
        a[0].localeCompare(b[0]),
    )
    .map(([k]) => k);
}

/** Числовые квоты тарифа; `null` — без лимита (тариф «Чемпионат мира»). */
export type PlanNumericLimits = {
  tournaments: number | null;
  teamsPerTournament: number | null;
  users: number | null;
  newsPerTournament: number | null;
};

/**
 * Как в сессии / API: базовые лимиты + `teamsPerTenant` = `tournaments × teamsPerTournament`.
 */
export type TenantSubscriptionLimits = PlanNumericLimits & {
  teamsPerTenant: number | null;
};

/**
 * Лимиты по тарифам (админка / валидация).
 * Квота команд на организацию не хранится отдельно: см. `maxTeamsPerTenant` / `tenantSubscriptionLimits`.
 */
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanNumericLimits> = {
  FREE: {
    tournaments: 1,
    teamsPerTournament: 8,
    users: 5,
    newsPerTournament: 10,
  },
  AMATEUR: {
    tournaments: 3,
    teamsPerTournament: 16,
    users: 20,
    newsPerTournament: 50,
  },
  PREMIER: {
    tournaments: 10,
    teamsPerTournament: 64,
    users: 100,
    newsPerTournament: 200,
  },
  CHAMPIONS: {
    tournaments: 50,
    teamsPerTournament: 128,
    users: 500,
    newsPerTournament: 1000,
  },
  WORLD_CUP: {
    tournaments: null,
    teamsPerTournament: null,
    users: null,
    newsPerTournament: null,
  },
};

/** Алиас для обращения к лимитам по плану (как к объекту). */
export const subscriptionPlanLimits = PLAN_LIMITS;

function planLimitsRow(plan: SubscriptionPlan | string): PlanNumericLimits {
  return PLAN_LIMITS[canonicalSubscriptionPlan(plan)];
}

/** null — без ограничения. */
export function maxTournamentsForPlan(
  plan: SubscriptionPlan | string,
): number | null {
  return planLimitsRow(plan).tournaments;
}

/** null — без ограничения. */
export function maxTeamsPerTournament(
  plan: SubscriptionPlan | string,
): number | null {
  return planLimitsRow(plan).teamsPerTournament;
}

/** null — без ограничения. Производное: число турниров × команд в турнире. */
export function maxTeamsPerTenant(
  plan: SubscriptionPlan | string,
): number | null {
  const row = planLimitsRow(plan);
  if (row.tournaments === null || row.teamsPerTournament === null) return null;
  return row.tournaments * row.teamsPerTournament;
}

export function tenantSubscriptionLimits(
  plan: SubscriptionPlan | string,
): TenantSubscriptionLimits {
  const p = canonicalSubscriptionPlan(plan);
  const row = PLAN_LIMITS[p];
  return {
    ...row,
    teamsPerTenant: maxTeamsPerTenant(p),
  };
}

/** null — без ограничения. */
export function maxUsersPerTenant(
  plan: SubscriptionPlan | string,
): number | null {
  return planLimitsRow(plan).users;
}

/** null — без ограничения. */
export function maxNewsPerTournament(
  plan: SubscriptionPlan | string,
): number | null {
  return planLimitsRow(plan).newsPerTournament;
}

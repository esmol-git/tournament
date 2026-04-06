/** staleTime / fetchQuery: справочники и списки тенанта в админке. */
export const ADMIN_TENANT_QUERY_STALE_MS = 60_000

/**
 * Ключи TanStack Query для дедупликации между страницами админки (один тенант + один URL).
 * Префикс `admin` отделяет от возможных публичных ключей.
 */
export const adminTenantQueryKeys = {
  seasons: (tenantId: string) => ['admin', 'tenant', tenantId, 'seasons'] as const,
  competitions: (tenantId: string) => ['admin', 'tenant', tenantId, 'competitions'] as const,
  ageGroups: (tenantId: string) => ['admin', 'tenant', tenantId, 'age-groups'] as const,
  stadiumsReferees: (tenantId: string) => ['admin', 'tenant', tenantId, 'stadiums-referees'] as const,
  protocolEventTypes: (tenantId: string) => ['admin', 'tenant', tenantId, 'protocol-event-types'] as const,
  matchScheduleReasons: (tenantId: string) =>
    ['admin', 'tenant', tenantId, 'match-schedule-reasons'] as const,
  /** Все команды тенанта (постраничная выборка на клиенте) — селекты, календарь, матчи. */
  teamsAll: (tenantId: string) => ['admin', 'tenant', tenantId, 'teams', 'all'] as const,
  /**
   * Команды для формы турнира с опциональным фильтром по возрастной группе.
   * `ageGroupKey`: trimmed id или `'none'`.
   */
  teamsTournamentForm: (tenantId: string, ageGroupKey: string) =>
    ['admin', 'tenant', tenantId, 'teams', 'tournament-form', ageGroupKey] as const,
  /** Все турниры тенанта (без фильтров списка) — селекты «прикрепить к турниру» и т.п. */
  tournamentsAll: (tenantId: string) => ['admin', 'tenant', tenantId, 'tournaments', 'all'] as const,
}

/** После CRUD команд — сбросить все кэши `/teams` для тенанта. */
export function invalidateAdminTenantTeamsQueries(
  queryClient: {
    invalidateQueries: (filters: { queryKey: readonly string[] }) => Promise<unknown>
  },
  tenantId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: ['admin', 'tenant', tenantId, 'teams'],
  })
}

/** После создания/изменения турнира — списки для селектов. */
export function invalidateAdminTenantTournamentsAll(
  queryClient: {
    invalidateQueries: (filters: { queryKey: readonly string[] }) => Promise<unknown>
  },
  tenantId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: ['admin', 'tenant', tenantId, 'tournaments', 'all'],
  })
}

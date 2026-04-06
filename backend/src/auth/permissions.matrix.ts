/**
 * Единый источник декларативных прав по ролям (матрица).
 * Guards и сервисы могут ссылаться на эти флаги вместо разрозненных allowlist’ов.
 *
 * Ключи вроде `STAFF` — логический уровень матрицы; сопоставление с {@link UserRole}
 * из Prisma (MODERATOR, USER, …) делается отдельно по мере консолидации.
 */
export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: {
    manageAnyTournament: true,
    manageTenantContent: true,
    manageMatches: true,
    publishTournament: true,
  },
  TENANT_ADMIN: {
    manageAnyTournamentInTenant: true,
    manageTenantContent: true,
    manageMatches: true,
    publishTournament: true,
  },
  TOURNAMENT_ADMIN: {
    manageOwnTournament: true,
    manageOwnTournamentContent: true,
    manageOwnMatches: true,
    publishOwnTournament: true,
  },
  STAFF: {
    manageMatches: false,
    manageTenantContent: false,
    manageAnyTournamentInTenant: false,
  },
} as const;

export type MatrixRole = keyof typeof ROLE_PERMISSIONS;

type MatrixRow = (typeof ROLE_PERMISSIONS)[MatrixRole];

/** Объединение всех имён прав, встречающихся в матрице. */
export type MatrixPermission = {
  [K in MatrixRole]: keyof (typeof ROLE_PERMISSIONS)[K];
}[MatrixRole];

const isRecord = (v: unknown): v is Record<string, boolean> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Явное право в строке роли (только то, что задано в матрице).
 * Отсутствующий ключ трактуем как `false`, чтобы строки с разным набором полей были сопоставимы.
 */
export function hasMatrixPermission(
  role: MatrixRole,
  permission: MatrixPermission,
): boolean {
  const row: MatrixRow = ROLE_PERMISSIONS[role];
  if (!isRecord(row)) {
    return false;
  }
  const v = row[permission as keyof typeof row];
  return v === true;
}

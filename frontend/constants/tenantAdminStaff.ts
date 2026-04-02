/**
 * Роли, которым разрешена панель организатора (`/admin`).
 * USER и REFEREE — нет (только публичный сайт / личные данные вне админки).
 */
export const TENANT_ADMIN_STAFF_ROLES = [
  'TENANT_ADMIN',
  'TOURNAMENT_ADMIN',
  'TEAM_ADMIN',
  'MODERATOR',
] as const

export type TenantAdminStaffRole = (typeof TENANT_ADMIN_STAFF_ROLES)[number]

const STAFF_SET = new Set<string>(TENANT_ADMIN_STAFF_ROLES)

/** Роли без доступа к админке организатора. */
export const TENANT_ADMIN_EXCLUDED_ROLES = ['USER', 'REFEREE'] as const

const EXCLUDED_SET = new Set<string>(TENANT_ADMIN_EXCLUDED_ROLES)

export function isTenantAdminStaffRole(role: string | null | undefined): boolean {
  if (!role) return false
  return STAFF_SET.has(role)
}

export function isTenantAdminExcludedRole(role: string | null | undefined): boolean {
  if (!role) return false
  return EXCLUDED_SET.has(role)
}

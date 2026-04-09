import type { UserRole } from '../types/user'

/** Подписи ролей для UI (вход одной учёткой — роль приходит с сервера). */
export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Супер-админ платформы',
  TENANT_ADMIN: 'Админ организации',
  TOURNAMENT_ADMIN: 'Админ турнира',
  TEAM_ADMIN: 'Админ команды',
  MODERATOR: 'Модератор',
  USER: 'Пользователь',
  REFEREE: 'Судья',
}

/** Роли, для которых планируется сценарий ввода результатов и матч-действий. */
export const MATCH_STAFF_ROLES: UserRole[] = [
  'TENANT_ADMIN',
  'TOURNAMENT_ADMIN',
  'MODERATOR',
  'REFEREE',
]

export function canAccessMatchResultsFlow(role: UserRole): boolean {
  return MATCH_STAFF_ROLES.includes(role)
}

/** Роли, которым backend разрешает PATCH протокола матча (`PROTOCOL_ROLES`). */
const PROTOCOL_ROLES: UserRole[] = ['TENANT_ADMIN', 'TOURNAMENT_ADMIN', 'MODERATOR', 'REFEREE']

export function canEditMatchProtocol(role: UserRole): boolean {
  return PROTOCOL_ROLES.includes(role)
}

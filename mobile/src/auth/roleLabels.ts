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

/**
 * Краткие строки для UI: что в мобильном клиенте реально доступно с этой ролью
 * (согласовано с guards API и вкладками навигации).
 */
export function getMobileRoleCapabilityLines(role: UserRole): readonly string[] {
  switch (role) {
    case 'SUPER_ADMIN':
      return [
        'В приложении — обзор выбранной организации: турниры и карточки турниров.',
        'Список матчей по всей организации и супер-админские сценарии удобнее в веб-интерфейсе.',
      ]
    case 'TENANT_ADMIN':
      return [
        'Турниры организации (включая черновики), сводка, вкладка «Матчи» и протоколы.',
      ]
    case 'TOURNAMENT_ADMIN':
      return [
        'Турниры, которые вы создали, их матчи и протокол; сводка по организации.',
      ]
    case 'MODERATOR':
      return [
        'Турниры и матчи только там, где вы назначены модератором турнира; протокол по этим матчам.',
      ]
    case 'REFEREE':
      return [
        'Вкладка «Матчи» — календарь матчей организации и внесение протокола.',
        'В списке турниров — как на сайте: только опубликованные.',
      ]
    case 'TEAM_ADMIN':
      return [
        'Просмотр турниров организации и расписания в карточке турнира.',
        'Вкладка «Матчи» и правка протокола в приложении недоступны — при необходимости используйте сайт.',
      ]
    case 'USER':
      return [
        'Турниры с сайта (опубликованные), без рабочих экранов матчей и протокола.',
      ]
  }
}

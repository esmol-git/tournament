/**
 * Стабильные коды ошибок API: фронт, аудит, агрегация логов.
 * Сообщения (`message`) могут меняться; `code` — контракт.
 */
export const ApiErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',
  CROSS_TENANT_ACCESS_DENIED: 'CROSS_TENANT_ACCESS_DENIED',
  TOURNAMENT_ACCESS_DENIED: 'TOURNAMENT_ACCESS_DENIED',
  TOURNAMENT_NOT_FOUND: 'TOURNAMENT_NOT_FOUND',
  /** Организация не найдена (контент/настройки по tenant id). */
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  TENANT_CONTENT_ACCESS_DENIED: 'TENANT_CONTENT_ACCESS_DENIED',
  TOURNAMENT_ID_REQUIRED: 'TOURNAMENT_ID_REQUIRED',
  TENANT_ID_REQUIRED: 'TENANT_ID_REQUIRED',
  /** Панель организатора: роль USER/REFEREE без прав. */
  ADMIN_STAFF_ROLE_REQUIRED: 'ADMIN_STAFF_ROLE_REQUIRED',
  /** Удаление пользователей выключено в настройках организации. */
  USER_DELETION_DISABLED: 'USER_DELETION_DISABLED',
  /** Повторное создание матча с теми же турниром, командами, временем и этапом. */
  MATCH_DUPLICATE: 'MATCH_DUPLICATE',
} as const;

export type ApiErrorCodeValue =
  (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

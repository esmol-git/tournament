/**
 * Маршруты админки, закрытые для глобальной роли MODERATOR (навигация и прямой заход по URL).
 * Справочники, новости, медиа, общий календарь матчей организации.
 */
export function isModeratorForbiddenAdminRoute(path: string): boolean {
  if (/^\/admin\/references(\/|$)/.test(path)) return true
  if (/^\/admin\/news(\/|$)/.test(path)) return true
  if (/^\/admin\/gallery(\/|$)/.test(path)) return true
  if (/^\/admin\/matches(\/|$)/.test(path)) return true
  if (/^\/admin\/calendar(\/|$)/.test(path)) return true
  return false
}

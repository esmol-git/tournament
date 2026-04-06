/**
 * Политика «глобальный MODERATOR = только просмотр» на уровне маршрутов админки.
 * Дополняет {@link isModeratorForbiddenAdminRoute} (полный запрет входа) и навигацию в `adminNav.ts`.
 *
 * На всех страницах с `layout: 'admin'` в `definePageMeta` задано `adminOrgModeratorReadOnly`
 * (`true` — команды, игроки, список турниров; иначе `false`), чтобы не гадать по путям только из кода страниц.
 * Контроль в CI: `check:admin-moderator-meta`, `typecheck` (`.github/workflows/quality.yml`).
 *
 * Не входят в org read-only по умолчанию: `/admin`, `/admin/tournaments/:id`
 * — {@link useAdminGlobalModeratorTournamentPolicy}.
 */

/**
 * Пути, где без явного `meta.adminOrgModeratorReadOnly` модератор только смотрит.
 * На страницах команд, игроков и списка турниров в `definePageMeta` также задано `adminOrgModeratorReadOnly: true` для наглядности.
 */
function pathIsTournamentListOnly(path: string): boolean {
  return path === '/admin/tournaments'
}

export function isAdminOrgModeratorReadOnlyPath(path: string): boolean {
  if (path.startsWith('/admin/teams')) return true
  if (path.startsWith('/admin/players')) return true
  if (pathIsTournamentListOnly(path)) return true
  return false
}

/**
 * Нужен ли режим read-only для глобального MODERATOR с учётом `route.meta`.
 */
export function resolveAdminOrgModeratorReadOnly(
  path: string,
  metaAdminOrgModeratorReadOnly: boolean | undefined,
): boolean {
  if (metaAdminOrgModeratorReadOnly === false) return false
  if (metaAdminOrgModeratorReadOnly === true) return true
  return isAdminOrgModeratorReadOnlyPath(path)
}

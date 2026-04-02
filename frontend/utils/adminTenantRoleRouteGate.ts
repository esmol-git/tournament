/**
 * Маршруты админки только для администратора организации (не для админа турнира / модератора и т.д.).
 */
const TENANT_ADMIN_ONLY_PATH_RE =
  /^\/admin\/(users|social-links|settings)(\/|$)/

export function isTenantAdminOnlyAdminRoute(path: string): boolean {
  return TENANT_ADMIN_ONLY_PATH_RE.test(path)
}

/**
 * Учётки и URL задаются через env (см. `e2e/.env.example`).
 * Без полного набора переменных тесты помечаются как skipped.
 */
export const e2eEnv = {
  baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
  tenantSlug: process.env.E2E_TENANT_SLUG ?? 'default',
  /** Опционально: прямой заход на карточку турнира, если в списке нет черновиков */
  tournamentId: (process.env.E2E_TOURNAMENT_ID ?? '').trim(),
  adminUser: process.env.E2E_ADMIN_USER ?? '',
  adminPassword: process.env.E2E_ADMIN_PASSWORD ?? '',
  moderatorUser: process.env.E2E_MODERATOR_USER ?? '',
  moderatorPassword: process.env.E2E_MODERATOR_PASSWORD ?? '',
}

export function e2eCredentialsConfigured(): boolean {
  return !!(
    e2eEnv.adminUser &&
    e2eEnv.adminPassword &&
    e2eEnv.moderatorUser &&
    e2eEnv.moderatorPassword
  )
}

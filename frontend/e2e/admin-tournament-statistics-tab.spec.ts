import { expect, test } from '@playwright/test'
import { describeE2e } from './helpers/describe-e2e'
import { e2eEnv } from './helpers/env'
import { loginAdminStaff } from './helpers/login'

describeE2e('TENANT_ADMIN: вкладка «Статистика» турнира', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdminStaff(page, e2eEnv.adminUser, e2eEnv.adminPassword)
  })

  test('GET player-stats уходит после открытия вкладки «Статистика», а не на календаре', async ({
    page,
  }) => {
    let playerStatsHits = 0
    await page.route(/\/tournaments\/[^/]+\/player-stats(\?|$)/, async (route) => {
      playerStatsHits += 1
      await route.continue()
    })

    const tid = e2eEnv.tournamentId
    if (tid) {
      await page.goto(`/admin/tournaments/${tid}?tab=calendar`)
    } else {
      await page.goto('/admin/tournaments')
      const openFirst = page.getByTestId('tournament-card-open').first()
      const hasCard = await openFirst.isVisible({ timeout: 20_000 }).catch(() => false)
      if (!hasCard) {
        test.skip(true, 'Нет турниров в списке — создайте черновик или задайте E2E_TOURNAMENT_ID')
      }
      await openFirst.click()
      await page.waitForURL(/\/admin\/tournaments\/[^/]+$/, { timeout: 20_000 })
    }

    await expect(page).toHaveURL(/\/admin\/tournaments\/[^/]+/)
    await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible', timeout: 25_000 })

    await page.waitForTimeout(1200)
    expect(playerStatsHits).toBe(0)

    const statsTab = page.getByRole('tab', { name: /^Статистика$/i })
    await expect(statsTab).toBeVisible({ timeout: 15_000 })
    await statsTab.click()

    await expect.poll(() => playerStatsHits, { timeout: 25_000 }).toBeGreaterThanOrEqual(1)
  })
})

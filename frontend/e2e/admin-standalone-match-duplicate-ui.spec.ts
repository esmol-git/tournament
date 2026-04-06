import { expect, test } from '@playwright/test'
import { e2eApiBase } from './helpers/api-base'
import { describeE2e } from './helpers/describe-e2e'
import { e2eEnv } from './helpers/env'
import { loginAdminStaff } from './helpers/login'

/** Фиксированный момент: совпадает с телом POST и с ручным вводом в DatePicker. */
const FIXED_START_ISO = '2032-03-10T11:20:00.000Z'

/** Строка как у PrimeVue `dateFormat` ru (`dd.mm.yy`) + время для `showTime`. */
function primeRuDateTimeInLocalTimezone(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}.${mm}.${yy} ${hh}:${mi}`
}

describeE2e('Standalone match duplicate (UI toast)', () => {
  test.use({ timezoneId: 'UTC' })

  test('повторное создание показывает предупреждающий toast', async ({ page }) => {
    await loginAdminStaff(page, e2eEnv.adminUser, e2eEnv.adminPassword)
    const apiBase = e2eApiBase()

    await page.evaluate(
      async ({ apiBase: base, iso }) => {
        const token = localStorage.getItem('auth_token')
        const user = JSON.parse(localStorage.getItem('auth_user') || 'null') as {
          tenantId?: string
        } | null
        if (!token || !user?.tenantId) throw new Error('Нет сессии после логина')
        const tr = await fetch(
          `${base}/tenants/${user.tenantId}/teams?page=1&pageSize=100`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!tr.ok) throw new Error(`teams ${tr.status}`)
        const teamsJson = (await tr.json()) as {
          items: Array<{ id: string; slug: string | null }>
        }
        const home = teamsJson.items.find((x) => x.slug === 'e2e-ci-home')
        const away = teamsJson.items.find((x) => x.slug === 'e2e-ci-away')
        if (!home || !away) throw new Error('Нет команд e2e-ci-home / e2e-ci-away (seed:ci-playwright)')
        const res = await fetch(`${base}/tenants/${user.tenantId}/standalone-matches`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            homeTeamId: home.id,
            awayTeamId: away.id,
            startTime: iso,
          }),
        })
        if (res.status !== 201 && res.status !== 409) {
          throw new Error(`standalone create ${res.status}`)
        }
      },
      { apiBase, iso: FIXED_START_ISO },
    )

    await page.goto('/admin/matches')
    await page.getByRole('button', { name: 'Создать матч' }).click()
    const dialog = page.getByRole('dialog', { name: /Новый матч/i })
    await expect(dialog).toBeVisible()

    await dialog.locator('span[role="combobox"]').nth(0).click()
    await page.getByRole('option', { name: 'E2E Home', exact: true }).click()
    await dialog.locator('span[role="combobox"]').nth(1).click()
    await page.getByRole('option', { name: 'E2E Away', exact: true }).click()

    const str = primeRuDateTimeInLocalTimezone(new Date(FIXED_START_ISO))
    const input = page.locator('#e2e-standalone-create-start')
    await input.click()
    await input.clear()
    await input.fill(str)
    await input.press('Tab')

    await dialog.getByRole('button', { name: 'Создать' }).click()

    await expect(
      page.getByRole('alert').filter({ hasText: /Такой матч уже запланирован/i }),
    ).toBeVisible({ timeout: 20_000 })
  })
})

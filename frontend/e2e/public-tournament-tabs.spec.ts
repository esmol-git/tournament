import { expect, test } from '@playwright/test'
import { e2eEnv } from './helpers/env'
import { gotoOrSkip, requireTenantSlugOrSkip, skipIfVisible } from './helpers/public-guards'

test.describe('Public tournament tabs', () => {
  test('переключение вкладок не теряет tid и контент', async ({ page }) => {
    const slug = requireTenantSlugOrSkip()
    const basePath = `/${slug}/table`
    const url = e2eEnv.tournamentId
      ? `${basePath}?tid=${encodeURIComponent(e2eEnv.tournamentId)}`
      : basePath

    await gotoOrSkip(page, url, `Не удалось открыть ${url}; проверьте E2E_TENANT_SLUG и локальный стенд`)

    const noTournaments = page.getByRole('heading', { name: /Турниры пока не опубликованы/i })
    await skipIfVisible(noTournaments, 'Нет опубликованных турниров для проверки вкладок')

    const tabs = page
      .locator('button')
      .filter({ hasText: /^(ТАБЛИЦА|ШАХМАТКА|ПРОГРЕСС|ПЛЕЙ-ОФФ)$/i })

    const tabsCount = await tabs.count()
    expect(tabsCount).toBeGreaterThan(0)
    if (tabsCount < 2) {
      test.skip(true, 'Доступна только одна вкладка, переключение не проверить')
    }

    const initialUrl = new URL(page.url())
    const initialPathname = initialUrl.pathname
    const initialTid = initialUrl.searchParams.get('tid')

    for (let i = 0; i < tabsCount; i++) {
      const tab = tabs.nth(i)
      await expect(tab).toBeVisible()
      const label = (await tab.innerText()).trim().toUpperCase()

      await tab.click()
      await expect
        .poll(
          () => {
            const currentUrl = new URL(page.url())
            return `${currentUrl.pathname}|${currentUrl.searchParams.get('tid') ?? ''}`
          },
          { timeout: 5_000 },
        )
        .toBe(`${initialPathname}|${initialTid ?? ''}`)

      const currentUrl = new URL(page.url())
      expect(currentUrl.pathname).toBe(initialPathname)
      expect(currentUrl.searchParams.get('tid')).toBe(initialTid)

      if (label === 'ПРОГРЕСС') {
        await expect(page.getByText('Все результаты турнира по командам.').first()).toBeVisible()
      }
      if (label === 'ПЛЕЙ-ОФФ') {
        await expect(page.getByText('Матчи на вылет вынесены отдельно от группового этапа.').first()).toBeVisible()
      }
    }
  })
})

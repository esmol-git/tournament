import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import { clickAndWaitTextChange, gotoOrSkip, requireTenantSlugOrSkip, skipIfVisible } from './helpers/public-guards'

function parseCurrentPage(report: string): number | null {
  const m = report.match(/(\d+)\s*\/\s*\d+/)
  if (!m) return null
  return Number(m[1] ?? 0) || null
}

async function clickAndWaitForPaginatorReportChange(pageReport: Locator, nextBtn: Locator) {
  const before = (await pageReport.innerText()).trim()
  await nextBtn.click()
  await expect
    .poll(async () => (await pageReport.innerText()).trim(), { timeout: 5_000 })
    .not.toBe(before)
  return {
    before,
    after: (await pageReport.innerText()).trim(),
  }
}

test.describe('Public players tables', () => {
  test('participants-players: сортировка и пагинация', async ({ page }) => {
    const slug = requireTenantSlugOrSkip()
    await gotoOrSkip(page, `/${slug}/participants-players`)

    await skipIfVisible(page.getByRole('heading', { name: /Игроков пока нет/i }), 'Нет игроков для проверки таблицы участников')

    await expect(page.getByRole('heading', { name: /Реестр игроков/i })).toBeVisible()

    const sortBtn = page.getByRole('button', { name: /Сортировать по: игрок|Сортировка по: игрок/i }).first()
    await expect(sortBtn).toBeVisible()

    const { before: beforeSort, after: afterSort } = await clickAndWaitTextChange(sortBtn)
    expect(afterSort).not.toBe(beforeSort)

    const pageReport = page.locator('.p-paginator-current').first()
    if (await pageReport.isVisible().catch(() => false)) {
      const nextBtn = page.locator('.p-paginator-next').first()
      if (await nextBtn.isVisible().catch(() => false)) {
        const { before, after } = await clickAndWaitForPaginatorReportChange(pageReport, nextBtn)
        const beforePage = parseCurrentPage(before)
        const afterPage = parseCurrentPage(after)
        if (beforePage && afterPage) expect(afterPage).toBeGreaterThanOrEqual(beforePage)
      }
    }
  })

  test('scorers: сортировка и пагинация', async ({ page }) => {
    const slug = requireTenantSlugOrSkip()
    await gotoOrSkip(page, `/${slug}/scorers`)
    await skipIfVisible(
      page.getByText(/Выберите турнир в карточке выше|пока нет игроков|игроки не найдены/i).first(),
      'Недостаточно данных для проверки таблицы бомбардиров',
    )

    await expect(page.getByRole('heading', { name: /Игроки турнира/i })).toBeVisible()

    const goalsSort = page.getByRole('button', { name: /Сортировать по: голы|Сортировка по: голы/i }).first()
    await expect(goalsSort).toBeVisible()
    const { before, after } = await clickAndWaitTextChange(goalsSort)
    expect(after).not.toBe(before)

    const pageReport = page.locator('.p-paginator-current').first()
    if (await pageReport.isVisible().catch(() => false)) {
      const nextBtn = page.locator('.p-paginator-next').first()
      if (await nextBtn.isVisible().catch(() => false)) {
        const { before: beforeReport, after: afterReport } = await clickAndWaitForPaginatorReportChange(pageReport, nextBtn)
        const beforePage = parseCurrentPage(beforeReport)
        const afterPage = parseCurrentPage(afterReport)
        if (beforePage && afterPage) expect(afterPage).toBeGreaterThanOrEqual(beforePage)
      }
    }
  })
})

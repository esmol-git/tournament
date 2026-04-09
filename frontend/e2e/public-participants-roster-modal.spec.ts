import { expect, test } from '@playwright/test'
import { gotoOrSkip, requireTenantSlugOrSkip, skipIfVisible } from './helpers/public-guards'

test.describe('Public participants roster modal', () => {
  test('открытие и закрытие модалки состава', async ({ page }) => {
    const slug = requireTenantSlugOrSkip()
    await gotoOrSkip(page, `/${slug}/participants`)

    const noData = page.getByText(/Выберите турнир|пока нет команд|Не удалось загрузить состав участников/i).first()
    await skipIfVisible(noData, 'Недостаточно данных для проверки модалки состава')

    const openButtons = page.getByRole('button', { name: /Все игроки/i })
    const openCount = await openButtons.count()
    if (openCount === 0) {
      test.skip(true, 'Нет команд с кнопкой "Все игроки"')
    }

    await openButtons.first().click()

    const dialog = page.getByRole('dialog').first()
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.public-roster-dialog-player-row').first()).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})

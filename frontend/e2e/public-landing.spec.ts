import { expect, test } from '@playwright/test'

test.describe('Public landing', () => {
  test('главная: ссылка «Войти» в админку', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Войти/i })).toBeVisible()
  })
})

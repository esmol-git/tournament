import { expect, test } from '@playwright/test'
import { e2eEnv } from './helpers/env'

test.describe('Admin login: неверные данные', () => {
  test('остаёмся на /admin/login и видим role=alert', async ({ page }) => {
    await page.goto('/admin/login')
    await page.locator('#username').fill('__no_such_user_e2e__')
    await page.locator('#password').fill('wrong-pass-e2e-9')

    const tenantField = page.locator('#tenantSlug')
    if (await tenantField.isVisible().catch(() => false)) {
      await tenantField.fill(e2eEnv.tenantSlug)
    }

    await page.getByRole('button', { name: /Войти/i }).click()
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/admin\/login/)
  })
})

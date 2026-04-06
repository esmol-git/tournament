import type { Page } from '@playwright/test'
import { e2eEnv } from './env'

/**
 * Вход в админку с локального хоста (нужен slug организации, если бэкенд не вернул его по hostname).
 */
export async function loginAdminStaff(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/admin/login')
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)

  const tenantField = page.locator('#tenantSlug')
  if (await tenantField.isVisible().catch(() => false)) {
    await tenantField.fill(e2eEnv.tenantSlug)
  }

  await page.getByRole('button', { name: /Войти/i }).click()
  await page.waitForURL(/\/admin(\/|$)/, { timeout: 30_000 })
}

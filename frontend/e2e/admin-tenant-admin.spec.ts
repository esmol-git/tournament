import { expect, test } from '@playwright/test'
import { describeE2e } from './helpers/describe-e2e'
import { e2eEnv } from './helpers/env'
import { loginAdminStaff } from './helpers/login'

describeE2e('TENANT_ADMIN: турниры и черновик', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdminStaff(page, e2eEnv.adminUser, e2eEnv.adminPassword)
  })

  test('логин → список турниров → открыть диалог создания черновика', async ({ page }) => {
    await page.goto('/admin/tournaments')
    await expect(
      page.getByRole('heading', { level: 1, name: /Турниры/i }).or(page.getByRole('heading', { level: 2, name: /Пока нет турниров/i })),
    ).toBeVisible()

    await page
      .getByRole('button', { name: 'Создать турнир' })
      .or(page.getByRole('button', { name: /^Создать$/ }))
      .first()
      .click()
    await expect(page.getByRole('dialog', { name: /Создать турнир/i })).toBeVisible()
  })
})

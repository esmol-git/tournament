import { expect, test } from '@playwright/test'
import { describeE2e } from './helpers/describe-e2e'
import { e2eEnv } from './helpers/env'
import { loginAdminStaff } from './helpers/login'

describeE2e('MODERATOR: навигация без справочников', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdminStaff(page, e2eEnv.moderatorUser, e2eEnv.moderatorPassword)
  })

  test('в сайдбаре нет группы «Справочники»', async ({ page }) => {
    const nav = page.getByRole('navigation')
    await expect(nav.getByRole('button', { name: /Справочники/i })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: /Соревнования/i })).toHaveCount(0)
  })

  test('прямой заход на справочник ведёт на экран недоступности', async ({ page }) => {
    await page.goto('/admin/references/seasons')
    await expect(page).toHaveURL(/\/admin\/feature-unavailable/)
  })
})

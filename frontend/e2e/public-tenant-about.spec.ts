import { expect, test } from '@playwright/test'
import { e2eEnv } from './helpers/env'

/**
 * Публичная страница «О лиге»: резолв тенанта через API (нужен поднятый backend).
 */
test.describe('Public tenant: about', () => {
  test('заголовок страницы для slug организации', async ({ page }) => {
    const slug = e2eEnv.tenantSlug || 'default'
    await page.goto(`/${slug}/about`)
    await expect(
      page.getByRole('heading', { name: /Единая площадка турниров/i }),
    ).toBeVisible({ timeout: 25_000 })
  })
})

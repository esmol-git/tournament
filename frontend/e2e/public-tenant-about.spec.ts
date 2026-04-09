import { expect, test } from '@playwright/test'
import { gotoOrSkip, requireTenantSlugOrSkip } from './helpers/public-guards'

/**
 * Публичная страница «О лиге»: резолв тенанта через API (нужен поднятый backend).
 */
test.describe('Public tenant: about', () => {
  test('заголовок страницы для slug организации', async ({ page }) => {
    const slug = requireTenantSlugOrSkip()
    await gotoOrSkip(page, `/${slug}/about`, 'Не удалось открыть public about: проверьте E2E_TENANT_SLUG и стенд')
    await expect(
      page.getByRole('heading', { name: /Единая площадка турниров/i }),
    ).toBeVisible({ timeout: 25_000 })
  })
})

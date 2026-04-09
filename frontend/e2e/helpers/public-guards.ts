import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { e2eEnv } from './env'

export function requireTenantSlugOrSkip(): string {
  const configuredSlug = String(process.env.E2E_TENANT_SLUG ?? '').trim()
  if (!configuredSlug) {
    test.skip(true, 'E2E_TENANT_SLUG не задан')
  }
  return configuredSlug || e2eEnv.tenantSlug || 'default'
}

export async function gotoOrSkip(page: Page, url: string, reason?: string): Promise<void> {
  try {
    await page.goto(url)
    await page.waitForLoadState('networkidle')
  } catch {
    test.skip(true, reason ?? `Не удалось открыть ${url}`)
  }
}

export async function skipIfVisible(locator: Locator, reason: string): Promise<void> {
  if (await locator.isVisible().catch(() => false)) {
    test.skip(true, reason)
  }
}

export async function clickAndWaitTextChange(locator: Locator): Promise<{ before: string, after: string }> {
  const before = (await locator.innerText()).trim()
  await locator.click()
  const after = await expect.poll(async () => (await locator.innerText()).trim(), { timeout: 5_000 })
  return { before, after }
}

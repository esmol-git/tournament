import { test } from '@playwright/test'
import { e2eCredentialsConfigured } from './env'

/** Без E2E_* весь describe помечается skipped (без запуска браузера). */
export function describeE2e(title: string, fn: () => void): void {
  if (e2eCredentialsConfigured()) {
    test.describe(title, fn)
  } else {
    test.describe.skip(`${title} — задайте E2E_* (см. e2e/.env.example)`, fn)
  }
}

import { defineConfig, devices } from '@playwright/test'

/**
 * Быстрый smoke-набор публички:
 * - запускает только public-спеки
 * - удобен для локального прогона и CI pre-check
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['public-*.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})

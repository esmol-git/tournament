import { expect, test } from '@playwright/test'
import { e2eApiBase } from './helpers/api-base'
import { describeE2e } from './helpers/describe-e2e'
import { e2eEnv } from './helpers/env'

/**
 * Контракт дубликата свободного матча (как в UI при повторной отправке).
 * Команды E2E Home / E2E Away создаёт `npm run seed:ci-playwright` в backend.
 */
describeE2e('Standalone match duplicate (API)', () => {
  test('second POST with same payload returns 409 MATCH_DUPLICATE', async ({
    request,
  }) => {
    const base = e2eApiBase()
    const login = await request.post(`${base}/auth/login`, {
      data: {
        username: e2eEnv.adminUser,
        password: e2eEnv.adminPassword,
        tenantSlug: e2eEnv.tenantSlug,
      },
    })
    expect(login.ok()).toBeTruthy()
    const session = (await login.json()) as {
      accessToken: string
      user: { tenantId: string }
    }
    const token = session.accessToken
    const tenantId = session.user.tenantId

    const teamsRes = await request.get(
      `${base}/tenants/${tenantId}/teams?page=1&pageSize=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(teamsRes.ok()).toBeTruthy()
    const teamsJson = (await teamsRes.json()) as {
      items: Array<{ id: string; slug: string | null }>
    }
    const home = teamsJson.items.find((x) => x.slug === 'e2e-ci-home')
    const away = teamsJson.items.find((x) => x.slug === 'e2e-ci-away')
    expect(home).toBeTruthy()
    expect(away).toBeTruthy()

    const startTime = new Date(Date.now() + 30 * 86400000).toISOString()
    const body = {
      homeTeamId: home!.id,
      awayTeamId: away!.id,
      startTime,
    }

    const first = await request.post(
      `${base}/tenants/${tenantId}/standalone-matches`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: body,
      },
    )
    expect(first.status()).toBe(201)

    const dup = await request.post(
      `${base}/tenants/${tenantId}/standalone-matches`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: body,
      },
    )
    expect(dup.status()).toBe(409)
    const dupBody = (await dup.json()) as { code?: string }
    expect(dupBody.code).toBe('MATCH_DUPLICATE')
  })
})

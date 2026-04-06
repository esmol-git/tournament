# Приоритетные e2e / интеграционные сценарии (бэкенд)

Цель: закрыть риски **cross-tenant**, **подписка/блокировка**, **роли (модератор / SUPER_ADMIN)**.  
Запуск e2e: `npm run test:e2e` (нужны `DATABASE_URL`, `JWT_SECRET`). В `jest-e2e.json` — `maxWorkers: 1` для стабильности по БД.

## Уже есть

| Область | Файл | Что покрыто |
|--------|------|-------------|
| Турниры + tenant path | `tournaments-access.e2e-spec.ts` | 401 без токена, TOURNAMENT_ADMIN только «свой» турнир, TENANT_ADMIN в пределах тенанта, cross-tenant GET/PATCH 403, подмена `tenantId` в URL 403, USER не мутирует, 404 на несуществующий id |
| Auth, refresh, подписка / блокировка | `auth-subscription.e2e-spec.ts` | HttpOnly `tp_refresh_token` после login; refresh только с `Cookie` и пустым body; logout сбрасывает куку и отзывает refresh; login при blocked / истёкшей подписке; `GET /users/me` после смены `blocked` / `subscriptionEndsAt` → `TENANT_BLOCKED` / `SUBSCRIPTION_EXPIRED` |
| SUPER_ADMIN + tenant zone | `super-admin-zone.e2e-spec.ts` | `GET /tenants/:id/tournaments` и `GET /users/me` с JWT `SUPER_ADMIN` → **403** `INSUFFICIENT_ROLE`; `GET /platform/tenants` → **200** |
| Публичный API, MODERATOR, тариф `audit_log` | `p1-public-moderator-plan.e2e-spec.ts` | `GET /public/tenants/:slug` и `/tournaments` без JWT → **200**, в теле нет `password`; MODERATOR: список турниров **200**, справочник `age-groups` **403** `INSUFFICIENT_ROLE`, `POST …/teams` **403**; `GET …/admin-audit-log/summary`: FREE → `SUBSCRIPTION_PLAN_INSUFFICIENT`, после смены плана на `WORLD_CUP` → **200** |
| Матчи: дубли / повторный attach | `p2-matches-idempotency.e2e-spec.ts` | Повторный `POST …/standalone-matches/:id/attach` → **404**; второй `POST …/matches` с тем же телом → **409** `MATCH_DUPLICATE`; второй `POST …/standalone-matches` с тем же телом → **409** `MATCH_DUPLICATE`. |
| REFEREE и панель организатора | `referee-staff-scope.e2e-spec.ts` | `GET /tenants/:id/tournaments` с ролью REFEREE → **403** `ADMIN_STAFF_ROLE_REQUIRED`. |
| Лимит login | `throttle-login.e2e-spec.ts` | Шестой `POST /auth/login` подряд → **429**; в `beforeAll` выставляется `E2E_AUTH_THROTTLE=1` (см. `app.module.ts`), в `afterAll` сбрасывается. |

**Примечание:** под Jest throttling по умолчанию отключён (`JEST_WORKER_ID` в `skipIf`), иначе длинные auth e2e упираются в 5/мин. Для проверки лимита используется только `E2E_AUTH_THROTTLE=1` в процессе throttle-spec.

## Юнит-тесты (точечно)

- `subscription-plan-features.util.ts` — `src/auth/subscription-plan-features.util.spec.ts` (алиасы планов, фичи, лимиты).  
- `tenant-param-consistency.guard` — `src/auth/tenant-param-consistency.guard.spec.ts` (mock `ExecutionContext`).  
- Не дублировать e2e: юнит там, где логика чистая и стабильная.

## Фронт (Playwright)

- Локально: `e2e/README.md`, переменные из `e2e/.env.example`.  
- CI: job `frontend-e2e` в `quality.yml`; сид пользователей: `cd backend && npm run seed:ci-playwright` (env `PLAYWRIGHT_SEED_*`, `E2E_TENANT_SLUG`).

## Команды

```bash
cd backend
npm run test:e2e
# при необходимости только один файл:
npx jest --config ./test/jest-e2e.json test/tournaments-access.e2e-spec.ts
npx jest --config ./test/jest-e2e.json test/auth-subscription.e2e-spec.ts
npx jest --config ./test/jest-e2e.json test/super-admin-zone.e2e-spec.ts
npx jest --config ./test/jest-e2e.json test/p1-public-moderator-plan.e2e-spec.ts
npx jest --config ./test/jest-e2e.json test/p2-matches-idempotency.e2e-spec.ts
npx jest --config ./test/jest-e2e.json test/throttle-login.e2e-spec.ts
npx jest --config ./test/jest-e2e.json test/referee-staff-scope.e2e-spec.ts
```

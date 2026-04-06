# Тестирование (кратко)

## Бэкенд (NestJS)

| Команда | Назначение |
|--------|------------|
| `cd backend && npm test` | Юнит-тесты (`src/**/*.spec.ts`) |
| `cd backend && npm run test:e2e` | Интеграционные e2e против БД (`test/*.e2e-spec.ts`) |

E2e требуют `DATABASE_URL` и `JWT_SECRET`. В `test/jest-e2e.json` задано `maxWorkers: 1`, чтобы снизить гонки по одной БД.

### Throttling в e2e

- Обычные e2e отключают лимиты при наличии `JEST_WORKER_ID` (см. `app.module.ts`).
- Проверка **429** на `/auth/login`: `test/throttle-login.e2e-spec.ts` и переменная **`E2E_AUTH_THROTTLE=1`** в этом процессе.

### Redis (`USE_REDIS_THROTTLE`)

В **CI** (job `backend` в `quality.yml`) для шага **E2E** поднимается сервис Redis и задаются `USE_REDIS_THROTTLE=1` и `REDIS_URL`, чтобы `throttle-login.e2e-spec.ts` шёл через Redis storage (как на стенде с Redis). Локально без Redis оставьте переменную выключенной; юнит-тесты в CI не задают `USE_REDIS_THROTTLE`.

## Фронтенд (Nuxt + Playwright)

| Команда | Назначение |
|--------|------------|
| `cd frontend && npm run test:unit` | Vitest |
| `cd frontend && npm run test:e2e` | Playwright (`e2e/*.spec.ts`) |

Локально: поднять API и фронт, переменные из `frontend/e2e/.env.example` → `e2e/.env`, см. `frontend/e2e/README.md`.

Ошибка **`MATCH_DUPLICATE`** (409) при создании свободного матча (раздел **«Матчи»**, **календарь**) или матча в турнире (страница турнира) показывается отдельным toast (предупреждение + текст с API).

### CI

Workflow **`.github/workflows/quality.yml`**: job **`backend`** — Postgres + Redis, для шага e2e задаются `USE_REDIS_THROTTLE=1` и `REDIS_URL`; job **`frontend-e2e`** — те же Postgres и Redis, API в шаге **Start API** стартует с теми же переменными (как на стенде с Redis), затем Nuxt preview и Playwright (в т.ч. **`MATCH_DUPLICATE`**: API `e2e/admin-standalone-match-duplicate.spec.ts`, UI-toast `e2e/admin-standalone-match-duplicate-ui.spec.ts`). При падении шага прикладываются артефакты `api.log` / `nuxt.log`.

## Сводка сценариев бэкенда

Подробная таблица: `backend/test/PRIORITY_SCENARIOS.md`.

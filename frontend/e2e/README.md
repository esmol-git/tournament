# E2E (Playwright)

Сценарии:

1. **Публичная главная** (`public-landing.spec.ts`) — `/`, ссылка «Войти» (без `E2E_*`).
2. **Публичный tenant** (`public-tenant-about.spec.ts`) — `/{slug}/about`, нужен API (в CI — тот же стек, что и остальные e2e).
3. **Неверный логин** (`admin-login-wrong-password.spec.ts`) — `role=alert`, остаёмся на `/admin/login` (без полного набора учёток модератора).
4. **TENANT_ADMIN** — вход → `/admin/tournaments` → кнопка «Создать» → диалог «Создать турнир».
5. **MODERATOR** — в сайдбаре нет «Справочники»; прямой URL `/admin/references/seasons` → редирект на `feature-unavailable`.
6. **Дубликат свободного матча (API)** (`admin-standalone-match-duplicate.spec.ts`) — логин по API, два одинаковых `POST …/standalone-matches` → второй ответ **409** `MATCH_DUPLICATE` (нужны команды **E2E Home** / **E2E Away** из `seed:ci-playwright`). Браузер не обязателен; задайте `NUXT_PUBLIC_API_BASE` (см. `e2e/.env.example`).
7. **Дубликат свободного матча (UI toast)** (`admin-standalone-match-duplicate-ui.spec.ts`) — логин в админку, через `fetch` в странице создаётся первый матч, затем в диалоге «Новый матч» повторная отправка с тем же временем; ожидается toast «Такой матч уже запланирован». Таймзона теста **UTC** (как в CI), чтобы строка даты совпадала с `dd.mm.yy` PrimeVue.

## Подготовка

1. Поднять API и БД, завести две учётки в одной организации: админ тенанта и пользователь с ролью `MODERATOR`.
2. `cp e2e/.env.example e2e/.env` и заполнить пароли.
3. `npm run dev` (или `NUXT_PUBLIC_API_BASE=...` указывает на ваш API).
4. Установить браузер: `npx playwright install chromium`

## Запуск

Из каталога `frontend/`:

```bash
set -a && source e2e/.env && set +a && npm run test:e2e
```

Или вручную экспортировать переменные `E2E_*`.

Без полного набора `E2E_*` сценарии с `describeE2e` помечаются **skipped**; лендинг, публичный `about`, неверный логин и тесты с API запускаются при поднятом бэкенде.

Интерактивно: `npm run test:e2e:ui`

## CI

В `.github/workflows/quality.yml` job **`frontend-e2e`**: Postgres и **Redis**; миграции, `npm run seed:ci-playwright` в `backend/`, API (`start:prod`) со **`USE_REDIS_THROTTLE=1`** и **`REDIS_URL`** (как на стенде с Redis-throttler), сборка Nuxt с `NUXT_PUBLIC_API_BASE`, `nuxt preview`, затем `npm run test:e2e`. Учётки и пароли задаются env в workflow (тестовые значения, не секреты реального стенда).

Локально для полного паритета с CI можно поднять Redis и задать в `.env` API те же переменные (см. `backend/.env.example`).

# Catalogs Status

This file fixes the current catalog baseline and prevents adding "checkbox" catalogs
without real usage in the product.

## Status Legend

- `active` - used in business flows (admin + backend checks and/or public pages)
- `standby` - CRUD exists, but core flow usage is partial
- `deprecated` - hidden from navigation, kept only for compatibility/migration

## Current Matrix

| Catalog | Admin CRUD | Used in Admin Flows | Used in Backend Logic | Used in Public | Status |
|---|---|---|---|---|---|
| Competitions | yes | Tournament create/edit/filter | Tournament validation & filters | Tournament details | active |
| Seasons | yes | Tournament create/edit/filter | Tournament validation & filters | Tournament details | active |
| Age Groups | yes | Team + Tournament assignment/filter | Team/Tournament compatibility checks | Tournament details | active |
| Regions | yes | Team + Stadium forms/filters | Team/Stadium validation | - | active |
| Stadiums | yes | Tournament assignment | Tournament validation | Tournament details | active |
| Referee Categories | yes | Referee forms | Referee validation | - | active |
| Referee Positions | yes | Referee forms | Referee validation | - | active |
| Referees | yes | Tournament referee assignment | Tournament validation | Tournament details | active |
| Protocol Event Types | yes | Match protocol editor | Match protocol strict validation | - | active |
| Match Schedule Reasons | yes | Match postpone/cancel flows | Scope validation by action | - | active |
| Reference Documents | yes | Admin documents page | Public tournament documents API | Public tournament/table + documents page | active |
| Management Members | yes | Admin management page | Public management API | Public about page | active |
| Team Categories | yes | Standalone CRUD page only | Not connected to effective team/player constraints | - | deprecated |

## Catalog Governance Rules

Any new catalog must satisfy all rules before being added to navigation:

1. At least one concrete admin flow consumes it (not only CRUD page).
2. At least one backend validation/business rule uses it.
3. It has a public/read model if related to public-facing sections.
4. It has a clear owner domain (teams/tournaments/matches/public-site).

If a catalog does not meet the rules, keep it out of navigation and mark as `standby`.

Идеи по расширению продукта и технике

Кэш и повторные запросы: сейчас много прямых authFetch из страниц. Для списков и справочников уместны TanStack Query или обёртка на useAsyncData с ключами и staleTime, чтобы не дублировать запросы при навигации между вкладками админки.

Состояние «загрузка / пусто / ошибка»: общий компонент или composable (`useAsyncState`) для таблиц и карточек — единый UX (частично уже используется на отдельных экранах).

Модератор read-only (глобальный MODERATOR организации) — **сделано**: реестр путей и разрешение через `route.meta` в `frontend/constants/adminModeratorOrgPolicy.ts`; composables `useGlobalModeratorReadOnly`, `useAdminOrgModeratorReadOnly` (команды/игроки/список турниров), `useAdminGlobalModeratorTournamentPolicy` (карточка турнира); роль из сессии — `frontend/utils/tenantStaffRole.ts`; на всех страницах с `layout: 'admin'` задан `definePageMeta.adminOrgModeratorReadOnly`; middleware по-прежнему отсекает запрещённые разделы; в CI — `npm run check:admin-moderator-meta` и `typecheck` (`.github/workflows/quality.yml`).

Доступность (тяжёлые диалоги) — **частично сделано**: `block-scroll` + стартовый фокус через `autofocus` в `pt` (совместимо с встроенным `focus()` у PrimeVue `Dialog`); в `AdminMatchProtocolDialog.vue` — `aria-describedby` на корне диалога (сводка матча), связки `label`/`inputId` для счёта, доп. времени, пенальти, даты/времени, статуса, причин переноса/отмены; подсказки для доп. времени и пенальти через `aria-describedby` на полях; ошибки валидации событий и отмены — `role="alert"` + связь с комбобоксом; пресеты/минуты/`aria-pressed` у выбора команды события; `type="button"` у кнопок в теле. `AdminConfirmDialog` / `AdminLogoutDialog` — `block-scroll`, `aria-describedby` для текста, `type="button"`. `AdminTournamentListDeleteDialog` — то же для текста удаления/архива. `AdminMarkdownEditor` — `block-scroll` + `draggable=false` у диалогов ссылки/картинки. Админка: `users.vue` (форма пользователя), `players.vue` (импорт + форма игрока) — `block-scroll`, `label`/`id`/`input-id`, ошибки с `role="alert"` и `aria-describedby` где уместно. Справочники `admin/references/*.vue` — у всех `Dialog`: `block-scroll`; в футерах и у кнопок «Отмена»/«Сохранить» в формах — `type="button"`. `news-tags`: `v-model:visible` вместо неверного присваивания в `@update:visible`. `matches.vue`, `calendar.vue`, `audit-log.vue` (детали и статистика), `platform/tenants.vue` (переименование, подписка, список пользователей) — у `Dialog` добавлен `block-scroll`; у кнопок в футерах форм матчей/календаря и платформенных диалогов — `type="button"`. Дальше — при желании единые `input-id`/`for` по полям этих форм и кастомные оверлеи.

Наблюдаемость (клиентские ошибки API) — **сделано, блок закрыт**: `frontend/utils/apiClientErrorLog.ts` + `stores/auth.ts` (авторизованные запросы) + `app/plugins/api-fetch-observability.client.ts` (публичный `$fetch` к `apiBase` без `Authorization`, без дубля для `/auth/refresh`). Консоль: `[api-client-error]` + JSON `{ op, method, path, status, code, tenant }`; опционально `window.__TP_REPORT_API_ERROR__(payload)` для Sentry/своего бэкенда (`frontend/types/window-api-report.d.ts`).

E2E (Playwright) — **базовые сценарии в репозитории**: `frontend/e2e/`, `playwright.config.ts`, `npm run test:e2e` / `test:e2e:ui`, переменные из `frontend/e2e/.env.example` → `e2e/.env` (локально: поднятый API + фронт, две учётки и при необходимости `NUXT_PUBLIC_API_BASE`). Без полного набора `E2E_*` сценарии с `describeE2e` **skipped**. **CI**: `.github/workflows/quality.yml`, job **`frontend-e2e`** — Postgres, Redis, миграции, `backend` `npm run seed:ci-playwright` (в т.ч. команды E2E Home/Away для сценариев дубликата матча), поднятый API с `USE_REDIS_THROTTLE`, сборка Nuxt, `nuxt preview`, Playwright. Подробнее: `docs/TESTING.md`, `frontend/e2e/README.md`.
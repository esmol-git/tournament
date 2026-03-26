# Tournament Platform

Монорепозиторий: **backend** (NestJS) и **frontend** (Nuxt 4).

## Быстрый старт

1. Backend: см. [`backend/README.md`](backend/README.md)
2. Frontend: см. [`frontend/README.md`](frontend/README.md) — переменная **`NUXT_PUBLIC_API_BASE`** должна указывать на API (по умолчанию `http://localhost:4000`).

## Прод деплой

- Регламент и структура сервера: [`docs/backend-deploy-runbook.md`](docs/backend-deploy-runbook.md)
- API workflow: [`.github/workflows/deploy-backend.yml`](.github/workflows/deploy-backend.yml)
- Frontend workflow: [`.github/workflows/deploy-frontend.yml`](.github/workflows/deploy-frontend.yml)

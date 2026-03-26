# Deploy Runbook (API + Frontend)

Этот регламент убирает путаницу с несколькими репозиториями и ручным деплоем.

## 1) Один репозиторий

- Основной репозиторий: `https://github.com/esmol-git/tournament`.
- Репозиторий `https://github.com/esmol-git/backend.git` пометить deprecated и не использовать для прод-выкатки.

## 2) Целевая структура на сервере

```text
/opt/tournament/
  api/
    shared/.env
    current -> /opt/tournament/api/releases/<timestamp>
    releases/<timestamp>/
  frontend/
    shared/.env
    current -> /opt/tournament/frontend/releases/<timestamp>
    releases/<timestamp>/
```

- В `shared/.env` живут постоянные переменные окружения.
- Каждый деплой создает новый каталог в `releases`.
- Симлинк `current` переключается на новую версию.

## 3) One-time подготовка сервера

```bash
sudo mkdir -p /opt/tournament/api/{releases,shared}
sudo mkdir -p /opt/tournament/frontend/{releases,shared}
sudo chown -R $USER:$USER /opt/tournament
cp /var/www/tournament-platform1/backend/.env /opt/tournament/api/shared/.env
cp /var/www/tournament-platform1/frontend/.env /opt/tournament/frontend/shared/.env
```

Проверь, что установлен `pm2` и Node.js 20+.

## 4) Очистить текущую путаницу в PM2

Оставь один backend-процесс (`api`) и один frontend-процесс (`frontend`).

```bash
pm2 list
pm2 delete tournament-backend || true
pm2 delete api || true
pm2 start /var/www/tournament-platform1/backend/dist/main.js --name api
pm2 save
```

Если backend будет запускаться из `/opt/tournament/api/current`, после первого CI-деплоя перезапусти:

```bash
pm2 delete api
pm2 start /opt/tournament/api/current/dist/main.js --name api
pm2 save
```

## 5) GitHub Secrets для автодеплоя

В репозитории `tournament-platform1` добавь secrets:

- `DEPLOY_HOST` - IP или домен сервера
- `DEPLOY_USER` - SSH user
- `DEPLOY_SSH_KEY` - приватный ключ для этого user
- `DEPLOY_PORT` - SSH порт (опционально; если не задан, используется `22`)

Workflows:

- `.github/workflows/deploy-backend.yml`
- `.github/workflows/deploy-frontend.yml`

## 6) Как работает деплой

При пуше в `main`:

1. Изменения в `backend/**` запускают backend workflow.
2. Изменения в `frontend/**` запускают frontend workflow.
3. GitHub Actions собирает проекты и формирует архивы релизов.
4. Архивы копируются на сервер.
5. На сервере:
   - распаковывает релиз в новый каталог,
   - подключает `shared/.env`,
   - для API ставит `prod`-зависимости и запускает `prisma migrate deploy` (если есть `prisma/schema.prisma`),
   - переключает `current`,
   - перезапускает `pm2` процесс (`api` или `frontend`).

## 7) Ручной fallback деплой API

Если CI временно недоступен:

```bash
bash scripts/deploy-backend-server.sh /tmp/tournament-backend-release.tgz
```

Перед этим скопируй архив релиза на сервер в `/tmp/tournament-backend-release.tgz`.

## 8) Проверка после выката

```bash
pm2 list
pm2 logs api --lines 100
pm2 logs frontend --lines 100
curl -I https://tournament-platform.ru
curl -I https://api.tournament-platform.ru/api
```

Если есть health endpoint, добавь отдельную проверку в чеклист.

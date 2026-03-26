# Backend Deploy Runbook

Этот регламент убирает путаницу с несколькими репозиториями и ручным деплоем.

## 1) Один репозиторий

- Основной репозиторий: `https://github.com/esmol-git/tournament-platform1`.
- Репозиторий `https://github.com/esmol-git/backend.git` пометить deprecated и не использовать для прод-выкатки.

## 2) Целевая структура на сервере

```text
/opt/tournament/backend/
  shared/.env
  current -> /opt/tournament/backend/releases/<timestamp>
  releases/<timestamp>/
```

- В `shared/.env` живут постоянные переменные окружения.
- Каждый деплой создает новый каталог в `releases`.
- Симлинк `current` переключается на новую версию.

## 3) One-time подготовка сервера

```bash
sudo mkdir -p /opt/tournament/backend/{releases,shared}
sudo chown -R $USER:$USER /opt/tournament
cp /var/www/tournament-platform1/backend/.env /opt/tournament/backend/shared/.env
```

Проверь, что установлен `pm2` и Node.js 20+.

## 4) Очистить текущую путаницу в PM2

Оставь один backend-процесс (`tournament-backend`) и один frontend-процесс.

```bash
pm2 list
pm2 delete api || true
pm2 delete tournament-backend || true
pm2 start /var/www/tournament-platform1/backend/dist/main.js --name tournament-backend
pm2 save
```

Если backend будет запускаться из `/opt/tournament/backend/current`, после первого CI-деплоя перезапусти:

```bash
pm2 delete tournament-backend
pm2 start /opt/tournament/backend/current/dist/main.js --name tournament-backend
pm2 save
```

## 5) GitHub Secrets для автодеплоя

В репозитории `tournament-platform1` добавь secrets:

- `DEPLOY_HOST` - IP или домен сервера
- `DEPLOY_USER` - SSH user
- `DEPLOY_SSH_KEY` - приватный ключ для этого user
- `DEPLOY_PORT` - SSH порт (опционально; если не задан, используется `22`)

Workflow: `.github/workflows/deploy-backend.yml`

## 6) Как работает деплой

При пуше в `main` с изменениями в `backend/**`:

1. GitHub Actions собирает backend (`npm ci --include=dev`, `npm run build`).
2. Формирует архив релиза (`dist`, `package.json`, `package-lock.json`, опционально `prisma`).
3. Копирует архив на сервер.
4. На сервере:
   - распаковывает релиз в новый каталог,
   - подключает `shared/.env`,
   - ставит `prod`-зависимости,
   - запускает `prisma migrate deploy` (если есть `prisma/schema.prisma`),
   - переключает `current`,
   - перезапускает `pm2 tournament-backend`.

## 7) Ручной fallback деплой

Если CI временно недоступен:

```bash
bash scripts/deploy-backend-server.sh /tmp/tournament-backend-release.tgz
```

Перед этим скопируй архив релиза на сервер в `/tmp/tournament-backend-release.tgz`.

## 8) Проверка после выката

```bash
pm2 list
pm2 logs tournament-backend --lines 100
curl -I https://api.tournament-platform.ru/api
```

Если есть health endpoint, добавь отдельную проверку в чеклист.

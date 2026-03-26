# Ops Runbook (short)

Короткий регламент ежедневной работы с продом.

## 1) Деплой

- Изменяешь код локально.
- Делаешь `git push origin main`.
- GitHub Actions автоматически деплоит:
  - `backend/**` -> `Deploy backend`
  - `frontend/**` -> `Deploy frontend`

## 2) Быстрая проверка

```bash
pm2 list
pm2 logs api --lines 80
pm2 logs frontend --lines 80
curl -I https://tournament-platform.ru
curl -I https://api.tournament-platform.ru/api
```

## 3) Если деплой упал

1. Открыть GitHub Actions и посмотреть красный step.
2. Проверить secrets:
   - `DEPLOY_HOST`
   - `DEPLOY_USER`
   - `DEPLOY_SSH_KEY`
   - `DEPLOY_PORT`
3. Проверить env на сервере:
   - `/opt/tournament/api/shared/.env`
   - `/opt/tournament/frontend/shared/.env`

## 4) Rollback за 1 минуту

```bash
# API
ls -1dt /opt/tournament/api/releases/* | head
ln -sfn /opt/tournament/api/releases/<PREVIOUS_RELEASE> /opt/tournament/api/current
pm2 restart api

# Frontend
ls -1dt /opt/tournament/frontend/releases/* | head
ln -sfn /opt/tournament/frontend/releases/<PREVIOUS_RELEASE> /opt/tournament/frontend/current
pm2 restart frontend
```

## 5) Еженедельная гигиена

```bash
pm2 list
df -h
```

Если заканчивается диск, удалить старые релизы, оставив последние 5-10.

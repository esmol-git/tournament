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

## 2.1) Пост-деплой: проверить, что релиз реально встал

1. Открыть run в GitHub Actions (`Deploy backend` / `Deploy frontend`) и посмотреть **Summary**:
   - `Result: ✅ success`
   - `Rollback: ❌ not needed`
   - `Active release: /opt/tournament/.../releases/<STAMP>`
2. Если в Summary есть `Rollback: ✅ performed`, считать релиз неуспешным:
   - новая версия не поднялась;
   - активной осталась предыдущая версия (`Active release` в Summary).
3. На сервере подтвердить состояние (опционально):

```bash
readlink -f /opt/tournament/api/current
readlink -f /opt/tournament/frontend/current
curl -f http://127.0.0.1:4000/api
curl -f http://127.0.0.1:3000/
```

## 2.2) Обязательный smoke-check логина (после каждого релиза)

Проверяем два критичных сценария авторизации:

1. **Platform login (SUPER_ADMIN):**
   - открыть `https://tournament-platform.ru/platform/login`;
   - выполнить вход под `platform_admin`;
   - убедиться, что вход успешен и нет `INVALID_CREDENTIALS`.

2. **Tenant admin login:**
   - открыть `https://<tenant>.tournament-platform.ru/admin/login`;
   - выполнить вход под админом организации;
   - убедиться, что грузятся базовые страницы (`/admin`, список команд/игроков).

Если любой шаг не проходит:
- релиз считать неуспешным;
- проверить Summary в GitHub Actions (`Rollback`, `Active release`);
- при необходимости выполнить recovery из раздела `9) Recovery SUPER_ADMIN`.

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

## 6) Откат, Git и теги

**Что уже есть.** Деплой складывает каждый выклад в каталог `releases/<штамп-времени>/`, а рабочая версия — symlink `current` (см. §4). Скрипты в workflow после деплоя **оставляют на диске только последние 5 релизов** для API и фронта — откат возможен только на одну из этих пяти. Если нужна более длинная «глубина», увеличьте число сохраняемых релизов в workflow (строка с `sed` после `ls -1dt …/releases/*`) или перенесите чистку в редкий cron.

**Связать релиз с коммитом.** Сейчас имя каталога — время, не SHA. Удобный порядок работы:

- В **GitHub Actions** у упавшего/успешного run открыть **Commit** — это точный исходный коммит деплоя.
- По желанию договориться о **лёгких тегах** на `main` после проверенного выката: `v2026.04.06` или `release-2026-04-06` — не обязательны для symlink-отката, но помогают людям и релиз-нотам. Тег не восстанавливает сервер сам: либо §4 (старый каталог в `releases/`), либо новый деплой с нужного коммита.

**Если нужного артефакта уже нет на сервере** (стёрт чисткой или прошло >5 деплоев):

- Сделать **`git revert`** проблемных коммитов на `main` и push — сработает обычный CI-деплой.
- Либо вручную на сервере собрать/распаковать архив с нужного коммита (или добавить в workflow **`workflow_dispatch`** с input `ref` и `actions/checkout` на этот ref — тогда «перекат» без revert в истории).

**База данных.** Откат **кода** через `current` **не откатывает схему БД**: `prisma migrate deploy` уже мог применить миграции. Стратегии: (1) починить баг новым коммитом поверх текущей схемы; (2) если критично — заранее продуманный **down**-миграция или бэкап + восстановление (это отдельная процедура, не symlink).

## 7) Если сервер погиб — что остаётся в Git

**В Git / на GitHub есть только исходный код** (и история коммитов). Папки `releases/…` на диске — это **артефакты деплоя**; в репозиторий они не коммитятся и при потере диска **исчезают вместе с сервером**.

**Не живёт в Git (нужны отдельные меры):**

- **PostgreSQL** — данные и пользователи; без **регулярных бэкапов** (dump, снапшот, managed-автобэкап) восстановить нельзя.
- **`shared/.env`** и прочие секреты — хранить **копию вне сервера** (менеджер паролей, GitHub Secrets только для CI — на проде свой набор).
- **Загрузки (S3 / MinIO)** — в Git их нет; нужны **бэкап бакета** или репликация.

**Восстановление с нуля:** новый VPS, снова настроить nginx/pm2/pути как в runbook деплоя, **восстановить БД из бэкапа**, положить `.env`, затем **push в `main` или ручной запуск Deploy** — CI соберёт новые каталоги в `releases/`. Старые штампы на диске не вернуться, но **версия кода** снова будет из Git.

## 8) Отладка через консоль (создание команд/игроков)

На сервере можно быстро создавать тестовые сущности через API без UI.
Скрипт лежит в репозитории: `scripts/server/debug-api.sh` (если на сервере нет клона репо — скопируйте файл один раз через `scp`).

```bash
cd <path-to-repo>
export API_BASE=https://api.tournament-platform.ru
export TENANT_SLUG=<tenant-slug>
export USERNAME=<tenant-admin-username>
export PASSWORD=<tenant-admin-password>

# 1) Логин (токен сохранится в /tmp/tp-debug-api-token)
./scripts/server/debug-api.sh login

# 2) Быстро создать команду + игрока + привязку
./scripts/server/debug-api.sh seed \
  --team-name "Debug Team" \
  --team-slug "debug-team-01" \
  --first-name "Ivan" \
  --last-name "Ivanov" \
  --jersey 10
```

Отдельные команды:

```bash
./scripts/server/debug-api.sh list-teams
./scripts/server/debug-api.sh list-players
./scripts/server/debug-api.sh list-teams --json
./scripts/server/debug-api.sh list-players --json
./scripts/server/debug-api.sh create-team "Debug Team 2" "debug-team-02"
./scripts/server/debug-api.sh create-player "Petr" "Petrov"
./scripts/server/debug-api.sh attach-player <teamId> <playerId> 11
./scripts/server/debug-api.sh delete-team <teamId>
./scripts/server/debug-api.sh delete-player <playerId>

# удалить последние сущности, созданные через seed
./scripts/server/debug-api.sh cleanup-seed
```

## 9) Recovery SUPER_ADMIN

Если вход в `/platform/login` не проходит с ошибкой `INVALID_CREDENTIALS`, восстановите пользователя штатным скриптом backend.

```bash
cd /opt/tournament/api/current
set -a
source /opt/tournament/api/shared/.env
set +a

# при необходимости задайте новый пароль
export SUPER_ADMIN_PASSWORD='NewStrongPassword123!'

# создать/обновить SUPER_ADMIN
node dist/scripts/bootstrap-super-admin.js
```

Ожидаемый результат:
- `Updated SUPER_ADMIN user: platform_admin` или
- `Created SUPER_ADMIN user: platform_admin`

Проверка входа:

```bash
curl -sS -X POST "https://api.tournament-platform.ru/auth/platform/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"platform_admin","password":"NewStrongPassword123!"}'
```

Должен вернуться `accessToken`. В UI входить через `https://tournament-platform.ru/platform/login`.

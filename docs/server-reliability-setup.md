# Server reliability setup (backup + monitoring)

Пошаговая настройка бэкапов БД и health-check на сервере.

## 1) Скопировать скрипты на сервер

```bash
sudo mkdir -p /opt/tournament/ops
sudo cp scripts/server/backup-db.sh /opt/tournament/ops/backup-db.sh
sudo cp scripts/server/healthcheck.sh /opt/tournament/ops/healthcheck.sh
sudo chmod +x /opt/tournament/ops/*.sh
```

## 2) Установить зависимости на сервере

```bash
sudo apt update
sudo apt install -y postgresql-client curl
```

## 3) Настроить Telegram alerts (опционально)

Если нужны уведомления, создайте бота и chat id, затем добавьте env-переменные в cron:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## 4) Добавить cron для backup и healthcheck

Открыть cron:

```bash
crontab -e
```

Добавить:

```cron
# DB backup каждый день в 03:10
10 3 * * * BACKUP_DIR=/var/backups/tournament/db RETENTION_DAYS=14 API_ENV_FILE=/opt/tournament/api/shared/.env /opt/tournament/ops/backup-db.sh >> /var/log/tournament-backup.log 2>&1

# Healthcheck каждые 5 минут
*/5 * * * * FRONT_URL=https://tournament-platform.ru API_URL=https://api.tournament-platform.ru/api PM2_API_NAME=api PM2_FRONTEND_NAME=frontend /opt/tournament/ops/healthcheck.sh >> /var/log/tournament-healthcheck.log 2>&1
```

Если нужен Telegram, добавьте префикс переменных к команде:

```cron
TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=yyy ...
```

## 5) Проверить руками

```bash
BACKUP_DIR=/var/backups/tournament/db API_ENV_FILE=/opt/tournament/api/shared/.env /opt/tournament/ops/backup-db.sh
FRONT_URL=https://tournament-platform.ru API_URL=https://api.tournament-platform.ru/api /opt/tournament/ops/healthcheck.sh
```

## 6) Проверить лог-файлы

```bash
tail -n 100 /var/log/tournament-backup.log
tail -n 100 /var/log/tournament-healthcheck.log
```

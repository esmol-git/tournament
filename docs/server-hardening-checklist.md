# Server hardening checklist

Минимальный baseline для прод-сервера `tournament`.

## 1) SSH и доступ

- Отключить вход по паролю (`PasswordAuthentication no`).
- Отключить root login по паролю (`PermitRootLogin prohibit-password`).
- Использовать отдельного deploy-user с sudo (не root для CI).
- Включить `fail2ban`.

## 2) Firewall

- Включить `ufw`.
- Разрешить только:
  - `22/tcp` (или ваш SSH порт),
  - `80/tcp`,
  - `443/tcp`.
- Закрыть внешние порты БД/Redis/MinIO console.

## 3) Процессы и автоподнятие

- `pm2 save` после изменений.
- `pm2 startup` подключен к systemd.
- Процессы только:
  - `api`
  - `frontend`

## 4) Бэкапы

- Ежедневный backup PostgreSQL.
- Ротация 14 дней (минимум).
- Копия бэкапа во внешнее хранилище.
- Тест восстановления 1 раз в неделю.

## 5) Мониторинг и алерты

- Healthcheck на `frontend` и `api` каждые 5 минут.
- Алерты в Telegram при сбое.
- Проверка диска/памяти и срока TLS сертификата.

## 6) Redis (если включаем)

- Bind только localhost или private network.
- Установить пароль (`requirepass`), если доступ не только через localhost.
- Не открывать Redis в интернет.
- Для текущего стека использовать Redis для throttling/cache.

## 7) Релизы и откаты

- Деплой только через GitHub Actions.
- Хранить последние 5-10 релизов.
- Rollback через переключение `current` symlink + `pm2 restart`.

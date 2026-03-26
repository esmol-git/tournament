# Шпаргалка: сервер, БД, TLS, фронт

Команды для продакшена на VPS (пути примерные: `/var/www/tournament-platform1`). Подставьте свои каталоги и имена процессов PM2.

---

## 1. Переменные окружения backend

**Зачем:** подгрузить `DATABASE_URL` и остальное из `.env` в текущую shell-сессию перед `psql` или скриптами.

```bash
cd /var/www/tournament-platform1/backend
set -a && source .env && set +a
```

---

## 2. PostgreSQL через `psql`

**Зачем:** Prisma часто задаёт `DATABASE_URL` с хвостом `?schema=public`. Стандартный `psql` такой URI не принимает — отрезаем всё после `?`.

**Интерактивная консоль:**

```bash
psql "${DATABASE_URL%%\?*}"
```

**Список тенантов:**

```bash
psql "${DATABASE_URL%%\?*}" -c 'SELECT id, slug, name, blocked FROM "Tenant" ORDER BY slug;'
```

**Пользователи с привязкой к тенанту:**

```bash
psql "${DATABASE_URL%%\?*}" -c 'SELECT u.username, u.email, u.role, t.slug AS tenant_slug FROM "User" u JOIN "Tenant" t ON u."tenantId" = t.id ORDER BY t.slug, u.username;'
```

**Сводные счётчики (пустая ли БД «по смыслу»):**

```bash
psql "${DATABASE_URL%%\?*}" -c "SELECT (SELECT COUNT(*) FROM \"Tenant\") AS tenants, (SELECT COUNT(*) FROM \"User\") AS users, (SELECT COUNT(*) FROM \"Tournament\") AS tournaments;"
```

**Если нет клиента:** `sudo apt-get install -y postgresql-client`

---

## 3. Первый супер-администратор (bootstrap)

**Зачем:** создать/обновить тенант и пользователя с ролью SUPER_ADMIN по переменным `SUPER_ADMIN_*` в `.env`.

```bash
cd /var/www/tournament-platform1/backend
set -a && source .env && set +a
npm run bootstrap:super-admin
```

Пароль в env должен быть не короче 8 символов. Slug тенанта по умолчанию нормализуется до `platform`, если не задан `SUPER_ADMIN_TENANT_SLUG`.

---

## 4. Let’s Encrypt (Certbot)

**Зачем:** выпустить или **расширить** сертификат, добавив новый поддомен (например `impuls`).

```bash
sudo certbot certonly --nginx \
  -d tournament-platform.ru \
  -d www.tournament-platform.ru \
  -d api.tournament-platform.ru \
  -d impuls.tournament-platform.ru
```

Если Certbot спросит про существующий сертификат — **Expand (E)**, чтобы один `fullchain.pem` покрывал все перечисленные имена.

**Wildcard** (опционально, через DNS-01; нужна TXT-запись `_acme-challenge`):

```bash
sudo certbot certonly --manual --preferred-challenges dns \
  -d tournament-platform.ru \
  -d '*.tournament-platform.ru'
```

Проверка TXT перед нажатием Enter в Certbot:

```bash
dig +short TXT _acme-challenge.tournament-platform.ru
```

---

## 5. Проверка TLS и заголовков

**Зачем:** убедиться, что на хост отдаётся нужный сертификат (SAN) и что ответ идёт по HTTPS.

**SAN и срок действия сертификата:**

```bash
echo | openssl s_client -connect impuls.tournament-platform.ru:443 \
  -servername impuls.tournament-platform.ru 2>/dev/null \
  | openssl x509 -noout -subject -dates -ext subjectAltName
```

**Первые строки HTTP-ответа (Nuxt/nginx):**

```bash
curl -sI https://impuls.tournament-platform.ru/ | head -20
```

**HSTS (после настройки Nginx):**

```bash
curl -sI https://impuls.tournament-platform.ru/ | grep -i strict-transport
```

---

## 6. Nginx: найти конфиг, править, перезагрузить

**Зачем:** правки прокси, SSL, `add_header` для HSTS делаются только в конфиге, не в bash.

**Найти файл с wildcard-поддоменом:**

```bash
sudo grep -rl '\*\.tournament-platform\.ru' /etc/nginx/
```

**Список включённых сайтов:**

```bash
ls -la /etc/nginx/sites-enabled/
```

**Редактирование (пример пути):**

```bash
sudo nano /etc/nginx/sites-available/tournament-platform
```

**Проверка синтаксиса и мягкая перезагрузка:**

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**Сводка по 443 и сертификатам из активной конфигурации:**

```bash
sudo nginx -T 2>/dev/null | grep -E 'listen .*443|ssl_certificate|server_name' | head -40
```

**HSTS внутри каждого `server { listen 443 ssl; ... }` (пример директивы):**

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

`add_header` не вводится в терминале — только в файле конфигурации Nginx.

---

## 7. Фронтенд: API URL, сборка, PM2

**Зачем:** `NUXT_PUBLIC_API_BASE` вшивается в клиентский бундл **при сборке**. Значение `http://localhost:4000` на проде даёт mixed content и «Не защищено» в браузере.

**Проверить текущее значение:**

```bash
grep NUXT_PUBLIC_API_BASE /var/www/tournament-platform1/frontend/.env
```

**Ожидаемо на проде:**

```env
NUXT_PUBLIC_API_BASE=https://api.tournament-platform.ru
```

**Сборка после смены `.env`:**

```bash
cd /var/www/tournament-platform1/frontend
npm run build
```

**Перезапуск процесса PM2 (имя взять из списка):**

```bash
pm2 list
pm2 restart ИМЯ_ПРОЦЕССА
```

Если меняли переменные в ecosystem-файле PM2:

```bash
pm2 restart ИМЯ_ПРОЦЕССА --update-env
```

---

## 8. Swagger (OpenAPI)

**Зачем:** интерактивная документация API (NestJS).

| Окружение | URL |
|-----------|-----|
| Прод | `https://api.tournament-platform.ru/api` |
| Локально (порт по `PORT`, обычно 4000) | `http://localhost:4000/api` |

JSON-спецификация часто: `/api-json` на том же хосте.

---

## 9. Загрузка картинок (`POST /upload`, S3 / MinIO)

**Зачем:** логотипы турниров/команд и фото игроков уходят в S3-совместимое хранилище; в API возвращается публичный URL.

Подробно про **локальную разработку vs прод**, порты **9000 (API)** и **9001 (консоль MinIO)** и безопасность: **[minio-s3-environments.md](./minio-s3-environments.md)**.

**Обязательные переменные backend:** `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`. Без них ответ 500 с текстом про «S3 is not configured».

**Прод с MinIO на `127.0.0.1`:** клиенты не откроют `http://127.0.0.1:9000/...`. Задайте **`S3_PUBLIC_BASE_URL`** — HTTPS-адрес, по которому Nginx (или CDN) отдаёт тот же бакет path-style (`/bucket/key`). Внутренний доступ SDK по-прежнему через `S3_ENDPOINT`.

**Nginx:** для больших файлов увеличьте лимит тела запроса (в блоке `server` или `http`):

```nginx
client_max_body_size 20M;
```

Перезагрузка: `sudo nginx -t && sudo systemctl reload nginx`.

**Фронт:** запросы к `/upload` идут на `NUXT_PUBLIC_API_BASE` с JWT; после смены API URL нужен **`npm run build`**.

---

## 10. Логин в админку и тенант

**Зачем:** `POST /auth/login` требует существующий `tenantSlug` и пользователя в этом тенанте.

- Поддомен `https://<slug>.tournament-platform.ru` задаёт `tenantSlug` из первой метки хоста.
- Если в БД только тенант `platform`, заходите с **`platform.…`** или выставьте `NUXT_PUBLIC_DEFAULT_TENANT_SLUG=platform` для сценария без поддомена.

---

## 11. Копия шпаргалки на сервере (опционально)

```bash
# с локальной машины, если есть ssh (пример)
scp docs/server-operations-cheatsheet.md user@server:~/
```

На сервере: `less ~/server-operations-cheatsheet.md`

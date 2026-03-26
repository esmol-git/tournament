# MinIO / S3: локальная разработка и продакшен

## Два разных «админки»

| Что | Порт по умолчанию | Назначение |
|-----|-------------------|------------|
| **S3 API** MinIO | **9000** | Сюда ходит **приложение** (NestJS, AWS SDK): загрузка файлов, `S3_ENDPOINT`. |
| **MinIO Console** (веб-UI) | **9001** | Отдельная **админка самого MinIO** (бакеты, ключи, просмотр объектов). Это **не** админка Tournament Platform. |

URL вида `http://<IP>:9001/browser/...` — это **консоль MinIO**. Для локальной разработки её удобно открывать на своей машине. На **продакшен-сервере** порт **9001 не стоит открывать в интернет** без защиты: это полный доступ к настройке хранилища и данным.

Рекомендации для прода:

- Слушать MinIO только на `127.0.0.1` (или в Docker-сети), а наружу не публиковать API/консоль напрямую.
- Консоль при необходимости — через **SSH-туннель** (`ssh -L 9001:127.0.0.1:9001 user@server`) или VPN.
- Если нужен веб-доступ к консоли — отдельный **HTTPS** через Nginx, **basic auth** / IP allowlist, сильные пароли.

---

## Разделение переменных: dev vs prod

Один и тот же код читает переменные из **одного** файла `.env` на машине, где запущен backend. Разделение «разработка / прод» делается **разными файлами `.env` на разных машинах** (и `NODE_ENV=production` на сервере).

### Локальная разработка (ПК разработчика)

- MinIO часто в Docker или локально: API на `http://127.0.0.1:9000`, консоль на `http://127.0.0.1:9001`.
- Приложение и MinIO на **одной** машине → `S3_ENDPOINT=http://127.0.0.1:9000` нормально.
- **`S3_PUBLIC_BASE_URL`** обычно **не нужен**: в ответе `POST /upload` можно отдавать URL с тем же `127.0.0.1` — браузер на вашем же ПК откроет картинку.
- Автосоздание бакета по умолчанию включено для «локального» endpoint (см. логику в `StorageService`).

Пример фрагмента `.env`:

```env
NODE_ENV=development
S3_ENDPOINT=http://127.0.0.1:9000
S3_BUCKET=tournament-uploads
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
# S3_PUBLIC_BASE_URL не задаём
```

### Продакшен (VPS, приложение и MinIO на сервере)

- **Backend** подключается к MinIO по **внутреннему** адресу (часто `http://127.0.0.1:9000`), чтобы не гонять трафик S3 наружу и обойтись без лишнего NAT.
- **Браузеры пользователей** не должны получать ссылки вида `http://127.0.0.1:9000/...` или `http://46.8.78.207:9000/...` — это не откроется у клиента или даст mixed content на HTTPS-сайте.
- Задайте **`S3_PUBLIC_BASE_URL`** — базовый URL, по которому **публично** отдаются объекты бакета (path-style: `/имя_бакета/ключ`):

  - либо отдельный поддомен и Nginx reverse proxy на MinIO (например `https://files.tournament-platform.ru` → `http://127.0.0.1:9000`),
  - либо внешний S3 (AWS и т.д.) — тогда `S3_PUBLIC_BASE_URL` совпадает с публичным endpoint провайдера.

Пример фрагмента `.env` на сервере:

```env
NODE_ENV=production
S3_ENDPOINT=http://127.0.0.1:9000
S3_PUBLIC_BASE_URL=https://files.tournament-platform.ru
S3_BUCKET=tournament-uploads
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_CREATE_BUCKET_IF_MISSING=false
```

После смены переменных backend нужно **пересобрать и перезапустить** процесс (PM2 и т.д.).

---

## Фронтенд

`NUXT_PUBLIC_API_BASE` на проде должен указывать на **HTTPS API** (например `https://api.tournament-platform.ru`), а не на `localhost`. Иначе запросы к `/upload` пойдут не туда. После изменения — **`npm run build`** у фронта.

---

## Nginx

- Для загрузки больших картинок увеличьте **`client_max_body_size`** на `server`/`location` для API.
- Публичная раздача файлов MinIO — отдельный `server` или `location`, прокси на `127.0.0.1:9000`, без открытия порта 9000 в firewall наружу.

---

## Краткий чеклист прода

1. MinIO API (9000) доступен приложению локально на сервере.
2. В `.env` backend заданы `S3_*` и **`S3_PUBLIC_BASE_URL`** с HTTPS.
3. Консоль MinIO (9001) не торчит в открытый интернет без защиты.
4. Фронт собран с правильным `NUXT_PUBLIC_API_BASE`.

См. также: [server-operations-cheatsheet.md](./server-operations-cheatsheet.md).
cd /var/www/tournament-platform1/backend
S3_ENDPOINT=http://127.0.0.1:9000 \
S3_PUBLIC_BASE_URL=https://files.tournament-platform.ru \
S3_BUCKET=images \
S3_ACCESS_KEY=minioadmin \
S3_SECRET_KEY=MyStr0ngPassw0rd123 \
S3_CREATE_BUCKET_IF_MISSING=true \
S3_SET_PUBLIC_READ_POLICY=true \
pm2 restart 0 --update-env

curl -I "https://files.tournament-platform.ru/images/В1774508224735-d93b718a.webp"# 1) Локально: собрать фронт
cd /Users/esmolyakov/Projects/tournament-platform/frontend
npm run build
# 2) Локально: залить фронт на сервер (исключая node_modules/.nuxt/.output)
rsync -az --delete \
  --exclude node_modules \
  --exclude .nuxt \
  --exclude .output \
  /Users/esmolyakov/Projects/tournament-platform/frontend/ \
  root@46.8.78.207:/var/www/tournament-platform1/frontend/
# 3) На сервере: установить зависимости (если нужно) и перезапустить процесс
ssh root@46.8.78.207 "cd /var/www/tournament-platform1/frontend && npm ci --omit=dev && pm2 restart 1"
# 4) (опционально) проверить статус
ssh root@46.8.78.207 "pm2 list"
Если у вас имя процесса не 1, замените на frontend или ваш id/name из pm2 list.
\


Деплой API
cd /opt/tournament/api/releases
STAMP=$(date +%Y%m%d%H%M%S)
mkdir -p "$STAMP"
rsync -az --delete --exclude node_modules /var/www/tournament-platform1/backend/ "/opt/tournament/api/releases/$STAMP/"
cd "/opt/tournament/api/releases/$STAMP"
npm ci --include=dev
npm run build
npx prisma migrate deploy
ln -sfn "/opt/tournament/api/releases/$STAMP" /opt/tournament/api/current
pm2 restart api --update-env
Деплой Frontend
(с твоим VPS лучше собирать не на сервере, а локально/CI; но если срочно на сервере:)

cd /opt/tournament/frontend/releases
STAMP=$(date +%Y%m%d%H%M%S)
mkdir -p "$STAMP"
rsync -az --delete --exclude node_modules --exclude .nuxt --exclude .output /var/www/tournament-platform1/frontend/ "/opt/tournament/frontend/releases/$STAMP/"
cd "/opt/tournament/frontend/releases/$STAMP"
npm ci --include=dev
export NODE_OPTIONS="--max-old-space-size=3072"
npm run build
ln -sfn "/opt/tournament/frontend/releases/$STAMP" /opt/tournament/frontend/current
pm2 restart frontend --update-env
Откат за минуту

# API
ls -1dt /opt/tournament/api/releases/* | head
ln -sfn /opt/tournament/api/releases/<PREVIOUS_STAMP> /opt/tournament/api/current
pm2 restart api
# Frontend
ls -1dt /opt/tournament/frontend/releases/* | head
ln -sfn /opt/tournament/frontend/releases/<PREVIOUS_STAMP> /opt/tournament/frontend/current
pm2 restart frontend


cd /Users/esmolyakov/Projects/tournament-platform/frontend
npm run build
rsync -az --delete .output/ root@46.8.78.207:/var/www/tournament-platform1/frontend/.output/
ssh root@46.8.78.207 "pm2 restart 1"
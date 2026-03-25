# Prisma (локальная разработка)

## Ошибка P3014 «permission denied to create database»

`prisma migrate dev` по умолчанию пытается **создать** временную shadow-базу. Если у пользователя PostgreSQL нет права `CREATEDB`, используется **отдельная уже существующая** база через `SHADOW_DATABASE_URL` (см. `schema.prisma`).

### Один раз

Под суперпользователем или любой ролью с правом `CREATE DATABASE`:

```sql
CREATE DATABASE tournament_shadow;
```

Права на базу — как у основной (`tournament`), тот же логин/пароль в URL.

В `.env` уже задан пример:

- `DATABASE_URL` → основная БД  
- `SHADOW_DATABASE_URL` → `.../tournament_shadow?schema=public`

### Миграции

```bash
cd backend
npx prisma migrate dev --name <имя_миграции>
```

## «Drift detected» и вопрос про reset (потеря данных)

Так бывает, если базу раньше поднимали через **`prisma db push`**, а папки **`prisma/migrations/`** не было: в БД уже есть таблицы, а история миграций пустая.

**Не соглашайся на reset** (это сотрёт данные).

В репозитории уже лежит **baseline-миграция** `20260318120000_baseline` — SQL «с нуля до текущей схемы». Её нужно **только записать в историю** как уже применённую (SQL по БД второй раз не гоняем):

```bash
cd backend
npx prisma migrate resolve --applied 20260318120000_baseline
```

После этого снова:

```bash
npx prisma migrate dev --name <следующее_изменение>
```

Если Prisma всё ещё ругается на drift, значит реальная БД **чуть отличается** от `schema.prisma` — тогда либо подровняй схему под БД (`db pull`), либо поправь данные/ограничения вручную.

### Если миграции пока не нужны

Синхронизация схемы без shadow-базы:

```bash
npx prisma db push
```

`db push` не создаёт файлы в `prisma/migrations/` — для команды это нормальный dev-режим.

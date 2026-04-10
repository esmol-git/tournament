# Tournament Platform — мобильное приложение

Expo + React Native + TypeScript, навигация `@react-navigation/native`, токены в `expo-secure-store`.

## Иконка и логотип в UI

Файлы в **`assets/`**: `icon.png` (иконка приложения iOS/Android), `adaptive-icon.png`, `splash-icon.png`, `favicon.png`. Для сторов лучше подставить **квадрат PNG 1024×1024** с запасом по краям (safe zone для Android adaptive icon).

Внутри приложения тот же файл подключается через компонент **`AppLogo`** (`src/components/brand/AppLogo.tsx`): `import { AppLogo } from '.../components/brand/AppLogo'` и `<AppLogo size={64} />`.

## Запуск

```bash
cd mobile
npm install
npm start
```

Дальше: `i` / `a` или `npm run ios` / `npm run android`.

## API

Создайте файл **`.env`** (например `cp .env.example .env`). **Expo читает только `.env`**, не `.env.example` — иначе останется дефолт `http://127.0.0.1:4000` (в т.ч. в подписи «API: …» на экране входа). После правок `.env` перезапустите `npm start`.

Укажите `EXPO_PUBLIC_API_BASE_URL` (на **реальном устройстве** к локальному API — IP вашего Mac в Wi‑Fi, не `127.0.0.1`).

Продакшен: **`https://api.tournament-platform.ru`** (как `NUXT_PUBLIC_API_BASE` у Nuxt-фронта). Лендинг `https://tournament-platform.ru` — это не API.

Вход: `POST /auth/login` с полями `username`, `password`, `tenantSlug` (как в backend). Регистрации в приложении нет.

## Сборка Android (EAS)

Нужен аккаунт [Expo](https://expo.dev). CLI входит в проект как **`eas-cli`** (devDependency) — после `npm install` команды `npm run eas:*` не дергают `npx` и не спрашивают «Ok to proceed?».

URL API для **облачной сборки** задаётся в **`eas.json`** в блоке `env` у профилей (сейчас прод: `EXPO_PUBLIC_API_BASE_URL` → `https://api.tournament-platform.ru`). Локальный `.env` на результат **EAS Build не влияет** — переменные берутся из профиля.

1. Один раз: `npm run eas:login`, затем **`npm run eas:init`** — привяжет проект к Expo и допишет `projectId` в `app.json` (под `expo.extra.eas`).
2. Сборка **APK** для установки вручную / internal testing:  
   `npm run eas:build:android:apk`  
   (профиль `preview` в `eas.json` — `buildType: apk`).
3. Сборка **AAB** для Google Play:  
   `npm run eas:build:android:aab`  
   (профиль `production`).

Подпись Android на первых сборках EAS создаст автоматически (managed credentials), либо можно подключить свой keystore в настройках проекта на expo.dev.

Идентификатор приложения: **`ru.tournamentplatform.app`** (`app.json` — `android.package` / `ios.bundleIdentifier`). При публикации в Play Console должен совпадать.

## Структура

| Путь | Назначение |
|------|------------|
| `App.tsx` | `AuthProvider` + `RootNavigator` |
| `src/api/` | HTTP-клиент, `authApi`, дальше `matchesApi` и т.д. |
| `src/auth/` | сессия, `AuthContext`, подписи ролей |
| `src/config/` | `appConfig` (env) |
| `src/navigation/` | корневой и вложенный стек |
| `src/screens/auth/` | экран входа |
| `src/screens/app/` | главная, **список турниров**, **карточка турнира + матчи**, заглушка матчей |
| `src/api/tournamentsApi.ts` | список и детали (staff vs публичный API для USER/REFEREE) |
| `src/features/matches/` | место под сценарии матчей/результатов |
| `src/components/ui/` | примитивы UI |
| `src/theme/` | цвета |

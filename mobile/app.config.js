/**
 * Динамическая конфигурация Expo: universal links + параметры OTA.
 * Базовые поля — в `app.json`.
 *
 * Universal links (после публикации AASA / Digital Asset Links на домене):
 *   https://<хост>/mobile/tournaments/...
 * Отключить нативную привязку: EXPO_PUBLIC_UNIVERSAL_LINK_ORIGIN= (пусто) при сборке.
 */
const appJson = require('./app.json')

function parseUniversalHost() {
  const raw = process.env.EXPO_PUBLIC_UNIVERSAL_LINK_ORIGIN
  if (raw === '') return null
  const base = (raw || 'https://tournament-platform.ru').replace(/\/$/, '')
  try {
    return new URL(base).hostname
  } catch {
    return 'tournament-platform.ru'
  }
}

module.exports = () => {
  const expo = { ...appJson.expo }
  const host = parseUniversalHost()

  if (host) {
    expo.ios = {
      ...expo.ios,
      associatedDomains: [...(expo.ios?.associatedDomains ?? []), `applinks:${host}`],
    }
    expo.android = {
      ...expo.android,
      intentFilters: [
        ...(expo.android?.intentFilters ?? []),
        {
          action: 'VIEW',
          autoVerify: true,
          data: [{ scheme: 'https', host, pathPrefix: '/mobile' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    }
  }

  expo.updates = {
    ...expo.updates,
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 5000,
  }

  return { expo }
}

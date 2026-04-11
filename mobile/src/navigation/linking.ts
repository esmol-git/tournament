import type { LinkingOptions } from '@react-navigation/native'
import { getStateFromPath as getStateFromPathRN } from '@react-navigation/native'
import * as Linking from 'expo-linking'
import { getUniversalLinkOrigin } from '../config/appConfig'
import type { SessionUser } from '../types/user'
import type { RootStackParamList } from './types'

/**
 * Deep links (после входа в приложение):
 * - tournamentplatform://tournaments — список турниров
 * - tournamentplatform://tournaments/:tournamentId — карточка турнира
 * - tournamentplatform://tournaments/:tournamentId/match/:matchId — протокол
 * - tournamentplatform://home — главная
 * - tournamentplatform://matches — матчи (если вкладка доступна)
 * - tournamentplatform://settings — настройки
 *
 * Universal links (HTTPS, тот же путь после префикса /mobile/):
 * - https://ваш-домен/mobile/tournaments/...
 * См. EXPO_PUBLIC_UNIVERSAL_LINK_ORIGIN и `app.config.js` (associatedDomains / intentFilters).
 */
const fullConfig = {
  screens: {
    Login: 'login',
    Main: {
      screens: {
        HomeTab: {
          path: 'home',
          screens: {
            Home: '',
          },
        },
        TournamentsTab: {
          path: 'tournaments',
          screens: {
            Tournaments: '',
            TournamentDetail: ':tournamentId',
            MatchProtocol: ':tournamentId/match/:matchId',
          },
        },
        MatchesTab: {
          path: 'matches',
          screens: {
            MatchResults: '',
          },
        },
        SettingsTab: {
          path: 'settings',
          screens: {
            Settings: '',
          },
        },
      },
    },
  },
} as const

const loggedOutConfig = {
  screens: {
    Login: 'login',
  },
} as const

function normalizePathForLinking(path: string): string {
  let normalized = path.replace(/^\//, '')
  if (normalized.startsWith('mobile/')) {
    normalized = normalized.slice('mobile/'.length)
  }
  return normalized
}

export function createAppLinking(user: SessionUser | null): LinkingOptions<RootStackParamList> {
  const linkingConfig = user ? fullConfig : loggedOutConfig
  const universalOrigin = getUniversalLinkOrigin()
  const prefixes = [
    Linking.createURL('/'),
    'tournamentplatform://',
    ...(universalOrigin ? [universalOrigin] : []),
  ]

  return {
    prefixes,
    config: linkingConfig,
    getStateFromPath(path, options) {
      const normalized = normalizePathForLinking(path)
      return getStateFromPathRN(normalized, {
        ...options,
        screens: linkingConfig.screens,
      })
    },
  } as LinkingOptions<RootStackParamList>
}

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApiUrl } from '~/composables/useApiUrl'
import {
  ADMIN_SETTINGS_COOKIE_KEY,
  ADMIN_SETTINGS_STORAGE_KEY,
  defaultAdminSettings,
  type AdminAccentId,
  type AdminLocaleCode,
  type AdminSettingsPersisted,
  type AdminThemeMode,
} from '~/constants/adminSettings'
import { useAuthStore } from '~/stores/auth'

function readFromCookieRaw(): string | null {
  if (typeof document === 'undefined') return null
  const escaped = ADMIN_SETTINGS_COOKIE_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`))
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function readPersisted(): AdminSettingsPersisted {
  if (typeof localStorage === 'undefined') return { ...defaultAdminSettings }
  try {
    // SSR читает тему из cookie, поэтому на клиенте используем тот же приоритет,
    // чтобы не было двойного переключения темы при гидрации.
    const raw = readFromCookieRaw() || localStorage.getItem(ADMIN_SETTINGS_STORAGE_KEY)
    if (!raw) return { ...defaultAdminSettings }
    const parsed = JSON.parse(raw) as Partial<AdminSettingsPersisted>
    return {
      ...defaultAdminSettings,
      ...parsed,
      themeMode: parsed.themeMode ?? defaultAdminSettings.themeMode,
      locale: parsed.locale ?? defaultAdminSettings.locale,
      accent: parsed.accent ?? defaultAdminSettings.accent,
    }
  } catch {
    return { ...defaultAdminSettings }
  }
}

function savePersisted(s: AdminSettingsPersisted) {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = JSON.stringify(s)
    localStorage.setItem(ADMIN_SETTINGS_STORAGE_KEY, raw)
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:'
    const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : ''
    const isIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
    const isLocalhost = host === 'localhost' || host === '127.0.0.1'
    let domainPart = ''
    if (host && !isIp && !isLocalhost) {
      const parts = host.split('.').filter(Boolean)
      if (parts.length >= 2) {
        const apex = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
        domainPart = `; Domain=${apex}`
      }
    }
    document.cookie = `${ADMIN_SETTINGS_COOKIE_KEY}=${encodeURIComponent(raw)}; Path=/; Max-Age=31536000; SameSite=Lax${domainPart}${secure ? '; Secure' : ''}`
  } catch {
    /* ignore */
  }
}

const THEME_OK = new Set<string>(['light', 'dark', 'system'])
const LOCALE_OK = new Set<string>(['ru', 'en'])
const ACCENT_OK = new Set<string>([
  'emerald',
  'blue',
  'violet',
  'rose',
  'amber',
  'cyan',
])

/** Приводит ответ API к допустимым значениям (в т.ч. после ручного правки JSON / PascalCase). */
function normalizeFetchedSettings(
  data: Partial<AdminSettingsPersisted>,
): AdminSettingsPersisted {
  const tm =
    typeof data.themeMode === 'string'
      ? data.themeMode.toLowerCase()
      : defaultAdminSettings.themeMode
  const loc =
    typeof data.locale === 'string'
      ? data.locale.toLowerCase()
      : defaultAdminSettings.locale
  const ac =
    typeof data.accent === 'string'
      ? data.accent.toLowerCase()
      : defaultAdminSettings.accent
  return {
    themeMode: (THEME_OK.has(tm) ? tm : defaultAdminSettings.themeMode) as AdminThemeMode,
    locale: (LOCALE_OK.has(loc) ? loc : defaultAdminSettings.locale) as AdminLocaleCode,
    accent: (ACCENT_OK.has(ac) ? ac : defaultAdminSettings.accent) as AdminAccentId,
  }
}

export const useAdminSettingsStore = defineStore('adminSettings', () => {
  const { apiUrl } = useApiUrl()

  const themeMode = ref<AdminThemeMode>(defaultAdminSettings.themeMode)
  const locale = ref<AdminLocaleCode>(defaultAdminSettings.locale)
  const accent = ref<AdminAccentId>(defaultAdminSettings.accent)

  /** После первого fetch (или пропуска без токена) — чтобы не показывать форму с «пустыми» SSR-значениями до ответа API */
  const uiSettingsReady = ref(false)

  function hydrate() {
    const p = readPersisted()
    themeMode.value = p.themeMode
    locale.value = p.locale
    accent.value = p.accent
    // Держим cookie синхронной с localStorage, чтобы SSR сразу рендерил нужную тему.
    persist()
  }

  function persist() {
    savePersisted({
      themeMode: themeMode.value,
      locale: locale.value,
      accent: accent.value,
    })
  }

  /** Один сетевой запрос при параллельных вызовах (middleware + страницы). */
  let fetchFromServerInFlight: Promise<void> | null = null

  async function runFetchFromServerIfLoggedIn() {
    try {
      const auth = useAuthStore()
      auth.syncWithStorage()
      if (!auth.token) {
        return
      }
      try {
        const data = await auth.authFetch<Partial<AdminSettingsPersisted>>(
          apiUrl('/users/me/ui-settings'),
        )
        const n = normalizeFetchedSettings(data)
        if (
          themeMode.value === n.themeMode &&
          locale.value === n.locale &&
          accent.value === n.accent
        ) {
          return
        }
        themeMode.value = n.themeMode
        locale.value = n.locale
        accent.value = n.accent
        persist()
      } catch {
        /* офлайн или несовместимый API */
      }
    } finally {
      /** Всегда, иначе после SSR/гидрации Pinia может оставить uiSettingsReady=false без ответа API */
      uiSettingsReady.value = true
    }
  }

  /** Подтянуть настройки с сервера (после входа или при открытии админки). */
  async function fetchFromServerIfLoggedIn() {
    if (!fetchFromServerInFlight) {
      fetchFromServerInFlight = runFetchFromServerIfLoggedIn().finally(() => {
        fetchFromServerInFlight = null
      })
    }
    return fetchFromServerInFlight
  }

  /** Отправить текущие настройки на сервер (кнопка «Сохранить»). */
  async function syncToServer() {
    const auth = useAuthStore()
    auth.syncWithStorage()
    if (!auth.token) {
      throw new Error('Not authenticated')
    }
    await auth.authFetch(apiUrl('/users/me/ui-settings'), {
      method: 'PATCH',
      body: {
        themeMode: themeMode.value,
        locale: locale.value,
        accent: accent.value,
      },
    })
  }

  function setThemeMode(v: AdminThemeMode) {
    themeMode.value = v
    persist()
  }

  function setLocale(v: AdminLocaleCode) {
    locale.value = v
    persist()
  }

  function setAccent(v: AdminAccentId) {
    accent.value = v
    persist()
  }

  return {
    themeMode,
    locale,
    accent,
    uiSettingsReady,
    hydrate,
    persist,
    fetchFromServerIfLoggedIn,
    syncToServer,
    setThemeMode,
    setLocale,
    setAccent,
  }
})

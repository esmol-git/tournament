export type AdminThemeMode = 'light' | 'dark' | 'system'
export type AdminLocaleCode = 'ru' | 'en'
export type AdminAccentId = 'emerald' | 'blue' | 'violet' | 'rose' | 'amber' | 'cyan'

export const ADMIN_SETTINGS_STORAGE_KEY = 'admin-settings-v1'
export const ADMIN_SETTINGS_COOKIE_KEY = 'admin-settings-v1'

export interface AdminSettingsPersisted {
  themeMode: AdminThemeMode
  locale: AdminLocaleCode
  accent: AdminAccentId
}

export const defaultAdminSettings: AdminSettingsPersisted = {
  themeMode: 'light',
  locale: 'ru',
  accent: 'emerald',
}

export const adminAccentOptions: { id: AdminAccentId; sample: string }[] = [
  { id: 'emerald', sample: '#10b981' },
  { id: 'blue', sample: '#3b82f6' },
  { id: 'violet', sample: '#8b5cf6' },
  { id: 'rose', sample: '#f43f5e' },
  { id: 'amber', sample: '#f59e0b' },
  { id: 'cyan', sample: '#06b6d4' },
]

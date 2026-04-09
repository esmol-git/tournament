<script setup lang="ts">
import { computed } from 'vue'
import { useCookie, useHead, useRoute } from '#app'
import {
  ADMIN_SETTINGS_COOKIE_KEY,
  defaultAdminSettings,
  type AdminSettingsPersisted,
} from '../constants/adminSettings'

const route = useRoute()
const adminSettingsCookie = useCookie<string | null>(ADMIN_SETTINGS_COOKIE_KEY)

const accentPrimaryVars: Record<
  AdminSettingsPersisted['accent'],
  { color: string; hover: string; active: string; contrast: string }
> = {
  emerald: { color: '#10b981', hover: '#059669', active: '#047857', contrast: '#ffffff' },
  blue: { color: '#3b82f6', hover: '#2563eb', active: '#1d4ed8', contrast: '#ffffff' },
  violet: { color: '#8b5cf6', hover: '#7c3aed', active: '#6d28d9', contrast: '#ffffff' },
  rose: { color: '#f43f5e', hover: '#e11d48', active: '#be123c', contrast: '#ffffff' },
  amber: { color: '#f59e0b', hover: '#d97706', active: '#b45309', contrast: '#1c1917' },
  cyan: { color: '#06b6d4', hover: '#0891b2', active: '#0e7490', contrast: '#ffffff' },
}

function parseSettings(raw: string | null | undefined): AdminSettingsPersisted {
  if (!raw) return { ...defaultAdminSettings }
  try {
    const parsed = JSON.parse(raw) as Partial<AdminSettingsPersisted>
    return {
      themeMode:
        parsed.themeMode === 'dark' || parsed.themeMode === 'light' || parsed.themeMode === 'system'
          ? parsed.themeMode
          : defaultAdminSettings.themeMode,
      locale: parsed.locale === 'en' || parsed.locale === 'ru' ? parsed.locale : defaultAdminSettings.locale,
      accent:
        parsed.accent === 'emerald' ||
        parsed.accent === 'blue' ||
        parsed.accent === 'violet' ||
        parsed.accent === 'rose' ||
        parsed.accent === 'amber' ||
        parsed.accent === 'cyan'
          ? parsed.accent
          : defaultAdminSettings.accent,
    }
  } catch {
    return { ...defaultAdminSettings }
  }
}

const cookieSettings = computed(() => parseSettings(adminSettingsCookie.value))
/** Та же тема/акцент, что в админке: вход организации, платформенный суперадмин. */
const usesPersistedAdminChrome = computed(
  () => route.path.startsWith('/admin') || route.path.startsWith('/platform'),
)
/**
 * На админке/платформе скролл обычно в `main.overflow-y-auto`, не на document.
 * Глобальный `scrollbar-gutter: stable` на html + компенсация Prime при модалке дают
 * «двойную» полосу справа — отключаем stable только для этих зон.
 */
const htmlRootClass = computed(() => {
  const parts: string[] = []
  if (usesPersistedAdminChrome.value && cookieSettings.value.themeMode === 'dark') {
    parts.push('dark-mode')
  }
  if (usesPersistedAdminChrome.value) {
    parts.push('admin-chrome-no-scrollbar-gutter')
  }
  return parts.length ? parts.join(' ') : undefined
})
const adminAccent = computed(() =>
  usesPersistedAdminChrome.value ? cookieSettings.value.accent : undefined,
)
const adminAccentInlineStyle = computed(() => {
  if (!usesPersistedAdminChrome.value) return undefined
  const v = accentPrimaryVars[cookieSettings.value.accent]
  return `html[data-accent="${cookieSettings.value.accent}"]{--p-primary-color:${v.color};--p-primary-hover-color:${v.hover};--p-primary-active-color:${v.active};--p-primary-contrast-color:${v.contrast};}`
})

useHead(() => ({
  htmlAttrs: {
    class: htmlRootClass.value,
    'data-accent': adminAccent.value,
  },
  style: adminAccentInlineStyle.value
    ? [{ key: 'admin-accent-inline', textContent: adminAccentInlineStyle.value }]
    : [],
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>


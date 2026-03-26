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
const isAdminRoute = computed(() => route.path.startsWith('/admin'))
const adminHtmlClass = computed(() =>
  isAdminRoute.value && cookieSettings.value.themeMode === 'dark' ? 'dark-mode' : undefined,
)
const adminAccent = computed(() =>
  isAdminRoute.value ? cookieSettings.value.accent : undefined,
)

useHead(() => ({
  htmlAttrs: {
    class: adminHtmlClass.value,
    'data-accent': adminAccent.value,
  },
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>


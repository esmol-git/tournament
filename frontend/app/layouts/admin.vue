<script setup lang="ts">
import {
  applyAdminLocale,
  syncThemeAndAccentFromStore,
} from '~/composables/useAdminAppearance'
import { useAdminSidebarCollapsed } from '~/composables/useAdminSidebarCollapsed'
import { useAdminSettingsStore } from '~/stores/adminSettings'

const confirmLogout = ref(false)
const adminSettings = useAdminSettingsStore()
const { locale, setLocale } = useI18n()
const nuxtApp = useNuxtApp()
const { mini, toggleMini } = useAdminSidebarCollapsed()
const showThemeGate = ref(true)

function syncI18nAndPrimeLocale() {
  const code = adminSettings.locale
  if (locale.value !== code) {
    setLocale(code)
  }
  applyAdminLocale(code, nuxtApp)
}

if (import.meta.client) {
  syncI18nAndPrimeLocale()
  syncThemeAndAccentFromStore()
}

/**
 * После гидрации: повторный fetch с дедупом в сторе. Нужен, если SSR восстановил Pinia с uiSettingsReady=false
 * или middleware не дошёл до конца — иначе страница «Настройки» зависает на скелетоне.
 */
onMounted(() => {
  void adminSettings.fetchFromServerIfLoggedIn().then(() => {
    syncI18nAndPrimeLocale()
    syncThemeAndAccentFromStore()
  }).finally(() => {
    void nextTick(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          showThemeGate.value = false
        })
      })
    })
  })
})

watch(
  () => adminSettings.locale,
  () => {
    syncI18nAndPrimeLocale()
  },
)

watch(
  () => [adminSettings.themeMode, adminSettings.accent] as const,
  () => {
    syncThemeAndAccentFromStore()
  },
)
</script>

<template>
  <div class="flex min-h-screen bg-surface-50 dark:bg-surface-950 text-surface-900 dark:text-surface-100">
    <transition
      enter-active-class="transition-opacity duration-150 ease-out"
      leave-active-class="transition-opacity duration-150 ease-out"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showThemeGate"
        class="fixed inset-0 z-[1000] flex items-center justify-center bg-[#161a22] text-white"
      >
        <i class="pi pi-spin pi-spinner text-[#c4c9d4] text-2xl" />
      </div>
    </transition>

    <div :class="showThemeGate ? 'invisible' : 'visible'" class="contents">
      <Toast position="top-right" />

      <AdminSidebar @logout-click="confirmLogout = true" />

      <div class="flex min-w-0 flex-1 flex-col">
        <header
          class="sticky top-0 z-10 flex h-16 items-center border-b border-surface-200 bg-surface-0/95 px-4 shadow-[0_6px_16px_rgba(15,23,42,0.06)] backdrop-blur dark:border-surface-700 dark:bg-surface-900/95 dark:shadow-[0_6px_16px_rgba(0,0,0,0.35)] sm:px-6"
        >
          <div class="flex items-center gap-3">
            <Button
              type="button"
              text
              rounded
              severity="secondary"
              :icon="mini ? 'pi pi-angle-double-right' : 'pi pi-angle-double-left'"
              :title="mini ? 'Развернуть сайдбар' : 'Свернуть сайдбар'"
              :aria-label="mini ? 'Развернуть сайдбар' : 'Свернуть сайдбар'"
              class="!h-10 !w-10 !p-0"
              @click="toggleMini"
            />
            <div class="min-w-0">
              <p class="truncate text-sm text-muted-color">Админ-панель</p>
              <h2 class="truncate text-base font-semibold text-surface-900 dark:text-surface-0">
                Tournament Platform
              </h2>
            </div>
          </div>
        </header>

        <main class="flex-1 min-w-0 overflow-x-auto">
          <slot />
        </main>
      </div>

      <AdminLogoutDialog v-model="confirmLogout" />
    </div>
  </div>
</template>

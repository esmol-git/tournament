<script setup lang="ts">
import {
  applyAdminLocale,
  syncThemeAndAccentFromStore,
} from '~/composables/useAdminAppearance'
import { useAuth } from '~/composables/useAuth'
import { useAdminSettingsStore } from '~/stores/adminSettings'

const confirmLogout = ref(false)
const mobileMenuOpen = ref(false)
const route = useRoute()
const adminSettings = useAdminSettingsStore()
const { syncWithStorage, fetchMe, loggedIn } = useAuth()
const { locale, setLocale, t } = useI18n()
const nuxtApp = useNuxtApp()
const showThemeGate = ref(true)

let mobileMenuViewportCleanup: (() => void) | undefined

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
  if (import.meta.client) {
    syncWithStorage()
    if (loggedIn.value) {
      void fetchMe().catch(() => {})
    }
    const mq = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => {
      if (mq.matches) mobileMenuOpen.value = false
    }
    closeOnDesktop()
    mq.addEventListener('change', closeOnDesktop)
    mobileMenuViewportCleanup = () => mq.removeEventListener('change', closeOnDesktop)
  }

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

onBeforeUnmount(() => {
  mobileMenuViewportCleanup?.()
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

watch(
  () => route.path,
  () => {
    mobileMenuOpen.value = false
  },
)

function onMobileNavLogout() {
  confirmLogout.value = true
  mobileMenuOpen.value = false
}
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

      <Drawer
        v-model:visible="mobileMenuOpen"
        position="left"
        :header="t('admin.sidebar.mobile_menu')"
        class="!w-[min(100vw,20rem)]"
        :block-scroll="true"
        :pt="{
          content: {
            class: '!min-h-0 !flex !flex-1 !flex-col !overflow-hidden !p-0',
          },
        }"
      >
        <AdminSidebarNav
          force-expanded
          pin-footer
          @logout-click="onMobileNavLogout"
        />
      </Drawer>

      <div class="flex min-w-0 flex-1 flex-col">
        <header
          class="sticky top-0 z-10 flex h-16 items-center border-b border-surface-200 bg-surface-0/95 px-4 shadow-[0_6px_16px_rgba(15,23,42,0.06)] backdrop-blur dark:border-surface-700 dark:bg-surface-900/95 dark:shadow-[0_6px_16px_rgba(0,0,0,0.35)] sm:px-6"
        >
          <div class="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              text
              rounded
              severity="secondary"
              icon="pi pi-bars"
              class="!h-10 !w-10 !p-0 lg:!hidden"
              :title="t('admin.sidebar.open_menu')"
              :aria-label="t('admin.sidebar.open_menu')"
              @click="mobileMenuOpen = true"
            />
            <NuxtLink
              to="/admin"
              class="flex shrink-0 items-center lg:hidden"
              aria-label="Tournament Platform"
            >
              <img
                src="/logo.png"
                alt=""
                width="36"
                height="36"
                class="h-9 w-9 object-contain"
              />
            </NuxtLink>
            <div class="min-w-0">
              <h2 class="truncate text-base font-semibold text-surface-900 dark:text-surface-0">
                {{ t('admin.layout.header_title') }}
              </h2>
              <p class="truncate text-xs text-muted-color sm:text-sm">
                {{ t('admin.layout.header_subtitle') }}
              </p>
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

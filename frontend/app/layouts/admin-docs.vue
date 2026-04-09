<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { syncThemeAndAccentFromStore } from '~/composables/useAdminAppearance'
import { useAdminSettingsStore } from '~/stores/adminSettings'
import { useAuth } from '~/composables/useAuth'

const { t } = useI18n()
const adminSettings = useAdminSettingsStore()
const { loggedIn, syncWithStorage } = useAuth()
const showThemeGate = ref(true)

function applyAccentAndTheme() {
  try {
    syncThemeAndAccentFromStore()
  } catch {
    // no-op: безопасный fallback для редких контекстов
  }
}

onMounted(() => {
  if (!import.meta.client) return
  syncWithStorage()
  if (loggedIn.value) {
    void adminSettings.fetchFromServerIfLoggedIn().finally(() => {
      applyAccentAndTheme()
      void nextTick(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            showThemeGate.value = false
          })
        })
      })
    })
  } else {
    applyAccentAndTheme()
    void nextTick(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          showThemeGate.value = false
        })
      })
    })
  }
})

watch(
  () => [adminSettings.themeMode, adminSettings.accent] as const,
  () => applyAccentAndTheme(),
)
</script>

<template>
  <div class="min-h-screen bg-surface-950 text-surface-100">
    <transition
      enter-active-class="transition-opacity duration-150 ease-out"
      leave-active-class="transition-opacity duration-150 ease-out"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showThemeGate"
        class="fixed inset-0 z-[1200] flex items-center justify-center bg-[#161a22] text-white"
      >
        <i class="pi pi-spin pi-spinner text-[#c4c9d4] text-2xl" />
      </div>
    </transition>
    <header
      class="sticky top-0 z-40 border-b border-surface-800 bg-surface-900/95 backdrop-blur"
    >
      <div class="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between px-4 sm:px-6">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-surface-100">
            {{ t('admin.layout.header_title') }}
          </p>
          <p class="truncate text-xs text-surface-400">
            {{ t('admin.layout.header_subtitle') }}
          </p>
        </div>
        <NuxtLink
          to="/admin"
          class="rounded-lg border border-surface-700 px-3 py-1.5 text-xs font-semibold text-surface-200 transition hover:border-surface-500 hover:text-surface-0"
        >
          К админке
        </NuxtLink>
      </div>
    </header>

    <main class="mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-6 sm:py-6 lg:px-10 2xl:px-14">
      <slot />
    </main>
  </div>
</template>

import {
  applyAdminThemeAndAccent,
  bindSystemThemeListener,
} from '~/composables/useAdminAppearance'
import { useAdminSettingsStore } from '~/stores/adminSettings'

export default defineNuxtPlugin({
  name: 'admin-appearance',
  setup(nuxtApp) {
    if (import.meta.server) return

    const store = useAdminSettingsStore()
    store.hydrate()
    applyAdminThemeAndAccent({
      themeMode: store.themeMode,
      accent: store.accent,
    })

    let unbind: (() => void) | undefined
    nuxtApp.hook('app:mounted', () => {
      unbind?.()
      unbind = bindSystemThemeListener()
    })
  },
})

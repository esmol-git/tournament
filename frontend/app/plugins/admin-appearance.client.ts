import {
  applyAdminThemeAndAccent,
  bindSystemThemeListener,
} from '~/composables/useAdminAppearance'
import { useAdminSettingsStore } from '~/stores/adminSettings'

export default defineNuxtPlugin({
  name: 'admin-appearance',
  setup(nuxtApp) {
    if (import.meta.server) return

    const router = useRouter()
    const store = useAdminSettingsStore()

    let unbindSystem: (() => void) | undefined

    function syncRoute() {
      const path = router.currentRoute.value.path
      const isAdmin = path.startsWith('/admin') || path.startsWith('/platform')

      unbindSystem?.()
      unbindSystem = undefined

      if (isAdmin) {
        store.hydrate()
        applyAdminThemeAndAccent({
          themeMode: store.themeMode,
          accent: store.accent,
        })
        unbindSystem = bindSystemThemeListener()
      } else {
        document.documentElement.removeAttribute('data-accent')
      }
    }

    syncRoute()
    router.afterEach(() => syncRoute())

    nuxtApp.hook('app:mounted', () => {
      syncRoute()
    })
  },
})

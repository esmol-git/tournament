import {
  applyAdminLocale,
  syncThemeAndAccentFromStore,
} from '~/composables/useAdminAppearance'
import { useAuth } from '~/composables/useAuth'
import { useAdminSettingsStore } from '~/stores/adminSettings'

export default defineNuxtRouteMiddleware(async (to) => {
  // Защищаем только маршруты админки, публичные страницы не трогаем
  if (!to.path.startsWith('/admin')) {
    return
  }

  const { loggedIn, syncWithStorage } = useAuth()

  if (import.meta.client) {
    syncWithStorage()
  }

  const isAuthPage = to.path === '/admin/login'
  const isSubscriptionExpiredPage = to.path === '/admin/subscription-expired'
  const isAccessDeniedPage = to.path === '/admin/access-denied'

  if (!loggedIn.value && !isAuthPage && !isSubscriptionExpiredPage && !isAccessDeniedPage) {
    return navigateTo('/admin/login')
  }

  if (loggedIn.value && isAuthPage) {
    return navigateTo('/admin')
  }

  if (isAccessDeniedPage && !loggedIn.value) {
    return navigateTo('/admin/login')
  }

  /**
   * До монтирования страниц админки подтягиваем ui-settings — иначе первым уходит
   * запрос данных (players и т.д.), тема с сервера применяется позже и даёт мигание.
   */
  if (
    import.meta.client &&
    loggedIn.value &&
    !isAuthPage &&
    !isSubscriptionExpiredPage &&
    !isAccessDeniedPage
  ) {
    const adminSettings = useAdminSettingsStore()
    await adminSettings.fetchFromServerIfLoggedIn()
    try {
      syncThemeAndAccentFromStore()
      const nuxtApp = useNuxtApp()
      const { locale, setLocale } = useI18n()
      const code = adminSettings.locale
      if (locale.value !== code) {
        setLocale(code)
      }
      applyAdminLocale(code, nuxtApp)
    } catch {
      /* тема уже применена из стора; i18n может быть недоступен в редких контекстах middleware */
    }
  }
})


import { storeToRefs } from 'pinia'
import { useAuthStore } from '~/stores/auth'

/**
 * Обёртка над `useAuthStore`: тот же API, что раньше, но состояние в Pinia.
 * Новый код может вызывать `useAuthStore()` напрямую.
 */
export function useAuth() {
  const store = useAuthStore()
  const { token, refreshToken, user, loggedIn } = storeToRefs(store)

  return {
    token,
    refreshToken,
    user,
    loggedIn,
    setSession: store.setSession,
    clearSession: store.clearSession,
    clearSessionWithServerLogout: store.clearSessionWithServerLogout,
    syncWithStorage: store.syncWithStorage,
    restoreSessionViaRefreshCookieIfNeeded: store.restoreSessionViaRefreshCookieIfNeeded,
    fetchMe: store.fetchMe,
    authFetch: store.authFetch,
    authFetchBlob: store.authFetchBlob,
  }
}

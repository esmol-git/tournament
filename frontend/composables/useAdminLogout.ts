import { useRouter } from 'vue-router'
import { useApiUrl } from './useApiUrl'
import { useAuth } from './useAuth'
import { useMetaStore } from '~/stores/meta'

/** Выход из админки: POST /auth/logout, очистка сессии, редирект на логин */
export function useAdminLogout() {
  const router = useRouter()
  const { apiUrl } = useApiUrl()
  const { token, clearSession } = useAuth()
  const metaStore = useMetaStore()

  const logout = async () => {
    try {
      await $fetch(apiUrl('/auth/logout'), {
        method: 'POST',
        credentials: 'include',
        headers: token.value
          ? {
              Authorization: `Bearer ${token.value}`,
            }
          : undefined,
      })
    } catch {
      // даже если запрос упал, локальный logout всё равно выполняем
    } finally {
      clearSession()
      metaStore.clearRoles()
      await router.push('/admin/login')
    }
  }

  return { logout }
}

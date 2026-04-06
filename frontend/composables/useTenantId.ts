import { computed } from 'vue'
import { useAuth } from './useAuth'

type AuthUserLite = { tenantId?: string }

/** `tenantId` текущего пользователя для API tenant-scoped маршрутов */
export function useTenantId() {
  const { user } = useAuth()
  return computed(() => {
    const u = user.value as AuthUserLite | null
    return u?.tenantId ?? 'default'
  })
}

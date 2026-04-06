import { computed } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { readTenantStaffRole } from '~/utils/tenantStaffRole'

/**
 * Глобальная роль MODERATOR в организации (tenant user.role === 'MODERATOR').
 * Для read-only на маршрутах команд/игроков/списка турниров используйте {@link useAdminOrgModeratorReadOnly}.
 */
export function useGlobalModeratorReadOnly() {
  const { user } = useAuth()
  return computed(() => readTenantStaffRole(user.value) === 'MODERATOR')
}

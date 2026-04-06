import { computed } from 'vue'
import { resolveAdminOrgModeratorReadOnly } from '~/constants/adminModeratorOrgPolicy'
import { useGlobalModeratorReadOnly } from '~/composables/useGlobalModeratorReadOnly'

/**
 * Read-only UI для глобальной роли MODERATOR на «организационных» страницах (команды, игроки, список турниров).
 * Источник правды: {@link resolveAdminOrgModeratorReadOnly} + `route.meta.adminOrgModeratorReadOnly`.
 */
export function useAdminOrgModeratorReadOnly() {
  const route = useRoute()
  const isGlobalModerator = useGlobalModeratorReadOnly()

  return computed(() => {
    if (!isGlobalModerator.value) return false
    return resolveAdminOrgModeratorReadOnly(route.path, route.meta.adminOrgModeratorReadOnly)
  })
}

import { computed, type ComputedRef } from 'vue'
import { useGlobalModeratorReadOnly } from '~/composables/useGlobalModeratorReadOnly'

/**
 * Ограничения для глобальной роли MODERATOR на `/admin/tournaments/[id]`.
 * Один вход вместо разрозненных `if (isGlobalModerator)`; при расхождении с бэкендом правьте здесь.
 *
 * См. также `ROLE_PERMISSIONS` / `STAFF` на бэкенде (`permissions.matrix.ts`).
 */
export type AdminGlobalModeratorTournamentPolicy = {
  /** Публикация, публичная карточка, правки черновика (состав, группы, рейтинги и т.д.). */
  locksTournamentPublishingAndDraftStructure: boolean
  /** Автогенерация/очистка календаря, плей-офф из групп, drag порядка матчей в дне. */
  locksCalendarAndPlayoffAutomation: boolean
}

export function useAdminGlobalModeratorTournamentPolicy(): ComputedRef<AdminGlobalModeratorTournamentPolicy> {
  const isOrgModerator = useGlobalModeratorReadOnly()
  return computed(() => {
    const g = isOrgModerator.value
    return {
      locksTournamentPublishingAndDraftStructure: g,
      locksCalendarAndPlayoffAutomation: g,
    }
  })
}

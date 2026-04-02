import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { PublicTenantMeta } from '~/composables/usePublicTournamentFetch'
import type { usePublicTournamentSelection } from '~/composables/usePublicTournamentSelection'

export type PublicTournamentWorkspaceInject = ReturnType<typeof usePublicTournamentSelection> & {
  tenant: ComputedRef<string>
  tenantMeta: Ref<PublicTenantMeta | null>
  tenantNotFound: Ref<boolean>
  ensureTenantResolved: () => Promise<void>
  /** Флаг «страница ещё грузит основной контент» — усиливает loading у сайдбара */
  pageContentLoading: Ref<boolean>
  workspaceReady: Ref<boolean>
  /** Таблица: склеить нижний край сайдбара с блоком статистики в `sidebar-extra` */
  sidebarUnifiedBottom: Ref<boolean>
}

export const publicTournamentWorkspaceKey: InjectionKey<PublicTournamentWorkspaceInject> = Symbol(
  'publicTournamentWorkspace',
)

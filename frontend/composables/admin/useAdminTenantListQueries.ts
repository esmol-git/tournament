import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import type { TeamRow } from '~/types/admin/team'
import type { TournamentListResponse, TournamentRow } from '~/types/admin/tournaments-index'
import type { TeamLite } from '~/types/tournament-admin'
import { useApiUrl } from '~/composables/useApiUrl'
import { useAuth } from '~/composables/useAuth'
import { useTenantId } from '~/composables/useTenantId'
import {
  adminTenantQueryKeys,
  ADMIN_TENANT_QUERY_STALE_MS,
} from '~/composables/admin/adminTenantQueryKeys'

function mapTeamRowToLite(row: TeamRow): TeamLite {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
  }
}

async function fetchAllTeamsPages(
  authFetch: <T>(url: string, opts?: Record<string, unknown>) => Promise<T>,
  apiUrl: (p: string) => string,
  tenantId: string,
  token: string,
  listParams: Record<string, string | number | undefined>,
): Promise<TeamLite[]> {
  const headers = { Authorization: `Bearer ${token}` }
  const all: TeamLite[] = []
  let page = 1
  let total = 0
  do {
    const res = await authFetch<{ items: TeamRow[]; total: number }>(
      apiUrl(`/tenants/${tenantId}/teams`),
      {
        headers,
        params: { page, pageSize: 100, ...listParams },
      },
    )
    const items = res.items ?? []
    total = res.total ?? items.length
    for (const row of items) {
      all.push(mapTeamRowToLite(row))
    }
    page += 1
    if (!items.length) break
  } while (all.length < total)
  return all
}

/** Все команды тенанта — общий кэш для матчей, календаря, состава турнира. */
export function useAdminTenantTeamsAllQuery() {
  const { token, authFetch } = useAuth()
  const { apiUrl } = useApiUrl()
  const tenantId = useTenantId()

  const q = useQuery({
    queryKey: computed(() => adminTenantQueryKeys.teamsAll(tenantId.value)),
    enabled: computed(() => !!token.value),
    staleTime: ADMIN_TENANT_QUERY_STALE_MS,
    queryFn: async () => {
      const t = token.value!
      return fetchAllTeamsPages(authFetch, apiUrl, tenantId.value, t, {})
    },
  })

  return {
    teams: computed(() => q.data.value ?? []),
    teamsLoading: computed(() => q.isPending.value || q.isFetching.value),
    /** Ошибка последнего запроса списка команд (для AdminDataState / «Повторить»). */
    teamsQueryError: computed(() => (q.isError.value ? q.error.value : null)),
    refetch: () => q.refetch(),
  }
}

/** Команды для формы создания/редактирования турнира (фильтр по возрасту). */
export function useAdminTenantTeamsTournamentFormQuery(options: {
  showForm: Ref<boolean>
  ageGroupId: Ref<string>
}) {
  const { token, authFetch } = useAuth()
  const { apiUrl } = useApiUrl()
  const tenantId = useTenantId()

  const ageKey = computed(() => {
    const trimmed = options.ageGroupId.value.trim()
    return trimmed || 'none'
  })

  const q = useQuery({
    queryKey: computed(() =>
      adminTenantQueryKeys.teamsTournamentForm(tenantId.value, ageKey.value),
    ),
    enabled: computed(() => !!token.value && options.showForm.value),
    staleTime: ADMIN_TENANT_QUERY_STALE_MS,
    queryFn: async () => {
      const t = token.value!
      const ag = options.ageGroupId.value.trim()
      return fetchAllTeamsPages(authFetch, apiUrl, tenantId.value, t, ag ? { ageGroupId: ag } : {})
    },
  })

  return {
    teams: computed(() => q.data.value ?? []),
    teamsLoading: computed(() => q.isPending.value || q.isFetching.value),
    refetchTeamsLite: () => q.refetch(),
  }
}

/** Полный список турниров для селектов (без фильтров таблицы списка). */
export function useAdminTenantTournamentsAllQuery() {
  const { token, authFetch } = useAuth()
  const { apiUrl } = useApiUrl()
  const tenantId = useTenantId()

  const q = useQuery({
    queryKey: computed(() => adminTenantQueryKeys.tournamentsAll(tenantId.value)),
    enabled: computed(() => !!token.value),
    staleTime: ADMIN_TENANT_QUERY_STALE_MS,
    queryFn: async () => {
      const headers = { Authorization: `Bearer ${token.value!}` }
      const loaded: TournamentRow[] = []
      let page = 1
      let total = 0
      do {
        const res = await authFetch<TournamentListResponse>(
          apiUrl(`/tenants/${tenantId.value}/tournaments`),
          {
            headers,
            params: { page, pageSize: 100 },
          },
        )
        const items = res.items ?? []
        total = res.total ?? items.length
        loaded.push(...items)
        page += 1
        if (!items.length) break
      } while (loaded.length < total)
      return loaded
    },
  })

  return {
    tournaments: computed(() => q.data.value ?? []),
    tournamentsLoading: computed(() => q.isPending.value || q.isFetching.value),
    refetch: () => q.refetch(),
  }
}

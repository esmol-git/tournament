import {
  adminTenantQueryKeys,
  ADMIN_TENANT_QUERY_STALE_MS,
} from '~/composables/admin/adminTenantQueryKeys'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, unref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { AgeGroupRow } from '~/types/admin/age-group'
import type { CompetitionRow } from '~/types/admin/competition'
import type { RefereeRow } from '~/types/admin/referee'
import type { SeasonRow } from '~/types/admin/season'
import type { StadiumRow } from '~/types/admin/stadium'

type FetchFn = <T>(url: string, opts?: Record<string, unknown>) => Promise<T>

type Deps = {
  token: { value: string | null }
  tenantId: { value: string }
  apiUrl: (path: string) => string
  authFetch: FetchFn
  /**
   * Сезоны и возрастные группы (`reference_directory_basic` на бэкенде).
   * Без флага — запросы выполняются (обратная совместимость).
   */
  canAccessReferenceBasic?: Ref<boolean> | ComputedRef<boolean>
  /**
   * Типы соревнований, стадионы, судьи (`reference_directory_standard`).
   */
  canAccessReferenceStandard?: Ref<boolean> | ComputedRef<boolean>
}

function allowRefBasic(deps: Deps) {
  const c = deps.canAccessReferenceBasic
  return c === undefined ? true : !!unref(c)
}

function allowRefStandard(deps: Deps) {
  const c = deps.canAccessReferenceStandard
  return c === undefined ? true : !!unref(c)
}

type StadiumsRefereesBundle = { stadiums: StadiumRow[]; referees: RefereeRow[] }

export function useTournamentReferences(deps: Deps) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()

  const tenantId = computed(() => deps.tenantId.value)
  const tokenReady = computed(() => !!deps.token.value)

  const seasonsEnabled = computed(() => tokenReady.value && allowRefBasic(deps))
  const standardEnabled = computed(() => tokenReady.value && allowRefStandard(deps))

  const authHeader = () => ({
    headers: { Authorization: `Bearer ${deps.token.value!}` },
  })

  const seasonsQuery = useQuery({
    queryKey: computed(() => adminTenantQueryKeys.seasons(tenantId.value)),
    enabled: seasonsEnabled,
    staleTime: ADMIN_TENANT_QUERY_STALE_MS,
    queryFn: async (): Promise<SeasonRow[]> => {
      try {
        return await deps.authFetch<SeasonRow[]>(
          deps.apiUrl(`/tenants/${deps.tenantId.value}/seasons`),
          authHeader(),
        )
      } catch {
        return []
      }
    },
  })

  const competitionsQuery = useQuery({
    queryKey: computed(() => adminTenantQueryKeys.competitions(tenantId.value)),
    enabled: standardEnabled,
    staleTime: ADMIN_TENANT_QUERY_STALE_MS,
    queryFn: async (): Promise<CompetitionRow[]> => {
      try {
        return await deps.authFetch<CompetitionRow[]>(
          deps.apiUrl(`/tenants/${deps.tenantId.value}/competitions`),
          authHeader(),
        )
      } catch {
        return []
      }
    },
  })

  const ageGroupsQuery = useQuery({
    queryKey: computed(() => adminTenantQueryKeys.ageGroups(tenantId.value)),
    enabled: seasonsEnabled,
    staleTime: ADMIN_TENANT_QUERY_STALE_MS,
    queryFn: async (): Promise<AgeGroupRow[]> => {
      try {
        return await deps.authFetch<AgeGroupRow[]>(
          deps.apiUrl(`/tenants/${deps.tenantId.value}/age-groups`),
          authHeader(),
        )
      } catch {
        return []
      }
    },
  })

  const stadiumsRefereesQuery = useQuery({
    queryKey: computed(() => adminTenantQueryKeys.stadiumsReferees(tenantId.value)),
    enabled: standardEnabled,
    staleTime: ADMIN_TENANT_QUERY_STALE_MS,
    queryFn: async (): Promise<StadiumsRefereesBundle> => {
      try {
        const h = authHeader()
        const [stadiums, referees] = await Promise.all([
          deps.authFetch<StadiumRow[]>(
            deps.apiUrl(`/tenants/${deps.tenantId.value}/stadiums`),
            h,
          ),
          deps.authFetch<RefereeRow[]>(
            deps.apiUrl(`/tenants/${deps.tenantId.value}/referees`),
            h,
          ),
        ])
        return { stadiums, referees }
      } catch {
        return { stadiums: [], referees: [] }
      }
    },
  })

  const seasonsList = computed(() => seasonsQuery.data.value ?? [])
  const seasonsLoading = computed(() => seasonsQuery.isFetching.value)

  const competitionsList = computed(() => competitionsQuery.data.value ?? [])
  const competitionsLoading = computed(() => competitionsQuery.isFetching.value)

  const ageGroupsList = computed(() => ageGroupsQuery.data.value ?? [])
  const ageGroupsLoading = computed(() => ageGroupsQuery.isFetching.value)

  const stadiumsList = computed(() => stadiumsRefereesQuery.data.value?.stadiums ?? [])
  const refereesList = computed(() => stadiumsRefereesQuery.data.value?.referees ?? [])
  const stadiumsLoading = computed(() => stadiumsRefereesQuery.isFetching.value)
  const refereesLoading = computed(() => stadiumsRefereesQuery.isFetching.value)

  const seasonSelectOptions = computed(() => [
    { label: t('admin.references.season_none'), value: '' },
    ...seasonsList.value
      .slice()
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, locale.value),
      )
      .map((s) => ({
        label: s.active
          ? s.name
          : t('admin.references.inactive_masc', { name: s.name }),
        value: s.id,
      })),
  ])

  const seasonFilterOptions = computed(() => [
    { label: t('admin.references.season_all'), value: '' },
    ...seasonsList.value
      .slice()
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, locale.value),
      )
      .map((s) => ({ label: s.name, value: s.id })),
  ])

  const competitionSelectOptions = computed(() => [
    { label: t('admin.references.competition_none'), value: '' },
    ...competitionsList.value
      .slice()
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, locale.value),
      )
      .map((c) => ({
        label: c.active
          ? c.name
          : t('admin.references.inactive_masc', { name: c.name }),
        value: c.id,
      })),
  ])

  const competitionFilterOptions = computed(() => [
    { label: t('admin.references.competition_all'), value: '' },
    ...competitionsList.value
      .slice()
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, locale.value),
      )
      .map((c) => ({ label: c.name, value: c.id })),
  ])

  const ageGroupSelectOptions = computed(() => [
    { label: t('admin.references.age_group_none'), value: '' },
    ...ageGroupsList.value
      .slice()
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, locale.value),
      )
      .map((g) => ({
        label: g.active
          ? g.name
          : t('admin.references.inactive_fem', { name: g.name }),
        value: g.id,
      })),
  ])

  const ageGroupFilterOptions = computed(() => [
    { label: t('admin.references.age_group_all'), value: '' },
    ...ageGroupsList.value
      .slice()
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, locale.value),
      )
      .map((g) => ({ label: g.name, value: g.id })),
  ])

  const stadiumSelectOptions = computed(() => [
    { label: t('admin.references.stadium_none'), value: '' },
    ...stadiumsList.value.map((s) => ({
      label: s.city ? `${s.name} (${s.city})` : s.name,
      value: s.id,
    })),
  ])

  const stadiumMultiOptions = computed(() =>
    stadiumsList.value.map((s) => ({
      label: s.city ? `${s.name} (${s.city})` : s.name,
      value: s.id,
    })),
  )

  const refereeMultiOptions = computed(() =>
    refereesList.value.map((r) => {
      const name = `${r.lastName} ${r.firstName}`.trim()
      const pos = r.refereePosition?.name?.trim()
      return {
        label: pos ? `${name} — ${pos}` : name,
        value: r.id,
      }
    }),
  )

  async function fetchSeasonsList() {
    if (!deps.token.value || !allowRefBasic(deps)) return
    await queryClient.fetchQuery({
      queryKey: adminTenantQueryKeys.seasons(deps.tenantId.value),
      staleTime: ADMIN_TENANT_QUERY_STALE_MS,
      queryFn: async () => {
        try {
          return await deps.authFetch<SeasonRow[]>(
            deps.apiUrl(`/tenants/${deps.tenantId.value}/seasons`),
            authHeader(),
          )
        } catch {
          return []
        }
      },
    })
  }

  async function fetchCompetitionsList() {
    if (!deps.token.value || !allowRefStandard(deps)) return
    await queryClient.fetchQuery({
      queryKey: adminTenantQueryKeys.competitions(deps.tenantId.value),
      staleTime: ADMIN_TENANT_QUERY_STALE_MS,
      queryFn: async () => {
        try {
          return await deps.authFetch<CompetitionRow[]>(
            deps.apiUrl(`/tenants/${deps.tenantId.value}/competitions`),
            authHeader(),
          )
        } catch {
          return []
        }
      },
    })
  }

  async function fetchAgeGroupsList() {
    if (!deps.token.value || !allowRefBasic(deps)) return
    await queryClient.fetchQuery({
      queryKey: adminTenantQueryKeys.ageGroups(deps.tenantId.value),
      staleTime: ADMIN_TENANT_QUERY_STALE_MS,
      queryFn: async () => {
        try {
          return await deps.authFetch<AgeGroupRow[]>(
            deps.apiUrl(`/tenants/${deps.tenantId.value}/age-groups`),
            authHeader(),
          )
        } catch {
          return []
        }
      },
    })
  }

  async function fetchStadiumsReferees() {
    if (!deps.token.value || !allowRefStandard(deps)) return
    await queryClient.fetchQuery({
      queryKey: adminTenantQueryKeys.stadiumsReferees(deps.tenantId.value),
      staleTime: ADMIN_TENANT_QUERY_STALE_MS,
      queryFn: async (): Promise<StadiumsRefereesBundle> => {
        try {
          const h = authHeader()
          const [stadiums, referees] = await Promise.all([
            deps.authFetch<StadiumRow[]>(
              deps.apiUrl(`/tenants/${deps.tenantId.value}/stadiums`),
              h,
            ),
            deps.authFetch<RefereeRow[]>(
              deps.apiUrl(`/tenants/${deps.tenantId.value}/referees`),
              h,
            ),
          ])
          return { stadiums, referees }
        } catch {
          return { stadiums: [], referees: [] }
        }
      },
    })
  }

  return {
    seasonsList,
    seasonsLoading,
    competitionsList,
    competitionsLoading,
    ageGroupsList,
    ageGroupsLoading,
    stadiumsList,
    stadiumsLoading,
    refereesList,
    refereesLoading,
    seasonSelectOptions,
    seasonFilterOptions,
    competitionSelectOptions,
    competitionFilterOptions,
    ageGroupSelectOptions,
    ageGroupFilterOptions,
    stadiumSelectOptions,
    stadiumMultiOptions,
    refereeMultiOptions,
    fetchSeasonsList,
    fetchCompetitionsList,
    fetchAgeGroupsList,
    fetchStadiumsReferees,
  }
}

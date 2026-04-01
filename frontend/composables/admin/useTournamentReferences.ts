import { computed, ref } from 'vue'
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
}

export function useTournamentReferences(deps: Deps) {
  const seasonsList = ref<SeasonRow[]>([])
  const seasonsLoading = ref(false)

  const competitionsList = ref<CompetitionRow[]>([])
  const competitionsLoading = ref(false)

  const ageGroupsList = ref<AgeGroupRow[]>([])
  const ageGroupsLoading = ref(false)

  const stadiumsList = ref<StadiumRow[]>([])
  const stadiumsLoading = ref(false)

  const refereesList = ref<RefereeRow[]>([])
  const refereesLoading = ref(false)

  const seasonSelectOptions = computed(() => [
    { label: 'Без сезона', value: '' },
    ...seasonsList.value
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'))
      .map((s) => ({
        label: s.active ? s.name : `${s.name} (неактивен)`,
        value: s.id,
      })),
  ])

  const seasonFilterOptions = computed(() => [
    { label: 'Все сезоны', value: '' },
    ...seasonsList.value
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'))
      .map((s) => ({ label: s.name, value: s.id })),
  ])

  const competitionSelectOptions = computed(() => [
    { label: 'Без типа', value: '' },
    ...competitionsList.value
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'))
      .map((c) => ({
        label: c.active ? c.name : `${c.name} (неактивен)`,
        value: c.id,
      })),
  ])

  const competitionFilterOptions = computed(() => [
    { label: 'Все типы', value: '' },
    ...competitionsList.value
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'))
      .map((c) => ({ label: c.name, value: c.id })),
  ])

  const ageGroupSelectOptions = computed(() => [
    { label: 'Без группы', value: '' },
    ...ageGroupsList.value
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'))
      .map((g) => ({
        label: g.active ? g.name : `${g.name} (неактивна)`,
        value: g.id,
      })),
  ])

  const ageGroupFilterOptions = computed(() => [
    { label: 'Все группы', value: '' },
    ...ageGroupsList.value
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'))
      .map((g) => ({ label: g.name, value: g.id })),
  ])

  const stadiumSelectOptions = computed(() => [
    { label: 'Не выбран', value: '' },
    ...stadiumsList.value.map((s) => ({
      label: s.city ? `${s.name} (${s.city})` : s.name,
      value: s.id,
    })),
  ])

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
    if (!deps.token.value) return
    seasonsLoading.value = true
    try {
      seasonsList.value = await deps.authFetch<SeasonRow[]>(
        deps.apiUrl(`/tenants/${deps.tenantId.value}/seasons`),
        { headers: { Authorization: `Bearer ${deps.token.value}` } },
      )
    } catch {
      seasonsList.value = []
    } finally {
      seasonsLoading.value = false
    }
  }

  async function fetchCompetitionsList() {
    if (!deps.token.value) return
    competitionsLoading.value = true
    try {
      competitionsList.value = await deps.authFetch<CompetitionRow[]>(
        deps.apiUrl(`/tenants/${deps.tenantId.value}/competitions`),
        { headers: { Authorization: `Bearer ${deps.token.value}` } },
      )
    } catch {
      competitionsList.value = []
    } finally {
      competitionsLoading.value = false
    }
  }

  async function fetchAgeGroupsList() {
    if (!deps.token.value) return
    ageGroupsLoading.value = true
    try {
      ageGroupsList.value = await deps.authFetch<AgeGroupRow[]>(
        deps.apiUrl(`/tenants/${deps.tenantId.value}/age-groups`),
        { headers: { Authorization: `Bearer ${deps.token.value}` } },
      )
    } catch {
      ageGroupsList.value = []
    } finally {
      ageGroupsLoading.value = false
    }
  }

  async function fetchStadiumsReferees() {
    if (!deps.token.value) return
    stadiumsLoading.value = true
    refereesLoading.value = true
    try {
      const [s, r] = await Promise.all([
        deps.authFetch<StadiumRow[]>(deps.apiUrl(`/tenants/${deps.tenantId.value}/stadiums`), {
          headers: { Authorization: `Bearer ${deps.token.value}` },
        }),
        deps.authFetch<RefereeRow[]>(deps.apiUrl(`/tenants/${deps.tenantId.value}/referees`), {
          headers: { Authorization: `Bearer ${deps.token.value}` },
        }),
      ])
      stadiumsList.value = s
      refereesList.value = r
    } catch {
      stadiumsList.value = []
      refereesList.value = []
    } finally {
      stadiumsLoading.value = false
      refereesLoading.value = false
    }
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
    refereeMultiOptions,
    fetchSeasonsList,
    fetchCompetitionsList,
    fetchAgeGroupsList,
    fetchStadiumsReferees,
  }
}

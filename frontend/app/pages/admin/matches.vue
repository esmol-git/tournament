<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useTabQuerySync } from '~/composables/useTabQuerySync'
import { useApiUrl } from '~/composables/useApiUrl'
import { useMatchProtocolReferences } from '~/composables/useMatchProtocolReferences'
import { useTenantId } from '~/composables/useTenantId'
import useVuelidate from '@vuelidate/core'
import { helpers, required } from '@vuelidate/validators'
import type { MatchRow, TenantTournamentMatchRow } from '~/types/tournament-admin'
import type { TournamentListResponse, TournamentRow } from '~/types/admin/tournaments-index'
import type { TeamLite } from '~/types/tournament-admin'
import { getApiErrorMessage } from '~/utils/apiError'
import { toYmdLocal } from '~/utils/dateYmd'
import {
  formatDateTimeNoSeconds,
  formatMatchScoreDisplay,
  isMatchEditLocked,
  statusLabel,
  statusOptions,
  statusPillClass,
} from '~/utils/tournamentAdminUi'
import { computed, onMounted, reactive, ref, watch } from 'vue'

definePageMeta({ layout: 'admin' })

const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()

const { loadRefs, postponeReasonOptions } = useMatchProtocolReferences()

const loading = ref(false)
const standaloneMatches = ref<MatchRow[]>([])
const teams = ref<TeamLite[]>([])
const tournaments = ref<TournamentRow[]>([])

const activeTab = ref(0)
const { syncFromRoute: syncMatchesTabFromRoute } = useTabQuerySync(activeTab, [
  'standalone',
  'tournament',
] as const)
const loadingTournamentMatches = ref(false)
const tournamentMatches = ref<TenantTournamentMatchRow[]>([])
const tournamentMatchesTotal = ref(0)
const tournamentMatchesPage = ref(1)
const tournamentMatchesPageSize = ref(25)
const tournamentMatchFilterId = ref<string>('')
const tournamentMatchStatusFilter = ref<string>('')
const tournamentMatchTeamFilterId = ref<string>('')
const tournamentMatchDateRange = ref<Date[] | null>(null)
const detachingTournamentMatchId = ref<string | null>(null)

const protocolStandalone = ref(true)
const protocolTournamentIdForDialog = ref<string | null>(null)

const manualTournaments = computed(() =>
  tournaments.value.filter((t) => t.format === 'MANUAL'),
)

function isUnknownPlayoffTeamName(name: string) {
  const normalized = name.trim().toLowerCase()
  return (
    normalized.includes('победитель матча') ||
    normalized.includes('проигравший матча') ||
    /^[a-z]\d+$/i.test(normalized)
  )
}

function shouldHideUnknownPlayoffMatch(m: TenantTournamentMatchRow) {
  if (m.stage !== 'PLAYOFF') return false
  return (
    isUnknownPlayoffTeamName(m.homeTeam.name) ||
    isUnknownPlayoffTeamName(m.awayTeam.name)
  )
}

const visibleTournamentMatches = computed(() =>
  tournamentMatches.value.filter((m) => !shouldHideUnknownPlayoffMatch(m)),
)
const visibleTournamentMatchesWithIndex = computed(() => {
  const offset = (tournamentMatchesPage.value - 1) * tournamentMatchesPageSize.value
  return visibleTournamentMatches.value.map((m, index) => ({
    ...m,
    matchNumber: offset + index + 1,
  }))
})

const teamOptions = computed(() =>
  teams.value.map((t) => ({ label: t.name, value: t.id })),
)

const tournamentStatusFilterOptions = computed(() => [
  { label: 'Все статусы', value: '' },
  ...statusOptions.map((s) => ({ label: s.label, value: s.value })),
])

const tournamentTeamFilterOptions = computed(() => [
  { label: 'Все команды', value: '' },
  ...teamOptions.value,
])

/** Подсветка в колонке «Матч», когда выбран фильтр по команде. */
function isTournamentListTeamHighlighted(teamId: string) {
  const fid = tournamentMatchTeamFilterId.value
  return fid !== '' && fid === teamId
}

const attachTournamentByMatchId = reactive<Record<string, string>>({})

const createOpen = ref(false)
const createSaving = ref(false)
const createSubmitAttempted = ref(false)
const createForm = reactive({
  homeTeamId: '',
  awayTeamId: '',
  startTime: null as Date | null,
})
const createRules = computed(() => ({
  homeTeamId: { required },
  awayTeamId: { required },
  startTime: { required },
}))
const createV$ = useVuelidate(createRules, createForm, { $autoDirty: true })
const createFormErrors = computed(() => ({
  homeTeamId: createForm.homeTeamId ? '' : t('admin.validation.required'),
  awayTeamId: createForm.awayTeamId ? '' : t('admin.validation.required'),
  startTime: createForm.startTime ? '' : t('admin.validation.required_start_time'),
  sameTeams:
    !createForm.homeTeamId ||
    !createForm.awayTeamId ||
    createForm.homeTeamId !== createForm.awayTeamId
      ? ''
      : t('admin.validation.different_values'),
}))
const canCreateMatch = computed(
  () =>
    !createV$.value.$invalid &&
    !createFormErrors.value.homeTeamId &&
    !createFormErrors.value.awayTeamId &&
    !createFormErrors.value.startTime &&
    !createFormErrors.value.sameTeams,
)
const showCreateHomeError = computed(
  () => (createSubmitAttempted.value || createV$.value.homeTeamId.$dirty) && !!createFormErrors.value.homeTeamId,
)
const showCreateAwayError = computed(
  () => (createSubmitAttempted.value || createV$.value.awayTeamId.$dirty) && !!createFormErrors.value.awayTeamId,
)
const showCreateStartError = computed(
  () => (createSubmitAttempted.value || createV$.value.startTime.$dirty) && !!createFormErrors.value.startTime,
)
const showCreateSameTeamsError = computed(
  () => createSubmitAttempted.value && !!createFormErrors.value.sameTeams,
)

const editOpen = ref(false)
const editSaving = ref(false)
const editOriginalStartMs = ref<number | null>(null)
const editSubmitAttempted = ref(false)
const editForm = reactive({
  matchId: '',
  homeTeamId: '',
  awayTeamId: '',
  startTime: null as Date | null,
  scheduleChangeReasonId: '' as string,
})
const editStartChanged = computed(
  () =>
    editForm.startTime != null &&
    editOriginalStartMs.value != null &&
    editForm.startTime.getTime() !== editOriginalStartMs.value,
)
const editRules = computed(() => ({
  homeTeamId: { required },
  awayTeamId: { required },
  startTime: { required },
  scheduleChangeReasonId: {
    requiredWhenStartChanged: helpers.withMessage(
      'reason required',
      (v: unknown) => !editStartChanged.value || !!String(v ?? '').trim(),
    ),
  },
}))
const editV$ = useVuelidate(editRules, editForm, { $autoDirty: true })
const editFormErrors = computed(() => ({
  homeTeamId: editForm.homeTeamId ? '' : t('admin.validation.required'),
  awayTeamId: editForm.awayTeamId ? '' : t('admin.validation.required'),
  startTime: editForm.startTime ? '' : t('admin.validation.required_start_time'),
  sameTeams:
    !editForm.homeTeamId ||
    !editForm.awayTeamId ||
    editForm.homeTeamId !== editForm.awayTeamId
      ? ''
      : t('admin.validation.different_values'),
  scheduleChangeReasonId:
    !editStartChanged.value || editForm.scheduleChangeReasonId
      ? ''
      : t('admin.validation.required_reason'),
}))
const canEditMatch = computed(
  () =>
    !editV$.value.$invalid &&
    !editFormErrors.value.homeTeamId &&
    !editFormErrors.value.awayTeamId &&
    !editFormErrors.value.startTime &&
    !editFormErrors.value.sameTeams &&
    !editFormErrors.value.scheduleChangeReasonId,
)
const showEditHomeError = computed(
  () => (editSubmitAttempted.value || editV$.value.homeTeamId.$dirty) && !!editFormErrors.value.homeTeamId,
)
const showEditAwayError = computed(
  () => (editSubmitAttempted.value || editV$.value.awayTeamId.$dirty) && !!editFormErrors.value.awayTeamId,
)
const showEditStartError = computed(
  () => (editSubmitAttempted.value || editV$.value.startTime.$dirty) && !!editFormErrors.value.startTime,
)
const showEditSameTeamsError = computed(
  () => editSubmitAttempted.value && !!editFormErrors.value.sameTeams,
)
const showEditScheduleReasonError = computed(
  () =>
    (editSubmitAttempted.value || editV$.value.scheduleChangeReasonId.$dirty) &&
    !!editFormErrors.value.scheduleChangeReasonId,
)

const protocolOpen = ref(false)
const protocolMatch = ref<MatchRow | null>(null)

const deletingId = ref<string | null>(null)

const fetchStandalone = async () => {
  if (!token.value) return
  loading.value = true
  try {
    const res = await authFetch<MatchRow[]>(
      apiUrl(`/tenants/${tenantId.value}/standalone-matches`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
    standaloneMatches.value = res
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось загрузить матчи',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    loading.value = false
  }
}

const fetchTournamentMatchesList = async () => {
  if (!token.value) return
  loadingTournamentMatches.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(tournamentMatchesPage.value))
    params.set('pageSize', String(tournamentMatchesPageSize.value))
    params.set('excludeUndeterminedPlayoff', 'true')
    if (tournamentMatchFilterId.value) {
      params.set('tournamentId', tournamentMatchFilterId.value)
    }
    if (tournamentMatchStatusFilter.value) {
      params.set('status', tournamentMatchStatusFilter.value)
    }
    if (tournamentMatchTeamFilterId.value) {
      params.set('teamId', tournamentMatchTeamFilterId.value)
    }
    const dr = tournamentMatchDateRange.value
    if (Array.isArray(dr) && dr[0]) {
      params.set('dateFrom', toYmdLocal(dr[0]))
      if (dr[1]) params.set('dateTo', toYmdLocal(dr[1]))
    }
    const res = await authFetch<{
      items: TenantTournamentMatchRow[]
      total: number
    }>(apiUrl(`/tenants/${tenantId.value}/matches?${params.toString()}`), {
      headers: { Authorization: `Bearer ${token.value}` },
    })
    tournamentMatches.value = res.items ?? []
    tournamentMatchesTotal.value = typeof res.total === 'number' ? res.total : res.items?.length ?? 0
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось загрузить матчи турниров',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
    tournamentMatches.value = []
    tournamentMatchesTotal.value = 0
  } finally {
    loadingTournamentMatches.value = false
  }
}

function onTournamentPaginatorPage(e: { first: number; rows: number; page: number }) {
  tournamentMatchesPage.value = e.page + 1
  tournamentMatchesPageSize.value = e.rows
  void fetchTournamentMatchesList()
}

const fetchTeams = async () => {
  if (!token.value) return
  try {
    const res = await authFetch<{ items: TeamLite[]; total: number }>(
      apiUrl(`/tenants/${tenantId.value}/teams`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
    teams.value = res.items ?? []
  } catch {
    teams.value = []
  }
}

const fetchTournaments = async () => {
  if (!token.value) return
  try {
    const loaded: TournamentRow[] = []
    let page = 1
    let total = 0
    do {
      const res = await authFetch<TournamentListResponse>(
        apiUrl(`/tenants/${tenantId.value}/tournaments`),
        {
          headers: { Authorization: `Bearer ${token.value}` },
          params: { page, pageSize: 100 },
        },
      )
      const items = res.items ?? []
      total = res.total ?? items.length
      loaded.push(...items)
      page += 1
      if (!items.length) break
    } while (loaded.length < total)
    tournaments.value = loaded
  } catch {
    tournaments.value = []
  }
}

const openCreate = () => {
  createSubmitAttempted.value = false
  createForm.homeTeamId = ''
  createForm.awayTeamId = ''
  createForm.startTime = new Date()
  createV$.value.$reset()
  createOpen.value = true
}

const submitCreate = async () => {
  if (!token.value) return
  createSubmitAttempted.value = true
  createV$.value.$touch()
  if (!canCreateMatch.value) {
    return
  }
  createSaving.value = true
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/standalone-matches`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
      body: {
        homeTeamId: createForm.homeTeamId,
        awayTeamId: createForm.awayTeamId,
        startTime: createForm.startTime.toISOString(),
      },
    })
    createOpen.value = false
    await fetchStandalone()
    toast.add({ severity: 'success', summary: 'Матч создан', life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось создать матч',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    createSaving.value = false
  }
}

const openEdit = async (m: MatchRow) => {
  if (isMatchEditLocked(m.status)) {
    toast.add({
      severity: 'info',
      summary: 'Матч завершён',
      detail: 'Расписание и состав завершённого матча нельзя менять.',
      life: 4000,
    })
    return
  }
  if (token.value) {
    await loadRefs(authFetch, apiUrl, token.value, tenantId.value)
  }
  editForm.matchId = m.id
  editForm.homeTeamId = m.homeTeam.id
  editForm.awayTeamId = m.awayTeam.id
  editForm.startTime = new Date(m.startTime)
  editOriginalStartMs.value = editForm.startTime.getTime()
  editForm.scheduleChangeReasonId = ''
  editSubmitAttempted.value = false
  editV$.value.$reset()
  editOpen.value = true
}

const submitEdit = async () => {
  if (!token.value || !editForm.matchId || !editForm.startTime) return
  editSubmitAttempted.value = true
  editV$.value.$touch()
  if (!canEditMatch.value) {
    return
  }
  editSaving.value = true
  try {
    const body: Record<string, unknown> = {
      startTime: editForm.startTime.toISOString(),
      homeTeamId: editForm.homeTeamId,
      awayTeamId: editForm.awayTeamId,
    }
    if (editStartChanged.value) {
      body.scheduleChangeReasonId = editForm.scheduleChangeReasonId
    }
    await authFetch(
      apiUrl(`/tenants/${tenantId.value}/standalone-matches/${editForm.matchId}`),
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      },
    )
    editOpen.value = false
    await fetchStandalone()
    toast.add({ severity: 'success', summary: 'Сохранено', life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    editSaving.value = false
  }
}

const openProtocolStandalone = (m: MatchRow) => {
  protocolStandalone.value = true
  protocolTournamentIdForDialog.value = null
  protocolMatch.value = m
  protocolOpen.value = true
}

const openProtocolFromTournament = (m: TenantTournamentMatchRow) => {
  protocolStandalone.value = false
  protocolTournamentIdForDialog.value = m.tournament.id
  protocolMatch.value = m
  protocolOpen.value = true
}

const onProtocolSaved = async () => {
  await fetchStandalone()
  if (activeTab.value === 1) await fetchTournamentMatchesList()
}

const deleteMatchConfirmOpen = ref(false)
const matchToDelete = ref<MatchRow | null>(null)
const deleteMatchMessage =
  'Удалить этот матч? Он исчезнет из списка свободных матчей; восстановить его нельзя.'

function requestDeleteMatch(m: MatchRow) {
  if (!token.value) return
  if (isMatchEditLocked(m.status)) {
    toast.add({
      severity: 'info',
      summary: 'Матч завершён',
      detail: 'Удаление завершённых матчей недоступно.',
      life: 4000,
    })
    return
  }
  matchToDelete.value = m
  deleteMatchConfirmOpen.value = true
}

async function confirmDeleteMatch() {
  const m = matchToDelete.value
  if (!token.value || !m) return
  deletingId.value = m.id
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/standalone-matches/${m.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await fetchStandalone()
    toast.add({ severity: 'success', summary: 'Матч удалён', life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось удалить',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    deletingId.value = null
    matchToDelete.value = null
  }
}

const attachToTournament = async (m: MatchRow) => {
  if (isMatchEditLocked(m.status)) {
    toast.add({
      severity: 'info',
      summary: 'Матч завершён',
      detail: 'Нельзя прикрепить завершённый матч к турниру.',
      life: 4000,
    })
    return
  }
  const tid = attachTournamentByMatchId[m.id]
  if (!token.value || !tid) {
    toast.add({
      severity: 'warn',
      summary: 'Выберите турнир',
      detail: 'Нужен турнир с ручным расписанием (MANUAL), куда уже включены обе команды.',
      life: 5000,
    })
    return
  }
  try {
    await authFetch(
      apiUrl(`/tenants/${tenantId.value}/standalone-matches/${m.id}/attach`),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { tournamentId: tid },
      },
    )
    delete attachTournamentByMatchId[m.id]
    await fetchStandalone()
    toast.add({
      severity: 'success',
      summary: 'Матч прикреплён к турниру',
      detail: 'Матч появился в турнире; таблица пересчитана.',
      life: 4000,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось прикрепить',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  }
}

const detachMatchConfirmOpen = ref(false)
const tournamentMatchToDetach = ref<TenantTournamentMatchRow | null>(null)
const detachMatchMessage =
  'Открепить матч от турнира? Он появится среди свободных; таблица турнира пересчитается.'

function requestDetachTournamentMatch(m: TenantTournamentMatchRow) {
  if (!token.value) return
  if (m.tournament.format !== 'MANUAL') {
    toast.add({
      severity: 'warn',
      summary: 'Только MANUAL',
      detail: 'Открепление доступно для турниров с ручным расписанием.',
      life: 5000,
    })
    return
  }
  if (isMatchEditLocked(m.status)) {
    toast.add({
      severity: 'info',
      summary: 'Матч завершён',
      detail: 'Нельзя открепить завершённый матч.',
      life: 4000,
    })
    return
  }
  tournamentMatchToDetach.value = m
  detachMatchConfirmOpen.value = true
}

async function confirmDetachTournamentMatch() {
  const m = tournamentMatchToDetach.value
  if (!token.value || !m) return
  detachingTournamentMatchId.value = m.id
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/matches/${m.id}/detach`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await Promise.all([fetchTournamentMatchesList(), fetchStandalone()])
    toast.add({
      severity: 'success',
      summary: 'Матч откреплён',
      life: 3000,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось открепить',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    detachingTournamentMatchId.value = null
    tournamentMatchToDetach.value = null
  }
}

let tournamentListFiltersTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [
    tournamentMatchFilterId,
    tournamentMatchStatusFilter,
    tournamentMatchTeamFilterId,
    tournamentMatchDateRange,
  ],
  () => {
    tournamentMatchesPage.value = 1
    if (tournamentListFiltersTimer) clearTimeout(tournamentListFiltersTimer)
    tournamentListFiltersTimer = setTimeout(() => {
      if (activeTab.value === 1) void fetchTournamentMatchesList()
    }, 350)
  },
  { deep: true },
)

watch(activeTab, (i) => {
  if (i === 1) void fetchTournamentMatchesList()
})

onMounted(async () => {
  if (typeof window !== 'undefined') {
    syncWithStorage()
    if (!loggedIn.value) {
      router.push('/admin/login')
      return
    }
  }
  await Promise.all([fetchTeams(), fetchTournaments(), fetchStandalone()])
  syncMatchesTabFromRoute()
  if (activeTab.value === 1) void fetchTournamentMatchesList()
})
</script>

<template>
  <section class="p-6 space-y-8">
    <div>
      <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">Матчи</h1>
      <p class="mt-2 text-sm text-muted-color max-w-3xl">
        Создавайте матчи <strong>без привязки к турниру</strong>, ведите протокол, затем
        <strong>прикрепляйте</strong> к турниру с <strong>ручным расписанием</strong> (MANUAL). В турнире в
        <strong>«Составах»</strong> должны быть обе команды; если групп несколько — они должны быть в
        <strong>одной и той же группе</strong> (иначе матч не попадёт в групповую таблицу). Удобнее сразу вести
        расписание в карточке турнира: вкладка «Матчи» → «Добавить матч».
      </p>
    </div>

    <TabView v-model:activeIndex="activeTab">
      <TabPanel header="Свободные матчи">
    <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
          Без турнира
        </h2>
        <Button
          label="Создать матч"
          icon="pi pi-plus"
          size="small"
          :disabled="teams.length < 2"
          @click="openCreate"
        />
      </div>
      <p v-if="teams.length < 2" class="mt-2 text-xs text-muted-color">
        Нужно минимум две команды в арендаторе — добавьте их в разделе команд.
      </p>
      <p v-else-if="!manualTournaments.length" class="mt-2 text-xs text-muted-color">
        Пока нет турниров формата «только ручное расписание» (MANUAL) — прикрепление будет доступно после их
        создания.
      </p>
      <p v-else class="mt-2 text-xs text-muted-color max-w-3xl">
        Прикрепление проверяет состав турнира и, при нескольких группах, что обе команды в одной группе; при успехе у
        матча проставится нужный <code class="text-xs">groupId</code> для таблицы.
      </p>

      <div v-if="loading" class="mt-4 text-sm text-muted-color">Загрузка…</div>
      <div v-else-if="!standaloneMatches.length" class="mt-4 text-sm text-muted-color">
        Пока нет свободных матчей.
      </div>

      <DataTable
        v-else
        :value="standaloneMatches"
        dataKey="id"
        stripedRows
        size="small"
        class="mt-4"
      >
        <Column field="startTime" header="Начало" style="width: 9.5rem; min-width: 9rem">
          <template #body="{ data }">
            <span class="tabular-nums text-sm">{{ formatDateTimeNoSeconds(data.startTime) }}</span>
          </template>
        </Column>
        <Column header="Матч" style="min-width: 12rem; max-width: 22rem">
          <template #body="{ data }">
            <div class="flex items-baseline gap-1.5 min-w-0 text-sm">
              <span class="font-medium truncate" :title="data.homeTeam.name">{{ data.homeTeam.name }}</span>
              <span class="text-muted-color shrink-0 text-xs">—</span>
              <span class="font-medium truncate" :title="data.awayTeam.name">{{ data.awayTeam.name }}</span>
            </div>
          </template>
        </Column>
        <Column header="Счёт" style="min-width: 8rem; width: 8.75rem">
          <template #body="{ data }">
            <span
              v-if="data.homeScore !== null && data.awayScore !== null"
              class="tabular-nums text-sm font-medium whitespace-nowrap"
            >
              {{ formatMatchScoreDisplay(data) }}
            </span>
            <span v-else class="text-muted-color">—</span>
          </template>
        </Column>
        <Column header="Статус" style="width: 7.5rem">
          <template #body="{ data }">
            <span :class="statusPillClass(data.status)" class="!text-[11px] !py-0.5 !px-1.5">
              {{ statusLabel(data.status) }}
            </span>
          </template>
        </Column>
        <Column style="min-width: 11.5rem; width: 13rem">
          <template #header>
            <span v-tooltip.top="'Только турниры с ручным расписанием (MANUAL)'">К турниру</span>
          </template>
          <template #body="{ data }">
            <div class="flex items-center gap-1.5">
              <Select
                v-model="attachTournamentByMatchId[data.id]"
                :options="manualTournaments.map((t) => ({ label: t.name, value: t.id }))"
                optionLabel="label"
                optionValue="value"
                class="flex-1 min-w-0 max-w-[10rem]"
                size="small"
                placeholder="Турнир"
                :disabled="!manualTournaments.length || isMatchEditLocked(data.status)"
              />
              <Button
                icon="pi pi-link"
                severity="secondary"
                outlined
                size="small"
                class="!shrink-0 !w-8 !h-8 !p-0"
                :disabled="!manualTournaments.length || isMatchEditLocked(data.status)"
                v-tooltip.top="'Прикрепить'"
                @click="attachToTournament(data)"
              />
            </div>
          </template>
        </Column>
        <Column
          header="Действия"
          style="width: 7rem"
          headerClass="text-right !text-xs !font-normal !text-muted-color"
          :headerStyle="{ textAlign: 'right' }"
        >
          <template #body="{ data }">
            <div class="flex items-center justify-end gap-0">
              <Button
                icon="pi pi-book"
                text
                rounded
                size="small"
                class="!w-8 !h-8"
                v-tooltip.top="'Протокол'"
                @click="openProtocolStandalone(data)"
              />
              <Button
                icon="pi pi-calendar"
                text
                rounded
                size="small"
                class="!w-8 !h-8"
                :disabled="isMatchEditLocked(data.status)"
                v-tooltip.top="'Дата и время'"
                @click="openEdit(data)"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                class="!w-8 !h-8"
                :disabled="isMatchEditLocked(data.status)"
                :loading="deletingId === data.id"
                v-tooltip.top="'Удалить'"
                @click="requestDeleteMatch(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
      </TabPanel>

      <TabPanel header="В турнирах">
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4 space-y-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:items-end">
            <div class="flex flex-col gap-1 min-w-0">
              <label class="text-xs font-medium text-muted-color">Турнир</label>
              <Select
                v-model="tournamentMatchFilterId"
                :options="[
                  { label: 'Все турниры', value: '' },
                  ...tournaments.map((t) => ({ label: t.name, value: t.id })),
                ]"
                option-label="label"
                option-value="value"
                class="w-full"
                size="small"
                placeholder="Все турниры"
                filter
              />
            </div>
            <div class="flex flex-col gap-1 min-w-0">
              <label class="text-xs font-medium text-muted-color">Статус</label>
              <Select
                v-model="tournamentMatchStatusFilter"
                :options="tournamentStatusFilterOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                size="small"
                placeholder="Все статусы"
              />
            </div>
            <div class="flex flex-col gap-1 min-w-0">
              <label class="text-xs font-medium text-muted-color">Команда</label>
              <Select
                v-model="tournamentMatchTeamFilterId"
                :options="tournamentTeamFilterOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                size="small"
                placeholder="Любая"
                filter
              />
            </div>
            <div class="flex flex-col gap-1 min-w-0">
              <label class="text-xs font-medium text-muted-color">Период (начало матча)</label>
              <DatePicker
                v-model="tournamentMatchDateRange"
                selection-mode="range"
                date-format="dd.mm.yy"
                show-icon
                icon-display="input"
                class="w-full"
                size="small"
                placeholder="С — По"
              />
            </div>
          </div>

          <div v-if="loadingTournamentMatches" class="text-sm text-muted-color">Загрузка…</div>
          <div
            v-else-if="!tournamentMatchesTotal"
            class="text-sm text-muted-color"
          >
            Нет матчей по выбранным фильтрам.
          </div>

          <template v-else>
          <DataTable :value="visibleTournamentMatchesWithIndex" data-key="id" striped-rows size="small">
            <Column header="#" style="width: 2.75rem">
              <template #body="{ data }">
                <span class="tabular-nums text-sm text-muted-color">{{ data.matchNumber }}</span>
              </template>
            </Column>
            <Column field="startTime" header="Начало" style="width: 9.5rem; min-width: 9rem">
              <template #body="{ data }">
                <span class="tabular-nums text-sm">{{ formatDateTimeNoSeconds(data.startTime) }}</span>
              </template>
            </Column>
            <Column header="Турнир" style="min-width: 8rem; max-width: 14rem">
              <template #body="{ data }">
                <NuxtLink
                  :to="`/admin/tournaments/${data.tournament.id}`"
                  class="text-primary hover:underline font-medium text-sm truncate block"
                  :title="data.tournament.name"
                >
                  {{ data.tournament.name }}
                </NuxtLink>
              </template>
            </Column>
            <Column header="Матч" style="min-width: 12rem; max-width: 22rem">
              <template #body="{ data }">
                <div class="flex items-baseline gap-1.5 min-w-0 text-sm">
                  <span
                    class="font-medium truncate rounded px-0.5 transition-colors"
                    :class="
                      isTournamentListTeamHighlighted(data.homeTeam.id)
                        ? 'bg-primary/20 text-primary'
                        : ''
                    "
                    :title="data.homeTeam.name"
                  >
                    {{ data.homeTeam.name }}
                  </span>
                  <span class="text-muted-color shrink-0 text-xs">—</span>
                  <span
                    class="font-medium truncate rounded px-0.5 transition-colors"
                    :class="
                      isTournamentListTeamHighlighted(data.awayTeam.id)
                        ? 'bg-primary/20 text-primary'
                        : ''
                    "
                    :title="data.awayTeam.name"
                  >
                    {{ data.awayTeam.name }}
                  </span>
                </div>
              </template>
            </Column>
            <Column header="Счёт" style="min-width: 8rem; width: 8.75rem">
              <template #body="{ data }">
                <span
                  v-if="data.homeScore !== null && data.awayScore !== null"
                  class="tabular-nums text-sm font-medium whitespace-nowrap"
                >
                  {{ formatMatchScoreDisplay(data) }}
                </span>
                <span v-else class="text-muted-color">—</span>
              </template>
            </Column>
            <Column header="Статус" style="width: 7.5rem">
              <template #body="{ data }">
                <span :class="statusPillClass(data.status)" class="!text-[11px] !py-0.5 !px-1.5">
                  {{ statusLabel(data.status) }}
                </span>
              </template>
            </Column>
            <Column
              header="Действия"
              style="width: 5.5rem"
              headerClass="text-right !text-xs !font-normal !text-muted-color"
              :headerStyle="{ textAlign: 'right' }"
            >
              <template #body="{ data }">
                <div class="flex items-center justify-end gap-0">
                  <Button
                    icon="pi pi-book"
                    text
                    rounded
                    size="small"
                    class="!w-8 !h-8"
                    v-tooltip.top="'Протокол'"
                    @click="openProtocolFromTournament(data)"
                  />
                  <Button
                    v-if="data.tournament.format === 'MANUAL'"
                    icon="pi pi-unlock"
                    text
                    rounded
                    size="small"
                    class="!w-8 !h-8"
                    :disabled="isMatchEditLocked(data.status)"
                    :loading="detachingTournamentMatchId === data.id"
                    v-tooltip.top="'Открепить от турнира'"
                    @click="requestDetachTournamentMatch(data)"
                  />
                </div>
              </template>
            </Column>
          </DataTable>
          <Paginator
            v-if="tournamentMatchesTotal > tournamentMatchesPageSize"
            class="border-t border-surface-200 dark:border-surface-700 mt-0 rounded-b-xl"
            :rows="tournamentMatchesPageSize"
            :total-records="tournamentMatchesTotal"
            :first="(tournamentMatchesPage - 1) * tournamentMatchesPageSize"
            :rows-per-page-options="[25, 50, 100]"
            template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
            @page="onTournamentPaginatorPage"
          />
          </template>
        </div>
      </TabPanel>
    </TabView>

    <AdminConfirmDialog
      v-model="deleteMatchConfirmOpen"
      title="Удалить матч?"
      :message="deleteMatchMessage"
      @confirm="confirmDeleteMatch"
    />

    <AdminConfirmDialog
      v-model="detachMatchConfirmOpen"
      title="Открепить матч?"
      :message="detachMatchMessage"
      confirm-label="Открепить"
      confirm-severity="warn"
      @confirm="confirmDetachTournamentMatch"
    />

    <Dialog
      v-model:visible="createOpen"
      modal
      header="Новый матч (без турнира)"
      :style="{ width: '36rem' }"
    >
      <div class="space-y-4">
        <div>
          <label class="text-sm block mb-1">Хозяева</label>
          <Select
            v-model="createForm.homeTeamId"
            :options="teamOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            placeholder="Команда"
            :invalid="showCreateHomeError || showCreateSameTeamsError"
            :disabled="createSaving"
          />
          <p v-if="showCreateHomeError" class="mt-0 text-[11px] leading-3 text-red-500">{{ createFormErrors.homeTeamId }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Гости</label>
          <Select
            v-model="createForm.awayTeamId"
            :options="teamOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            placeholder="Команда"
            :invalid="showCreateAwayError || showCreateSameTeamsError"
            :disabled="createSaving"
          />
          <p v-if="showCreateAwayError" class="mt-0 text-[11px] leading-3 text-red-500">{{ createFormErrors.awayTeamId }}</p>
          <p v-if="showCreateSameTeamsError" class="mt-0 text-[11px] leading-3 text-red-500">{{ createFormErrors.sameTeams }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Начало</label>
          <DatePicker
            v-model="createForm.startTime"
            class="w-full"
            showTime
            hourFormat="24"
            showIcon
            :invalid="showCreateStartError"
            :disabled="createSaving"
          />
          <p v-if="showCreateStartError" class="mt-0 text-[11px] leading-3 text-red-500">{{ createFormErrors.startTime }}</p>
        </div>
      </div>
      <template #footer>
        <Button label="Отмена" text :disabled="createSaving" @click="createOpen = false" />
        <Button label="Создать" icon="pi pi-check" :loading="createSaving" :disabled="createSaving || (createSubmitAttempted && !canCreateMatch)" @click="submitCreate" />
      </template>
    </Dialog>

    <Dialog v-model:visible="editOpen" modal header="Параметры матча" :style="{ width: '36rem' }">
      <div v-if="editForm.matchId" class="space-y-4">
        <div>
          <label class="text-sm block mb-1">Хозяева</label>
          <Select
            v-model="editForm.homeTeamId"
            :options="teamOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            :invalid="showEditHomeError || showEditSameTeamsError"
            :disabled="editSaving"
          />
          <p v-if="showEditHomeError" class="mt-0 text-[11px] leading-3 text-red-500">{{ editFormErrors.homeTeamId }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Гости</label>
          <Select
            v-model="editForm.awayTeamId"
            :options="teamOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            :invalid="showEditAwayError || showEditSameTeamsError"
            :disabled="editSaving"
          />
          <p v-if="showEditAwayError" class="mt-0 text-[11px] leading-3 text-red-500">{{ editFormErrors.awayTeamId }}</p>
          <p v-if="showEditSameTeamsError" class="mt-0 text-[11px] leading-3 text-red-500">{{ editFormErrors.sameTeams }}</p>
        </div>
        <p class="text-xs text-muted-color">
          Смена пар сбрасывает счёт и события на сервере.
        </p>
        <div>
          <label class="text-sm block mb-1">Начало</label>
          <DatePicker
            v-model="editForm.startTime"
            class="w-full"
            showTime
            hourFormat="24"
            showIcon
            :invalid="showEditStartError"
            :disabled="editSaving"
          />
          <p v-if="showEditStartError" class="mt-0 text-[11px] leading-3 text-red-500">{{ editFormErrors.startTime }}</p>
        </div>
        <div class="space-y-2 rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50/50 dark:bg-surface-800/30 p-3">
          <p class="text-xs text-muted-color">
            При переносе времени можно указать причину из справочника.
          </p>
          <div>
            <label class="text-sm block mb-1">Причина переноса</label>
            <Select
              v-model="editForm.scheduleChangeReasonId"
              :options="postponeReasonOptions"
              option-label="label"
              option-value="value"
              show-clear
              placeholder="Не выбрано"
              class="w-full"
              :invalid="showEditScheduleReasonError"
              :disabled="editSaving"
            />
            <p v-if="showEditScheduleReasonError" class="mt-0 text-[11px] leading-3 text-red-500">{{ editFormErrors.scheduleChangeReasonId }}</p>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Отмена" text :disabled="editSaving" @click="editOpen = false" />
        <Button label="Сохранить" icon="pi pi-check" :loading="editSaving" :disabled="editSaving || (editSubmitAttempted && !canEditMatch)" @click="submitEdit" />
      </template>
    </Dialog>

    <AdminMatchProtocolDialog
      v-model:visible="protocolOpen"
      :standalone="protocolStandalone"
      :tournament-id="protocolTournamentIdForDialog"
      :tournament="null"
      :match="protocolMatch"
      @saved="onProtocolSaved"
    />
  </section>
</template>

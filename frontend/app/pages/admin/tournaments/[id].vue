<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import type {
  CalendarRound,
  CalendarViewMode,
  MatchRow,
  TableRow,
  TournamentDetails,
} from '~/types/tournament-admin'
import { getApiErrorMessage } from '~/utils/apiError'
import { buildPlayoffSlotLabels } from '~/utils/playoffSlotResolver'
import { MIN_SKELETON_DISPLAY_MS, sleepRemainingAfter } from '~/utils/minimumLoadingDelay'
import { toYmdLocal } from '~/utils/dateYmd'
import {
  buildCalendarRoundsFromMatches,
  buildTourSectionsFromMatches,
  getDisplayedRoundTitle,
} from '~/utils/tournamentMatchCalendar'
import {
  formatDateTimeNoSeconds,
  formatMatchScoreDisplay,
  isGroupsPlusPlayoffFamily,
  isMatchEditLocked,
  statusPillClass,
} from '~/utils/tournamentAdminUi'
import { hasSubscriptionFeature } from '~/utils/subscriptionFeatures'
import { displayTeamNameForUi } from '~/utils/teamDisplayName'
import { adminTooltip } from '~/utils/adminTooltip'
import { formatUserListLabel } from '~/utils/userDisplayName'
import { toastScheduleWarnings } from '~/utils/scheduleWarningsToast'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import draggable from 'vuedraggable'
import { useTenantStore } from '~/stores/tenant'
import { useAdminTenantTeamsAllQuery } from '~/composables/admin/useAdminTenantListQueries'
import { useAdminGlobalModeratorTournamentPolicy } from '~/composables/useAdminGlobalModeratorTournamentPolicy'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'
import AdminTournamentTableShareImageDialog from '~/app/components/admin/AdminTournamentTableShareImageDialog.vue'
import AdminTournamentStatsSection from '~/app/components/admin/AdminTournamentStatsSection.vue'

definePageMeta({
  layout: 'admin',
  /** Карточка турнира: не org read-only страница; ограничения — в {@link useAdminGlobalModeratorTournamentPolicy}. */
  adminOrgModeratorReadOnly: false,
})

const route = useRoute()
const router = useRouter()
const { token, user, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()
const { t, locale } = useI18n()
const tenantStore = useTenantStore()
const runtimeConfig = useRuntimeConfig()

const tournamentId = computed(() => route.params.id as string)

const subscriptionPlan = computed(() => {
  const u = user.value as { tenantSubscription?: { plan?: string | null } | null } | null
  return u?.tenantSubscription?.plan ?? null
})
const currentTenantId = computed(() => {
  const u = user.value as { tenantId?: string | null } | null
  return u?.tenantId ?? ''
})
const canTournamentAutomation = computed(() =>
  hasSubscriptionFeature(subscriptionPlan.value, 'tournament_automation'),
)

/** Глобальный MODERATOR: матрица ограничений на карточке турнира (публикация vs календарь/плей-офф). */
const modPolicy = useAdminGlobalModeratorTournamentPolicy()

/** До первого ответа API — иначе при F5 пустой заголовок и мелькание вкладок. */
const initialLoading = ref(true)
/** Ошибка первой загрузки карточки турнира (фильтры календаря — отдельно, через тост). */
const tournamentPageError = ref<string | null>(null)
/** Повторные запросы списка матчей (фильтры календаря и т.д.). */
const calendarRefreshing = ref(false)
/** Ошибка повторной загрузки турнира с фильтрами календаря (не первая загрузка страницы). */
const calendarRefreshError = ref<string | null>(null)
let isFirstTournamentFetch = true
const tournament = ref<TournamentDetails | null>(null)

/** Пачки матчей в GET /tournaments/:id (как на публичном плей-оффе: matchesOffset / matchesLimit). */
const ADMIN_TOURNAMENT_MATCHES_PAGE_SIZE = 100
const tournamentMatchesLoadingMore = ref(false)
const matchesAppendInFlight = ref(false)

const tableLoading = ref(false)
const calendarIcsDownloading = ref(false)
const calendarFeedLinkLoading = ref(false)
const tableError = ref<string | null>(null)
/** Успешно загрузили таблицу хотя бы раз (чтобы не показывать «пусто» до первого ответа). */
const tableLoadSucceeded = ref(false)
const tableSkeletonRows = Array.from({ length: 8 }, (_, i) => ({ id: `tbl-sk-${i}` }))
const table = ref<TableRow[]>([])
const groupTables = ref<Record<string, TableRow[]>>({})

const tableShareDialogVisible = ref(false)

const calendarDialog = ref(false)
const calendarSaving = ref(false)
const calendarSubmitAttempted = ref(false)
const launchChecklistSaving = ref(false)
const launchBlockCollapsed = ref(true)
const diagnosticsBlockCollapsed = ref(true)
const infrastructureLoading = ref(false)
const infrastructureSaving = ref(false)

const activeTab = ref(0)
const infrastructureForm = ref({
  seasonId: null as string | null,
  competitionId: null as string | null,
  ageGroupId: null as string | null,
  refereeIds: [] as string[],
  stadiumIds: [] as string[],
})
const infrastructureOptions = ref({
  seasons: [] as Array<{ id: string; name: string; active?: boolean | null }>,
  competitions: [] as Array<{ id: string; name: string; active?: boolean | null }>,
  ageGroups: [] as Array<{ id: string; name: string; shortLabel?: string | null; active?: boolean | null }>,
  referees: [] as Array<{ id: string; firstName: string; lastName: string }>,
  stadiums: [] as Array<{ id: string; name: string; city?: string | null; address?: string | null }>,
})

const { teams: allTeams, teamsLoading, teamsQueryError, refetch: refetchTeamsCatalog } =
  useAdminTenantTeamsAllQuery()

const teamsCatalogErrorMessage = computed(() =>
  teamsQueryError.value != null
    ? getApiErrorMessage(teamsQueryError.value, t('admin.errors.request_failed'))
    : null,
)

const showTeamsCatalogEmpty = computed(
  () => !teamsLoading.value && teamsQueryError.value == null && allTeams.value.length === 0,
)

const selectedTeamIds = ref<string[]>([])
const teamCompositionSubmitAttempted = ref(false)
const savingTeams = ref(false)
type TournamentTeamRow = TournamentDetails['tournamentTeams'][number]
type GroupColumn = { id: string; name: string; teams: TournamentTeamRow[] }
const groupColumns = ref<GroupColumn[]>([])
const groupingSaving = ref(false)
const preDragGroups = ref<Record<string, string[]>>({})

function showGroupBucketsFor(t: TournamentDetails) {
  const f = t.format
  if (isGroupsPlusPlayoffFamily(f)) return true
  if (f === 'MANUAL' && (t.groupCount ?? 1) > 1) return true
  return false
}

function initGroupColumns(res: TournamentDetails) {
  const gs = (res.groups ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const tts = res.tournamentTeams ?? []
  if (!gs.length) {
    groupColumns.value = []
    return
  }
  const cols: GroupColumn[] = gs.map((g) => ({
    id: g.id,
    name: g.name,
    teams: [] as TournamentTeamRow[],
  }))
  const byId = Object.fromEntries(cols.map((c) => [c.id, c.teams])) as Record<
    string,
    TournamentTeamRow[]
  >
  const assigned = new Set<string>()
  for (const tt of tts) {
    const gid = tt.group?.id
    if (gid && byId[gid]) {
      byId[gid].push(tt)
      assigned.add(tt.teamId)
    }
  }
  const loose = tts.filter((tt) => !assigned.has(tt.teamId))
  for (let i = 0; i < loose.length; i++) {
    const col = cols[i % cols.length]
    if (col) col.teams.push(loose[i]!)
  }
  for (const col of cols) {
    col.teams.sort(
      (a, b) =>
        (a.groupSortOrder ?? 0) - (b.groupSortOrder ?? 0) ||
        a.team.name.localeCompare(b.team.name, 'ru'),
    )
  }
  groupColumns.value = cols
}

const calendarForm = reactive({
  startDate: null as Date | null,
  endDate: null as Date | null,
  oneDayTournament: false,
  schedulingMode: 'FLOW' as 'FLOW' | 'STRICT_ROUNDS',
  format: 'SINGLE_GROUP',
  intervalDays: 7,
  roundsPerDay: 1,
  roundRobinCycles: 1,
  allowedDays: [] as number[],
  matchDurationMinutes: 50,
  matchBreakMinutes: 10,
  simultaneousMatches: 1,
  dayStartTimeDefault: '12:00',
  dayStartTimeOverrides: {} as Record<number, string>,
  replaceExisting: true,
})

const calendarRounds = ref<CalendarRound[]>([])

const calendarViewMode = ref<CalendarViewMode>('grouped')

// Диапазон дат для фильтра календаря.
// В PrimeVue DatePicker при selectionMode="range" обычно приходит массив [start, end].
const calendarFilterDateRange = ref<Date[] | null>(null)
const calendarFilterStatuses = ref<string[]>([])
const calendarFilterTeamIds = ref<string[]>([])

const expandedTourKeys = ref<Record<string, boolean>>({})

const calendarFiltersActive = computed(() => {
  return (
    calendarFilterStatuses.value.length > 0 ||
    calendarFilterTeamIds.value.length > 0 ||
    !!calendarFilterDateRange.value?.length
  )
})

/**
 * Общее число матчей для пагинации в GET /tournaments/:id.
 * Без фильтров календаря совпадает с summary.matchesTotal; при фильтрах полагаемся на matchesTotal из ответа.
 */
function resolvedMatchesTotal(tour: TournamentDetails): number {
  const loaded = tour.matches?.length ?? 0
  if (typeof tour.matchesTotal === 'number') return tour.matchesTotal
  if (
    !calendarFiltersActive.value &&
    typeof tour.summary?.matchesTotal === 'number'
  ) {
    return tour.summary.matchesTotal
  }
  return loaded
}

function withResolvedMatchesTotal(tour: TournamentDetails): TournamentDetails {
  if (typeof tour.matchesTotal === 'number') return tour
  if (
    !calendarFiltersActive.value &&
    typeof tour.summary?.matchesTotal === 'number'
  ) {
    return { ...tour, matchesTotal: tour.summary.matchesTotal }
  }
  return tour
}

const resetCalendarFilters = () => {
  calendarFilterDateRange.value = null
  calendarFilterStatuses.value = []
  calendarFilterTeamIds.value = []
  expandedTourKeys.value = {}
  fetchTournament()
}

// Фильтрация теперь полностью на бэкенде: фронт только отображает то, что вернул сервер.
const filteredMatches = computed(() => tournament.value?.matches ?? [])

const selectedCalendarTeamIdSet = computed(() => new Set(calendarFilterTeamIds.value))
const isCalendarTeamHighlighted = (teamId: string) =>
  selectedCalendarTeamIdSet.value.size > 0 &&
  selectedCalendarTeamIdSet.value.has(teamId)

const visibleCalendarRounds = computed(() => {
  return calendarRounds.value
    .map((r) => ({
      ...r,
      matches: r.matches,
    }))
    .filter((r) => r.matches.length > 0)
})

const toggleTour = (key: string) => {
  expandedTourKeys.value[key] = !expandedTourKeys.value[key]
}

const visibleTourSections = computed(() => buildTourSectionsFromMatches(filteredMatches.value))

const displayedRoundTitle = (r: CalendarRound) =>
  getDisplayedRoundTitle(r, {
    calendarViewMode: calendarViewMode.value,
    calendarFiltersActive: calendarFiltersActive.value,
  })

const localizedStatusOptions = computed(() => [
  { value: 'SCHEDULED', label: t('admin.tournament_page.status_scheduled') },
  { value: 'LIVE', label: t('admin.tournament_page.status_live') },
  { value: 'PLAYED', label: t('admin.tournament_page.status_played') },
  { value: 'FINISHED', label: t('admin.tournament_page.status_finished') },
  { value: 'CANCELED', label: t('admin.tournament_page.status_canceled') },
])

const statusLabelByValue = computed<Record<string, string>>(() =>
  localizedStatusOptions.value.reduce<Record<string, string>>((acc, o) => {
    acc[o.value] = o.label
    return acc
  }, {}),
)

const localizedStatusLabel = (status?: string | null) =>
  status ? statusLabelByValue.value[status] ?? status : '—'

const weekdayLabelByValue = computed<Record<number, string>>(() => ({
  1: t('admin.tournament_page.weekday_mon'),
  2: t('admin.tournament_page.weekday_tue'),
  3: t('admin.tournament_page.weekday_wed'),
  4: t('admin.tournament_page.weekday_thu'),
  5: t('admin.tournament_page.weekday_fri'),
  6: t('admin.tournament_page.weekday_sat'),
  0: t('admin.tournament_page.weekday_sun'),
}))

const allowedDayOptions = computed(() => [
  { value: 1, label: weekdayLabelByValue.value[1] },
  { value: 2, label: weekdayLabelByValue.value[2] },
  { value: 3, label: weekdayLabelByValue.value[3] },
  { value: 4, label: weekdayLabelByValue.value[4] },
  { value: 5, label: weekdayLabelByValue.value[5] },
  { value: 6, label: weekdayLabelByValue.value[6] },
  { value: 0, label: weekdayLabelByValue.value[0] },
])

const schedulingModeOptions = computed(() => [
  { label: t('admin.tournament_page.scheduling_mode_flow'), value: 'FLOW' },
  { label: t('admin.tournament_page.scheduling_mode_strict_rounds'), value: 'STRICT_ROUNDS' },
])

const localizedTournamentFormatLabel = (f?: string | null): string => {
  if (f == null || f === '') return '—'
  if (f === 'GROUPS_2' || f === 'GROUPS_3' || f === 'GROUPS_4') {
    return t('admin.tournament_page.format_groups_plus_playoff')
  }
  if (f === 'SINGLE_GROUP') return t('admin.tournament_page.format_single_group')
  if (f === 'PLAYOFF') return t('admin.tournament_page.format_playoff')
  if (f === 'GROUPS_PLUS_PLAYOFF') return t('admin.tournament_page.format_groups_plus_playoff')
  if (f === 'MANUAL') return t('admin.tournament_page.format_manual')
  return f
}

const localizedMatchCountLabel = (n: number) => {
  if (locale.value.startsWith('ru')) {
    const nn = Math.floor(Math.abs(n)) % 100
    const n10 = nn % 10
    if (n10 === 1 && nn !== 11) return t('admin.tournament_page.match_word_one')
    if (n10 >= 2 && n10 <= 4 && (nn < 12 || nn > 14)) return t('admin.tournament_page.match_word_few')
    return t('admin.tournament_page.match_word_many')
  }
  return n === 1 ? t('admin.tournament_page.match_word_one') : t('admin.tournament_page.match_word_other')
}

const matchNumberById = computed(() => {
  if (tournament.value?.matchNumberById) return tournament.value.matchNumberById

  // Fallback: compute from current matches (can shift when server-side filters are applied).
  const items = tournament.value?.matches ?? []
  const sorted = items
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))
  const map: Record<string, number> = {}
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]
    if (row) map[row.id] = i + 1
  }
  return map
})

const reordering = ref<string | null>(null)
const saveRoundOrder = async (r: CalendarRound) => {
  if (!token.value) return
  if (!tournament.value) return
  if (r.dateKey === 'unknown') return
  if (!canReorderCalendarDay.value) return

  const matchIds = (r.matches ?? []).map((m) => m.id)
  if (!matchIds.length) return

  reordering.value = r.dateKey
  try {
    await authFetch(
      apiUrl(`/tournaments/${tournamentId.value}/rounds/${r.dateKey}/reorder`),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { matchIds },
      },
    )
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_page.reorder_saved_summary'),
      detail: t('admin.tournament_page.reorder_saved_detail'),
      life: 2500,
    })
    await fetchTournament()
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.reorder_error_summary'),
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 6000,
    })
    // откатим порядок из сервера
    await fetchTournament()
  } finally {
    reordering.value = null
  }
}

const protocolOpen = ref(false)
const protocolMatch = ref<MatchRow | null>(null)

const openProtocol = async (m: MatchRow) => {
  protocolMatch.value = m
  protocolOpen.value = true
}

const onProtocolSaved = async () => {
  await fetchTournament()
  await fetchTable()
}

function buildTournamentDetailQueryParams(matchesOffset: number): URLSearchParams {
  const params = new URLSearchParams()
  const range = calendarFilterDateRange.value
  if (range?.[0]) params.set('dateFrom', toYmdLocal(new Date(range[0])))
  if (range?.[1]) params.set('dateTo', toYmdLocal(new Date(range[1])))
  if (calendarFilterStatuses.value.length) params.set('statuses', calendarFilterStatuses.value.join(','))
  if (calendarFilterTeamIds.value.length) params.set('teamIds', calendarFilterTeamIds.value.join(','))
  params.set('matchesLimit', String(ADMIN_TOURNAMENT_MATCHES_PAGE_SIZE))
  params.set('matchesOffset', String(Math.max(0, Math.floor(matchesOffset))))
  return params
}

async function appendNextTournamentMatchesPage(): Promise<void> {
  while (matchesAppendInFlight.value) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  matchesAppendInFlight.value = true
  try {
    const t = tournament.value
    if (!token.value || !t) return
    const loaded = t.matches?.length ?? 0
    const total = resolvedMatchesTotal(t)
    if (loaded >= total) return

    const params = buildTournamentDetailQueryParams(loaded)
    const url = apiUrl(`/tournaments/${tournamentId.value}?${params.toString()}`)
    const res = await authFetch<TournamentDetails>(url, {
      headers: { Authorization: `Bearer ${token.value}` },
    })

    const byId = new Map<string, MatchRow>()
    for (const m of t.matches ?? []) byId.set(m.id, m)
    for (const m of res.matches ?? []) byId.set(m.id, m)
    const merged = Array.from(byId.values()).sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime() ||
        a.id.localeCompare(b.id),
    )

    tournament.value = withResolvedMatchesTotal({
      ...t,
      ...res,
      matches: merged,
      matchNumberById: res.matchNumberById ?? t.matchNumberById,
    })
    calendarRounds.value = buildCalendarRoundsFromMatches(merged, t.groups ?? [])
  } finally {
    matchesAppendInFlight.value = false
  }
}

async function loadMoreTournamentMatchesForWorkspace() {
  if (tournamentMatchesLoadingMore.value) return
  const tour = tournament.value
  if (!tour) return
  const loaded = tour.matches?.length ?? 0
  const total = resolvedMatchesTotal(tour)
  if (loaded >= total) return

  tournamentMatchesLoadingMore.value = true
  try {
    await appendNextTournamentMatchesPage()
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.matches_load_more_error'),
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 5000,
    })
  } finally {
    tournamentMatchesLoadingMore.value = false
  }
}

const fetchTournament = async () => {
  if (!token.value) {
    initialLoading.value = false
    return
  }
  const loadStartedAt = Date.now()
  const isInitial = isFirstTournamentFetch
  if (!isInitial) {
    calendarRefreshing.value = true
    calendarRefreshError.value = null
  }
  try {
    const params = buildTournamentDetailQueryParams(0)
    const qs = params.toString()
    const url = apiUrl(`/tournaments/${tournamentId.value}?${qs}`)

    const res = await authFetch<TournamentDetails>(url, {
      headers: { Authorization: `Bearer ${token.value}` },
    })
    tournamentPageError.value = null
    calendarRefreshError.value = null
    tournament.value = withResolvedMatchesTotal(res)
    calendarRounds.value = buildCalendarRoundsFromMatches(res.matches ?? [], res.groups ?? [])

    calendarForm.intervalDays = res.intervalDays ?? 7
    calendarForm.roundRobinCycles = res.roundRobinCycles ?? 1
    calendarForm.schedulingMode = 'FLOW'
    calendarForm.allowedDays = Array.isArray(res.allowedDays) ? res.allowedDays : []
    calendarForm.oneDayTournament =
      (res.intervalDays ?? 7) === 1 &&
      Array.isArray(res.allowedDays) &&
      res.allowedDays.length === 1
    calendarForm.startDate = res.startsAt ? new Date(res.startsAt) : null
    calendarForm.endDate = res.endsAt ? new Date(res.endsAt) : null
    calendarForm.format = (res.format ?? 'SINGLE_GROUP') as string
    calendarForm.matchDurationMinutes = res.matchDurationMinutes ?? 50
    calendarForm.matchBreakMinutes = res.matchBreakMinutes ?? 10
    calendarForm.simultaneousMatches = res.simultaneousMatches ?? 1
    calendarForm.dayStartTimeDefault = (res.dayStartTimeDefault ?? '12:00') as string
    calendarForm.dayStartTimeOverrides = {}
    const overrides = res.dayStartTimeOverrides ?? {}
    if (overrides && typeof overrides === 'object') {
      for (const [k, v] of Object.entries(overrides as any)) {
        const day = Number(k)
        if (Number.isInteger(day) && day >= 0 && day <= 6 && typeof v === 'string') {
          calendarForm.dayStartTimeOverrides[day] = v
        }
      }
    }

    selectedTeamIds.value = Array.isArray(res.tournamentTeams)
      ? res.tournamentTeams.map((x) => x.teamId)
      : []
    infrastructureForm.value = {
      seasonId: res.season?.id ?? null,
      competitionId: res.competition?.id ?? null,
      ageGroupId: res.ageGroup?.id ?? null,
      refereeIds: (res.tournamentReferees ?? []).map((x) => x.refereeId),
      stadiumIds: (res.tournamentStadiums ?? []).map((x) => x.stadiumId),
    }

    if (showGroupBucketsFor(res)) {
      initGroupColumns(res)
    } else {
      groupColumns.value = []
    }

  } catch (e: any) {
    if (isInitial) {
      tournamentPageError.value = getApiErrorMessage(e, t('admin.errors.request_failed'))
    } else {
      calendarRefreshError.value = getApiErrorMessage(e, t('admin.errors.request_failed'))
    }
  } finally {
    await sleepRemainingAfter(MIN_SKELETON_DISPLAY_MS, loadStartedAt)
    if (isInitial) {
      isFirstTournamentFetch = false
      initialLoading.value = false
    } else {
      calendarRefreshing.value = false
    }
  }
}

async function retryTournamentPage() {
  tournamentPageError.value = null
  calendarRefreshError.value = null
  isFirstTournamentFetch = true
  initialLoading.value = true
  await fetchTournament()
  if (tournament.value && token.value) {
    await fetchTable()
  }
}

async function retryCalendarFetch() {
  calendarRefreshError.value = null
  await fetchTournament()
}

let filtersFetchTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [calendarFilterDateRange, calendarFilterStatuses, calendarFilterTeamIds],
  () => {
    if (!token.value) return
    if (filtersFetchTimer) clearTimeout(filtersFetchTimer)
    filtersFetchTimer = setTimeout(() => {
      fetchTournament()
    }, 350)
  },
  { deep: true },
)

/** Таблица по группам: групповые форматы + MANUAL с несколькими группами (см. ensureManualGroupsIfNeeded на бэкенде). */
const isGroupedFormat = computed(() => {
  const t = tournament.value
  if (!t) return false
  if (isGroupsPlusPlayoffFamily(t.format)) return true
  if (t.format === 'MANUAL' && (t.groupCount ?? 1) > 1) return true
  return false
})

const groupedTablesForShare = computed(() => {
  if (!isGroupedFormat.value || !tournament.value?.groups?.length) return undefined
  return tournament.value.groups
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((g) => ({
      groupId: g.id,
      groupName: g.name,
      rows: groupTables.value[g.id] ?? [],
    }))
})

const flatRowsForShare = computed(() => {
  if (isGroupedFormat.value) return []
  return table.value
})

const isTableDataEmpty = computed(() => {
  const tourn = tournament.value
  if (!tourn) return true
  if (isGroupedFormat.value) {
    const groups = tourn.groups ?? []
    if (!groups.length) return true
    return groups.every((g) => !(groupTables.value[g.id]?.length))
  }
  return table.value.length === 0
})

const showTableEmptyState = computed(
  () =>
    tableLoadSucceeded.value &&
    !tableLoading.value &&
    !tableError.value &&
    isTableDataEmpty.value,
)

/** Подсветка строк таблицы: одна круговая — только пьедестал 1–3 без «черты отбора»; группы с выходом в плей-офф — зона из k мест и линия под k-й строкой. */
const qualificationRowStyle = (row: any) => {
  const pos = row?.position
  if (typeof pos !== 'number') return undefined

  if (!isGroupedFormat.value) {
    if (pos >= 1 && pos <= 3) return { backgroundColor: 'rgba(34, 197, 94, 0.06)' }
    return undefined
  }

  const k = playoffQualifiersPerGroup.value
  if (!k) return undefined

  if (pos < k) return { backgroundColor: 'rgba(34, 197, 94, 0.06)' }

  if (pos === k) {
    return {
      backgroundColor: 'rgba(34, 197, 94, 0.08)',
      boxShadow: 'inset 0 -2px 0 rgba(34, 197, 94, 1)',
    }
  }

  return undefined
}

function tournamentLifecycleStatusLabel(s: string | undefined | null) {
  if (!s) return '—'
  const key = `admin.tournament_lifecycle.${s.toLowerCase()}` as const
  const translated = t(key)
  return translated !== key ? translated : s
}

function tournamentStatusBadgeClass(s: string | undefined | null) {
  switch (s) {
    case 'DRAFT':
      return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100'
    case 'ACTIVE':
      return 'border-primary/35 bg-primary/12 text-primary'
    case 'COMPLETED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
    case 'ARCHIVED':
      return 'border-surface-300 bg-surface-100 text-surface-600 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300'
    default:
      return 'border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-900'
  }
}

const isManualFormat = computed(() => tournament.value?.format === 'MANUAL')
const isPlayoffOnlyFormat = computed(() => tournament.value?.format === 'PLAYOFF')

/**
 * Slug организации для публичного URL: сначала из API турнира, иначе поддомен
 * (см. `tenant.global.ts`), иначе `NUXT_PUBLIC_DEFAULT_TENANT_SLUG` для localhost.
 */
const tenantSlugForPublicLink = computed(() => {
  const fromApi = tournament.value?.tenant?.slug?.trim()
  if (fromApi) return fromApi
  const fromHost = String(tenantStore.slug ?? '').trim()
  if (fromHost) return fromHost
  return String(runtimeConfig.public.defaultTenantSlug ?? '').trim()
})

const publishedSaving = ref(false)

const publishSwitchDisabled = computed(
  () =>
    publishedSaving.value ||
    modPolicy.value.locksTournamentPublishingAndDraftStructure ||
    (tournament.value?.status === 'DRAFT' && !tournament.value?.published),
)

async function setTournamentPublished(next: boolean) {
  if (!token.value || !tournament.value) return
  if (modPolicy.value.locksTournamentPublishingAndDraftStructure) return
  const prev = !!tournament.value.published
  if (next === prev) return
  if (next && tournament.value.status === 'DRAFT') {
    toast.add({
      severity: 'warn',
      summary: t('admin.tournament_page.published_toggle_label'),
      detail: t('admin.tournament_page.published_draft_blocked_hint'),
      life: 6000,
    })
    return
  }
  publishedSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { published: next },
    })
    tournament.value = { ...tournament.value, published: next }
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.published_save_error'),
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    publishedSaving.value = false
  }
}

/** Публичная страница турнира: таблица с `tid` (как на сайте). */
const publicTournamentAbsoluteUrl = computed(() => {
  const t = tournament.value
  const slug = tenantSlugForPublicLink.value
  if (!t?.id || !slug) return ''
  const path = `/${slug}/tournaments/table?tid=${encodeURIComponent(t.id)}`
  if (import.meta.client && typeof window !== 'undefined') {
    return `${window.location.origin}${path}`
  }
  return path
})

async function copyPublicTournamentLink() {
  if (!tournament.value?.published) return
  const url = publicTournamentAbsoluteUrl.value
  if (!url) return
  try {
    // Clipboard API может быть недоступен в http/не-secure контексте.
    if (navigator.clipboard?.writeText && (window.isSecureContext || window.location.protocol === 'https:')) {
      await navigator.clipboard.writeText(url)
    } else {
      const ta = document.createElement('textarea')
      ta.value = url
      ta.setAttribute('readonly', 'true')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      ta.style.top = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (!ok) throw new Error('execCommand copy failed')
    }
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_page.public_link_copied'),
      life: 2500,
    })
  } catch {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.public_link_copy_error'),
      life: 4000,
    })
  }
}

function openPublicTournamentLink() {
  if (!tournament.value?.published) return
  const url = publicTournamentAbsoluteUrl.value
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

const showTournamentTableTab = computed(() => !isPlayoffOnlyFormat.value)

const statisticsTabIndex = computed(() =>
  tournamentTabSlugToIndex('statistics', showTournamentTableTab.value),
)
const infrastructureTabIndex = computed(() =>
  tournamentTabSlugToIndex('infrastructure', showTournamentTableTab.value),
)
const matchesTabIndex = computed(() =>
  tournamentTabSlugToIndex('matches', showTournamentTableTab.value),
)
/** Неактивные вкладки PrimeVue часто скрыты — IntersectionObserver на «Матчах» иначе не срабатывает. */
const isMatchesTabActive = computed(() => activeTab.value === matchesTabIndex.value)
const isCalendarTabActive = computed(
  () => activeTab.value === tournamentTabSlugToIndex('calendar', showTournamentTableTab.value),
)
const isStatisticsTabActive = computed(() => activeTab.value === statisticsTabIndex.value)

/** Монтируем блок статистики только после первого захода на вкладку (и снова при смене турнира, если вкладка активна). */
const statisticsSectionMounted = ref(false)

watch(activeTab, (i) => {
  if (i === statisticsTabIndex.value) statisticsSectionMounted.value = true
}, { immediate: true })

watch(tournamentId, () => {
  statisticsSectionMounted.value = activeTab.value === statisticsTabIndex.value
})

async function downloadTournamentCalendarIcs() {
  if (!token.value || !tournament.value?.id) return
  calendarIcsDownloading.value = true
  try {
    const res = await fetch(apiUrl(`/tournaments/${tournament.value.id}/calendar.ics`), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const blob = await res.blob()
    const safeSlug =
      (tournament.value.slug || tournament.value.name || 'tournament')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'tournament'
    const downloadName = `${safeSlug}-calendar.ics`
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = downloadName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(blobUrl)
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_page.ics_download_success'),
      life: 2500,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.ics_download_error'),
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 5000,
    })
  } finally {
    calendarIcsDownloading.value = false
  }
}

async function copyTournamentCalendarFeedLink() {
  if (!token.value || !tournament.value?.id) return
  const tenantSlug = tenantSlugForPublicLink.value
  if (!tenantSlug) {
    toast.add({
      severity: 'warn',
      summary: t('admin.tournament_page.public_link_need_slug'),
      life: 7000,
    })
    return
  }
  calendarFeedLinkLoading.value = true
  try {
    const feedTokenRes = await authFetch<{ token: string }>(
      apiUrl(`/tournaments/${tournament.value.id}/calendar-feed-token`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
    const tokenValue = String(feedTokenRes?.token ?? '').trim()
    if (!tokenValue) throw new Error('Empty calendar feed token')
    const feedUrl = apiUrl(
      `/public/tenants/${encodeURIComponent(tenantSlug)}/tournaments/${encodeURIComponent(
        tournament.value.id,
      )}/calendar-feed.ics?token=${encodeURIComponent(tokenValue)}`,
    )
    if (navigator.clipboard?.writeText && (window.isSecureContext || window.location.protocol === 'https:')) {
      await navigator.clipboard.writeText(feedUrl)
    } else {
      const ta = document.createElement('textarea')
      ta.value = feedUrl
      ta.setAttribute('readonly', 'true')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      ta.style.top = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (!ok) throw new Error('execCommand copy failed')
    }
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_page.ics_feed_link_copied'),
      detail: t('admin.tournament_page.ics_feed_link_hint'),
      life: 5000,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.ics_feed_link_error'),
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 6000,
    })
  } finally {
    calendarFeedLinkLoading.value = false
  }
}

function tournamentTabSlugToIndex(slug: string | undefined | null, hasTable: boolean): number {
  const s = (slug ?? 'calendar').toString().toLowerCase()
  if (s === 'calendar') return 0
  if (s === 'matches') return 1
  if (s === 'table') return hasTable ? 2 : 0
  if (s === 'statistics') return hasTable ? 3 : 2
  if (s === 'compositions' || s === 'squads') return hasTable ? 4 : 3
  if (s === 'infrastructure') return hasTable ? 5 : 4
  return 0
}

function tournamentIndexToSlug(index: number, hasTable: boolean): string {
  if (hasTable) {
    return (
      ['calendar', 'matches', 'table', 'statistics', 'compositions', 'infrastructure'] as const
    )[index] ?? 'calendar'
  }
  return (['calendar', 'matches', 'statistics', 'compositions', 'infrastructure'] as const)[index] ?? 'calendar'
}

let tournamentTabSyncInProgress = false

function syncTournamentTabFromRoute() {
  if (!tournament.value) return
  const hasTable = showTournamentTableTab.value
  let raw = (route.query.tab as string | undefined) ?? 'calendar'
  const r = raw.toString().toLowerCase()
  if ((tournament.value.matches?.length ?? 0) === 0) {
    if (r === 'matches' || r === 'table') raw = 'calendar'
  }
  const next = tournamentTabSlugToIndex(raw, hasTable)
  const slug = tournamentIndexToSlug(next, hasTable)
  if (activeTab.value === next && (route.query.tab as string | undefined) === slug) return

  tournamentTabSyncInProgress = true
  activeTab.value = next
  if ((route.query.tab as string | undefined) !== slug) {
    void router.replace({ query: { ...route.query, tab: slug } })
  }
  nextTick(() => {
    tournamentTabSyncInProgress = false
  })
}

watch(activeTab, (i) => {
  if (tournamentTabSyncInProgress) return
  if (!tournament.value) return
  const hasTable = showTournamentTableTab.value
  const max = hasTable ? 5 : 4
  if (i < 0 || i > max) return
  const slug = tournamentIndexToSlug(i, hasTable)
  if ((route.query.tab as string | undefined) === slug) return
  void router.replace({ query: { ...route.query, tab: slug } })
})

watch(
  () => route.query.tab,
  () => {
    if (tournament.value) syncTournamentTabFromRoute()
  },
)

watch(showTournamentTableTab, (hasTable) => {
  if (!tournament.value) return
  if (!hasTable) {
    if (activeTab.value === 2) activeTab.value = 0
    else if (activeTab.value === 3) activeTab.value = 2
    else if (activeTab.value === 4) activeTab.value = 3
    else if (activeTab.value === 5) activeTab.value = 4
  }
})

watch(
  () => tournament.value,
  (t) => {
    if (t) syncTournamentTabFromRoute()
  },
  { immediate: true },
)

const showGroupBuckets = computed(() =>
  tournament.value ? showGroupBucketsFor(tournament.value) : false,
)

/** Перетаскивание порядка в дне как для круговой одной группы, так и для полностью ручного расписания. */
const canReorderCalendarDay = computed(() => {
  if (modPolicy.value.locksCalendarAndPlayoffAutomation) return false
  const f = tournament.value?.format
  return f === 'SINGLE_GROUP' || f === 'MANUAL'
})
const hasAnyEnteredResults = computed(() => {
  const ms = tournament.value?.matches ?? []
  return ms.some((m) => m.homeScore !== null && m.awayScore !== null && (m.status === 'PLAYED' || m.status === 'FINISHED'))
})

/**
 * Есть матчи в турнире в БД (расписание есть), независимо от текущих фильтров календаря.
 * Нельзя использовать только matches.length: при dateFrom/dateTo API отдаёт пустой список,
 * иначе UI уходит в «Расписания пока нет» и прячет фильтры — ловушка для пользователя.
 */
const hasScheduleMatches = computed(() => {
  const t = tournament.value
  if (!t) return false
  const summaryTotal = t.summary?.matchesTotal
  if (typeof summaryTotal === 'number') return summaryTotal > 0
  const nMap = t.matchNumberById ? Object.keys(t.matchNumberById).length : 0
  if (nMap > 0) return true
  return (t.matches?.length ?? 0) > 0
})

/** Есть ли ещё матчи за пределами уже загруженных пачек (см. matchesLimit на бэкенде). */
const tournamentMatchesHasMore = computed(() => {
  const tour = tournament.value
  if (!tour) return false
  const loaded = tour.matches?.length ?? 0
  return loaded < resolvedMatchesTotal(tour)
})

const tournamentPagingResolvedTotal = computed(() => {
  const tour = tournament.value
  if (!tour) return 0
  return resolvedMatchesTotal(tour)
})

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0
}

/** Условия для успешной POST /calendar (без MANUAL и пока нет матчей). */
const calendarReadinessItems = computed((): { id: string; ok: boolean; label: string }[] => {
  const tourn = tournament.value
  if (!tourn || isManualFormat.value || hasScheduleMatches.value) return []

  const items: { id: string; ok: boolean; label: string }[] = []
  const minT = Math.max(0, tourn.minTeams ?? 0)
  const tc = teamCount.value
  const fmt = tourn.format

  items.push({
    id: 'min_teams',
    ok: tc >= minT,
    label: t('admin.tournament_page.readiness_min_teams', { current: tc, min: minT }),
  })

  if (showGroupBuckets.value) {
    const eg = expectedGroupSize.value
    const gc = expectedGroupCount.value
    const divisible = eg !== null && tc > 0

    items.push({
      id: 'groups_divisible',
      ok: divisible,
      label: t('admin.tournament_page.readiness_groups_divisible', {
        teams: tc,
        groups: gc,
      }),
    })

    let distributionOk = false
    if (divisible && eg !== null && gc >= 1) {
      const groupsSorted = (tourn.groups ?? [])
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      const slice = groupsSorted.slice(0, gc)
      if (slice.length >= gc && tc === gc * eg) {
        const counts = new Map<string, number>()
        let allHaveGroup = true
        for (const tt of tourn.tournamentTeams ?? []) {
          const gid = tt.group?.id
          if (!gid) {
            allHaveGroup = false
            break
          }
          counts.set(gid, (counts.get(gid) ?? 0) + 1)
        }
        if (allHaveGroup) {
          distributionOk = slice.every((g) => (counts.get(g.id) ?? 0) === eg)
        }
      }
    }

    items.push({
      id: 'groups_balanced',
      ok: distributionOk,
      label: t('admin.tournament_page.readiness_groups_balanced', {
        perGroup: eg ?? '—',
      }),
    })
  }

  if (fmt === 'PLAYOFF') {
    items.push({
      id: 'playoff_size',
      ok: tc >= 4 && isPowerOfTwo(tc),
      label: t('admin.tournament_page.readiness_playoff_bracket'),
    })
  }

  if (isGroupsPlusPlayoffFamily(fmt)) {
    const k = tourn.playoffQualifiersPerGroup ?? 2
    const gc = expectedGroupCount.value
    const q = gc * k
    items.push({
      id: 'playoff_grid',
      ok: isPowerOfTwo(q),
      label: t('admin.tournament_page.readiness_playoff_grid', { total: q }),
    })
  }

  return items
})

const calendarReadinessAllOk = computed(
  () =>
    calendarReadinessItems.value.length > 0 &&
    calendarReadinessItems.value.every((i) => i.ok),
)

const showCalendarReadinessPanel = computed(
  () => !isManualFormat.value && !hasScheduleMatches.value && !!tournament.value,
)

type LaunchWizardStep = {
  id: 'basic' | 'teams' | 'staff_and_venues' | 'calendar' | 'publish'
  title: string
  ok: boolean
  hint: string
  tab: 'calendar' | 'squads' | 'infrastructure' | null
}

const launchWizardSteps = computed<LaunchWizardStep[]>(() => {
  const tRow = tournament.value
  if (!tRow) return []
  const teams = tRow.tournamentTeams?.length ?? 0
  const minTeams = Math.max(2, tRow.minTeams ?? 0)
  const hasReferees = (tRow.tournamentReferees?.length ?? 0) > 0
  const hasStadiums = (tRow.tournamentStadiums?.length ?? 0) > 0 || !!tRow.stadiumId
  const hasDates =
    !!tRow.startsAt &&
    !!tRow.endsAt &&
    new Date(tRow.startsAt).getTime() <= new Date(tRow.endsAt).getTime()
  const groupsRequired = showGroupBucketsFor(tRow)
  const unassignedTeams = groupsRequired
    ? (tRow.tournamentTeams ?? []).filter((tt) => !tt.group?.id).length
    : 0
  const teamsStepOk = teams >= minTeams && (!groupsRequired || unassignedTeams === 0)
  const teamsStepHint =
    teams < minTeams
      ? `Добавьте минимум ${minTeams} команд (сейчас ${teams}).`
      : groupsRequired && unassignedTeams > 0
        ? `Распределите команды по группам: без группы осталось ${unassignedTeams}.`
        : 'Проверьте состав команд.'

  return [
    {
      id: 'basic',
      title: '1) Базовые поля',
      ok:
        !!String(tRow.name ?? '').trim() &&
        !!String(tRow.slug ?? '').trim() &&
        !!String(tRow.format ?? '').trim() &&
        hasDates,
      hint: 'Заполните название, slug, формат и корректные даты (начало <= окончание).',
      tab: null,
    },
    {
      id: 'teams',
      title: '2) Команды и состав',
      ok: teamsStepOk,
      hint: teamsStepHint,
      tab: 'squads',
    },
    {
      id: 'staff_and_venues',
      title: '3) Судьи и площадки',
      ok: hasReferees && hasStadiums,
      hint: 'Назначьте хотя бы одного судью и одну площадку на вкладке «Инфраструктура».',
      tab: 'infrastructure',
    },
    {
      id: 'calendar',
      title: '4) Генерация календаря',
      ok: hasScheduleMatches.value,
      hint: 'Сгенерируйте календарь или добавьте матчи вручную.',
      tab: 'calendar',
    },
    {
      id: 'publish',
      title: '5) Проверка и публикация',
      ok: !!tRow.published,
      hint: 'После проверки данных включите публикацию турнира на сайте.',
      tab: null,
    },
  ]
})

const launchWizardReadyCount = computed(
  () => launchWizardSteps.value.filter((step) => step.ok).length,
)
const launchWizardAllReady = computed(
  () => launchWizardSteps.value.length > 0 && launchWizardSteps.value.every((step) => step.ok),
)
const launchChecklistCompletedLabel = computed(() => {
  const tRow = tournament.value
  if (!tRow?.launchChecklistCompletedAt) return ''
  const by = tRow.launchChecklistCompletedBy
    ? formatUserListLabel(tRow.launchChecklistCompletedBy)
    : '—'
  return `Отмечено как завершенное: ${new Date(tRow.launchChecklistCompletedAt).toLocaleString()} · ${by}`
})

function openLaunchWizardStep(step: LaunchWizardStep) {
  if (step.tab) {
    const hasTable = showTournamentTableTab.value
    activeTab.value = tournamentTabSlugToIndex(step.tab, hasTable)
    void router.replace({ query: { ...route.query, tab: step.tab } })
    return
  }
  if (step.id === 'publish' && import.meta.client) {
    document.getElementById('tournament-publish-card')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }
}

async function setLaunchChecklistCompleted(completed: boolean) {
  if (!token.value || !tournament.value || launchChecklistSaving.value) return
  launchChecklistSaving.value = true
  try {
    const res = await authFetch<{
      launchChecklistCompletedAt?: string | null
      launchChecklistCompletedBy?: {
        id: string
        name: string
        lastName?: string | null
        username?: string | null
      } | null
    }>(apiUrl(`/tournaments/${tournamentId.value}/launch-checklist`), {
      method: 'PATCH',
      body: { completed },
    })
    tournament.value = {
      ...tournament.value,
      launchChecklistCompletedAt: res.launchChecklistCompletedAt ?? null,
      launchChecklistCompletedBy: res.launchChecklistCompletedBy ?? null,
    }
    toast.add({
      severity: 'success',
      summary: completed ? 'Запуск отмечен как завершенный' : 'Статус запуска снят',
      life: 3000,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось обновить статус запуска',
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 5000,
    })
  } finally {
    launchChecklistSaving.value = false
  }
}

async function loadInfrastructureOptions() {
  if (!token.value || !currentTenantId.value) return
  infrastructureLoading.value = true
  try {
    const tenantId = currentTenantId.value
    const [seasons, competitions, ageGroups, referees, stadiums] = await Promise.all([
      authFetch<Array<{ id: string; name: string; active?: boolean | null }>>(
        apiUrl(`/tenants/${tenantId}/seasons`),
      ),
      authFetch<Array<{ id: string; name: string; active?: boolean | null }>>(
        apiUrl(`/tenants/${tenantId}/competitions`),
      ),
      authFetch<
        Array<{ id: string; name: string; shortLabel?: string | null; active?: boolean | null }>
      >(apiUrl(`/tenants/${tenantId}/age-groups`)),
      authFetch<Array<{ id: string; firstName: string; lastName: string }>>(
        apiUrl(`/tenants/${tenantId}/referees`),
      ),
      authFetch<Array<{ id: string; name: string; city?: string | null; address?: string | null }>>(
        apiUrl(`/tenants/${tenantId}/stadiums`),
      ),
    ])
    infrastructureOptions.value = { seasons, competitions, ageGroups, referees, stadiums }
  } catch (e: unknown) {
    toast.add({
      severity: 'warn',
      summary: t('admin.tournament_page.infrastructure_options_load_error'),
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 5000,
    })
  } finally {
    infrastructureLoading.value = false
  }
}

/** Справочники сезонов/площадок — по первому открытию вкладки «Инфраструктура», не при каждом входе на страницу турнира. */
let infrastructureOptionsLoadRequested = false

watch(
  [activeTab, showTournamentTableTab, tournament],
  () => {
    if (activeTab.value !== infrastructureTabIndex.value) return
    if (!tournament.value || !token.value || !currentTenantId.value) return
    if (infrastructureOptionsLoadRequested) return
    infrastructureOptionsLoadRequested = true
    void loadInfrastructureOptions()
  },
  { immediate: true },
)

async function saveInfrastructure() {
  if (!token.value || !tournament.value || infrastructureSaving.value) return
  infrastructureSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}`), {
      method: 'PATCH',
      body: {
        seasonId: infrastructureForm.value.seasonId || null,
        competitionId: infrastructureForm.value.competitionId || null,
        ageGroupId: infrastructureForm.value.ageGroupId || null,
        refereeIds: infrastructureForm.value.refereeIds,
        stadiumIds: infrastructureForm.value.stadiumIds,
      },
    })
    await fetchTournament()
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_page.infrastructure_saved'),
      life: 3000,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.infrastructure_save_error'),
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 5000,
    })
  } finally {
    infrastructureSaving.value = false
  }
}

watch(hasScheduleMatches, (has) => {
  if (has || !tournament.value) return
  const hasTable = showTournamentTableTab.value
  const onLockedTab =
    activeTab.value === 1 || (hasTable && activeTab.value === 2)
  if (!onLockedTab) return
  tournamentTabSyncInProgress = true
  activeTab.value = 0
  void router.replace({ query: { ...route.query, tab: 'calendar' } })
  nextTick(() => {
    tournamentTabSyncInProgress = false
  })
})

const canEditTournament = computed(
  () =>
    tournament.value?.status === 'DRAFT' &&
    !modPolicy.value.locksTournamentPublishingAndDraftStructure,
)

// Группы — только до появления матчей (как и состав команд).
const canEditGroups = computed(
  () =>
    showGroupBuckets.value &&
    canEditTournament.value &&
    !hasAnyEnteredResults.value &&
    !hasScheduleMatches.value,
)

/** Добавление/удаление команд — только пока нет матчей. */
const canEditTeamComposition = computed(
  () => canEditTournament.value && !hasAnyEnteredResults.value && !hasScheduleMatches.value,
)

/** Рейтинги для сетки — пока нет введённых результатов; при наличии матчей сработает перегенерация календаря. */
const canEditTeamRatings = computed(
  () => canEditTournament.value && !hasAnyEnteredResults.value,
)
const matchDayModeEnabled = ref(false)
const matchDayDate = ref<Date | null>(new Date())
const matchDayQuickLoadingId = ref<string | null>(null)
const openMatchDayFullscreen = () => {
  const q: Record<string, string> = {}
  if (matchDayDate.value) q.date = toYmdLocal(matchDayDate.value)
  void router.push({
    path: `/admin/match-day/${tournamentId.value}`,
    query: q,
  })
}

const isSameLocalDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const matchDayTimelineMatches = computed(() => {
  const day = matchDayDate.value
  const items = (tournament.value?.matches ?? []).slice()
  if (!day) return items
  return items
    .filter((m) => isSameLocalDate(new Date(m.startTime), day))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
})

const matchDayNextMatch = computed(() => {
  const now = Date.now()
  const rows = matchDayTimelineMatches.value
  const live = rows.find((m) => m.status === 'LIVE')
  if (live) return live
  return rows.find((m) => new Date(m.startTime).getTime() >= now) ?? rows[0] ?? null
})

const shiftMatchInDayMode = async (match: MatchRow, minutes: number) => {
  if (!token.value || isMatchEditLocked(match.status)) return
  matchDayQuickLoadingId.value = match.id
  try {
    const nextStart = new Date(new Date(match.startTime).getTime() + minutes * 60_000)
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}/matches/${match.id}`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: {
        startTime: nextStart.toISOString(),
        scheduleChangeNote: `Быстрый сдвиг в режиме дня тура (${minutes > 0 ? '+' : ''}${minutes} мин)`,
      },
    })
    await fetchTournament()
    toast.add({
      severity: 'success',
      summary: 'Время матча обновлено',
      life: 2500,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сдвинуть матч',
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 5000,
    })
  } finally {
    matchDayQuickLoadingId.value = null
  }
}

const quickSetMatchStatusInDayMode = async (
  match: MatchRow,
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED',
) => {
  if (!token.value || isMatchEditLocked(match.status)) return
  matchDayQuickLoadingId.value = match.id
  try {
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}/matches/${match.id}/status`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { status },
    })
    await fetchTournament()
    toast.add({
      severity: 'success',
      summary: 'Статус матча обновлен',
      life: 2500,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось обновить статус',
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 5000,
    })
  } finally {
    matchDayQuickLoadingId.value = null
  }
}
const infrastructureReferenceFieldsLocked = computed(
  () => hasScheduleMatches.value && hasAnyEnteredResults.value,
)

// Если календарь уже сгенерирован (есть матчи), то при правках состава/групп
// нужно пересоздавать расписание, иначе матчи будут соответствовать старой структуре.
const shouldRegenerateCalendar = computed(
  () => (tournament.value?.matches?.length ?? 0) > 0 && !hasAnyEnteredResults.value,
)

const teamCount = computed(() => tournament.value?.tournamentTeams?.length ?? 0)

const tournamentAdminMembers = computed(() =>
  (tournament.value?.members ?? []).filter((m) => m.role === 'TOURNAMENT_ADMIN'),
)
const tournamentModeratorMembers = computed(() =>
  (tournament.value?.members ?? []).filter((m) => m.role === 'MODERATOR'),
)

const canRegenerateCalendar = computed(() => {
  const minTeams = tournament.value?.minTeams ?? 0
  return (
    shouldRegenerateCalendar.value &&
    teamCount.value >= minTeams &&
    !isManualFormat.value &&
    canTournamentAutomation.value
  )
})
const teamCompositionErrors = computed(() => {
  const minTeams = Math.max(0, tournament.value?.minTeams ?? 0)
  const selectedCount = selectedTeamIds.value.length
  return {
    minTeams:
      selectedCount >= minTeams
        ? ''
        : t('admin.validation.min_teams_selected', { min: minTeams, selected: selectedCount }),
  }
})
const canSaveTeamComposition = computed(() => !teamCompositionErrors.value.minTeams)

const ratingSaving = ref(false)
const ratingOptions = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))

/** Иначе у .p-select-label срабатывает ellipsis и цифра 1–5 превращается в «1..». */
const seedStrengthSelectPt = {
  root: { class: 'w-[5.25rem] min-w-[5.25rem] shrink-0' },
  label: {
    class:
      '!flex-none overflow-visible [text-overflow:clip] text-center tabular-nums',
  },
}

const updateTeamRating = async (teamId: string, rating: number) => {
  if (!token.value) return
  if (!tournament.value) return
  if (!canEditTeamRatings.value) return
  if (ratingSaving.value) return

  ratingSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}/teams/${teamId}/rating`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { rating: Number(rating) },
    })

    if (canRegenerateCalendar.value) {
      await generateCalendar()
      await fetchTournament()
      await fetchTable()
    } else {
      await fetchTournament()
    }
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.rating_error_summary'),
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 6000,
    })
    // Синхронизируем состояние с сервером после ошибки.
    await fetchTournament()
  } finally {
    ratingSaving.value = false
  }
}

const expectedGroupCount = computed(() => {
  const f = tournament.value?.format
  const t = tournament.value
  if (f === 'GROUPS_2') return 2
  if (f === 'GROUPS_3') return 3
  if (f === 'GROUPS_4') return 4
  if (f === 'GROUPS_PLUS_PLAYOFF') return t?.groupCount ?? 2
  return t?.groupCount ?? 1
})

const expectedGroupSize = computed(() => {
  const total = tournament.value?.tournamentTeams?.length ?? 0
  const gc = expectedGroupCount.value
  if (!gc || gc < 1) return null
  if (total === 0) return null
  if (total % gc !== 0) return null
  return total / gc
})

const playoffQualifiersPerGroup = computed(() => tournament.value?.playoffQualifiersPerGroup ?? 2)

const playoffSlotLabels = (m: MatchRow) => {
  return playoffSlotLabelsByMatchId.value[m.id] ?? null
}

const playoffSlotLabelsByMatchId = computed(() =>
  buildPlayoffSlotLabels(tournament.value, {
    winnerOfMatch: (number) =>
      t('admin.tournament_page.playoff_winner_of_match', { number }),
    loserOfMatch: (number) =>
      t('admin.tournament_page.playoff_loser_of_match', { number }),
  }),
)

/** Полная синхронизация групп и порядка в колонках (groupSortOrder на бэкенде). */
const syncGroupLayoutFromColumns = async () => {
  if (!token.value || !tournament.value) return
  const items: { teamId: string; groupId: string; groupSortOrder: number }[] = []
  for (const col of groupColumns.value) {
    col.teams.forEach((t, i) => {
      items.push({ teamId: t.teamId, groupId: col.id, groupSortOrder: i })
    })
  }
  if (!items.length) return
  groupingSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}/teams/group-layout`), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { items },
    })
  } finally {
    groupingSaving.value = false
  }
}

/** При равном делении (expectedGroupSize) не даём переполнить группу; обмен — только между «полными» списками. */
const checkGroupMove = (evt: any) => {
  if (!canEditGroups.value || groupingSaving.value) return false
  const size = expectedGroupSize.value
  if (!size) return true
  const relatedContext = evt?.relatedContext
  const draggedContext = evt?.draggedContext
  // Если vuedraggable не передал list, не блокируем — иначе нельзя исправить уже «сломанный» состав; баланс ловим в onGroupChange.
  if (!relatedContext?.list || !draggedContext?.list) return true
  const destList = relatedContext.list as TournamentTeamRow[]
  const srcList = draggedContext.list as TournamentTeamRow[]
  if (destList === srcList) return true
  const destLen = destList.length
  const srcLen = srcList.length
  if (destLen < size) return true
  if (destLen === size && srcLen === size) return true
  return false
}

const snapshotPreDrag = () => {
  preDragGroups.value = Object.fromEntries(
    groupColumns.value.map((c) => [c.id, c.teams.map((t) => t.teamId)]),
  )
}

type GroupDragChangeEvt = {
  added?: { element?: TournamentTeamRow; newIndex?: number }
  moved?: { element?: TournamentTeamRow; newIndex?: number }
}

function handleGroupDragChange(evt: unknown, targetGroupId: string | null) {
  void onGroupChange(evt as GroupDragChangeEvt, targetGroupId)
}

const onGroupChange = async (evt: GroupDragChangeEvt, targetGroupId: string | null) => {
  if (!canEditGroups.value || !tournament.value) return
  if (!targetGroupId) return
  const moved = (evt?.added?.element ?? evt?.moved?.element) as TournamentTeamRow | undefined
  if (!moved) return
  const newIndex = (evt?.added?.newIndex ?? evt?.moved?.newIndex) as number | undefined
  const size = expectedGroupSize.value
  const cols = groupColumns.value
  let swapped: TournamentTeamRow | null = null

  if (size && cols.length === 2 && (cols[0]!.teams.length > size || cols[1]!.teams.length > size)) {
    const c0 = cols[0]!
    const c1 = cols[1]!
    const isTargetA = targetGroupId === c0.id
    const targetList = isTargetA ? c0.teams : c1.teams
    const sourceList = isTargetA ? c1.teams : c0.teams
    const preTarget = isTargetA ? preDragGroups.value[c0.id] ?? [] : preDragGroups.value[c1.id] ?? []
    const preSource = isTargetA ? preDragGroups.value[c1.id] ?? [] : preDragGroups.value[c0.id] ?? []

    const swapOutId =
      typeof newIndex === 'number' && newIndex >= 0 && newIndex < preTarget.length
        ? preTarget[newIndex]
        : null

    const pickSwapOut = () => {
      if (swapOutId && swapOutId !== moved.teamId) {
        const found = targetList.find((x) => x.teamId === swapOutId)
        if (found) return found
      }
      for (let i = targetList.length - 1; i >= 0; i--) {
        const cand = targetList[i]
        if (cand && cand.teamId !== moved.teamId) return cand
      }
      return null
    }

    const picked = pickSwapOut()
    swapped = picked
    if (picked) {
      const idx = targetList.findIndex((x) => x.teamId === picked.teamId)
      if (idx >= 0) targetList.splice(idx, 1)

      const desiredIndex = preSource.indexOf(moved.teamId)
      const insertAt = desiredIndex >= 0 ? Math.min(desiredIndex, sourceList.length) : sourceList.length
      sourceList.splice(insertAt, 0, picked)
    }
  }

  if (size && cols.length === 2) {
    const a = cols[0]!.teams.length
    const b = cols[1]!.teams.length
    if (a !== size || b !== size) {
      await fetchTournament()
      toast.add({
        severity: 'warn',
        summary: t('admin.tournament_page.groups_even_summary'),
        detail: t('admin.tournament_page.groups_even_detail', {
          teams: tournament.value?.tournamentTeams?.length ?? 0,
          groups: cols.length,
          size,
        }),
        life: 6000,
      })
      return
    }
  }

  try {
    await syncGroupLayoutFromColumns()
    await fetchTournament()

    if (canRegenerateCalendar.value) {
      await generateCalendar()
      await fetchTournament()
      toast.add({
        severity: 'success',
        summary: t('admin.tournament_page.groups_updated_summary'),
        detail: t('admin.tournament_page.groups_updated_regenerated_detail'),
        life: 2000,
      })
    } else {
      toast.add({
        severity: 'success',
        summary: t('admin.tournament_page.groups_updated_summary'),
        detail:
          swapped
            ? t('admin.tournament_page.groups_updated_swapped_detail')
            : t('admin.tournament_page.groups_updated_moved_detail') +
              (teamCount.value < (tournament.value?.minTeams ?? 0)
                ? ` ${t('admin.tournament_page.groups_updated_not_regenerated_detail')}`
                : ''),
        life: 1500,
      })
    }
    if (isGroupedFormat.value) {
      await fetchTable()
    }
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.groups_error_summary'),
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 6000,
    })
    await fetchTournament()
  }
}

const saveTeams = async () => {
  if (!token.value || !tournament.value) return
  teamCompositionSubmitAttempted.value = true
  if (!canSaveTeamComposition.value) {
    toast.add({
      severity: 'warn',
      summary: t('admin.tournament_page.composition_check_summary'),
      detail: teamCompositionErrors.value.minTeams,
      life: 5000,
    })
    return
  }
  savingTeams.value = true
  if (!canEditTeamComposition.value) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.composition_edit_forbidden_summary'),
      detail: hasScheduleMatches.value
        ? t('admin.tournament_page.composition_edit_forbidden_schedule_detail')
        : t('admin.tournament_page.composition_edit_forbidden_status_detail'),
      life: 6000,
    })
    savingTeams.value = false
    return
  }
  try {
    const prev = new Set<string>(
      Array.isArray(tournament.value.tournamentTeams)
        ? tournament.value.tournamentTeams.map((x) => x.teamId)
        : [],
    )
    const next = new Set<string>(selectedTeamIds.value)
    const toAdd = [...next].filter((id) => !prev.has(id))
    const toRemove = [...prev].filter((id) => !next.has(id))

    for (const teamId of toAdd) {
      await authFetch(apiUrl(`/tournaments/${tournamentId.value}/teams/${teamId}`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
      })
    }
    for (const teamId of toRemove) {
      await authFetch(apiUrl(`/tournaments/${tournamentId.value}/teams/${teamId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token.value}` },
      })
    }

    await fetchTournament()
    await fetchTable()
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_page.composition_saved_summary'),
      detail: t('admin.tournament_page.composition_saved_detail'),
      life: 2500,
    })

    if (canRegenerateCalendar.value) {
      await generateCalendar()
      await fetchTournament()
      await fetchTable()
    }
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.composition_error_summary'),
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 6000,
    })
  } finally {
    savingTeams.value = false
  }
}

const fetchTable = async () => {
  if (!token.value) return
  const tourn = tournament.value
  if (!tourn) return
  tableError.value = null
  tableLoading.value = true
  try {
    if (isGroupedFormat.value && Array.isArray(tourn.groups)) {
      const next: Record<string, TableRow[]> = {}
      for (const g of tourn.groups.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
        const res = await authFetch<TableRow[]>(
          apiUrl(`/tournaments/${tournamentId.value}/table`),
          {
            params: { groupId: g.id },
            headers: { Authorization: `Bearer ${token.value}` },
          },
        )
        next[g.id] = res
      }
      groupTables.value = next
      table.value = []
    } else {
      const res = await authFetch<TableRow[]>(apiUrl(`/tournaments/${tournamentId.value}/table`), {
        headers: { Authorization: `Bearer ${token.value}` },
      })
      table.value = res
      groupTables.value = {}
    }
    tableLoadSucceeded.value = true
  } catch (e: unknown) {
    tableError.value = getApiErrorMessage(e, t('admin.errors.request_failed'))
    table.value = []
    groupTables.value = {}
    tableLoadSucceeded.value = false
  } finally {
    tableLoading.value = false
  }
}

const normalizeDateInput = (v: unknown) => {
  if (!v) return undefined
  if (typeof v === 'string') return v
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return undefined
}

const isValidTimeHHmm = (s: unknown) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

const sanitizeDayStartOverrides = (overrides: Record<number, string>) => {
  const cleaned: Record<number, string> = {}
  for (const [k, raw] of Object.entries(overrides ?? {})) {
    const day = Number(k)
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) continue
    if (!isValidTimeHHmm(value)) {
      throw new Error(
        t('admin.tournament_page.invalid_day_start_time_format', {
          day: weekdayLabelByValue.value[day] ?? k,
        }),
      )
    }
    cleaned[day] = value
  }
  return cleaned
}

const parseTimeToDate = (time: string | undefined | null): Date | null => {
  if (!time || !isValidTimeHHmm(time)) return null
  const parts = time.split(':').map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

const toTimeHHmm = (value: Date | Date[] | (Date | null)[] | null | undefined): string => {
  const d = Array.isArray(value)
    ? value.find((x): x is Date => x instanceof Date) ?? value[0]
    : value
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

const defaultDayStartTimeModel = computed<Date | null>({
  get: () => parseTimeToDate(calendarForm.dayStartTimeDefault),
  set: (value) => {
    calendarForm.dayStartTimeDefault = toTimeHHmm(value) || '12:00'
  },
})

const getDayOverrideTimeModel = (day: number) => parseTimeToDate(calendarForm.dayStartTimeOverrides[day] || '')
const setDayOverrideTimeModel = (
  day: number,
  value: Date | Date[] | (Date | null)[] | null | undefined,
) => {
  const next = toTimeHHmm(value)
  if (next) calendarForm.dayStartTimeOverrides[day] = next
  else delete calendarForm.dayStartTimeOverrides[day]
}

type CalendarNumericField =
  | 'intervalDays'
  | 'roundsPerDay'
  | 'roundRobinCycles'
  | 'matchDurationMinutes'
  | 'matchBreakMinutes'
  | 'simultaneousMatches'

const setCalendarNumberLive = (field: CalendarNumericField, rawValue: unknown) => {
  const num =
    typeof rawValue === 'number'
      ? rawValue
      : typeof rawValue === 'string'
        ? Number(rawValue)
        : NaN
  if (typeof num !== 'number' || Number.isNaN(num)) return
  const n = Math.trunc(num)
  const clamp = (v: number, min: number, max?: number) =>
    max !== undefined ? Math.min(max, Math.max(min, v)) : Math.max(min, v)
  const next =
    field === 'roundRobinCycles'
      ? clamp(n, 1, 4)
      : field === 'matchBreakMinutes'
        ? clamp(n, 0)
        : clamp(n, 1)
  ;(calendarForm as Record<string, unknown>)[field] = next
}

const roundsPerDayHintText =
  t('admin.tournament_page.rounds_per_day_hint')
const roundRobinCyclesHintText =
  t('admin.tournament_page.round_robin_cycles_hint')
const previewHintText =
  t('admin.tournament_page.preview_hint')
const oneDayHintText =
  t('admin.tournament_page.one_day_hint')
const schedulingModeHintText =
  t('admin.tournament_page.scheduling_mode_hint')

const minutesUntilMidnightFromHhmm = (hhmm: string) => {
  if (!isValidTimeHHmm(hhmm)) return 24 * 60
  const parts = hhmm.split(':').map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  return 24 * 60 - h * 60 - m
}

const effectiveIntervalDays = computed(() =>
  calendarForm.oneDayTournament ? 1 : Math.max(1, Number(calendarForm.intervalDays) || 1),
)

const effectiveAllowedDays = computed(() => {
  if (!calendarForm.oneDayTournament) return calendarForm.allowedDays
  if (!calendarForm.startDate) return []
  return [new Date(calendarForm.startDate).getDay()]
})

const effectiveDayStartOverrides = computed(() =>
  calendarForm.oneDayTournament ? ({} as Record<number, string>) : calendarForm.dayStartTimeOverrides,
)

const calendarPreview = computed(() => {
  const teams = tournament.value?.tournamentTeams ?? []
  const teamCount = teams.length
  const cycles = Math.max(1, Number(calendarForm.roundRobinCycles) || 1)
  const roundsPerDay = Math.max(1, Number(calendarForm.roundsPerDay) || 1)
  const intervalDays = effectiveIntervalDays.value
  const startDate = calendarForm.startDate ? new Date(calendarForm.startDate) : null
  const format = tournament.value?.format ?? calendarForm.format

  const slotMinutes =
    Math.max(1, Number(calendarForm.matchDurationMinutes) || 50) +
    Math.max(0, Number(calendarForm.matchBreakMinutes) || 0)
  const parallel = Math.max(1, Number(calendarForm.simultaneousMatches) || 1)

  const roundsPerCycleForGroupSize = (n: number) => (n > 1 ? (n % 2 === 0 ? n - 1 : n) : 0)
  const matchesPerCycleForGroupSize = (n: number) => (n > 1 ? (n * (n - 1)) / 2 : 0)

  let estimatedMatches = 0
  let estimatedRounds = 0
  let matchesPerRound = 0

  if (format === 'SINGLE_GROUP') {
    estimatedMatches = matchesPerCycleForGroupSize(teamCount) * cycles
    estimatedRounds = roundsPerCycleForGroupSize(teamCount) * cycles
    matchesPerRound = Math.floor(teamCount / 2)
  } else if (isGroupsPlusPlayoffFamily(format)) {
    const groups = tournament.value?.groups ?? []
    const byGroup = new Map<string, number>()
    for (const tt of teams) {
      const gid = tt.group?.id
      if (!gid) continue
      byGroup.set(gid, (byGroup.get(gid) ?? 0) + 1)
    }
    const sizes = groups.map((g) => byGroup.get(g.id) ?? 0).filter((n) => n > 0)
    if (sizes.length) {
      estimatedMatches = sizes.reduce((acc, n) => acc + matchesPerCycleForGroupSize(n) * cycles, 0)
      estimatedRounds = Math.max(...sizes.map((n) => roundsPerCycleForGroupSize(n) * cycles))
      matchesPerRound = sizes.reduce((acc, n) => acc + Math.floor(n / 2), 0)
    }
  }

  if (!estimatedMatches && teamCount > 1) {
    estimatedMatches = matchesPerCycleForGroupSize(teamCount) * cycles
  }
  if (!estimatedRounds && teamCount > 1) {
    estimatedRounds = roundsPerCycleForGroupSize(teamCount) * cycles
  }
  if (!matchesPerRound && teamCount > 1 && format === 'SINGLE_GROUP') {
    matchesPerRound = Math.floor(teamCount / 2)
  }

  const roundDays = estimatedRounds ? Math.ceil(estimatedRounds / roundsPerDay) : 0
  const allowedSet = effectiveAllowedDays.value?.length ? new Set(effectiveAllowedDays.value) : null
  let estimatedEndDate: Date | null = null
  if (startDate && roundDays > 0) {
    let roundDate = new Date(startDate)
    for (let d = 0; d < roundDays; d++) {
      if (d > 0) {
        roundDate = new Date(roundDate.getTime() + intervalDays * 24 * 60 * 60 * 1000)
      }
      if (allowedSet) {
        while (!allowedSet.has(roundDate.getDay())) {
          roundDate = new Date(roundDate.getTime() + 24 * 60 * 60 * 1000)
        }
      }
      estimatedEndDate = new Date(roundDate)
    }
  }

  const roundsOnBusiestDay =
    estimatedRounds > 0 ? Math.min(estimatedRounds, roundsPerDay) : 0
  const matchesOnBusiestDay = roundsOnBusiestDay * matchesPerRound
  const effectiveParallel = Math.max(1, Math.min(parallel, Math.max(1, matchesPerRound)))
  const minutesNeededOnBusiestDay =
    matchesOnBusiestDay > 0
      ? calendarForm.schedulingMode === 'STRICT_ROUNDS'
        ? roundsOnBusiestDay * Math.ceil(matchesPerRound / effectiveParallel) * slotMinutes
        : Math.ceil(matchesOnBusiestDay / effectiveParallel) * slotMinutes
      : 0

  const dayIndices = effectiveAllowedDays.value?.length
    ? effectiveAllowedDays.value
    : ([0, 1, 2, 3, 4, 5, 6] as const)
  const minAvailableMinutesPerDay = Math.min(
    ...dayIndices.map((d) => {
      const t =
        (effectiveDayStartOverrides.value[d] as string | undefined) ||
        calendarForm.dayStartTimeDefault
      return minutesUntilMidnightFromHhmm(t)
    }),
  )

  const scheduleOverflow =
    (format === 'SINGLE_GROUP' || isGroupsPlusPlayoffFamily(format)) &&
    estimatedRounds > 0 &&
    matchesOnBusiestDay > 0 &&
    minutesNeededOnBusiestDay > minAvailableMinutesPerDay

  return {
    teamCount,
    estimatedMatches,
    estimatedRounds,
    roundDays,
    estimatedEndDate,
    minutesNeededOnBusiestDay,
    minAvailableMinutesPerDay,
    scheduleOverflow,
  }
})

type CalendarPreviewKey =
  | 'teamCount'
  | 'estimatedMatches'
  | 'estimatedRounds'
  | 'roundDays'
  | 'estimatedEndDate'

const calendarPreviewChanged = reactive<Record<CalendarPreviewKey, boolean>>({
  teamCount: false,
  estimatedMatches: false,
  estimatedRounds: false,
  roundDays: false,
  estimatedEndDate: false,
})

let previewResetTimer: ReturnType<typeof setTimeout> | null = null

watch(calendarPreview, (next, prev) => {
  if (!prev) return
  const prevEnd = prev.estimatedEndDate?.toISOString().slice(0, 10) ?? null
  const nextEnd = next.estimatedEndDate?.toISOString().slice(0, 10) ?? null
  calendarPreviewChanged.teamCount = next.teamCount !== prev.teamCount
  calendarPreviewChanged.estimatedMatches = next.estimatedMatches !== prev.estimatedMatches
  calendarPreviewChanged.estimatedRounds = next.estimatedRounds !== prev.estimatedRounds
  calendarPreviewChanged.roundDays = next.roundDays !== prev.roundDays
  calendarPreviewChanged.estimatedEndDate = nextEnd !== prevEnd
  if (previewResetTimer) clearTimeout(previewResetTimer)
  previewResetTimer = setTimeout(() => {
    calendarPreviewChanged.teamCount = false
    calendarPreviewChanged.estimatedMatches = false
    calendarPreviewChanged.estimatedRounds = false
    calendarPreviewChanged.roundDays = false
    calendarPreviewChanged.estimatedEndDate = false
  }, 700)
})

onBeforeUnmount(() => {
  if (previewResetTimer) clearTimeout(previewResetTimer)
})

watch(
  () => calendarForm.oneDayTournament,
  (enabled) => {
    if (!enabled) return
    calendarForm.endDate = null
    calendarForm.intervalDays = 1
    calendarForm.dayStartTimeOverrides = {}
    if (calendarForm.startDate) {
      calendarForm.allowedDays = [new Date(calendarForm.startDate).getDay()]
    }
  },
)

watch(
  () => calendarForm.startDate,
  (value) => {
    if (!calendarForm.oneDayTournament || !value) return
    calendarForm.allowedDays = [new Date(value).getDay()]
  },
)

watch(
  [() => calendarForm.oneDayTournament, () => calendarPreview.value.estimatedRounds],
  ([enabled, estimatedRounds]) => {
    if (!enabled) return
    calendarForm.roundsPerDay = Math.max(1, Number(estimatedRounds) || 1)
  },
)

const calendarFormErrors = computed(() => {
  const start = calendarForm.startDate ? new Date(calendarForm.startDate) : null
  const end = calendarForm.endDate ? new Date(calendarForm.endDate) : null
  return {
    startDate: start ? '' : t('admin.validation.required_start_date'),
    endDate:
      start && end && start >= end ? t('admin.validation.end_after_start') : '',
    dayStartTimeDefault: isValidTimeHHmm(calendarForm.dayStartTimeDefault)
      ? ''
      : t('admin.validation.invalid_time_hhmm'),
    schedule:
      calendarPreview.value.scheduleOverflow ||
      (calendarForm.oneDayTournament && calendarPreview.value.roundDays > 1)
        ? calendarPreview.value.scheduleOverflow
          ? t('admin.validation.schedule_overflow')
          : t('admin.validation.one_day_conflict')
        : '',
  }
})
const canGenerateCalendar = computed(
  () =>
    !modPolicy.value.locksCalendarAndPlayoffAutomation &&
    canTournamentAutomation.value &&
    !calendarFormErrors.value.startDate &&
    !calendarFormErrors.value.endDate &&
    !calendarFormErrors.value.dayStartTimeDefault &&
    !calendarFormErrors.value.schedule,
)

watch(calendarDialog, (open) => {
  if (open) calendarSubmitAttempted.value = false
})

const generateCalendar = async () => {
  if (!token.value) return
  if (modPolicy.value.locksCalendarAndPlayoffAutomation) return
  if (!canTournamentAutomation.value) {
    toast.add({
      severity: 'warn',
      summary: t('admin.settings.subscription.title'),
      detail: t('admin.settings.subscription.features.tournament_automation'),
      life: 6000,
    })
    return
  }
  if (tournament.value?.format === 'MANUAL') {
    toast.add({
      severity: 'warn',
      summary: t('admin.tournament_page.calendar_manual_summary'),
      detail: t('admin.tournament_page.calendar_manual_detail'),
      life: 4000,
    })
    return
  }
  calendarSubmitAttempted.value = true
  if (!canGenerateCalendar.value) {
    return
  }
  calendarSaving.value = true
  try {
    if (calendarForm.startDate && calendarForm.endDate && calendarForm.startDate >= calendarForm.endDate) {
      throw new Error(t('admin.validation.end_after_start'))
    }
    if (!isValidTimeHHmm(calendarForm.dayStartTimeDefault)) {
      throw new Error(t('admin.validation.invalid_time_hhmm'))
    }
    const cleanedDayStartTimeOverrides = sanitizeDayStartOverrides(effectiveDayStartOverrides.value)

    if (calendarPreview.value.scheduleOverflow) {
      throw new Error(
        t('admin.tournament_page.schedule_overflow_detailed', {
          needed: calendarPreview.value.minutesNeededOnBusiestDay,
          available: calendarPreview.value.minAvailableMinutesPerDay,
        }),
      )
    }
    if (calendarForm.oneDayTournament && calendarPreview.value.roundDays > 1) {
      throw new Error(
        t('admin.tournament_page.one_day_detailed'),
      )
    }

    // Important: calendar generator should not change tournament.format here.
    // Format is edited in the tournament edit dialog.
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: {
        startsAt: normalizeDateInput(calendarForm.startDate) ?? null,
        endsAt: calendarForm.oneDayTournament
          ? null
          : normalizeDateInput(calendarForm.endDate) ?? null,
        intervalDays: effectiveIntervalDays.value,
        allowedDays: Array.isArray(effectiveAllowedDays.value)
          ? effectiveAllowedDays.value
          : [],
        roundRobinCycles: calendarForm.roundRobinCycles || undefined,
        roundsPerDay: calendarForm.roundsPerDay || undefined,
        matchDurationMinutes: calendarForm.matchDurationMinutes || undefined,
        matchBreakMinutes: calendarForm.matchBreakMinutes ?? 0,
        simultaneousMatches: calendarForm.simultaneousMatches || undefined,
        dayStartTimeDefault: calendarForm.dayStartTimeDefault || undefined,
        dayStartTimeOverrides: cleanedDayStartTimeOverrides,
      },
    })

    const calendarRes = await authFetch<{ scheduleWarnings?: string[] | null }>(
      apiUrl(`/tournaments/${tournamentId.value}/calendar`),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: {
          // можно не передавать параметры — backend возьмёт startsAt/intervalDays/allowedDays из турнира
          startDate: normalizeDateInput(calendarForm.startDate),
          intervalDays: effectiveIntervalDays.value,
          roundsPerDay: calendarForm.roundsPerDay || undefined,
          roundRobinCycles: calendarForm.roundRobinCycles || undefined,
          schedulingMode: calendarForm.schedulingMode,
          allowedDays: effectiveAllowedDays.value?.length
            ? effectiveAllowedDays.value
            : undefined,
          replaceExisting: calendarForm.replaceExisting,
          matchDurationMinutes: calendarForm.matchDurationMinutes || undefined,
          matchBreakMinutes: calendarForm.matchBreakMinutes ?? undefined,
          simultaneousMatches: calendarForm.simultaneousMatches || undefined,
          dayStartTimeDefault: calendarForm.dayStartTimeDefault || undefined,
          dayStartTimeOverrides: cleanedDayStartTimeOverrides,
        },
      },
    )
    toastScheduleWarnings(toast, calendarRes)
    calendarDialog.value = false
    await fetchTournament()
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_page.calendar_created_summary'),
      detail: t('admin.tournament_page.calendar_created_default_detail'),
      life: 3000,
    })
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.calendar_generate_error_summary'),
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 6000,
    })
  } finally {
    calendarSaving.value = false
  }
}

const clearCalendar = async () => {
  if (!token.value) return
  if (modPolicy.value.locksCalendarAndPlayoffAutomation) return
  calendarSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}/calendar`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await fetchTournament()
    await fetchTable()
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_page.calendar_cleared_summary'),
      detail: t('admin.tournament_page.calendar_cleared_detail'),
      life: 3000,
    })
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.calendar_clear_error_summary'),
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 6000,
    })
  } finally {
    calendarSaving.value = false
  }
}

/**
 * Панель на вкладке «Матчи»: POST /playoff после закрытия групп подставляет в 1-й раунд плей-оффа
 * реальные команды по таблицам (для автоформатов сетка уже есть как заглушки с посевом из рейтинга).
 */
const canShowPlayoffFromGroupsPanel = computed(
  () =>
    !modPolicy.value.locksCalendarAndPlayoffAutomation &&
    canTournamentAutomation.value &&
    isGroupedFormat.value &&
    (tournament.value?.groups?.length ?? 0) >= 2 &&
    (isManualFormat.value ||
      isGroupsPlusPlayoffFamily(tournament.value?.format ?? '')),
)

const generatePlayoff = async () => {
  if (!token.value) return
  if (modPolicy.value.locksCalendarAndPlayoffAutomation) return
  if (!canTournamentAutomation.value) {
    toast.add({
      severity: 'warn',
      summary: t('admin.settings.subscription.title'),
      detail: t('admin.settings.subscription.features.tournament_automation'),
      life: 6000,
    })
    return
  }
  calendarSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}/playoff`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await fetchTournament()
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_page.playoff_created_summary'),
      detail: t('admin.tournament_page.playoff_created_detail'),
      life: 3000,
    })
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.playoff_create_error_summary'),
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 6000,
    })
  } finally {
    calendarSaving.value = false
  }
}

const canManageManualMatches = computed(
  () =>
    isManualFormat.value &&
    !!token.value &&
    tournament.value?.status !== 'ARCHIVED' &&
    (tournament.value?.tournamentTeams?.length ?? 0) >= 2,
)

const matchesWorkspaceRef = ref<{
  openManualMatchDialog: () => void
} | null>(null)
const matchesDiagnosticPresetFilter = ref<
  | 'all'
  | 'without_stadium'
  | 'without_group'
  | 'live_without_stadium'
  | 'team_overlap'
  | 'stadium_overlap'
  | 'finished_without_score'
  | 'scheduled_in_past'
>('all')

const tournamentDiagnostics = computed(() => {
  const rows = tournament.value?.matches ?? []
  const durationMs = Math.max(1, Number(tournament.value?.matchDurationMinutes ?? 90)) * 60_000
  const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1
  let teamOverlap = 0
  let stadiumOverlap = 0
  const teamOverlapIds = new Set<string>()
  const stadiumOverlapIds = new Set<string>()
  for (let i = 0; i < rows.length; i += 1) {
    const a = rows[i]
    if (!a) continue
    const a0 = new Date(a.startTime).getTime()
    const a1 = a0 + durationMs
    for (let j = i + 1; j < rows.length; j += 1) {
      const b = rows[j]
      if (!b) continue
      const b0 = new Date(b.startTime).getTime()
      const b1 = b0 + durationMs
      if (!overlaps(a0, a1, b0, b1)) continue
      const hasTeamOverlap =
        a.homeTeam.id === b.homeTeam.id ||
        a.homeTeam.id === b.awayTeam.id ||
        a.awayTeam.id === b.homeTeam.id ||
        a.awayTeam.id === b.awayTeam.id
      const hasStadiumOverlap = !!a.stadiumId && !!b.stadiumId && a.stadiumId === b.stadiumId
      if (hasTeamOverlap) {
        teamOverlapIds.add(a.id)
        teamOverlapIds.add(b.id)
      }
      if (hasStadiumOverlap) {
        stadiumOverlapIds.add(a.id)
        stadiumOverlapIds.add(b.id)
      }
    }
  }
  teamOverlap = teamOverlapIds.size
  stadiumOverlap = stadiumOverlapIds.size
  const withoutStadium = rows.filter(
    (m) => !m.stadiumId && (m.status === 'SCHEDULED' || m.status === 'LIVE'),
  ).length
  const withoutGroup = rows.filter((m) => m.stage === 'GROUP' && !m.groupId).length
  const finishedWithoutScore = rows.filter(
    (m) =>
      (m.status === 'FINISHED' || m.status === 'PLAYED') &&
      (m.homeScore === null || m.awayScore === null),
  ).length
  const scheduledInPast = rows.filter(
    (m) => m.status === 'SCHEDULED' && new Date(m.startTime).getTime() < Date.now(),
  ).length
  const totalActive = rows.filter(
    (m) => m.status === 'SCHEDULED' || m.status === 'LIVE',
  ).length
  const noRefereesConfigured =
    (tournament.value?.tournamentReferees?.length ?? 0) === 0
  const noStadiumsConfigured =
    (tournament.value?.tournamentStadiums?.length ?? 0) === 0 &&
    !tournament.value?.stadiumId
  return {
    withoutStadium,
    withoutGroup,
    teamOverlap,
    stadiumOverlap,
    finishedWithoutScore,
    scheduledInPast,
    totalActive,
    noRefereesConfigured,
    noStadiumsConfigured,
  }
})

const showLaunchWizardBlock = computed(
  () => !!tournament.value && tournament.value.status === 'DRAFT' && !tournament.value.published,
)
const showDiagnosticsBlock = computed(
  () => !!tournament.value && !showLaunchWizardBlock.value,
)

const mobileTabOptions = computed(() => {
  const hasTable = showTournamentTableTab.value
  const items = [
    { label: t('admin.tournament_page.tab_calendar'), value: 0 },
    { label: t('admin.tournament_page.tab_matches'), value: 1 },
  ]
  if (hasTable) items.push({ label: t('admin.tournament_page.tab_table'), value: 2 })
  items.push({
    label: t('admin.tournament_page.tab_statistics'),
    value: hasTable ? 3 : 2,
  })
  items.push({
    label: t('admin.tournament_page.tab_compositions'),
    value: hasTable ? 4 : 3,
  })
  items.push({
    label: t('admin.tournament_page.tab_infrastructure'),
    value: hasTable ? 5 : 4,
  })
  return items
})

const openMatchesDiagnosticFilter = (
  preset:
    | 'all'
    | 'without_stadium'
    | 'without_group'
    | 'live_without_stadium'
    | 'team_overlap'
    | 'stadium_overlap'
    | 'finished_without_score'
    | 'scheduled_in_past',
) => {
  matchesDiagnosticPresetFilter.value = preset
  const hasTable = showTournamentTableTab.value
  activeTab.value = tournamentTabSlugToIndex('matches', hasTable)
}

const openInfrastructureDiagnostics = () => {
  const hasTable = showTournamentTableTab.value
  activeTab.value = tournamentTabSlugToIndex('infrastructure', hasTable)
}

const onMatchesWorkspaceUpdated = async () => {
  await fetchTournament()
  await fetchTable()
}

const deletingMatchId = ref<string | null>(null)

const deleteManualMatchConfirmOpen = ref(false)
const manualMatchToDelete = ref<MatchRow | null>(null)
const deleteManualMatchMessage = t('admin.tournament_page.delete_match_confirm_message')

function requestDeleteManualMatch(m: MatchRow) {
  if (!token.value) return
  if (isMatchEditLocked(m.status)) {
    toast.add({
      severity: 'info',
      summary: t('admin.tournament_page.match_finished_summary'),
      detail: t('admin.tournament_page.match_delete_finished_detail'),
      life: 4000,
    })
    return
  }
  manualMatchToDelete.value = m
  deleteManualMatchConfirmOpen.value = true
}

async function confirmDeleteManualMatch() {
  const m = manualMatchToDelete.value
  if (!token.value || !m) return
  deletingMatchId.value = m.id
  try {
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}/matches/${m.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await fetchTournament()
    await fetchTable()
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_page.match_deleted_summary'),
      life: 2500,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.match_delete_error_summary'),
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 6000,
    })
  } finally {
    deletingMatchId.value = null
    manualMatchToDelete.value = null
  }
}

onMounted(async () => {
  if (typeof window !== 'undefined') {
    syncWithStorage()
    if (!loggedIn.value) {
      initialLoading.value = false
      tournamentPageError.value = null
      router.push('/admin/login')
      return
    }
  }
  await fetchTournament()
  teamCompositionSubmitAttempted.value = false
  await fetchTable()
})
</script>

<template>
  <AdminDataState
    :loading="initialLoading"
    :error="tournamentPageError"
    :empty="false"
    :content-card="false"
    :error-title="t('admin.tournament_page.load_error_title')"
    @retry="retryTournamentPage"
  >
    <template #loading>
      <section
        class="admin-page min-h-[28rem] space-y-4 sm:space-y-6"
        aria-busy="true"
      >
    <div class="flex items-start justify-between gap-4">
      <div class="space-y-3 min-w-0 flex-1">
        <Skeleton width="5rem" height="2.25rem" class="rounded-md" />
        <Skeleton width="85%" height="2rem" class="rounded-md max-w-md" />
        <Skeleton width="10rem" height="1rem" class="rounded-md" />
      </div>
      <Skeleton width="11rem" height="2.5rem" class="rounded-md shrink-0" />
    </div>
    <div class="flex flex-wrap gap-2">
      <Skeleton width="7rem" height="2.5rem" class="rounded-md" />
      <Skeleton width="6rem" height="2.5rem" class="rounded-md" />
      <Skeleton width="7rem" height="2.5rem" class="rounded-md" />
    </div>
    <div
      class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4 space-y-4"
    >
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-2 flex-1">
          <Skeleton width="11rem" height="1rem" class="rounded-md" />
          <Skeleton width="90%" height="0.75rem" class="rounded-md" />
        </div>
        <Skeleton width="9rem" height="2.25rem" class="rounded-md shrink-0" />
      </div>
      <div class="space-y-3">
        <div class="flex flex-wrap justify-between gap-3">
          <div class="flex gap-2">
            <Skeleton width="6.5rem" height="2.25rem" class="rounded-md" />
            <Skeleton width="5.5rem" height="2.25rem" class="rounded-md" />
          </div>
          <div class="flex gap-2">
            <Skeleton width="8rem" height="2rem" class="rounded-md" />
            <Skeleton width="7rem" height="2.25rem" class="rounded-md" />
          </div>
        </div>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div class="md:col-span-6 space-y-2">
            <Skeleton width="6rem" height="0.75rem" />
            <Skeleton width="100%" height="2.75rem" class="rounded-md" />
          </div>
          <div class="md:col-span-3 space-y-2">
            <Skeleton width="4rem" height="0.75rem" />
            <Skeleton width="100%" height="2.75rem" class="rounded-md" />
          </div>
          <div class="md:col-span-3 space-y-2">
            <Skeleton width="4.5rem" height="0.75rem" />
            <Skeleton width="100%" height="2.75rem" class="rounded-md" />
          </div>
        </div>
        <div
          v-for="sk in [1, 2, 3]"
          :key="`cal-full-sk-${sk}`"
          class="rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden"
        >
          <div class="px-3 py-2 bg-surface-50 dark:bg-surface-800/80">
            <Skeleton width="55%" height="1rem" class="rounded-md" />
          </div>
          <div class="divide-y divide-surface-200 dark:divide-surface-700">
            <div
              v-for="j in [1, 2]"
              :key="`cal-full-sk-${sk}-${j}`"
              class="flex gap-2 px-3 py-3"
            >
              <Skeleton shape="circle" width="2.5rem" height="2.5rem" />
              <div class="flex-1 space-y-2 min-w-0">
                <Skeleton width="75%" height="1rem" class="rounded-md" />
                <Skeleton width="40%" height="0.75rem" class="rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
      </section>
    </template>

    <section class="admin-page space-y-4 sm:space-y-6">
    <div class="flex flex-col gap-3 min-w-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div class="min-w-0">
        <div class="admin-toolbar-responsive mb-2">
        <Button
          :label="t('admin.tournament_page.back')"
          icon="pi pi-arrow-left"
          text
          @click="router.push('/admin/tournaments')"
        />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-0 sm:text-2xl">
            {{ tournament?.name ?? t('admin.tournament_page.tournament_fallback_name') }}
          </h1>
          <span
            v-if="tournament"
            v-tooltip.top="adminTooltip(t('admin.tournament_form.status_auto_hint'))"
            class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide"
            :class="tournamentStatusBadgeClass(tournament.status)"
          >
            {{ tournamentLifecycleStatusLabel(tournament.status) }}
          </span>
        </div>
        <p class="mt-1 text-xs text-muted-color sm:text-sm">/{{ tournament?.slug }}</p>
        <p v-if="tournament?.season" class="mt-2 text-xs text-surface-600 dark:text-surface-300 sm:text-sm">
          {{ t('admin.tournament_page.season_label') }}:
          <span class="font-medium text-surface-800 dark:text-surface-100">{{
            tournament.season.name
          }}</span>
        </p>
        <p v-if="tournament?.competition" class="mt-1 text-xs text-surface-600 dark:text-surface-300 sm:text-sm">
          {{ t('admin.tournament_page.competition_type_label') }}:
          <span class="font-medium text-surface-800 dark:text-surface-100">{{
            tournament.competition.name
          }}</span>
        </p>
        <p v-if="tournament?.ageGroup" class="mt-1 text-xs text-surface-600 dark:text-surface-300 sm:text-sm">
          {{ t('admin.tournament_page.age_group_label') }}:
          <span class="font-medium text-surface-800 dark:text-surface-100">{{
            tournament.ageGroup.shortLabel || tournament.ageGroup.name
          }}</span>
        </p>
      </div>

      <div class="admin-toolbar-responsive flex flex-wrap gap-2">
        <Button
          :label="t('admin.tournament_page.download_ics')"
          icon="pi pi-download"
          severity="secondary"
          outlined
          :loading="calendarIcsDownloading"
          @click="downloadTournamentCalendarIcs"
        />
        <Button
          :label="t('admin.tournament_page.copy_ics_feed_link')"
          icon="pi pi-link"
          severity="secondary"
          outlined
          :loading="calendarFeedLinkLoading"
          @click="copyTournamentCalendarFeedLink"
        />
        <Button
          v-if="!isPlayoffOnlyFormat"
          :label="t('admin.tournament_page.refresh_table')"
          icon="pi pi-refresh"
          :loading="tableLoading"
          severity="secondary"
          @click="fetchTable"
        />
      </div>
    </div>

    <div
      v-if="tournament && !modPolicy.locksTournamentPublishingAndDraftStructure"
      id="tournament-publish-card"
      class="rounded-xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900"
    >
      <p class="text-sm font-semibold text-surface-900 dark:text-surface-0">
        {{ t('admin.tournament_page.public_site_link_label') }}
      </p>
      <p class="mt-1 text-xs text-muted-color">
        {{ t('admin.tournament_page.published_toggle_hint') }}
      </p>
      <Message
        v-if="tournament.status === 'DRAFT' && !tournament.published"
        severity="info"
        :closable="false"
        class="mt-3 w-full text-sm"
      >
        {{ t('admin.tournament_page.published_draft_blocked_hint') }}
      </Message>
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <label
          class="flex items-center gap-2 text-sm text-surface-800 dark:text-surface-100"
          :class="publishSwitchDisabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'"
        >
          <ToggleSwitch
            input-id="tournament-published"
            :model-value="!!tournament.published"
            :disabled="publishSwitchDisabled"
            @update:model-value="setTournamentPublished"
          />
          <span>{{ t('admin.tournament_page.published_toggle_label') }}</span>
        </label>
      </div>
      <Message
        v-if="!tournament.published && publicTournamentAbsoluteUrl"
        severity="info"
        :closable="false"
        class="mt-3 w-full text-sm"
      >
        {{ t('admin.tournament_page.published_unpublished_notice') }}
      </Message>
      <template v-else-if="publicTournamentAbsoluteUrl && tournament.published">
        <p class="mt-3 text-xs text-muted-color">
          {{ t('admin.tournament_page.public_site_link_hint') }}
        </p>
        <div class="mt-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <InputText
            :model-value="publicTournamentAbsoluteUrl"
            readonly
            class="w-full flex-1 font-mono text-sm"
          />
          <div class="admin-toolbar-responsive flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              :label="t('admin.tournament_page.copy_public_link')"
              icon="pi pi-copy"
              severity="secondary"
              @click="copyPublicTournamentLink"
            />
            <Button
              type="button"
              :label="t('admin.tournament_page.open_public_link')"
              icon="pi pi-external-link"
              severity="secondary"
              outlined
              @click="openPublicTournamentLink"
            />
          </div>
        </div>
      </template>
      <Message v-else severity="warn" :closable="false" class="mt-3 w-full text-sm">
        {{ t('admin.tournament_page.public_link_need_slug') }}
      </Message>
    </div>

    <div
      v-if="showLaunchWizardBlock && tournament"
      class="rounded-xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900"
    >
      <div class="panel-header-row flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="panel-header-title text-sm font-semibold text-surface-900 dark:text-surface-0">
            Мастер запуска турнира
          </p>
          <p class="mt-1 text-xs text-muted-color">
            Выполнено шагов: {{ launchWizardReadyCount }}/{{ launchWizardSteps.length }}
          </p>
        </div>
        <div class="panel-collapse-actions flex items-center gap-2">
          <Tag
            :severity="launchWizardAllReady ? 'success' : 'warn'"
            :value="launchWizardAllReady ? 'Готов к запуску' : 'Есть незавершенные шаги'"
          />
          <Button
            class="panel-chevron-btn collapse-toggle-btn"
            size="small"
            text
            severity="secondary"
            :icon="launchBlockCollapsed ? 'pi pi-chevron-down' : 'pi pi-chevron-up'"
            :label="launchBlockCollapsed ? 'Развернуть' : 'Свернуть'"
            @click="launchBlockCollapsed = !launchBlockCollapsed"
          />
        </div>
      </div>

      <div v-if="!launchBlockCollapsed" class="mt-3 space-y-2">
        <div
          v-for="step in launchWizardSteps"
          :key="step.id"
          class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-200 px-3 py-2 dark:border-surface-700"
        >
          <div class="min-w-0">
            <p
              class="text-sm font-medium"
              :class="step.ok ? 'text-green-700 dark:text-green-300' : 'text-surface-900 dark:text-surface-0'"
            >
              <i :class="step.ok ? 'pi pi-check-circle mr-1' : 'pi pi-exclamation-circle mr-1'" />
              {{ step.title }}
            </p>
            <p v-if="!step.ok" class="mt-1 text-xs text-muted-color">{{ step.hint }}</p>
          </div>
          <Button
            v-if="!step.ok && (step.tab || step.id === 'publish')"
            label="Перейти"
            icon="pi pi-arrow-right"
            text
            @click="openLaunchWizardStep(step)"
          />
        </div>
      </div>
      <p v-if="launchChecklistCompletedLabel" class="mt-3 text-xs text-muted-color">
        {{ launchChecklistCompletedLabel }}
      </p>
      <div class="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          v-if="launchWizardAllReady && !tournament.launchChecklistCompletedAt"
          label="Отметить запуск завершенным"
          icon="pi pi-check"
          :loading="launchChecklistSaving"
          @click="setLaunchChecklistCompleted(true)"
        />
        <Button
          v-if="tournament.launchChecklistCompletedAt"
          label="Снять отметку запуска"
          icon="pi pi-times"
          severity="secondary"
          text
          :loading="launchChecklistSaving"
          @click="setLaunchChecklistCompleted(false)"
        />
      </div>
    </div>

    <div
      v-if="showDiagnosticsBlock && tournament"
      class="rounded-xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900"
    >
      <div class="panel-header-row flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="panel-header-title text-sm font-semibold text-surface-900 dark:text-surface-0 flex items-center gap-1.5">
            <span>Диагностика турнира</span>
            <i
              class="panel-info-icon pi pi-info-circle text-muted-color"
              v-tooltip.top="'Ключевые проверки расписания и инфраструктуры с быстрыми переходами к исправлению.'"
            />
          </p>
          <p class="mt-1 text-xs text-muted-color">
            Быстрая проверка проблем в текущем расписании и инфраструктуре.
          </p>
        </div>
        <Button
          class="panel-chevron-btn collapse-toggle-btn"
          size="small"
          text
          severity="secondary"
          :icon="diagnosticsBlockCollapsed ? 'pi pi-chevron-down' : 'pi pi-chevron-up'"
          :label="diagnosticsBlockCollapsed ? 'Развернуть' : 'Свернуть'"
          @click="diagnosticsBlockCollapsed = !diagnosticsBlockCollapsed"
        />
      </div>

      <div v-if="!diagnosticsBlockCollapsed" class="mt-3 grid gap-3 md:grid-cols-3">
        <div class="rounded-lg border border-surface-200 p-3 dark:border-surface-700">
          <p class="text-xs text-muted-color flex items-center gap-1.5">
            <span>Активных матчей без площадки</span>
            <i
              class="pi pi-info-circle text-[11px]"
              v-tooltip.top="'Матчи, которые сейчас запланированы или идут, но площадка для них не назначена.'"
            />
          </p>
          <p class="mt-1 text-lg font-semibold">
            {{ tournamentDiagnostics.withoutStadium }}<span class="text-sm text-muted-color"> / {{ tournamentDiagnostics.totalActive }}</span>
          </p>
          <Button
            class="mt-2"
            size="small"
            severity="secondary"
            outlined
            label="Показать в матчах"
            @click="openMatchesDiagnosticFilter('live_without_stadium')"
          />
        </div>

        <div class="rounded-lg border border-surface-200 p-3 dark:border-surface-700">
          <p class="text-xs text-muted-color flex items-center gap-1.5">
            <span>Судьи турнира</span>
            <i
              class="pi pi-info-circle text-[11px]"
              v-tooltip.top="'Проверка, назначен ли справочник судей на уровне турнира (инфраструктура).'"
            />
          </p>
          <p class="mt-1 text-sm font-medium">
            {{ tournamentDiagnostics.noRefereesConfigured ? 'Не назначены' : 'Назначены' }}
          </p>
          <Button
            class="mt-2"
            size="small"
            severity="secondary"
            outlined
            label="Открыть инфраструктуру"
            @click="openInfrastructureDiagnostics"
          />
        </div>

        <div class="rounded-lg border border-surface-200 p-3 dark:border-surface-700">
          <p class="text-xs text-muted-color flex items-center gap-1.5">
            <span>Площадки турнира</span>
            <i
              class="pi pi-info-circle text-[11px]"
              v-tooltip.top="'Проверка, назначены ли площадки турнира (общая или список площадок).'"
            />
          </p>
          <p class="mt-1 text-sm font-medium">
            {{ tournamentDiagnostics.noStadiumsConfigured ? 'Не назначены' : 'Назначены' }}
          </p>
          <Button
            class="mt-2"
            size="small"
            severity="secondary"
            outlined
            label="Открыть инфраструктуру"
            @click="openInfrastructureDiagnostics"
          />
        </div>
      </div>
      <div v-if="!diagnosticsBlockCollapsed" class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-lg border border-surface-200 p-3 dark:border-surface-700">
          <p class="text-xs text-muted-color flex items-center gap-1.5">
            <span>Пересечения команд</span>
            <i
              class="pi pi-info-circle text-[11px]"
              v-tooltip.top="'Матчи, где одна и та же команда пересекается по времени с другим матчем.'"
            />
          </p>
          <p class="mt-1 text-lg font-semibold">{{ tournamentDiagnostics.teamOverlap }}</p>
          <Button
            class="mt-2"
            size="small"
            severity="secondary"
            outlined
            label="Показать в матчах"
            @click="openMatchesDiagnosticFilter('team_overlap')"
          />
        </div>
        <div class="rounded-lg border border-surface-200 p-3 dark:border-surface-700">
          <p class="text-xs text-muted-color flex items-center gap-1.5">
            <span>Пересечения площадок</span>
            <i
              class="pi pi-info-circle text-[11px]"
              v-tooltip.top="'Матчи, где одна и та же площадка занята в пересекающиеся интервалы времени.'"
            />
          </p>
          <p class="mt-1 text-lg font-semibold">{{ tournamentDiagnostics.stadiumOverlap }}</p>
          <Button
            class="mt-2"
            size="small"
            severity="secondary"
            outlined
            label="Показать в матчах"
            @click="openMatchesDiagnosticFilter('stadium_overlap')"
          />
        </div>
        <div class="rounded-lg border border-surface-200 p-3 dark:border-surface-700">
          <p class="text-xs text-muted-color flex items-center gap-1.5">
            <span>Завершены без счёта</span>
            <i
              class="pi pi-info-circle text-[11px]"
              v-tooltip.top="'Матчи, отмеченные как завершённые или сыгранные, но без заполненного счёта.'"
            />
          </p>
          <p class="mt-1 text-lg font-semibold">{{ tournamentDiagnostics.finishedWithoutScore }}</p>
          <Button
            class="mt-2"
            size="small"
            severity="secondary"
            outlined
            label="Показать в матчах"
            @click="openMatchesDiagnosticFilter('finished_without_score')"
          />
        </div>
        <div class="rounded-lg border border-surface-200 p-3 dark:border-surface-700">
          <p class="text-xs text-muted-color flex items-center gap-1.5">
            <span>Запланированы в прошлом</span>
            <i
              class="pi pi-info-circle text-[11px]"
              v-tooltip.top="'Матчи, которые всё ещё запланированы, хотя их время начала уже прошло.'"
            />
          </p>
          <p class="mt-1 text-lg font-semibold">{{ tournamentDiagnostics.scheduledInPast }}</p>
          <Button
            class="mt-2"
            size="small"
            severity="secondary"
            outlined
            label="Показать в матчах"
            @click="openMatchesDiagnosticFilter('scheduled_in_past')"
          />
        </div>
      </div>
      <div v-if="!diagnosticsBlockCollapsed && isManualFormat" class="mt-3 grid gap-3 md:grid-cols-3">
        <div class="rounded-lg border border-surface-200 p-3 dark:border-surface-700">
          <p class="text-xs text-muted-color flex items-center gap-1.5">
            <span>Матчей без группы</span>
            <i
              class="pi pi-info-circle text-[11px]"
              v-tooltip.top="'Только для ручного формата: матчи группового этапа, у которых не назначена группа.'"
            />
          </p>
          <p class="mt-1 text-lg font-semibold">
            {{ tournamentDiagnostics.withoutGroup }}
          </p>
          <Button
            class="mt-2"
            size="small"
            severity="secondary"
            outlined
            label="Показать в матчах"
            @click="openMatchesDiagnosticFilter('without_group')"
          />
        </div>
      </div>
    </div>

    <div class="mb-3 sm:hidden">
      <Select
        v-model="activeTab"
        :options="mobileTabOptions"
        option-label="label"
        option-value="value"
        class="w-full"
      />
    </div>

    <TabView
      class="tournament-page-tabs"
      :activeIndex="activeTab"
      @update:activeIndex="(v) => (activeTab = v)"
    >
      <TabPanel value="calendar" :header="t('admin.tournament_page.tab_calendar')">
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4">
          <div
            v-if="isManualFormat"
            class="admin-toolbar-responsive mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 px-3 py-2"
          >
            <p class="text-sm text-muted-color">
              {{ t('admin.tournament_page.manual_schedule_hint') }}
            </p>
            <Button
              v-if="canManageManualMatches && hasScheduleMatches"
              :label="t('admin.tournament_page.add_match')"
              icon="pi pi-plus"
              size="small"
              class="shrink-0"
              @click="() => matchesWorkspaceRef?.openManualMatchDialog()"
            />
          </div>

          <template v-if="!hasScheduleMatches">
            <div
              class="mt-2 flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-200 bg-gradient-to-b from-surface-50 to-transparent px-5 py-14 text-center dark:border-surface-600 dark:from-surface-900/60 dark:to-transparent"
            >
              <div
                class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary"
              >
                <i class="pi pi-calendar-plus text-2xl" aria-hidden="true" />
              </div>
              <h3 class="text-base font-semibold text-surface-900 dark:text-surface-0">
                {{ t('admin.tournament_page.calendar_empty_title') }}
              </h3>
              <p class="mt-2 max-w-md text-sm leading-relaxed text-muted-color">
                <template v-if="isManualFormat">
                  {{ t('admin.tournament_page.calendar_empty_lead_manual') }}
                </template>
                <template v-else>
                  {{ t('admin.tournament_page.calendar_empty_lead_generate') }}
                </template>
              </p>
              <p
                v-if="isManualFormat && !canManageManualMatches"
                class="mt-2 max-w-md text-xs text-muted-color"
              >
                {{ t('admin.tournament_page.calendar_empty_manual_need_teams') }}
              </p>
              <p
                v-if="!isManualFormat && !canTournamentAutomation"
                class="mt-3 max-w-md text-xs leading-relaxed text-amber-900 dark:text-amber-200/90"
              >
                {{ t('admin.tournament_page.calendar_empty_legacy_format_hint') }}
              </p>
              <div
                v-if="showCalendarReadinessPanel && calendarReadinessItems.length"
                class="mt-6 w-full max-w-md"
              >
                <AdminTournamentCalendarReadiness
                  :items="calendarReadinessItems"
                  :all-ok="calendarReadinessAllOk"
                  :title="t('admin.tournament_page.readiness_title')"
                  :summary-ok="t('admin.tournament_page.readiness_summary_ok')"
                  :summary-warn="t('admin.tournament_page.readiness_summary_warn')"
                />
              </div>
              <div class="mt-6 flex flex-wrap justify-center gap-2">
                <Button
                  v-if="!isManualFormat && canTournamentAutomation && !modPolicy.locksCalendarAndPlayoffAutomation"
                  :label="t('admin.tournament_page.generate')"
                  icon="pi pi-calendar-plus"
                  :disabled="!tournament"
                  @click="calendarDialog = true"
                />
                <Button
                  v-else-if="canManageManualMatches"
                  :label="t('admin.tournament_page.add_match')"
                  icon="pi pi-plus"
                  @click="() => matchesWorkspaceRef?.openManualMatchDialog()"
                />
              </div>
            </div>
          </template>

          <template v-else>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">{{ t('admin.tournament_page.tournament_rounds_title') }}</h2>
              <p class="mt-1 text-xs text-muted-color">
                {{ t('admin.tournament_page.rounds_hint_open_protocol') }}
              </p>
            </div>
            <Button
              v-if="!isManualFormat && canTournamentAutomation && !modPolicy.locksCalendarAndPlayoffAutomation"
              :label="t('admin.tournament_page.generate')"
              icon="pi pi-calendar-plus"
              severity="secondary"
              :disabled="!tournament"
              @click="calendarDialog = true"
            />
          </div>

          <div class="mt-4 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <Button
                  :label="t('admin.tournament_page.view_mode_current')"
                  severity="secondary"
                  :text="calendarViewMode !== 'grouped'"
                  @click="calendarViewMode = 'grouped'"
                />
                <Button
                  :label="t('admin.tournament_page.view_mode_by_tours')"
                  severity="secondary"
                  :text="calendarViewMode !== 'tour'"
                  @click="calendarViewMode = 'tour'"
                />
              </div>
              <div class="flex items-center gap-2">
                <Button
                  :label="t('admin.tournament_page.reset_filters')"
                  text
                  :disabled="!calendarFiltersActive"
                  @click="resetCalendarFilters"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div class="min-w-0">
                <label class="text-sm block mb-1 text-surface-900 dark:text-surface-100">{{ t('admin.tournament_page.date_range') }}</label>
                <DatePicker
                  v-model="calendarFilterDateRange"
                  class="w-full"
                  dateFormat="yy-mm-dd"
                  showIcon
                  selectionMode="range"
                />
              </div>
              <div class="min-w-0">
                <label class="text-sm block mb-1 text-surface-900 dark:text-surface-100">{{ t('admin.tournament_page.status') }}</label>
                <MultiSelect
                  v-model="calendarFilterStatuses"
                  :options="localizedStatusOptions"
                  option-label="label"
                  option-value="value"
                  :maxSelectedLabels="0"
                  :selectedItemsLabel="t('admin.tournament_page.selected_count', { count: '{0}' })"
                  class="w-full"
                  :placeholder="t('admin.tournament_page.any')"
                  :showToggleAll="false"
                  filter
                />
              </div>
              <div class="min-w-0">
                <label class="text-sm block mb-1 text-surface-900 dark:text-surface-100">{{ t('admin.tournament_page.team') }}</label>
                <MultiSelect
                  v-model="calendarFilterTeamIds"
                  :options="allTeams"
                  option-label="name"
                  option-value="id"
                  :maxSelectedLabels="0"
                  :selectedItemsLabel="t('admin.tournament_page.selected_count', { count: '{0}' })"
                  class="w-full"
                  :loading="teamsLoading"
                  :placeholder="t('admin.tournament_page.all_teams')"
                  :showToggleAll="false"
                  filter
                />
              </div>
            </div>

            <AdminDataState
              :loading="calendarRefreshing"
              :error="calendarRefreshError"
              :empty="false"
              :content-card="false"
              :error-title="t('admin.tournament_page.filters_error_summary')"
              @retry="retryCalendarFetch"
            >
              <template #loading>
                <div class="space-y-4" aria-busy="true">
                  <div
                    v-for="sk in [1, 2, 3]"
                    :key="`cal-refresh-sk-${sk}`"
                    class="rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden"
                  >
                    <div class="px-3 py-2 bg-surface-50 dark:bg-surface-800/80">
                      <Skeleton width="55%" height="1rem" class="rounded-md" />
                    </div>
                    <div class="divide-y divide-surface-200 dark:divide-surface-700">
                      <div
                        v-for="j in [1, 2]"
                        :key="`cal-refresh-sk-${sk}-${j}`"
                        class="flex gap-2 px-3 py-3"
                      >
                        <Skeleton shape="circle" width="2.5rem" height="2.5rem" />
                        <div class="flex-1 space-y-2 min-w-0">
                          <Skeleton width="75%" height="1rem" class="rounded-md" />
                          <Skeleton width="40%" height="0.75rem" class="rounded-md" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

            <div v-if="calendarViewMode === 'grouped'">
              <div
                v-if="!visibleCalendarRounds.length"
                class="mt-1 flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-200 bg-gradient-to-b from-surface-50 to-transparent px-6 py-12 text-center dark:border-surface-600 dark:from-surface-900/60 dark:to-transparent"
              >
                <div
                  class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary"
                >
                  <i class="pi pi-filter-slash text-2xl" aria-hidden="true" />
                </div>
                <h3 class="text-base font-semibold text-surface-900 dark:text-surface-0">
                  {{ t('admin.tournament_page.calendar_filters_empty_title') }}
                </h3>
                <p class="mt-2 max-w-md text-sm leading-relaxed text-muted-color">
                  {{ t('admin.tournament_page.calendar_filters_empty_lead') }}
                </p>
                <Button
                  v-if="calendarFiltersActive"
                  class="mt-6"
                  :label="t('admin.tournament_page.reset_filters')"
                  icon="pi pi-filter-slash"
                  size="small"
                  @click="resetCalendarFilters"
                />
              </div>

              <div v-else class="space-y-4">
                <div
                  v-for="r in visibleCalendarRounds"
                  :key="r.dateKey"
                  class="rounded-lg border border-surface-200 dark:border-surface-700"
                >
                  <div class="flex items-center justify-between px-3 py-2 bg-surface-50 dark:bg-surface-800/80">
                    <div class="text-sm font-medium text-surface-900 dark:text-surface-100">
                  {{ displayedRoundTitle(r) }} <span class="text-muted-color">({{ r.dateLabel }})</span>
                      <span
                        v-if="canReorderCalendarDay"
                        class="ml-2 text-xs font-normal text-muted-color"
                      >
                        {{ t('admin.tournament_page.drag_to_reorder') }}
                      </span>
                    </div>
                    <div class="text-xs text-muted-color flex items-center gap-2">
                      <span v-if="reordering === r.dateKey" class="inline-flex items-center gap-1">
                        <span class="pi pi-spin pi-spinner" />
                        {{ t('admin.tournament_page.saving') }}
                      </span>
                      <span v-else>{{ r.matches.length }} {{ localizedMatchCountLabel(r.matches.length) }}</span>
                    </div>
                  </div>
                  <draggable
                    :list="r.matches"
                    item-key="id"
                    handle=".drag-handle"
                    :disabled="
                      !tournament ||
                      !canReorderCalendarDay ||
                      reordering === r.dateKey ||
                      calendarFiltersActive
                    "
                    class="divide-y divide-surface-200 dark:divide-surface-700"
                    @end="saveRoundOrder(r)"
                  >
                    <template #item="{ element: m }">
                      <div class="flex items-stretch gap-2 px-3 py-2 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                        <button
                          type="button"
                          class="drag-handle flex items-center justify-center w-10 text-muted-color hover:text-surface-900 dark:hover:text-surface-100 cursor-grab active:cursor-grabbing"
                          :title="canReorderCalendarDay ? t('admin.tournament_page.drag') : t('admin.tournament_page.unavailable_for_format')"
                        >
                          <div class="flex items-center gap-2">
                            <span class="pi pi-bars text-sm" />
                            <span class="text-xs tabular-nums text-surface-500">
                              {{ matchNumberById[m.id] ?? '—' }}
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          class="min-w-0 flex-1 text-left"
                          @click="openProtocol(m)"
                        >
                          <div class="flex items-center justify-between gap-3">
                            <div class="text-sm text-surface-900 dark:text-surface-100">
                              <span
                                class="font-medium rounded px-1 py-0.5 transition-colors"
                                :class="
                                  isCalendarTeamHighlighted(m.homeTeam.id)
                                    ? 'bg-primary/20 text-primary'
                                    : ''
                                "
                              >
                                {{ playoffSlotLabels(m)?.home ?? m.homeTeam.name }}
                              </span>
                              <span class="text-muted-color mx-1">
                                {{ playoffSlotLabels(m) ? '-' : 'vs' }}
                              </span>
                              <span
                                class="font-medium rounded px-1 py-0.5 transition-colors"
                                :class="
                                  isCalendarTeamHighlighted(m.awayTeam.id)
                                    ? 'bg-primary/20 text-primary'
                                    : ''
                                "
                              >
                                {{ playoffSlotLabels(m)?.away ?? m.awayTeam.name }}
                              </span>
                            </div>
                            <div class="text-sm tabular-nums text-surface-900 dark:text-surface-100">
                              <span v-if="m.homeScore !== null && m.awayScore !== null">
                                {{ formatMatchScoreDisplay(m) }}
                              </span>
                              <span v-else class="text-muted-color">—</span>
                            </div>
                          </div>
                          <div class="mt-1 text-xs text-muted-color">
                            {{ formatDateTimeNoSeconds(m.startTime) }} ·
                            <span :class="statusPillClass(m.status)">{{ localizedStatusLabel(m.status) }}</span>
                          </div>
                        </button>
                        <Button
                          v-if="canManageManualMatches"
                          type="button"
                          icon="pi pi-trash"
                          severity="danger"
                          text
                          rounded
                          class="shrink-0 self-center"
                          :disabled="isMatchEditLocked(m.status)"
                          :loading="deletingMatchId === m.id"
                          :aria-label="t('admin.tournament_page.delete_match_aria')"
                          @click.stop="requestDeleteManualMatch(m)"
                        />
                      </div>
                    </template>
                  </draggable>
                </div>
              </div>
            </div>

            <div v-else>
              <div
                v-if="!visibleTourSections.length"
                class="mt-1 flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-200 bg-gradient-to-b from-surface-50 to-transparent px-6 py-12 text-center dark:border-surface-600 dark:from-surface-900/60 dark:to-transparent"
              >
                <div
                  class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary"
                >
                  <i class="pi pi-filter-slash text-2xl" aria-hidden="true" />
                </div>
                <h3 class="text-base font-semibold text-surface-900 dark:text-surface-0">
                  {{ t('admin.tournament_page.calendar_filters_empty_title') }}
                </h3>
                <p class="mt-2 max-w-md text-sm leading-relaxed text-muted-color">
                  {{ t('admin.tournament_page.calendar_filters_empty_lead') }}
                </p>
                <Button
                  v-if="calendarFiltersActive"
                  class="mt-6"
                  :label="t('admin.tournament_page.reset_filters')"
                  icon="pi pi-filter-slash"
                  size="small"
                  @click="resetCalendarFilters"
                />
              </div>

              <div v-else class="space-y-4">
                <div
                  v-for="tourSection in visibleTourSections"
                  :key="tourSection.key"
                  class="rounded-lg border border-surface-200 dark:border-surface-700"
                >
                  <div class="flex items-center justify-between px-3 py-2 bg-surface-50 dark:bg-surface-800/80">
                    <div class="text-sm font-medium text-surface-900 dark:text-surface-100">
                      {{ tourSection.title }} <span class="text-muted-color">({{ tourSection.dateLabel }})</span>
                    </div>
                    <div class="text-xs text-muted-color flex items-center gap-2">
                      <Button
                        :icon="expandedTourKeys[tourSection.key] ? 'pi pi-angle-up' : 'pi pi-angle-down'"
                        text
                        severity="secondary"
                        size="small"
                        @click="toggleTour(tourSection.key)"
                      />
                      <span>{{ tourSection.matches.length }} {{ localizedMatchCountLabel(tourSection.matches.length) }}</span>
                    </div>
                  </div>

                  <div v-if="expandedTourKeys[tourSection.key]" class="divide-y divide-surface-200 dark:divide-surface-700">
                    <div
                      v-for="m in tourSection.matches"
                      :key="m.id"
                      class="flex items-stretch gap-2 px-3 py-2 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                    >
                      <button
                        type="button"
                        class="min-w-0 flex-1 text-left"
                        @click="openProtocol(m)"
                      >
                        <div class="flex items-center justify-between gap-3">
                          <div class="text-sm text-surface-900 dark:text-surface-100">
                            <span
                              class="font-medium rounded px-1 py-0.5 transition-colors"
                              :class="
                                isCalendarTeamHighlighted(m.homeTeam.id)
                                  ? 'bg-primary/20 text-primary'
                                  : ''
                              "
                            >
                              {{ playoffSlotLabels(m)?.home ?? m.homeTeam.name }}
                            </span>
                            <span class="text-muted-color mx-1">
                              {{ playoffSlotLabels(m) ? '-' : 'vs' }}
                            </span>
                            <span
                              class="font-medium rounded px-1 py-0.5 transition-colors"
                              :class="
                                isCalendarTeamHighlighted(m.awayTeam.id)
                                  ? 'bg-primary/20 text-primary'
                                  : ''
                              "
                            >
                              {{ playoffSlotLabels(m)?.away ?? m.awayTeam.name }}
                            </span>
                          </div>
                          <div class="text-sm tabular-nums text-surface-900 dark:text-surface-100">
                            <span v-if="m.homeScore !== null && m.awayScore !== null">
                              {{ formatMatchScoreDisplay(m) }}
                            </span>
                            <span v-else class="text-muted-color">—</span>
                          </div>
                        </div>
                        <div class="mt-1 text-xs text-muted-color">
                          {{ formatDateTimeNoSeconds(m.startTime) }} ·
                          <span :class="statusPillClass(m.status)">{{ localizedStatusLabel(m.status) }}</span>
                        </div>
                      </button>
                      <Button
                        v-if="canManageManualMatches"
                        type="button"
                        icon="pi pi-trash"
                        severity="danger"
                        text
                        rounded
                        class="shrink-0 self-center"
                        :disabled="isMatchEditLocked(m.status)"
                        :loading="deletingMatchId === m.id"
                        :aria-label="t('admin.tournament_page.delete_match_aria')"
                        @click.stop="requestDeleteManualMatch(m)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <AdminTournamentMatchesPagingBar
              v-if="tournament && tournamentMatchesHasMore && !calendarRefreshing"
              :matches-has-more="tournamentMatchesHasMore"
              :matches-loading-more="tournamentMatchesLoadingMore"
              :load-more-matches="loadMoreTournamentMatchesForWorkspace"
              :tab-visible="isCalendarTabActive"
              :loaded-count="tournament.matches?.length ?? 0"
              :total-count="tournamentPagingResolvedTotal"
            />
            </AdminDataState>
          </div>
          </template>
        </div>
      </TabPanel>

      <TabPanel
        value="matches"
        :header="t('admin.tournament_page.tab_matches')"
        :disabled="!hasScheduleMatches"
        :headerActionProps="
          !hasScheduleMatches
            ? { title: t('admin.tournament_page.tab_need_schedule_title') }
            : undefined
        "
      >
        <div class="mb-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-3 sm:p-4">
          <div class="panel-header-title text-sm font-semibold text-surface-900 dark:text-surface-0 flex items-center gap-1.5">
              <span>Режим дня тура</span>
              <i
                class="panel-info-icon pi pi-info-circle text-muted-color"
                v-tooltip.top="'Быстрые действия по матчам выбранной даты: старт, завершение, сдвиг времени и переход в протокол.'"
              />
          </div>
          <div class="match-day-toolbar mt-2 flex flex-wrap items-center justify-between gap-3">
            <div class="match-day-toolbar-actions flex items-center gap-2">
              <Button
                size="small"
                severity="secondary"
                outlined
                :icon="matchDayModeEnabled ? 'pi pi-eye-slash' : 'pi pi-eye'"
                :label="matchDayModeEnabled ? 'Скрыть режим' : 'Показать режим'"
                @click="matchDayModeEnabled = !matchDayModeEnabled"
              />
              <Button
                size="small"
                severity="secondary"
                outlined
                icon="pi pi-external-link"
                label="На весь экран"
                @click="openMatchDayFullscreen"
              />
            </div>
            <div class="match-day-toolbar-date flex items-center gap-2">
              <DatePicker
                v-model="matchDayDate"
                class="w-full sm:w-52"
                dateFormat="yy-mm-dd"
                showIcon
              />
            </div>
          </div>
          <p class="mt-1 text-xs text-muted-color">
            Хронология матчей на выбранную дату + быстрые действия без переходов.
          </p>
        </div>

        <div
          v-if="matchDayModeEnabled"
          class="mb-4 grid gap-4 lg:grid-cols-3"
        >
          <div class="rounded-xl border border-primary/30 bg-primary/5 p-4 lg:col-span-1">
            <div class="text-xs uppercase tracking-wide text-primary/90">Следующий матч</div>
            <template v-if="matchDayNextMatch">
              <div class="mt-2 text-sm font-semibold">
                {{ matchDayNextMatch.homeTeam.name }} - {{ matchDayNextMatch.awayTeam.name }}
              </div>
              <div class="mt-1 text-xs text-muted-color">
                {{ formatDateTimeNoSeconds(matchDayNextMatch.startTime) }} ·
                <span :class="statusPillClass(matchDayNextMatch.status)">{{ localizedStatusLabel(matchDayNextMatch.status) }}</span>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <Button size="small" icon="pi pi-book" label="Протокол" @click="openProtocol(matchDayNextMatch)" />
                <Button
                  v-if="matchDayNextMatch.status === 'SCHEDULED'"
                  size="small"
                  severity="success"
                  outlined
                  icon="pi pi-play"
                  label="Начать"
                  :loading="matchDayQuickLoadingId === matchDayNextMatch.id"
                  @click="quickSetMatchStatusInDayMode(matchDayNextMatch, 'LIVE')"
                />
                <Button
                  v-if="matchDayNextMatch.status === 'LIVE'"
                  size="small"
                  severity="warn"
                  outlined
                  icon="pi pi-check"
                  label="Завершить"
                  :loading="matchDayQuickLoadingId === matchDayNextMatch.id"
                  @click="quickSetMatchStatusInDayMode(matchDayNextMatch, 'FINISHED')"
                />
                <Button
                  size="small"
                  severity="secondary"
                  outlined
                  icon="pi pi-clock"
                  label="+15"
                  :loading="matchDayQuickLoadingId === matchDayNextMatch.id"
                  :disabled="isMatchEditLocked(matchDayNextMatch.status)"
                  @click="shiftMatchInDayMode(matchDayNextMatch, 15)"
                />
              </div>
            </template>
            <p v-else class="mt-2 text-sm text-muted-color">На выбранную дату матчей нет.</p>
          </div>

          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4 lg:col-span-2">
            <div class="text-sm font-semibold">Таймлайн дня</div>
            <div v-if="!matchDayTimelineMatches.length" class="mt-2 text-sm text-muted-color">
              Матчи на эту дату не найдены.
            </div>
            <div v-else class="mt-3 space-y-2">
              <div
                v-for="m in matchDayTimelineMatches"
                :key="m.id"
                class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-200 px-3 py-2 dark:border-surface-700"
              >
                <div class="min-w-0">
                  <div class="text-sm font-medium">
                    {{ m.homeTeam.name }} - {{ m.awayTeam.name }}
                  </div>
                  <div class="mt-1 text-xs text-muted-color">
                    {{ formatDateTimeNoSeconds(m.startTime) }} ·
                    <span :class="statusPillClass(m.status)">{{ localizedStatusLabel(m.status) }}</span>
                  </div>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <Button size="small" text icon="pi pi-book" label="Протокол" @click="openProtocol(m)" />
                  <Button
                    v-if="m.status === 'SCHEDULED'"
                    size="small"
                    text
                    severity="success"
                    icon="pi pi-play"
                    label="Начать"
                    :loading="matchDayQuickLoadingId === m.id"
                    @click="quickSetMatchStatusInDayMode(m, 'LIVE')"
                  />
                  <Button
                    v-if="m.status === 'LIVE'"
                    size="small"
                    text
                    severity="warn"
                    icon="pi pi-check"
                    label="Завершить"
                    :loading="matchDayQuickLoadingId === m.id"
                    @click="quickSetMatchStatusInDayMode(m, 'FINISHED')"
                  />
                  <Button
                    size="small"
                    text
                    severity="secondary"
                    icon="pi pi-angle-left"
                    label="-15"
                    :disabled="isMatchEditLocked(m.status)"
                    :loading="matchDayQuickLoadingId === m.id"
                    @click="shiftMatchInDayMode(m, -15)"
                  />
                  <Button
                    size="small"
                    text
                    severity="secondary"
                    icon="pi pi-angle-right"
                    label="+15"
                    :disabled="isMatchEditLocked(m.status)"
                    :loading="matchDayQuickLoadingId === m.id"
                    @click="shiftMatchInDayMode(m, 15)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="canShowPlayoffFromGroupsPanel"
          class="mb-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50 p-4"
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="text-sm">
              <span class="font-medium text-surface-900 dark:text-surface-0">{{ t('admin.tournament_page.playoff_from_groups_title') }}</span>
              <p class="mt-1 text-xs text-muted-color">
                {{ t('admin.tournament_page.playoff_from_groups_hint') }}
              </p>
            </div>
            <Button
              :label="t('admin.tournament_page.generate_playoff')"
              icon="pi pi-sitemap"
              severity="secondary"
              :loading="calendarSaving"
              class="shrink-0"
              @click="generatePlayoff"
            />
          </div>
        </div>
        <AdminTournamentMatchesWorkspace
          ref="matchesWorkspaceRef"
          embedded
          :tournament-id="tournamentId"
          :tournament="tournament"
          :preset-filter="matchesDiagnosticPresetFilter"
          :external-open-protocol="openProtocol"
          :matches-has-more="tournamentMatchesHasMore"
          :matches-loading-more="tournamentMatchesLoadingMore"
          :matches-tab-visible="isMatchesTabActive"
          :load-more-matches="loadMoreTournamentMatchesForWorkspace"
          @updated="onMatchesWorkspaceUpdated"
        />
      </TabPanel>

      <TabPanel
        value="table"
        v-if="!isPlayoffOnlyFormat"
        :header="t('admin.tournament_page.tab_table')"
        :disabled="!hasScheduleMatches"
        :headerActionProps="
          !hasScheduleMatches
            ? { title: t('admin.tournament_page.tab_need_schedule_title') }
            : undefined
        "
      >
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4">
          <div class="admin-toolbar-responsive flex flex-col gap-2 min-w-0 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">{{ t('admin.tournament_page.table_title') }}</h2>
              <p class="mt-1 text-xs text-muted-color">{{ t('admin.tournament_page.table_autorefresh_hint') }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button
                v-if="hasScheduleMatches && !showTableEmptyState && !tableLoading"
                :label="t('admin.tournament_page.table_share_image')"
                icon="pi pi-image"
                severity="secondary"
                outlined
                @click="tableShareDialogVisible = true"
              />
              <Button
                :label="t('admin.tournament_page.refresh')"
                icon="pi pi-refresh"
                :loading="tableLoading"
                severity="secondary"
                @click="fetchTable"
              />
            </div>
          </div>

          <AdminTournamentTableShareImageDialog
            v-model:visible="tableShareDialogVisible"
            :tournament-name="tournament?.name ?? t('admin.tournament_page.tournament_fallback_name')"
            :file-slug="tournament?.slug ?? tournamentId"
            :flat-rows="flatRowsForShare"
            :grouped-tables="groupedTablesForShare"
            :is-grouped-standings="isGroupedFormat"
            :playoff-qualifiers-per-group="playoffQualifiersPerGroup"
          />

          <AdminDataState
            class="mt-3"
            :loading="tableLoading"
            :error="tableError"
            :empty="showTableEmptyState"
            :empty-title="t('admin.tournament_page.table_empty_title')"
            :empty-description="t('admin.tournament_page.table_empty_description')"
            empty-icon="pi pi-table"
            :error-title="t('admin.tournament_page.table_load_error_title')"
            :content-card="false"
            @retry="fetchTable"
          >
            <template #loading>
              <div class="admin-datatable-scroll min-w-0 rounded-lg border border-surface-200 dark:border-surface-700">
                <DataTable
                  :value="tableSkeletonRows"
                  data-key="id"
                  striped-rows
                  class="mt-0 min-h-[14rem]"
                  aria-busy="true"
                >
                  <Column header="#" style="width: 4rem">
                    <template #body>
                      <Skeleton width="1.25rem" height="0.875rem" class="rounded-md" />
                    </template>
                  </Column>
                  <Column :header="t('admin.tournament_page.team')">
                    <template #body>
                      <Skeleton width="70%" height="0.875rem" class="rounded-md" />
                    </template>
                  </Column>
                  <Column style="width: 4rem">
                    <template #header>
                      <span class="text-xs">{{ t('admin.tournament_page.table_col_played') }}</span>
                    </template>
                    <template #body>
                      <Skeleton width="1rem" height="0.875rem" class="rounded-md" />
                    </template>
                  </Column>
                  <Column style="width: 4rem">
                    <template #header>
                      <span class="text-xs">{{ t('admin.tournament_page.table_col_wins') }}</span>
                    </template>
                    <template #body>
                      <Skeleton width="1rem" height="0.875rem" class="rounded-md" />
                    </template>
                  </Column>
                  <Column style="width: 4rem">
                    <template #header>
                      <span class="text-xs">{{ t('admin.tournament_page.table_col_draws') }}</span>
                    </template>
                    <template #body>
                      <Skeleton width="1rem" height="0.875rem" class="rounded-md" />
                    </template>
                  </Column>
                  <Column style="width: 4rem">
                    <template #header>
                      <span class="text-xs">{{ t('admin.tournament_page.table_col_losses') }}</span>
                    </template>
                    <template #body>
                      <Skeleton width="1rem" height="0.875rem" class="rounded-md" />
                    </template>
                  </Column>
                  <Column style="width: 6rem">
                    <template #header>
                      <span class="text-xs">{{ t('admin.tournament_page.table_col_goals') }}</span>
                    </template>
                    <template #body>
                      <Skeleton width="2.5rem" height="0.875rem" class="rounded-md" />
                    </template>
                  </Column>
                  <Column header="Δ" style="width: 4rem">
                    <template #body>
                      <Skeleton width="1.25rem" height="0.875rem" class="rounded-md" />
                    </template>
                  </Column>
                  <Column style="width: 5rem">
                    <template #header>
                      <span class="text-xs">{{ t('admin.tournament_page.table_col_points') }}</span>
                    </template>
                    <template #body>
                      <Skeleton width="1.25rem" height="0.875rem" class="rounded-md" />
                    </template>
                  </Column>
                </DataTable>
              </div>
            </template>

            <div v-if="isGroupedFormat" class="space-y-6">
              <div
                v-for="g in (tournament?.groups ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))"
                :key="g.id"
              >
                <div class="text-sm font-semibold text-surface-900 dark:text-surface-0">{{ g.name }}</div>
                <div class="admin-datatable-scroll mt-2 min-w-0">
                  <DataTable
                    :value="groupTables[g.id] ?? []"
                    :rowStyle="qualificationRowStyle"
                    class="mt-0"
                    stripedRows
                  >
                    <Column field="position" header="#" style="width: 4rem" />
                    <Column field="teamName" :header="t('admin.tournament_page.team')" />
                    <Column field="played" :header="t('admin.tournament_page.table_col_played')" style="width: 4rem" />
                    <Column field="wins" :header="t('admin.tournament_page.table_col_wins')" style="width: 4rem" />
                    <Column field="draws" :header="t('admin.tournament_page.table_col_draws')" style="width: 4rem" />
                    <Column field="losses" :header="t('admin.tournament_page.table_col_losses')" style="width: 4rem" />
                    <Column :header="t('admin.tournament_page.table_col_goals')" style="width: 6rem">
                      <template #body="{ data }">
                        {{ data.goalsFor }}:{{ data.goalsAgainst }}
                      </template>
                    </Column>
                    <Column field="goalDiff" header="Δ" style="width: 4rem" />
                    <Column field="points" :header="t('admin.tournament_page.table_col_points')" style="width: 5rem" />
                  </DataTable>
                </div>
              </div>
            </div>

            <div v-else class="admin-datatable-scroll min-w-0">
              <DataTable
                :value="table"
                class="mt-0"
                :rowStyle="qualificationRowStyle"
                stripedRows
              >
                <Column field="position" header="#" style="width: 4rem" />
                <Column field="teamName" :header="t('admin.tournament_page.team')" />
                <Column field="played" :header="t('admin.tournament_page.table_col_played')" style="width: 4rem" />
                <Column field="wins" :header="t('admin.tournament_page.table_col_wins')" style="width: 4rem" />
                <Column field="draws" :header="t('admin.tournament_page.table_col_draws')" style="width: 4rem" />
                <Column field="losses" :header="t('admin.tournament_page.table_col_losses')" style="width: 4rem" />
                <Column :header="t('admin.tournament_page.table_col_goals')" style="width: 6rem">
                  <template #body="{ data }">
                    {{ data.goalsFor }}:{{ data.goalsAgainst }}
                  </template>
                </Column>
                <Column field="goalDiff" header="Δ" style="width: 4rem" />
                <Column field="points" :header="t('admin.tournament_page.table_col_points')" style="width: 5rem" />
              </DataTable>
            </div>
          </AdminDataState>
        </div>
      </TabPanel>

      <TabPanel value="statistics" :header="t('admin.tournament_page.tab_statistics')">
        <AdminTournamentStatsSection
          v-if="tournament && statisticsSectionMounted"
          :key="tournamentId"
          :active="isStatisticsTabActive"
          :tournament-id="tournamentId"
          :tournament="tournament"
        />
      </TabPanel>

      <TabPanel value="compositions" :header="t('admin.tournament_page.tab_compositions')">
        <div class="grid gap-4 lg:grid-cols-3">
          <div class="flex flex-col gap-4 lg:col-span-2">
            <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4">
              <div class="flex items-center justify-between gap-3">
                <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
                  {{ t('admin.tournament_page.tournament_teams_title') }}
                </h2>
                <div class="text-xs text-muted-color shrink-0 tabular-nums">
                  {{ tournament?.tournamentTeams?.length ?? 0 }} / {{ tournament?.minTeams ?? 0 }}
                </div>
              </div>
              <p class="mt-1.5 text-xs leading-relaxed text-muted-color">
                {{ t('admin.tournament_page.teams_tab_participants_lead') }}
              </p>

              <AdminDataState
                class="mt-3"
                :loading="teamsLoading"
                :error="teamsCatalogErrorMessage"
                :empty="showTeamsCatalogEmpty"
                :empty-title="t('admin.tournament_page.teams_catalog_empty_title')"
                :empty-description="t('admin.tournament_page.teams_catalog_empty_description')"
                empty-icon="pi pi-users"
                :error-title="t('admin.tournament_page.teams_catalog_load_error_title')"
                :content-card="false"
                @retry="() => refetchTeamsCatalog()"
              >
                <template #loading>
                  <div class="grid gap-2 md:grid-cols-[1fr_auto]">
                    <Skeleton height="2.75rem" class="w-full rounded-md" />
                    <Skeleton height="2.75rem" width="5.5rem" class="rounded-md shrink-0 justify-self-start md:justify-self-auto" />
                  </div>
                </template>
                <div class="grid gap-2 md:grid-cols-[1fr_auto]">
                  <MultiSelect
                    v-model="selectedTeamIds"
                    :options="allTeams"
                    option-label="name"
                    option-value="id"
                    :maxSelectedLabels="0"
                    :selectedItemsLabel="t('admin.tournament_page.selected_count', { count: '{0}' })"
                    class="w-full"
                    :placeholder="t('admin.tournament_page.select_teams')"
                    filter
                    :disabled="!canEditTeamComposition"
                  >
                    <template #option="{ option }">
                      <span>{{ displayTeamNameForUi(option.name) }}</span>
                    </template>
                  </MultiSelect>
                  <Button
                    :label="t('admin.tournament_page.save')"
                    icon="pi pi-check"
                    :loading="savingTeams"
                    @click="saveTeams"
                    :disabled="!canEditTeamComposition || (teamCompositionSubmitAttempted && !canSaveTeamComposition)"
                  />
                </div>
                <p
                  v-if="teamCompositionSubmitAttempted && teamCompositionErrors.minTeams"
                  class="mt-2 text-[11px] leading-3 text-red-500"
                >
                  {{ teamCompositionErrors.minTeams }}
                </p>

                <p
                  v-if="canEditTournament && hasScheduleMatches && !hasAnyEnteredResults"
                  class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
                >
                  {{ t('admin.tournament_page.schedule_generated_lock_hint') }}
                </p>
                <div
                  v-if="showCalendarReadinessPanel && calendarReadinessItems.length"
                  class="mt-4"
                >
                  <AdminTournamentCalendarReadiness
                    :items="calendarReadinessItems"
                    :all-ok="calendarReadinessAllOk"
                    :title="t('admin.tournament_page.readiness_title')"
                    :summary-ok="t('admin.tournament_page.readiness_summary_ok')"
                    :summary-warn="t('admin.tournament_page.readiness_summary_warn')"
                  />
                </div>
              </AdminDataState>
            </div>

            <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4">
              <template v-if="showGroupBuckets">
                <div class="text-sm font-semibold text-surface-900 dark:text-surface-0">
                  {{ t('admin.tournament_page.groups_title') }}
                </div>
                <div class="mt-1 text-xs text-muted-color space-y-1">
                  <p v-if="isManualFormat">
                    {{ t('admin.tournament_page.groups_manual_hint') }}
                  </p>
                  <p v-else>
                    {{ t('admin.tournament_page.groups_drag_hint') }}
                  </p>
                </div>
                <div
                  v-if="expectedGroupSize"
                  class="mt-2 text-xs font-medium text-surface-700 dark:text-surface-200"
                >
                  {{
                    t('admin.tournament_page.groups_expected_size', {
                      size: expectedGroupSize,
                      teams: tournament?.tournamentTeams?.length ?? 0,
                      groups: tournament?.groupCount ?? 1,
                    })
                  }}
                </div>
                <p class="mt-2 text-xs leading-relaxed text-muted-color">
                  {{ t('admin.tournament_page.teams_tab_groups_rating_hint') }}
                </p>

                <div class="mt-3 grid gap-3 md:grid-cols-2">
                  <div
                    v-for="col in groupColumns"
                    :key="col.id"
                    class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 min-w-0"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-sm font-medium truncate">{{ col.name }}</div>
                      <div class="text-xs text-muted-color shrink-0">{{ col.teams.length }}</div>
                    </div>
                    <draggable
                      :list="col.teams"
                      item-key="teamId"
                      group="teams-groups"
                      handle=".drag-handle"
                      :disabled="!canEditGroups || groupingSaving"
                      :move="checkGroupMove"
                      class="mt-2 space-y-2"
                      @start="snapshotPreDrag"
                      @change="handleGroupDragChange($event, col.id)"
                    >
                      <template #item="{ element: tt }">
                        <div class="flex items-center justify-between gap-2 rounded-md border border-surface-200 dark:border-surface-700 px-3 py-2">
                          <div class="flex items-center gap-2 min-w-0">
                            <span
                              class="drag-handle pi pi-bars text-muted-color shrink-0"
                              :class="canEditGroups ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-50'"
                              :title="canEditGroups ? t('admin.tournament_page.drag') : t('admin.tournament_page.unavailable_after_generation')"
                            />
                            <div class="text-sm truncate">{{ displayTeamNameForUi(tt.team.name) }}</div>
                          </div>
                          <div class="flex shrink-0 items-center gap-1.5">
                            <span class="hidden sm:inline text-[10px] uppercase tracking-wide text-muted-color whitespace-nowrap">
                              {{ t('admin.tournament_page.teams_tab_seed_label') }}
                            </span>
                            <Select
                              :modelValue="tt.rating ?? 3"
                              :options="ratingOptions"
                              optionLabel="label"
                              optionValue="value"
                              :pt="seedStrengthSelectPt"
                              :disabled="!canEditTeamRatings || ratingSaving || groupingSaving"
                              @update:modelValue="(v) => { tt.rating = v; updateTeamRating(tt.teamId, v) }"
                            />
                          </div>
                        </div>
                      </template>
                    </draggable>
                  </div>
                </div>
              </template>

              <template v-else>
                <div class="text-sm font-semibold text-surface-900 dark:text-surface-0">
                  {{ t('admin.tournament_page.teams_tab_list_title') }}
                </div>
                <p class="mt-1 text-xs leading-relaxed text-muted-color">
                  {{ t('admin.tournament_page.teams_tab_list_lead') }}
                </p>
                <ul class="mt-3 space-y-2">
                  <li
                    v-for="tt in tournament?.tournamentTeams ?? []"
                    :key="tt.teamId"
                    class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2"
                  >
                    <div class="flex min-w-0 items-center gap-2">
                      <div class="text-sm truncate">{{ displayTeamNameForUi(tt.team.name) }}</div>
                    </div>
                    <div class="flex items-center gap-2 sm:gap-3">
                      <div class="flex items-center gap-1.5">
                        <span class="text-[10px] uppercase tracking-wide text-muted-color whitespace-nowrap">
                          {{ t('admin.tournament_page.teams_tab_seed_label') }}
                        </span>
                        <Select
                          :modelValue="tt.rating ?? 3"
                          :options="ratingOptions"
                          optionLabel="label"
                          optionValue="value"
                          :pt="seedStrengthSelectPt"
                          :disabled="!canEditTeamRatings || ratingSaving || groupingSaving"
                          @update:modelValue="(v) => { tt.rating = v; updateTeamRating(tt.teamId, v) }"
                        />
                      </div>
                      <div class="text-xs text-muted-color w-24 text-right shrink-0">
                        <span v-if="tt.group">{{ tt.group.name }}</span>
                        <span v-else>—</span>
                      </div>
                    </div>
                  </li>
                </ul>
              </template>
            </div>
          </div>

          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4 h-fit space-y-5">
            <div>
              <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
                {{ t('admin.tournament_page.tournament_admins_title') }}
              </h2>
              <p class="mt-1 text-xs text-muted-color leading-relaxed">
                {{ t('admin.tournament_page.tournament_admins_lead') }}
              </p>
              <ul v-if="tournamentAdminMembers.length" class="mt-3 space-y-2">
                <li
                  v-for="m in tournamentAdminMembers"
                  :key="m.id"
                  class="rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2"
                >
                  <div class="text-sm">
                    {{ formatUserListLabel(m.user) }}
                  </div>
                </li>
              </ul>
              <p v-else class="mt-3 text-xs text-muted-color leading-relaxed">
                {{ t('admin.tournament_page.tournament_admins_empty') }}
              </p>
            </div>
            <div class="border-t border-surface-200 pt-4 dark:border-surface-700">
              <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
                {{ t('admin.tournament_page.tournament_moderators_title') }}
              </h2>
              <p class="mt-1 text-xs text-muted-color leading-relaxed">
                {{ t('admin.tournament_page.tournament_moderators_lead') }}
              </p>
              <ul v-if="tournamentModeratorMembers.length" class="mt-3 space-y-2">
                <li
                  v-for="m in tournamentModeratorMembers"
                  :key="m.id"
                  class="rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2"
                >
                  <div class="text-sm">
                    {{ formatUserListLabel(m.user) }}
                  </div>
                </li>
              </ul>
              <p v-else class="mt-3 text-xs text-muted-color leading-relaxed">
                {{ t('admin.tournament_page.tournament_moderators_empty') }}
              </p>
            </div>
          </div>
        </div>
      </TabPanel>

      <TabPanel value="infrastructure" :header="t('admin.tournament_page.tab_infrastructure')">
        <div class="grid gap-4 lg:grid-cols-12">
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4 sm:p-5 lg:col-span-12">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-base font-semibold text-surface-900 dark:text-surface-0">
                {{ t('admin.tournament_page.infrastructure_tournament_params_title') }}
              </h2>
              <Button
                :label="t('admin.tournament_page.save')"
                icon="pi pi-save"
                :loading="infrastructureSaving"
                class="shrink-0"
                @click="saveInfrastructure"
              />
            </div>
            <Message
              v-if="infrastructureReferenceFieldsLocked"
              severity="warn"
              :closable="false"
              class="mt-3"
            >
              {{ t('admin.tournament_page.infrastructure_locked_after_results') }}
            </Message>
            <div class="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-xs font-medium tracking-wide text-muted-color">{{ t('admin.tournament_page.season_label') }}</label>
                <Select
                  v-model="infrastructureForm.seasonId"
                  :options="infrastructureOptions.seasons"
                  optionLabel="name"
                  optionValue="id"
                  :loading="infrastructureLoading"
                  :disabled="infrastructureReferenceFieldsLocked"
                  showClear
                  class="w-full"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-xs font-medium tracking-wide text-muted-color">{{ t('admin.tournament_page.competition_type_label') }}</label>
                <Select
                  v-model="infrastructureForm.competitionId"
                  :options="infrastructureOptions.competitions"
                  optionLabel="name"
                  optionValue="id"
                  :loading="infrastructureLoading"
                  :disabled="infrastructureReferenceFieldsLocked"
                  showClear
                  class="w-full"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-xs font-medium tracking-wide text-muted-color">{{ t('admin.tournament_page.age_group_label') }}</label>
                <Select
                  v-model="infrastructureForm.ageGroupId"
                  :options="infrastructureOptions.ageGroups"
                  optionLabel="name"
                  optionValue="id"
                  :loading="infrastructureLoading"
                  :disabled="infrastructureReferenceFieldsLocked"
                  showClear
                  class="w-full"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-xs font-medium tracking-wide text-muted-color">{{ t('admin.tournament_page.tournament_format') }}</label>
                <div class="h-[2.6rem] flex items-center rounded-md border border-surface-200 bg-surface-50/80 px-3 text-sm dark:border-surface-700 dark:bg-surface-800/40">
                  {{ localizedTournamentFormatLabel(tournament?.format) }}
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4 sm:p-5 lg:col-span-6 h-full">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-base font-semibold text-surface-900 dark:text-surface-0">
                {{ t('admin.tournament_page.infrastructure_referees_title') }}
              </h2>
              <span class="rounded-full border border-surface-200 px-2 py-0.5 text-xs text-muted-color dark:border-surface-700">
                {{ infrastructureForm.refereeIds.length }}
              </span>
            </div>
            <MultiSelect
              v-model="infrastructureForm.refereeIds"
              :options="infrastructureOptions.referees"
              optionValue="id"
              :loading="infrastructureLoading"
              :maxSelectedLabels="0"
              :selectedItemsLabel="t('admin.tournament_page.selected_count', { count: '{0}' })"
              class="mt-3 w-full"
              filter
              :placeholder="t('admin.tournament_page.infrastructure_referees_placeholder')"
            >
              <template #option="{ option }">
                <span>{{ option.lastName }} {{ option.firstName }}</span>
              </template>
            </MultiSelect>
          </div>

          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4 sm:p-5 lg:col-span-6 h-full">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-base font-semibold text-surface-900 dark:text-surface-0">
                {{ t('admin.tournament_page.infrastructure_stadiums_title') }}
              </h2>
              <span class="rounded-full border border-surface-200 px-2 py-0.5 text-xs text-muted-color dark:border-surface-700">
                {{ infrastructureForm.stadiumIds.length }}
              </span>
            </div>
            <MultiSelect
              v-model="infrastructureForm.stadiumIds"
              :options="infrastructureOptions.stadiums"
              optionLabel="name"
              optionValue="id"
              :loading="infrastructureLoading"
              :maxSelectedLabels="0"
              :selectedItemsLabel="t('admin.tournament_page.selected_count', { count: '{0}' })"
              class="mt-3 w-full"
              filter
              :placeholder="t('admin.tournament_page.infrastructure_stadiums_placeholder')"
            >
              <template #option="{ option }">
                <div class="min-w-0">
                  <div class="truncate">{{ option.name }}</div>
                  <div class="text-xs text-muted-color truncate">
                    {{ [option.city, option.address].filter(Boolean).join(', ') || '—' }}
                  </div>
                </div>
              </template>
            </MultiSelect>
            <p
              v-if="infrastructureReferenceFieldsLocked"
              class="mt-2.5 text-xs leading-relaxed text-muted-color"
            >
              {{ t('admin.tournament_page.infrastructure_add_only_after_results') }}
            </p>
          </div>
        </div>
      </TabPanel>
    </TabView>

    <AdminConfirmDialog
      v-model="deleteManualMatchConfirmOpen"
      :title="t('admin.tournament_page.delete_match_confirm_title')"
      :message="deleteManualMatchMessage"
      @confirm="confirmDeleteManualMatch"
    />

    <Dialog
      :visible="calendarDialog"
      @update:visible="(v) => (calendarDialog = v)"
      modal
      :header="t('admin.tournament_page.calendar_generation_header')"
      :style="{ width: '48rem' }"
    >
      <div class="flex flex-col gap-3">
        <Message
          v-if="!canTournamentAutomation"
          severity="warn"
          :closable="false"
          class="w-full text-sm"
        >
          {{ t('admin.tournament_page.calendar_automation_plan_notice') }}
        </Message>
        <div>
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-medium text-surface-900 dark:text-surface-0">{{ t('admin.tournament_page.tournament_format') }}</div>
              <div class="mt-1 text-sm text-muted-color">
                {{ localizedTournamentFormatLabel(tournament?.format ?? calendarForm.format) }}
              </div>
            </div>
            <div class="text-xs text-muted-color">
              {{ t('admin.tournament_page.changed_in_edit_tournament') }}
            </div>
          </div>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="
            (calendarPreview.scheduleOverflow ||
              (calendarForm.oneDayTournament && calendarPreview.roundDays > 1))
              ? 'border-red-300 bg-red-50/80 dark:border-red-800 dark:bg-red-950/30'
              : 'border-surface-200 dark:border-surface-700'
          "
        >
          <div class="text-sm font-medium has-tooltip flex items-center gap-1.5">
            <span>{{ t('admin.tournament_page.preview_parameters') }}</span>
            <button
              type="button"
              class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
              :aria-label="t('admin.tournament_page.hint_preview_aria')"
              v-tooltip.top="adminTooltip(previewHintText)"
              @click.prevent
            >
              <i class="pi pi-info-circle text-sm" aria-hidden="true" />
            </button>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div class="text-muted-color">{{ t('admin.tournament_page.preview_teams') }}</div>
            <div
              class="text-right font-medium transition-colors"
              :class="calendarPreviewChanged.teamCount ? 'text-primary' : ''"
            >
              {{ calendarPreview.teamCount }}
            </div>
            <div class="text-muted-color">{{ t('admin.tournament_page.preview_matches_approx') }}</div>
            <div
              class="text-right font-medium transition-colors"
              :class="calendarPreviewChanged.estimatedMatches ? 'text-primary' : ''"
            >
              {{ calendarPreview.estimatedMatches }}
            </div>
            <div class="text-muted-color">{{ t('admin.tournament_page.preview_rounds_approx') }}</div>
            <div
              class="text-right font-medium transition-colors"
              :class="calendarPreviewChanged.estimatedRounds ? 'text-primary' : ''"
            >
              {{ calendarPreview.estimatedRounds }}
            </div>
            <div class="text-muted-color">{{ t('admin.tournament_page.preview_game_days') }}</div>
            <div
              class="text-right font-medium transition-colors"
              :class="calendarPreviewChanged.roundDays ? 'text-primary' : ''"
            >
              {{ calendarPreview.roundDays }}
            </div>
            <div class="text-muted-color">{{ t('admin.tournament_page.preview_end_estimate') }}</div>
            <div
              class="text-right font-medium transition-colors"
              :class="calendarPreviewChanged.estimatedEndDate ? 'text-primary' : ''"
            >
              {{
                calendarPreview.estimatedEndDate
                  ? calendarPreview.estimatedEndDate.toISOString().slice(0, 10)
                  : '—'
              }}
            </div>
            <div class="text-muted-color">{{ t('admin.tournament_page.preview_min_minutes_to_midnight') }}</div>
            <div class="text-right font-medium">{{ calendarPreview.minAvailableMinutesPerDay }}</div>
            <div class="text-muted-color">{{ t('admin.tournament_page.preview_minutes_needed_busiest_day') }}</div>
            <div
              class="text-right font-medium"
              :class="calendarPreview.scheduleOverflow ? 'text-red-600 dark:text-red-400' : ''"
            >
              {{ calendarPreview.minutesNeededOnBusiestDay }}
            </div>
          </div>
          <div class="mt-2 text-xs">
            <div
              v-if="calendarPreview.scheduleOverflow"
              class="text-red-700 dark:text-red-300"
            >
              {{ t('admin.tournament_page.schedule_overflow_short') }}
            </div>
            <div
              v-else-if="calendarForm.oneDayTournament && calendarPreview.roundDays > 1"
              class="text-red-700 dark:text-red-300"
            >
              {{ t('admin.tournament_page.one_day_short', { days: calendarPreview.roundDays }) }}
            </div>
            <div v-else class="text-muted-color">
              {{ t('admin.tournament_page.preview_estimate_hint') }}
            </div>
            <p
              v-if="calendarSubmitAttempted && calendarFormErrors.schedule"
              class="mt-1 text-[11px] leading-3 text-red-500"
            >
              {{ calendarFormErrors.schedule }}
            </p>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div class="md:col-span-2 rounded-lg border border-surface-200 dark:border-surface-700 p-3">
            <div class="flex items-center justify-between gap-3">
              <label class="text-sm font-medium has-tooltip flex items-center gap-1.5">
                <span>{{ t('admin.tournament_page.one_day_tournament') }}</span>
                <button
                  type="button"
                  class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                  :aria-label="t('admin.tournament_page.hint_one_day_aria')"
                  v-tooltip.top="adminTooltip(oneDayHintText)"
                  @click.prevent
                >
                  <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                </button>
              </label>
              <ToggleSwitch v-model="calendarForm.oneDayTournament" />
            </div>
          </div>
          <div class="md:col-span-2">
            <label class="text-sm block mb-1 has-tooltip flex items-center gap-1.5">
              <span>{{ t('admin.tournament_page.scheduling_mode') }}</span>
              <button
                type="button"
                class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                :aria-label="t('admin.tournament_page.hint_scheduling_mode_aria')"
                v-tooltip.top="adminTooltip(schedulingModeHintText)"
                @click.prevent
              >
                <i class="pi pi-info-circle text-sm" aria-hidden="true" />
              </button>
            </label>
            <Select
              v-model="calendarForm.schedulingMode"
              :options="schedulingModeOptions"
              option-label="label"
              option-value="value"
              class="w-full"
            />
          </div>
          <div>
            <label class="text-sm block mb-1">{{ t('admin.tournament_page.start_date') }}</label>
            <DatePicker
              v-model="calendarForm.startDate"
              class="w-full"
              dateFormat="yy-mm-dd"
              showIcon
              :invalid="calendarSubmitAttempted && !!calendarFormErrors.startDate"
            />
            <p
              v-if="calendarSubmitAttempted && calendarFormErrors.startDate"
              class="mt-0 text-[11px] leading-3 text-red-500"
            >
              {{ calendarFormErrors.startDate }}
            </p>
          </div>
          <div>
            <label class="text-sm block mb-1">{{ t('admin.tournament_page.end_date_optional') }}</label>
            <DatePicker
              v-model="calendarForm.endDate"
              class="w-full"
              dateFormat="yy-mm-dd"
              showIcon
              :disabled="calendarForm.oneDayTournament"
              :invalid="calendarSubmitAttempted && !!calendarFormErrors.endDate"
            />
            <p
              v-if="calendarSubmitAttempted && calendarFormErrors.endDate"
              class="mt-0 text-[11px] leading-3 text-red-500"
            >
              {{ calendarFormErrors.endDate }}
            </p>
          </div>
          <div>
            <label class="text-sm block mb-1">{{ t('admin.tournament_page.interval_days') }}</label>
            <InputNumber
              v-model="calendarForm.intervalDays"
              class="w-full"
              :min="1"
              :disabled="calendarForm.oneDayTournament"
              @input="(e) => setCalendarNumberLive('intervalDays', e.value)"
            />
          </div>
          <div>
            <label class="text-sm block mb-1 has-tooltip flex items-center gap-1.5">
              <span>{{ t('admin.tournament_page.rounds_per_day') }}</span>
              <button
                type="button"
                class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                :aria-label="t('admin.tournament_page.hint_rounds_per_day_aria')"
                v-tooltip.top="adminTooltip(roundsPerDayHintText)"
                @click.prevent
              >
                <i class="pi pi-info-circle text-sm" aria-hidden="true" />
              </button>
            </label>
            <InputNumber
              v-model="calendarForm.roundsPerDay"
              class="w-full"
              :min="1"
              :disabled="calendarForm.oneDayTournament"
              @input="(e) => setCalendarNumberLive('roundsPerDay', e.value)"
            />
          </div>
          <div>
            <label class="text-sm block mb-1 has-tooltip flex items-center gap-1.5">
              <span>{{ t('admin.tournament_page.round_robin_cycles') }}</span>
              <button
                type="button"
                class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                :aria-label="t('admin.tournament_page.hint_cycles_aria')"
                v-tooltip.top="adminTooltip(roundRobinCyclesHintText)"
                @click.prevent
              >
                <i class="pi pi-info-circle text-sm" aria-hidden="true" />
              </button>
            </label>
            <InputNumber
              v-model="calendarForm.roundRobinCycles"
              class="w-full"
              :min="1"
              :max="4"
              @input="(e) => setCalendarNumberLive('roundRobinCycles', e.value)"
            />
          </div>
          <div>
            <label class="text-sm block mb-1">{{ t('admin.tournament_page.allowed_days') }}</label>
            <MultiSelect
              v-model="calendarForm.allowedDays"
              :options="allowedDayOptions"
              option-label="label"
              option-value="value"
              :maxSelectedLabels="0"
              :selectedItemsLabel="t('admin.tournament_page.selected_count', { count: '{0}' })"
              class="w-full"
              :placeholder="t('admin.tournament_page.any_days')"
              :showToggleAll="false"
              :disabled="calendarForm.oneDayTournament"
            />
          </div>
          <div>
            <label class="text-sm block mb-1 leading-tight">{{ t('admin.tournament_page.duration_minutes') }}</label>
            <InputNumber
              v-model="calendarForm.matchDurationMinutes"
              class="w-full"
              inputClass="w-full"
              :min="1"
              @input="(e) => setCalendarNumberLive('matchDurationMinutes', e.value)"
            />
          </div>
          <div>
            <label class="text-sm block mb-1 leading-tight">{{ t('admin.tournament_page.break_minutes') }}</label>
            <InputNumber
              v-model="calendarForm.matchBreakMinutes"
              class="w-full"
              inputClass="w-full"
              :min="0"
              @input="(e) => setCalendarNumberLive('matchBreakMinutes', e.value)"
            />
          </div>
          <div>
            <label class="text-sm block mb-1 leading-tight">{{ t('admin.tournament_page.simultaneous_matches') }}</label>
            <InputNumber
              v-model="calendarForm.simultaneousMatches"
              class="w-full"
              inputClass="w-full"
              :min="1"
              @input="(e) => setCalendarNumberLive('simultaneousMatches', e.value)"
            />
          </div>
          <div>
            <label class="text-sm block mb-1 leading-tight">{{ t('admin.tournament_page.day_start_time') }}</label>
            <DatePicker
              v-model="defaultDayStartTimeModel"
              class="w-full"
              timeOnly
              hourFormat="24"
              showIcon
              :manualInput="false"
              :invalid="calendarSubmitAttempted && !!calendarFormErrors.dayStartTimeDefault"
            />
            <p
              v-if="calendarSubmitAttempted && calendarFormErrors.dayStartTimeDefault"
              class="mt-0 text-[11px] leading-3 text-red-500"
            >
              {{ calendarFormErrors.dayStartTimeDefault }}
            </p>
          </div>
        </div>
        <div
          v-if="!calendarForm.oneDayTournament && calendarForm.allowedDays?.length"
          class="rounded-lg border border-surface-200 dark:border-surface-700 p-3"
        >
          <div class="text-sm font-medium">{{ t('admin.tournament_page.day_start_time_overrides') }}</div>
          <div class="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div
              v-for="d in calendarForm.allowedDays"
              :key="d"
              class="flex items-center justify-between gap-3"
            >
              <div class="text-sm text-muted-color">{{ weekdayLabelByValue[d] }}</div>
              <DatePicker
                :modelValue="getDayOverrideTimeModel(d)"
                @update:modelValue="(value) => setDayOverrideTimeModel(d, value)"
                class="w-40"
                timeOnly
                hourFormat="24"
                showIcon
                :manualInput="false"
              />
            </div>
          </div>
          <div class="mt-2 text-xs text-muted-color">
            {{ t('admin.tournament_page.day_start_time_overrides_hint') }}
          </div>
        </div>
        <div class="flex items-center justify-between gap-3">
          <div class="text-sm">
            {{ t('admin.tournament_page.replace_existing_calendar') }}
            <div class="text-xs text-muted-color">
              {{ t('admin.tournament_page.replace_existing_calendar_hint') }}
            </div>
          </div>
          <ToggleSwitch v-model="calendarForm.replaceExisting" />
        </div>
      </div>
      <template #footer>
        <div v-if="isManualFormat" class="flex justify-end gap-2">
          <Button :label="t('admin.tournament_page.close')" @click="calendarDialog = false" />
        </div>
        <div
          v-else
          class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex flex-wrap gap-2">
            <Button
              v-if="tournament?.matches?.length && !modPolicy.locksCalendarAndPlayoffAutomation"
              :label="t('admin.tournament_page.clear_calendar')"
              icon="pi pi-trash"
              severity="danger"
              text
              :loading="calendarSaving"
              @click="clearCalendar"
            />
          </div>
          <div class="flex justify-end gap-2 sm:shrink-0">
            <Button :label="t('admin.tournament_page.cancel')" text @click="calendarDialog = false" />
            <Button
              v-if="!modPolicy.locksCalendarAndPlayoffAutomation"
              :label="t('admin.tournament_page.generate')"
              icon="pi pi-check"
              class="min-w-40"
              :loading="calendarSaving"
              :disabled="
                calendarSaving ||
                !canTournamentAutomation ||
                (calendarSubmitAttempted && !canGenerateCalendar)
              "
              @click="generateCalendar"
            />
          </div>
        </div>
      </template>
    </Dialog>

    <AdminMatchProtocolDialog
      :visible="protocolOpen"
      @update:visible="(v) => (protocolOpen = v)"
      :tournament-id="tournamentId"
      :tournament="tournament"
      :match="protocolMatch"
      @saved="onProtocolSaved"
    />

    <AdminScrollToMainTopFab />
  </section>
  </AdminDataState>
</template>

<style scoped>
:deep(.tournament-page-tabs .p-tabview-panels) {
  padding: 0.75rem 0 0 0 !important;
}

:deep(.tournament-page-tabs .p-tabview-panel) {
  padding: 0 !important;
}

.panel-header-row {
  min-height: 2.5rem;
}

.panel-header-title {
  min-height: 1.5rem;
}

.panel-info-icon {
  font-size: 12px;
  line-height: 1;
}

.panel-chevron-btn {
  --p-button-padding-y: 4px;
  --p-button-padding-x: 8px;
}

:deep(.panel-chevron-btn .p-button-icon) {
  font-size: 12px;
}

@media (max-width: 767px) {
  :deep(.tournament-page-tabs .p-tabview-nav-container),
  :deep(.tournament-page-tabs .p-tabview-tablist-container) {
    display: none !important;
  }

  .match-day-toolbar-actions,
  .match-day-toolbar-date {
    width: 100%;
  }

  .panel-collapse-actions {
    width: 100%;
    justify-content: flex-end;
  }

  :deep(.collapse-toggle-btn .p-button-label) {
    display: none;
  }
}
</style>



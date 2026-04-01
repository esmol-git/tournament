<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type {
  CalendarRound,
  CalendarViewMode,
  MatchRow,
  TableRow,
  TeamLite,
  TournamentDetails,
} from '~/types/tournament-admin'
import { getApiErrorMessage } from '~/utils/apiError'
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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import draggable from 'vuedraggable'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const router = useRouter()
const { token, user, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()
const { t, locale } = useI18n()

const tournamentId = computed(() => route.params.id as string)
const tenantId = useTenantId()

/** До первого ответа API — иначе при F5 пустой заголовок и мелькание вкладок. */
const initialLoading = ref(true)
/** Повторные запросы списка матчей (фильтры календаря и т.д.). */
const calendarRefreshing = ref(false)
let isFirstTournamentFetch = true
const tournament = ref<TournamentDetails | null>(null)

const tableLoading = ref(false)
const table = ref<TableRow[]>([])
const groupTables = ref<Record<string, TableRow[]>>({})

const calendarDialog = ref(false)
const calendarSaving = ref(false)
const calendarSubmitAttempted = ref(false)

const activeTab = ref(0)

const teamsLoading = ref(false)
const allTeams = ref<TeamLite[]>([])
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
  templateId: '' as '' | 'kids_mini_8',
  useTemplate: false,
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
    map[sorted[i].id] = i + 1
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
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
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

const fetchTournament = async () => {
  if (!token.value) {
    initialLoading.value = false
    return
  }
  const loadStartedAt = Date.now()
  const isInitial = isFirstTournamentFetch
  if (!isInitial) calendarRefreshing.value = true
  try {
    const params = new URLSearchParams()
    const range = calendarFilterDateRange.value
    if (range?.[0]) params.set('dateFrom', toYmdLocal(new Date(range[0])))
    if (range?.[1]) params.set('dateTo', toYmdLocal(new Date(range[1])))
    if (calendarFilterStatuses.value.length) params.set('statuses', calendarFilterStatuses.value.join(','))
    if (calendarFilterTeamIds.value.length) params.set('teamIds', calendarFilterTeamIds.value.join(','))

    const qs = params.toString()
    const url = qs
      ? apiUrl(`/tournaments/${tournamentId.value}?${qs}`)
      : apiUrl(`/tournaments/${tournamentId.value}`)

    const res = await authFetch<TournamentDetails>(url, {
      headers: { Authorization: `Bearer ${token.value}` },
    })
    tournament.value = res
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

    if (showGroupBucketsFor(res)) {
      initGroupColumns(res)
    } else {
      groupColumns.value = []
    }
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.filters_error_summary'),
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
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

const applyCalendarFilters = async () => {
  await fetchTournament()
}

/** Таблица по группам: групповые форматы + MANUAL с несколькими группами (см. ensureManualGroupsIfNeeded на бэкенде). */
const isGroupedFormat = computed(() => {
  const t = tournament.value
  if (!t) return false
  if (isGroupsPlusPlayoffFamily(t.format)) return true
  if (t.format === 'MANUAL' && (t.groupCount ?? 1) > 1) return true
  return false
})

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

const isManualFormat = computed(() => tournament.value?.format === 'MANUAL')
const isPlayoffOnlyFormat = computed(() => tournament.value?.format === 'PLAYOFF')

const showTournamentTableTab = computed(() => !isPlayoffOnlyFormat.value)

function tournamentTabSlugToIndex(slug: string | undefined | null, hasTable: boolean): number {
  const s = (slug ?? 'calendar').toString().toLowerCase()
  if (s === 'calendar') return 0
  if (s === 'matches') return 1
  if (s === 'table') return hasTable ? 2 : 0
  if (s === 'squads') return hasTable ? 3 : 2
  return 0
}

function tournamentIndexToSlug(index: number, hasTable: boolean): string {
  if (hasTable) {
    return (['calendar', 'matches', 'table', 'squads'] as const)[index] ?? 'calendar'
  }
  return (['calendar', 'matches', 'squads'] as const)[index] ?? 'calendar'
}

let tournamentTabSyncInProgress = false

function syncTournamentTabFromRoute() {
  if (!tournament.value) return
  const hasTable = showTournamentTableTab.value
  const raw = (route.query.tab as string | undefined) ?? 'calendar'
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
  const max = hasTable ? 3 : 2
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
  const f = tournament.value?.format
  return f === 'SINGLE_GROUP' || f === 'MANUAL'
})
const hasAnyEnteredResults = computed(() => {
  const ms = tournament.value?.matches ?? []
  return ms.some((m) => m.homeScore !== null && m.awayScore !== null && (m.status === 'PLAYED' || m.status === 'FINISHED'))
})

/** Есть хотя бы один матч в расписании (календарь сгенерирован или добавлен вручную). */
const hasScheduleMatches = computed(() => (tournament.value?.matches?.length ?? 0) > 0)

const canEditTournament = computed(() => tournament.value?.status === 'DRAFT')

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

// Если календарь уже сгенерирован (есть матчи), то при правках состава/групп
// нужно пересоздавать расписание, иначе матчи будут соответствовать старой структуре.
const shouldRegenerateCalendar = computed(
  () => (tournament.value?.matches?.length ?? 0) > 0 && !hasAnyEnteredResults.value,
)

const teamCount = computed(() => tournament.value?.tournamentTeams?.length ?? 0)

const canRegenerateCalendar = computed(() => {
  const minTeams = tournament.value?.minTeams ?? 0
  return (
    shouldRegenerateCalendar.value &&
    teamCount.value >= minTeams &&
    !isManualFormat.value
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
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
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

// Восстановление "первой/второй" группы по фактическим assignment'ам команд.
// Иногда `tournament.groups` может быть неполным, а `tournamentTeams[].group` приходит корректно.
const teamGroupIdsOrdered = computed(() => {
  const ids: string[] = []
  const tts = tournament.value?.tournamentTeams ?? []
  for (const tt of tts) {
    const gid = tt.group?.id
    if (!gid) continue
    if (!ids.includes(gid)) ids.push(gid)
  }
  return ids
})

const groupIdA = computed(() => {
  const gs = tournament.value?.groups ?? []
  return gs.find((g) => g.name === 'Группа A')?.id ?? teamGroupIdsOrdered.value[0] ?? gs[0]?.id ?? null
})
const groupIdB = computed(() => {
  const gs = tournament.value?.groups ?? []
  return gs.find((g) => g.name === 'Группа B')?.id ?? teamGroupIdsOrdered.value[1] ?? gs[1]?.id ?? null
})

const groupIdC = computed(() => {
  const gs = tournament.value?.groups ?? []
  return gs.find((g) => g.name === 'Группа C')?.id ?? gs[2]?.id ?? null
})

const groupIdD = computed(() => {
  const gs = tournament.value?.groups ?? []
  return gs.find((g) => g.name === 'Группа D')?.id ?? gs[3]?.id ?? null
})

const groupTeamIdsA = computed(() =>
  (tournament.value?.tournamentTeams ?? [])
    .filter((tt) => tt.group?.id === groupIdA.value)
    .map((tt) => tt.teamId)
    .slice(0, 2),
)
const groupTeamIdsB = computed(() =>
  (tournament.value?.tournamentTeams ?? [])
    .filter((tt) => tt.group?.id === groupIdB.value)
    .map((tt) => tt.teamId)
    .slice(0, 2),
)

const groupTeamIdsC = computed(() =>
  (tournament.value?.tournamentTeams ?? [])
    .filter((tt) => tt.group?.id === groupIdC.value)
    .map((tt) => tt.teamId)
    .slice(0, 2),
)

const groupTeamIdsD = computed(() =>
  (tournament.value?.tournamentTeams ?? [])
    .filter((tt) => tt.group?.id === groupIdD.value)
    .map((tt) => tt.teamId)
    .slice(0, 2),
)

const groupStageFinished = computed(() => {
  const ms = tournament.value?.matches ?? []
  const groupMatches = ms.filter((m) => m.stage === 'GROUP')
  if (!groupMatches.length) return false
  return groupMatches.every(
    (m) =>
      m.homeScore !== null &&
      m.awayScore !== null &&
      (m.status === 'PLAYED' || m.status === 'FINISHED'),
  )
})

const playoffSupportedFormats = [
  'GROUPS_PLUS_PLAYOFF',
  'GROUPS_2',
  'GROUPS_3',
  'GROUPS_4',
  'MANUAL',
]

const playoffQualifiersPerGroup = computed(() => tournament.value?.playoffQualifiersPerGroup ?? 2)

const seedLabelByTeamId = computed(() => {
  const map = new Map<string, string>()
  const groups = (tournament.value?.groups ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const teams = tournament.value?.tournamentTeams ?? []
  const k = playoffQualifiersPerGroup.value

  for (let gi = 0; gi < groups.length; gi++) {
    const groupId = groups[gi].id
    const letter = String.fromCharCode(65 + gi)
    const groupTeams = teams.filter((tt) => tt.group?.id === groupId).map((tt) => tt.teamId)
    for (let rank = 0; rank < k; rank++) {
      const teamId = groupTeams[rank]
      if (teamId) map.set(teamId, `${letter}${rank + 1}`)
    }
  }

  return map
})

const playoffFirstRoundNumber = computed<number | null>(() => {
  const ms = (tournament.value?.matches ?? []).filter(
    (m) => m.stage === 'PLAYOFF' && typeof m.roundNumber === 'number',
  )
  if (!ms.length) return null
  return Math.min(...ms.map((m) => m.roundNumber as number))
})

const playoffMatchesByRoundNumber = computed(() => {
  const map = new Map<number, MatchRow[]>()
  for (const m of tournament.value?.matches ?? []) {
    if (m.stage !== 'PLAYOFF') continue
    if (typeof m.roundNumber !== 'number') continue
    const rn = m.roundNumber as number
    const arr = map.get(rn) ?? []
    arr.push(m)
    map.set(rn, arr)
  }

  // Stable ordering is required to map (idx*2 .. idx*2+1) between rounds.
  for (const [rn, arr] of map.entries()) {
    arr.sort((a, b) => {
      const at = new Date(a.startTime).getTime()
      const bt = new Date(b.startTime).getTime()
      return at - bt || a.id.localeCompare(b.id)
    })
    map.set(rn, arr)
  }
  return map
})

const matchHasResult = (m: MatchRow) =>
  m.homeScore !== null &&
  m.awayScore !== null &&
  (m.status === 'PLAYED' || m.status === 'FINISHED')

const winnerName = (m: MatchRow) => {
  if (!matchHasResult(m)) return null
  const hs = m.homeScore as number
  const as = m.awayScore as number
  if (hs === as) return null
  return hs > as ? m.homeTeam.name : m.awayTeam.name
}

const loserName = (m: MatchRow) => {
  if (!matchHasResult(m)) return null
  const hs = m.homeScore as number
  const as = m.awayScore as number
  if (hs === as) return null
  return hs > as ? m.awayTeam.name : m.homeTeam.name
}

const playoffSlotLabels = (m: MatchRow) => {
  const fmt = tournament.value?.format ?? ''
  if (!playoffSupportedFormats.includes(fmt)) return null
  if (m.stage !== 'PLAYOFF') return null
  if (typeof m.roundNumber !== 'number') return null

  const firstRn = playoffFirstRoundNumber.value
  if (firstRn === null) return null

  // First knockout round: show seeds (A1/B2/...) until group stage is finished.
  if (m.roundNumber === firstRn) {
    if (groupStageFinished.value) return null
    const homeSeed = seedLabelByTeamId.value.get(m.homeTeam.id)
    const awaySeed = seedLabelByTeamId.value.get(m.awayTeam.id)
    if (!homeSeed || !awaySeed) return null
    return { home: homeSeed, away: awaySeed }
  }

  // FINAL / THIRD_PLACE depend only on the 2 "semi-final" matches of the previous round.
  if (m.playoffRound === 'FINAL' || m.playoffRound === 'THIRD_PLACE') {
    const parentRn = m.roundNumber - 1
    const parentMatches = playoffMatchesByRoundNumber.value.get(parentRn) ?? []
    if (parentMatches.length < 2) return null
    const semi1 = parentMatches[0]
    const semi2 = parentMatches[1]

    const usesLoser = m.playoffRound === 'THIRD_PLACE'

    const homeTeam =
      (usesLoser ? loserName(semi1) : winnerName(semi1)) ??
      t(usesLoser ? 'admin.tournament_page.playoff_loser_of_match' : 'admin.tournament_page.playoff_winner_of_match', {
        number: matchNumberById.value[semi1.id] ?? '—',
      })
    const awayTeam =
      (usesLoser ? loserName(semi2) : winnerName(semi2)) ??
      t(usesLoser ? 'admin.tournament_page.playoff_loser_of_match' : 'admin.tournament_page.playoff_winner_of_match', {
        number: matchNumberById.value[semi2.id] ?? '—',
      })
    return { home: homeTeam, away: awayTeam }
  }

  // Later knockout rounds: show winners/losers of the previous round matches (binary-tree mapping).
  const parentRn = m.roundNumber - 1
  const currentMatches = playoffMatchesByRoundNumber.value.get(m.roundNumber) ?? []
  const parentMatches = playoffMatchesByRoundNumber.value.get(parentRn) ?? []
  if (!currentMatches.length || parentMatches.length < 2) return null

  const idx = currentMatches.findIndex((x) => x.id === m.id)
  if (idx < 0) return null

  const leftParent = parentMatches[idx * 2]
  const rightParent = parentMatches[idx * 2 + 1]
  if (!leftParent || !rightParent) return null

  const homeTeam =
    winnerName(leftParent) ??
    t('admin.tournament_page.playoff_winner_of_match', {
      number: matchNumberById.value[leftParent.id] ?? '—',
    })
  const awayTeam =
    winnerName(rightParent) ??
    t('admin.tournament_page.playoff_winner_of_match', {
      number: matchNumberById.value[rightParent.id] ?? '—',
    })

  return { home: homeTeam, away: awayTeam }
}

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

const onGroupChange = async (evt: any, targetGroupId: string | null) => {
  if (!canEditGroups.value || !tournament.value) return
  if (!targetGroupId) return
  const moved = (evt?.added?.element ?? evt?.moved?.element) as TournamentTeamRow | undefined
  if (!moved) return
  const newIndex = (evt?.added?.newIndex ?? evt?.moved?.newIndex) as number | undefined
  const size = expectedGroupSize.value
  const cols = groupColumns.value
  let swapped: TournamentTeamRow | null = null

  if (size && cols.length === 2 && (cols[0].teams.length > size || cols[1].teams.length > size)) {
    const c0 = cols[0]
    const c1 = cols[1]
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
        if (targetList[i].teamId !== moved.teamId) return targetList[i]
      }
      return null
    }

    swapped = pickSwapOut()
    if (swapped) {
      const idx = targetList.findIndex((x) => x.teamId === swapped.teamId)
      if (idx >= 0) targetList.splice(idx, 1)

      const desiredIndex = preSource.indexOf(moved.teamId)
      const insertAt = desiredIndex >= 0 ? Math.min(desiredIndex, sourceList.length) : sourceList.length
      sourceList.splice(insertAt, 0, swapped)
    }
  }

  if (size && cols.length === 2) {
    const a = cols[0].teams.length
    const b = cols[1].teams.length
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
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
    await fetchTournament()
  }
}

const fetchAllTeams = async () => {
  if (!token.value) return
  teamsLoading.value = true
  try {
    const res = await authFetch<{ items: TeamLite[]; total: number }>(
      apiUrl(`/tenants/${tenantId.value}/teams`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
        params: { page: 1, pageSize: 200 },
      },
    )
    allTeams.value = res.items
  } finally {
    teamsLoading.value = false
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
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    savingTeams.value = false
  }
}

const fetchTable = async () => {
  if (!token.value) return
  tableLoading.value = true
  try {
    if (isGroupedFormat.value && Array.isArray(tournament.value.groups)) {
      const next: Record<string, TableRow[]> = {}
      for (const g of tournament.value.groups.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
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
  } finally {
    tableLoading.value = false
  }
}

const toDateString = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined)

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
  const [h, m] = time.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

const toTimeHHmm = (value: Date | Date[] | null | undefined): string => {
  const d = Array.isArray(value) ? value[0] : value
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
const setDayOverrideTimeModel = (day: number, value: Date | Date[] | null | undefined) => {
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

const setCalendarNumberLive = (field: CalendarNumericField, rawValue: number | null | undefined) => {
  if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) return
  const n = Math.trunc(rawValue)
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
  const [h, m] = hhmm.split(':').map(Number)
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
    Math.max(0, Number(calendarForm.matchBreakMinutes) ?? 0)
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
      !calendarForm.useTemplate &&
      (calendarPreview.value.scheduleOverflow ||
        (calendarForm.oneDayTournament && calendarPreview.value.roundDays > 1))
        ? calendarPreview.value.scheduleOverflow
          ? t('admin.validation.schedule_overflow')
          : t('admin.validation.one_day_conflict')
        : '',
  }
})
const canGenerateCalendar = computed(
  () =>
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
    const templateEnabled =
      calendarForm.useTemplate && calendarForm.templateId === 'kids_mini_8'

    if (calendarForm.startDate && calendarForm.endDate && calendarForm.startDate >= calendarForm.endDate) {
      throw new Error(t('admin.validation.end_after_start'))
    }
    if (!isValidTimeHHmm(calendarForm.dayStartTimeDefault)) {
      throw new Error(t('admin.validation.invalid_time_hhmm'))
    }
    const cleanedDayStartTimeOverrides = sanitizeDayStartOverrides(effectiveDayStartOverrides.value)

    if (
      !templateEnabled &&
      calendarPreview.value.scheduleOverflow
    ) {
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
        ...(templateEnabled
          ? {}
          : {
              intervalDays: effectiveIntervalDays.value,
              allowedDays: Array.isArray(effectiveAllowedDays.value)
                ? effectiveAllowedDays.value
                : [],
              roundRobinCycles: calendarForm.roundRobinCycles || undefined,
            }),
        roundsPerDay: calendarForm.roundsPerDay || undefined,
        matchDurationMinutes: calendarForm.matchDurationMinutes || undefined,
        matchBreakMinutes: calendarForm.matchBreakMinutes ?? 0,
        simultaneousMatches: calendarForm.simultaneousMatches || undefined,
        dayStartTimeDefault: calendarForm.dayStartTimeDefault || undefined,
        dayStartTimeOverrides: cleanedDayStartTimeOverrides,
      },
    })

    if (templateEnabled) {
      const res = await authFetch<any>(apiUrl(`/tournaments/${tournamentId.value}/calendar/from-template`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: {
          templateId: calendarForm.templateId,
          startDate: normalizeDateInput(calendarForm.startDate),
          parallelMatches: calendarForm.simultaneousMatches || undefined,
          replaceExisting: calendarForm.replaceExisting,
        },
      })
      if (res?.playoff?.skipped) {
        toast.add({
          severity: 'info',
          summary: t('admin.tournament_page.groups_created_summary'),
          detail: t('admin.tournament_page.groups_created_playoff_detail'),
          life: 4500,
        })
      }
    } else {
      await authFetch(apiUrl(`/tournaments/${tournamentId.value}/calendar`), {
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
      })
    }
    calendarDialog.value = false
    await fetchTournament()
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_page.calendar_created_summary'),
      detail: templateEnabled
        ? t('admin.tournament_page.calendar_created_template_detail')
        : t('admin.tournament_page.calendar_created_default_detail'),
      life: 3000,
    })
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.calendar_generate_error_summary'),
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    calendarSaving.value = false
  }
}

const clearCalendar = async () => {
  if (!token.value) return
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
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    calendarSaving.value = false
  }
}

/** MANUAL с несколькими группами: сетка плей-офф строится по таблицам групп (тот же API, что и для GROUPS_*). */
const canGenerateManualPlayoff = computed(
  () =>
    isManualFormat.value &&
    isGroupedFormat.value &&
    (tournament.value?.groups?.length ?? 0) >= 2,
)

const generatePlayoff = async () => {
  if (!token.value) return
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
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
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
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
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
      router.push('/admin/login')
      return
    }
  }
  await fetchTournament()
  teamCompositionSubmitAttempted.value = false
  await fetchAllTeams()
  await fetchTable()
})
</script>

<template>
  <section
    v-if="initialLoading"
    class="p-6 space-y-6 min-h-[28rem]"
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

  <section v-else class="p-6 space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <Button
          :label="t('admin.tournament_page.back')"
          icon="pi pi-arrow-left"
          text
          class="mb-2"
          @click="router.push('/admin/tournaments')"
        />
        <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
          {{ tournament?.name ?? t('admin.tournament_page.tournament_fallback_name') }}
        </h1>
        <p class="mt-1 text-sm text-muted-color">/{{ tournament?.slug }}</p>
        <p v-if="tournament?.season" class="mt-2 text-sm text-surface-600 dark:text-surface-300">
          {{ t('admin.tournament_page.season_label') }}:
          <span class="font-medium text-surface-800 dark:text-surface-100">{{
            tournament.season.name
          }}</span>
        </p>
        <p v-if="tournament?.competition" class="mt-1 text-sm text-surface-600 dark:text-surface-300">
          {{ t('admin.tournament_page.competition_type_label') }}:
          <span class="font-medium text-surface-800 dark:text-surface-100">{{
            tournament.competition.name
          }}</span>
        </p>
        <p v-if="tournament?.ageGroup" class="mt-1 text-sm text-surface-600 dark:text-surface-300">
          {{ t('admin.tournament_page.age_group_label') }}:
          <span class="font-medium text-surface-800 dark:text-surface-100">{{
            tournament.ageGroup.shortLabel || tournament.ageGroup.name
          }}</span>
        </p>
      </div>

      <div class="flex gap-2">
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

    <TabView :activeIndex="activeTab" @update:activeIndex="(v) => (activeTab = v)">
      <TabPanel :header="t('admin.tournament_page.tab_calendar')">
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4">
          <div
            v-if="isManualFormat"
            class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 px-3 py-2"
          >
            <p class="text-sm text-muted-color">
              {{ t('admin.tournament_page.manual_schedule_hint') }}
            </p>
            <Button
              v-if="canManageManualMatches"
              :label="t('admin.tournament_page.add_match')"
              icon="pi pi-plus"
              size="small"
              class="shrink-0"
              @click="() => matchesWorkspaceRef?.openManualMatchDialog()"
            />
          </div>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">{{ t('admin.tournament_page.tournament_rounds_title') }}</h2>
              <p class="mt-1 text-xs text-muted-color">
                {{ t('admin.tournament_page.rounds_hint_open_protocol') }}
              </p>
            </div>
            <Button
              v-if="!isManualFormat"
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
                <Button
                  :label="t('admin.tournament_page.apply_filters')"
                  icon="pi pi-filter"
                  severity="secondary"
                  :disabled="!calendarFiltersActive || !tournament"
                  @click="applyCalendarFilters"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div class="md:col-span-6">
                <label class="text-sm block mb-1 text-surface-900 dark:text-surface-100">{{ t('admin.tournament_page.date_range') }}</label>
                <DatePicker
                  v-model="calendarFilterDateRange"
                  class="w-full"
                  dateFormat="yy-mm-dd"
                  showIcon
                  selectionMode="range"
                />
              </div>
              <div class="md:col-span-3">
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
              <div class="md:col-span-3">
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

            <div v-if="calendarRefreshing" class="space-y-4" aria-busy="true">
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

            <template v-else>
            <div v-if="calendarViewMode === 'grouped'">
              <div v-if="!visibleCalendarRounds.length" class="text-sm text-muted-color">
                {{ t('admin.tournament_page.no_matches_with_filters') }}
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
              <div v-if="!visibleTourSections.length" class="text-sm text-muted-color">
                {{ t('admin.tournament_page.no_matches_with_filters') }}
              </div>

              <div v-else class="space-y-4">
                <div
                  v-for="t in visibleTourSections"
                  :key="t.key"
                  class="rounded-lg border border-surface-200 dark:border-surface-700"
                >
                  <div class="flex items-center justify-between px-3 py-2 bg-surface-50 dark:bg-surface-800/80">
                    <div class="text-sm font-medium text-surface-900 dark:text-surface-100">
                      {{ t.title }} <span class="text-muted-color">({{ t.dateLabel }})</span>
                    </div>
                    <div class="text-xs text-muted-color flex items-center gap-2">
                      <Button
                        :icon="expandedTourKeys[t.key] ? 'pi pi-angle-up' : 'pi pi-angle-down'"
                        text
                        severity="secondary"
                        size="small"
                        @click="toggleTour(t.key)"
                      />
                      <span>{{ t.matches.length }} {{ localizedMatchCountLabel(t.matches.length) }}</span>
                    </div>
                  </div>

                  <div v-if="expandedTourKeys[t.key]" class="divide-y divide-surface-200 dark:divide-surface-700">
                    <div
                      v-for="m in t.matches"
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
            </template>
          </div>
        </div>
      </TabPanel>

      <TabPanel :header="t('admin.tournament_page.tab_matches')">
        <div
          v-if="canGenerateManualPlayoff"
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
          :external-open-protocol="openProtocol"
          @updated="onMatchesWorkspaceUpdated"
        />
      </TabPanel>

      <TabPanel v-if="!isPlayoffOnlyFormat" :header="t('admin.tournament_page.tab_table')">
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">{{ t('admin.tournament_page.table_title') }}</h2>
              <p class="mt-1 text-xs text-muted-color">{{ t('admin.tournament_page.table_autorefresh_hint') }}</p>
            </div>
            <Button
              :label="t('admin.tournament_page.refresh')"
              icon="pi pi-refresh"
              :loading="tableLoading"
              severity="secondary"
              @click="fetchTable"
            />
          </div>

          <div v-if="isGroupedFormat" class="mt-3 space-y-6">
            <div
              v-for="g in (tournament?.groups ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))"
              :key="g.id"
            >
              <div class="text-sm font-semibold text-surface-900 dark:text-surface-0">{{ g.name }}</div>
              <DataTable
                :value="groupTables[g.id] ?? []"
                :loading="tableLoading"
                :rowStyle="qualificationRowStyle"
                class="mt-2"
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

          <DataTable
            v-else
            :value="table"
            :loading="tableLoading"
            class="mt-3"
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
      </TabPanel>

      <TabPanel :header="t('admin.tournament_page.tab_compositions')">
        <div class="grid gap-4 lg:grid-cols-3">
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4 lg:col-span-2">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">{{ t('admin.tournament_page.tournament_teams_title') }}</h2>
              <div class="text-xs text-muted-color">
                {{ tournament?.tournamentTeams?.length ?? 0 }} / {{ tournament?.minTeams ?? 0 }}
              </div>
            </div>

            <div class="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
              <MultiSelect
                v-model="selectedTeamIds"
                :loading="teamsLoading"
                :options="allTeams"
                option-label="name"
                option-value="id"
                :maxSelectedLabels="0"
                :selectedItemsLabel="t('admin.tournament_page.selected_count', { count: '{0}' })"
                class="w-full"
                :placeholder="t('admin.tournament_page.select_teams')"
                filter
                :disabled="!canEditTeamComposition"
              />
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
              class="mt-0 text-[11px] leading-3 text-red-500"
            >
              {{ teamCompositionErrors.minTeams }}
            </p>

            <p
              v-if="canEditTournament && hasScheduleMatches && !hasAnyEnteredResults"
              class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
            >
              {{ t('admin.tournament_page.schedule_generated_lock_hint') }}
            </p>

            <div v-if="showGroupBuckets" class="mt-4">
              <div class="text-sm font-semibold text-surface-900 dark:text-surface-0">{{ t('admin.tournament_page.groups_title') }}</div>
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

              <div
                class="mt-3 grid gap-3"
                :class="{
                  'md:grid-cols-2': groupColumns.length <= 2,
                  'md:grid-cols-2 lg:grid-cols-3': groupColumns.length === 3,
                  'md:grid-cols-2 lg:grid-cols-4': groupColumns.length >= 4,
                }"
              >
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
                    @change="(e) => onGroupChange(e, col.id)"
                  >
                    <template #item="{ element: tt }">
                      <div class="flex items-center justify-between rounded-md border border-surface-200 dark:border-surface-700 px-3 py-2">
                        <div class="flex items-center gap-2 min-w-0">
                          <span
                            class="drag-handle pi pi-bars text-muted-color shrink-0"
                            :class="canEditGroups ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-50'"
                            :title="canEditGroups ? t('admin.tournament_page.drag') : t('admin.tournament_page.unavailable_after_generation')"
                          />
                          <div class="text-sm truncate">{{ tt.team.name }}</div>
                        </div>
                        <Select
                          :modelValue="tt.rating ?? 3"
                          :options="ratingOptions"
                          optionLabel="label"
                          optionValue="value"
                          class="w-20 shrink-0"
                          :disabled="!canEditTeamRatings || ratingSaving || groupingSaving"
                          @update:modelValue="(v) => { tt.rating = v; updateTeamRating(tt.teamId, v) }"
                        />
                      </div>
                    </template>
                  </draggable>
                </div>
              </div>
            </div>

            <ul v-else class="mt-3 space-y-2">
              <li
                v-for="tt in tournament?.tournamentTeams ?? []"
                :key="tt.teamId"
                class="flex items-center justify-between rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2"
              >
                <div class="flex items-center gap-2">
                  <div class="text-sm">{{ tt.team.name }}</div>
                </div>
                <div class="flex items-center gap-3">
                  <Select
                    :modelValue="tt.rating ?? 3"
                    :options="ratingOptions"
                    optionLabel="label"
                    optionValue="value"
                    class="w-20"
                    :disabled="!canEditTeamRatings || ratingSaving || groupingSaving"
                    @update:modelValue="(v) => { tt.rating = v; updateTeamRating(tt.teamId, v) }"
                  />
                  <div class="text-xs text-muted-color">
                    <span v-if="tt.group">{{ tt.group.name }}</span>
                    <span v-else>—</span>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4">
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">{{ t('admin.tournament_page.tournament_admins_title') }}</h2>
            <ul class="mt-3 space-y-2">
              <li
                v-for="m in tournament?.members ?? []"
                :key="m.id"
                class="rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2"
              >
                <div class="text-sm">
                  {{ m.user.name }}
                  <span class="text-muted-color">({{ m.user.email }})</span>
                </div>
                <div class="text-xs text-muted-color">{{ m.role }}</div>
              </li>
            </ul>
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
            <div
              v-if="isGroupsPlusPlayoffFamily(calendarForm.format)"
              class="mt-2 rounded-lg border border-surface-200 dark:border-surface-700 p-3"
            >
            <div class="flex items-center justify-between gap-3">
                <div class="text-sm font-medium">{{ t('admin.tournament_page.generation_mode') }}</div>
              <ToggleSwitch v-model="calendarForm.useTemplate" />
            </div>
            <div class="mt-1 text-xs text-muted-color">
                {{ t('admin.tournament_page.kids_mini_preset_hint') }}
            </div>
            <div v-if="calendarForm.useTemplate" class="mt-3 text-sm">
              {{ t('admin.tournament_page.kids_mini_preset_used') }}
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
              v-tooltip.top="previewHintText"
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
            <template v-if="!calendarForm.useTemplate">
              <div class="text-muted-color">{{ t('admin.tournament_page.preview_min_minutes_to_midnight') }}</div>
              <div class="text-right font-medium">{{ calendarPreview.minAvailableMinutesPerDay }}</div>
              <div class="text-muted-color">{{ t('admin.tournament_page.preview_minutes_needed_busiest_day') }}</div>
              <div
                class="text-right font-medium"
                :class="calendarPreview.scheduleOverflow ? 'text-red-600 dark:text-red-400' : ''"
              >
                {{ calendarPreview.minutesNeededOnBusiestDay }}
              </div>
            </template>
          </div>
          <div v-if="!calendarForm.useTemplate" class="mt-2 text-xs">
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
          <div v-else class="mt-2 text-xs text-muted-color">
            {{ t('admin.tournament_page.preview_estimate_hint') }}
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
                  v-tooltip.top="oneDayHintText"
                  @click.prevent
                >
                  <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                </button>
              </label>
              <ToggleSwitch v-model="calendarForm.oneDayTournament" />
            </div>
          </div>
          <div v-if="!calendarForm.useTemplate" class="md:col-span-2">
            <label class="text-sm block mb-1 has-tooltip flex items-center gap-1.5">
              <span>{{ t('admin.tournament_page.scheduling_mode') }}</span>
              <button
                type="button"
                class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                :aria-label="t('admin.tournament_page.hint_scheduling_mode_aria')"
                v-tooltip.top="schedulingModeHintText"
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
          <div v-if="!calendarForm.useTemplate">
            <label class="text-sm block mb-1">{{ t('admin.tournament_page.interval_days') }}</label>
            <InputNumber
              v-model="calendarForm.intervalDays"
              class="w-full"
              :min="1"
              :disabled="calendarForm.oneDayTournament"
              @input="(e) => setCalendarNumberLive('intervalDays', e.value)"
            />
          </div>
          <div v-if="!calendarForm.useTemplate">
            <label class="text-sm block mb-1 has-tooltip flex items-center gap-1.5">
              <span>{{ t('admin.tournament_page.rounds_per_day') }}</span>
              <button
                type="button"
                class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                :aria-label="t('admin.tournament_page.hint_rounds_per_day_aria')"
                v-tooltip.top="roundsPerDayHintText"
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
          <div v-if="!calendarForm.useTemplate">
            <label class="text-sm block mb-1 has-tooltip flex items-center gap-1.5">
              <span>{{ t('admin.tournament_page.round_robin_cycles') }}</span>
              <button
                type="button"
                class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                :aria-label="t('admin.tournament_page.hint_cycles_aria')"
                v-tooltip.top="roundRobinCyclesHintText"
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
          <div v-if="!calendarForm.useTemplate">
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
              v-if="tournament?.matches?.length"
              :label="t('admin.tournament_page.clear_calendar')"
              icon="pi pi-trash"
              severity="danger"
              text
              :loading="calendarSaving"
              @click="clearCalendar"
            />
            <Button
              v-if="isGroupsPlusPlayoffFamily(tournament?.format)"
              :label="t('admin.tournament_page.generate_playoff')"
              icon="pi pi-sitemap"
              severity="secondary"
              text
              :loading="calendarSaving"
              @click="generatePlayoff"
            />
          </div>
          <div class="flex justify-end gap-2 sm:shrink-0">
            <Button :label="t('admin.tournament_page.cancel')" text @click="calendarDialog = false" />
            <Button
              :label="t('admin.tournament_page.generate')"
              icon="pi pi-check"
              class="min-w-40"
              :loading="calendarSaving"
              :disabled="calendarSaving || (calendarSubmitAttempted && !canGenerateCalendar)"
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
  </section>
</template>



<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  arePublicCalendarBootstrapFresh,
  getCachedCalendarBootstrap,
} from '~/composables/public/readPublicTournamentViewCache'
import { publicTenantQueryKeys } from '~/composables/public/publicTenantQueryKeys'
import {
  usePublicTournamentFetch,
  type PublicRosterTeam,
} from '~/composables/usePublicTournamentFetch'
import type {
  CalendarRound,
  CalendarViewMode,
  MatchRow,
  TableRow,
  TournamentDetails,
} from '~/types/tournament-admin'

type MatchEventRow = NonNullable<MatchRow['events']>[number]
import {
  buildCalendarRoundsFromMatches,
  buildTourSectionsFromMatches,
  formatPublicCalendarDateLabel,
} from '~/utils/tournamentMatchCalendar'
import { isMatchCountedInPublicStandings } from '~/utils/publicTournamentStandingsMatch'
import { formatMatchScoreDisplay, statusLabel } from '~/utils/tournamentAdminUi'
import { buildPlayoffSlotLabels } from '~/utils/playoffSlotResolver'

import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { usePublicTournamentSidebarPreviewStore } from '~/composables/usePublicTournamentSidebarPreviewStore'
import { usePublicTournamentWorkspace } from '~/composables/usePublicTournamentWorkspace'

definePageMeta({
  layout: 'public-tournament',
  path: '/:tenant/tournaments/calendar',
  alias: ['/:tenant/calendar'],
})

const { fetchTournamentDetail, fetchRoster, fetchTable } = usePublicTournamentFetch()
const queryClient = useQueryClient()

const { ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const {
  tenant,
  selectedTournamentId,
  loading,
  syncTidToQuery,
  workspaceReady,
  pageContentLoading,
} = usePublicTournamentWorkspace()

const { publish: publishSidebarStandings } = usePublicTournamentSidebarPreviewStore()

const errorText = ref('')
const pageReady = ref(false)
const isInitializing = ref(true)
const suppressWatchEffects = ref(true)

const calendarLoading = ref(false)
const calendarLoadingMore = ref(false)
const calendarLoadMoreSentinel = ref<HTMLElement | null>(null)
const calendarSentinelIntersecting = ref(false)
let calendarLoadMoreObserver: IntersectionObserver | null = null
const calendarRounds = ref<CalendarRound[]>([])
const calendarTours = ref<Array<{ key: string; title: string; dateLabel: string; matches: TournamentDetails['matches'] }>>([])
const calendarDetail = ref<TournamentDetails | null>(null)
const calendarRequestId = ref(0)
const CALENDAR_MATCHES_PAGE_SIZE = 50
const route = useRoute()
const router = useRouter()
const debugRequestCounts = ref({
  calendar: 0,
  roster: 0,
  table: 0,
  loadMore: 0,
})
const showDebugPanel = computed(() => {
  if (!import.meta.dev) return false
  const raw = String(route.query.debug ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true'
})
const debugPanelCollapsed = ref(false)
const DEBUG_PANEL_COLLAPSE_KEY = 'public-calendar-debug-panel-collapsed'
const resetDebugRequestCounts = () => {
  debugRequestCounts.value = {
    calendar: 0,
    roster: 0,
    table: 0,
    loadMore: 0,
  }
}
const showPageSkeleton = computed(() => {
  return (
    !pageReady.value ||
    loading.value ||
    (calendarLoading.value && !calendarRounds.value.length)
  )
})
const calendarViewMode = ref<CalendarViewMode>('grouped')
const matchStatsOpen = ref(false)
const matchStatsTab = ref(0)
const selectedMatchForStats = ref<TournamentDetails['matches'][number] | null>(null)
const teamLogoById = ref<Record<string, string>>({})
const playerNameById = ref<Record<string, string>>({})
const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'
const CALENDAR_VIEW_QUERY_KEY = 'view'

function matchWordByCount(n: number): string {
  const abs = Math.abs(Math.trunc(n))
  const mod100 = abs % 100
  const mod10 = abs % 10
  if (mod100 >= 11 && mod100 <= 14) return 'матчей'
  if (mod10 === 1) return 'матч'
  if (mod10 >= 2 && mod10 <= 4) return 'матча'
  return 'матчей'
}

function sideLabel(side?: 'HOME' | 'AWAY' | null) {
  if (side === 'HOME') return 'Хозяева'
  if (side === 'AWAY') return 'Гости'
  return '—'
}

function eventMinuteLabel(minute?: number | null) {
  if (minute == null) return '—'
  return `${minute}'`
}

function playerNameByEvent(event: MatchEventRow) {
  const id = String(event.playerId ?? '').trim()
  if (!id) return 'Игрок не указан'
  return playerNameById.value[id] ?? 'Игрок'
}

function sideBadgeClass(side?: 'HOME' | 'AWAY' | null) {
  if (side === 'HOME') return 'bg-[#eef5ff] text-[#1a5a8c]'
  if (side === 'AWAY') return 'bg-[#fff2f7] text-[#b10f46]'
  return 'bg-surface-100 text-surface-700'
}

function normalizeCardType(raw: unknown): 'YELLOW' | 'RED' | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (!s) return null
  if (
    s === 'yellow' ||
    s === 'yellow_card' ||
    s === 'y' ||
    s === 'yc' ||
    s === 'жк'
  ) {
    return 'YELLOW'
  }
  if (
    s === 'red' ||
    s === 'red_card' ||
    s === 'r' ||
    s === 'rc' ||
    s === 'кк'
  ) {
    return 'RED'
  }
  if (s.includes('yellow')) return 'YELLOW'
  if (s.includes('red')) return 'RED'
  return null
}

function cardTypeByEvent(event: MatchEventRow): 'YELLOW' | 'RED' | null {
  const payload = (event.payload ?? {}) as Record<string, unknown>
  return (
    normalizeCardType(payload.cardType) ||
    normalizeCardType(payload.color) ||
    normalizeCardType(payload.cardColor) ||
    normalizeCardType(event.protocolEventType?.name) ||
    null
  )
}

function cardTypeLabel(event: MatchEventRow) {
  const t = cardTypeByEvent(event)
  if (t === 'YELLOW') return 'ЖК'
  if (t === 'RED') return 'КК'
  return 'Карта'
}

function cardTypeBadgeClass(event: MatchEventRow) {
  const t = cardTypeByEvent(event)
  if (t === 'YELLOW') return 'bg-amber-100 text-amber-900'
  if (t === 'RED') return 'bg-rose-100 text-rose-900'
  return 'bg-surface-100 text-surface-700'
}

function openMatchStats(m: TournamentDetails['matches'][number]) {
  selectedMatchForStats.value = m
  matchStatsTab.value = 0
  matchStatsOpen.value = true
}

function resolveTeamLogo(teamId: string | null | undefined) {
  if (!teamId) return TEAM_PLACEHOLDER_SRC
  const logo = teamLogoById.value[teamId]
  if (typeof logo === 'string' && logo.trim().length > 0) return logo
  return TEAM_PLACEHOLDER_SRC
}

function normalizeCalendarViewMode(value: unknown): CalendarViewMode {
  return value === 'tour' ? 'tour' : 'grouped'
}

function syncCalendarViewToQuery(mode: CalendarViewMode) {
  const next = mode
  if ((route.query[CALENDAR_VIEW_QUERY_KEY] as string | undefined) === next) return
  void router.replace({
    query: {
      ...route.query,
      [CALENDAR_VIEW_QUERY_KEY]: next,
    },
  })
}

function debugLog(event: string, meta?: Record<string, unknown>) {
  if (!import.meta.dev) return
   
  console.debug('[public-calendar]', event, { ...debugRequestCounts.value, ...(meta ?? {}) })
}

const groupNameById = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {}
  for (const g of calendarDetail.value?.groups ?? []) out[g.id] = g.name
  return out
})
const hasMultipleCalendarGroups = computed(() => (calendarDetail.value?.groups?.length ?? 0) > 1)
const showCalendarModeSwitch = computed(() => hasMultipleCalendarGroups.value)

function enforceCalendarViewMode(mode: CalendarViewMode): CalendarViewMode {
  if (!showCalendarModeSwitch.value) return 'tour'
  return mode
}

function applyCalendarViewModeConstraints() {
  const next = enforceCalendarViewMode(calendarViewMode.value)
  if (next !== calendarViewMode.value) {
    calendarViewMode.value = next
    return
  }
  syncCalendarViewToQuery(next)
}

function matchMetaLabel(m: TournamentDetails['matches'][number]) {
  const time = new Date(m.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (calendarViewMode.value === 'tour' && m.stage === 'GROUP') {
    if (!hasMultipleCalendarGroups.value) return time
    const gName = m.groupId ? groupNameById.value[m.groupId] : ''
    return gName ? `${time} · ${gName}` : `${time} · Группа`
  }
  return `${time}${m.stage ? ` · ${m.stage === 'GROUP' ? 'Группа' : 'Плей-офф'}` : ''}`
}

const calendarSections = computed<Array<{ key: string; title: string; dateLabel: string; matches: TournamentDetails['matches'] }>>(() =>
  calendarViewMode.value === 'grouped'
    ? calendarRounds.value.map((r, idx) => ({
        key: `${r.dateKey}:${r.round}:${idx}`,
        title: r.title,
        dateLabel: r.dateLabel,
        matches: r.matches,
      }))
    : calendarTours.value,
)
const calendarMatchesLoaded = computed(() => calendarDetail.value?.matches?.length ?? 0)
const calendarMatchesTotal = computed(() => {
  const total = calendarDetail.value?.matchesTotal
  if (typeof total === 'number' && total >= 0) return total
  return calendarMatchesLoaded.value
})
const canLoadMoreCalendarMatches = computed(
  () =>
    !calendarLoading.value &&
    !calendarLoadingMore.value &&
    !!selectedTournamentId.value &&
    calendarMatchesLoaded.value < calendarMatchesTotal.value,
)

function initCalendarLoadMoreObserver() {
  calendarLoadMoreObserver?.disconnect()
  calendarLoadMoreObserver = null
  if (typeof window === 'undefined') return
  if (!calendarLoadMoreSentinel.value) return
  calendarLoadMoreObserver = new IntersectionObserver(
    (entries) => {
      const isIntersecting = entries.some((entry) => entry.isIntersecting)
      const becameVisible = isIntersecting && !calendarSentinelIntersecting.value
      calendarSentinelIntersecting.value = isIntersecting
      if (becameVisible && canLoadMoreCalendarMatches.value) {
        void loadMoreCalendarMatches()
      }
    },
    { root: null, rootMargin: '400px 0px', threshold: 0.01 },
  )
  calendarLoadMoreObserver.observe(calendarLoadMoreSentinel.value)
}
const matchNumberById = computed<Record<string, number>>(() => {
  const detail = calendarDetail.value
  if (detail?.matchNumberById) return detail.matchNumberById
  const sorted = (detail?.matches ?? [])
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))
  const map: Record<string, number> = {}
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]
    if (row) map[row.id] = i + 1
  }
  return map
})
const playoffSlotLabelsByMatchId = computed(() =>
  buildPlayoffSlotLabels(calendarDetail.value, {
    winnerOfMatch: (n) => `Победитель матча ${n}`,
    loserOfMatch: (n) => `Проигравший матча ${n}`,
  }),
)

function localDateKey(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'unknown'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const tourSectionBucketsByKey = computed(() => {
  const out: Record<string, Array<{ dateKey: string; dateLabel: string; matches: TournamentDetails['matches'] }>> = {}
  if (calendarViewMode.value !== 'tour') return out

  for (const section of calendarSections.value) {
    const byDate = new Map<string, TournamentDetails['matches']>()
    for (const m of section.matches) {
      const key = localDateKey(m.startTime)
      const arr = byDate.get(key) ?? []
      arr.push(m)
      byDate.set(key, arr)
    }
    const buckets = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dateKey, matches]) => ({
        dateKey,
        dateLabel: formatPublicCalendarDateLabel(dateKey),
        matches: matches
          .slice()
          .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)),
      }))
    out[section.key] = buckets
  }
  return out
})

function displayedCalendarTeamName(m: TournamentDetails['matches'][number], side: 'home' | 'away') {
  const labels = playoffSlotLabelsByMatchId.value[m.id]
  if (!labels) return side === 'home' ? m.homeTeam.name : m.awayTeam.name
  return side === 'home' ? labels.home : labels.away
}

function displayedCalendarTeamId(
  m: TournamentDetails['matches'][number],
  side: 'home' | 'away',
): string | null {
  const labels = playoffSlotLabelsByMatchId.value[m.id]
  if (labels) return null
  return side === 'home' ? m.homeTeam.id : m.awayTeam.id
}

function teamsSeparator(m: TournamentDetails['matches'][number]) {
  return playoffSlotLabelsByMatchId.value[m.id] ? '-' : 'vs'
}

function matchNumberLabel(m: TournamentDetails['matches'][number]) {
  const n = matchNumberById.value[m.id]
  return n ? `Матч #${n}` : 'Матч'
}

const selectedMatchGoals = computed(() =>
  (selectedMatchForStats.value?.events ?? [])
    .filter((e) => e.type === 'GOAL')
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)),
)

const selectedMatchCards = computed(() =>
  (selectedMatchForStats.value?.events ?? [])
    .filter((e) => e.type === 'CARD')
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)),
)

const selectedMatchSubs = computed(() =>
  (selectedMatchForStats.value?.events ?? [])
    .filter((e) => e.type === 'SUBSTITUTION')
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)),
)

const selectedMatchSummary = computed(() => {
  const m = selectedMatchForStats.value
  if (!m) return null
  const bySide = (type: 'GOAL' | 'CARD' | 'SUBSTITUTION', side: 'HOME' | 'AWAY') =>
    (m.events ?? []).filter((e) => e.type === type && e.teamSide === side).length
  return {
    goalsHome: bySide('GOAL', 'HOME'),
    goalsAway: bySide('GOAL', 'AWAY'),
    cardsHome: bySide('CARD', 'HOME'),
    cardsAway: bySide('CARD', 'AWAY'),
    subsHome: bySide('SUBSTITUTION', 'HOME'),
    subsAway: bySide('SUBSTITUTION', 'AWAY'),
    totalEvents: (m.events ?? []).length,
  }
})

const selectedMatchStageLabel = computed(() => {
  const m = selectedMatchForStats.value
  if (!m) return '—'
  return m.stage === 'PLAYOFF' ? 'Плей-офф' : 'Группа'
})

const selectedMatchFacts = computed(() => {
  const s = selectedMatchSummary.value
  if (!s) return [] as Array<{ key: string; label: string; value: string }>
  const facts: Array<{ key: string; label: string; value: string }> = []
  if (s.totalEvents > 0) facts.push({ key: 'events', label: 'События', value: String(s.totalEvents) })
  if (s.goalsHome + s.goalsAway > 0) facts.push({ key: 'goals', label: 'Голы', value: `${s.goalsHome}:${s.goalsAway}` })
  if (s.cardsHome + s.cardsAway > 0) facts.push({ key: 'cards', label: 'Карточки', value: `${s.cardsHome}:${s.cardsAway}` })
  if (s.subsHome + s.subsAway > 0) facts.push({ key: 'subs', label: 'Замены', value: `${s.subsHome}:${s.subsAway}` })
  return facts
})

async function applyCalendarLoadedData(
  res: TournamentDetails,
  roster: PublicRosterTeam[],
  tableRows: TableRow[],
  tid: string,
  reqId: number,
) {
  if (reqId !== calendarRequestId.value || tid !== selectedTournamentId.value) return
  const nextMap: Record<string, string> = {}
  const nextPlayers: Record<string, string> = {}
  for (const team of roster) {
    const logo = String(team.logoUrl ?? '').trim()
    if (logo) nextMap[team.teamId] = logo
    for (const p of team.players) {
      nextPlayers[p.id] = `${String(p.lastName ?? '').trim()} ${String(p.firstName ?? '').trim()}`.trim() || 'Игрок'
    }
  }
  teamLogoById.value = nextMap
  playerNameById.value = nextPlayers
  calendarDetail.value = res
  const mapSidebarRow = (row: TableRow) => ({
    teamId: row.teamId,
    teamName: row.teamName,
    points: Number(row.points ?? 0),
    played: Number(row.played ?? 0),
    goalDiff: Number(row.goalDiff ?? 0),
    logoUrl: nextMap[row.teamId] ?? null,
  })
  const sortRows = (rows: TableRow[]) =>
    rows
      .slice()
      .sort(
        (a, b) =>
          Number(b.points ?? 0) - Number(a.points ?? 0) ||
          Number(b.goalDiff ?? 0) - Number(a.goalDiff ?? 0) ||
          Number(b.goalsFor ?? 0) - Number(a.goalsFor ?? 0),
      )

  const playoffTeamsTotal = Number(res.summary?.teamsExpectedTotal ?? res.minTeams ?? 0)
  const calendarTitleOptions =
    Number.isFinite(playoffTeamsTotal) && playoffTeamsTotal >= 2
      ? { totalPlayoffTeams: playoffTeamsTotal }
      : undefined

  /** Сначала матчи из ответа — не ждём N× `fetchTable` по группам (иначе «вечный» скелетон и блокировка UI). */
  calendarRounds.value = buildCalendarRoundsFromMatches(
    res.matches ?? [],
    res.groups ?? [],
    calendarTitleOptions,
  )
  calendarTours.value = buildTourSectionsFromMatches(res.matches ?? [], calendarTitleOptions)
  applyCalendarViewModeConstraints()

  const groups = res.groups ?? []
  if (groups.length > 1) {
    const groupedRows = await Promise.all(
      groups.map(async (group) => {
        const groupRows = sortRows((await fetchTable(tenant.value, tid, group.id)) as TableRow[])
        return {
          groupId: group.id,
          groupName: group.name,
          rows: groupRows.slice(0, 3).map(mapSidebarRow),
        }
      }),
    )
    if (reqId !== calendarRequestId.value || tid !== selectedTournamentId.value) return
    publishSidebarStandings(
      tenant.value,
      tid,
      [],
      groupedRows.filter((x) => x.rows.length > 0),
    )
  } else {
    publishSidebarStandings(
      tenant.value,
      tid,
      sortRows(tableRows as TableRow[])
        .slice(0, 3)
        .map(mapSidebarRow),
      [],
    )
  }
}

async function fetchCalendar(opts?: { soft?: boolean }) {
  if (!selectedTournamentId.value) {
    calendarRounds.value = []
    teamLogoById.value = {}
    playerNameById.value = {}
    return
  }

  const soft = opts?.soft === true
  const tid = selectedTournamentId.value
  const reqId = ++calendarRequestId.value
  errorText.value = ''

  try {
    const warm = getCachedCalendarBootstrap(queryClient, tenant.value, tid, CALENDAR_MATCHES_PAGE_SIZE)
    const bootstrapFresh = arePublicCalendarBootstrapFresh(
      queryClient,
      tenant.value,
      tid,
      CALENDAR_MATCHES_PAGE_SIZE,
    )

    if (bootstrapFresh && warm) {
      calendarLoading.value = false
      await applyCalendarLoadedData(warm.detail, warm.roster, warm.table, tid, reqId)
      return
    }

    if (!soft) calendarLoading.value = true
    debugRequestCounts.value.calendar += 1
    debugRequestCounts.value.roster += 1
    debugRequestCounts.value.table += 1
    debugLog('fetchCalendar:start', { tid })
    const [res, roster, tableRows] = await Promise.all([
      fetchTournamentDetail(tenant.value, tid, {
        matchesOffset: 0,
        matchesLimit: CALENDAR_MATCHES_PAGE_SIZE,
      }),
      fetchRoster(tenant.value, tid),
      fetchTable(tenant.value, tid),
    ])
    await applyCalendarLoadedData(res, roster, tableRows as TableRow[], tid, reqId)
  } catch {
    if (reqId !== calendarRequestId.value || tid !== selectedTournamentId.value) return
    calendarDetail.value = null
    calendarRounds.value = []
    calendarTours.value = []
    publishSidebarStandings(tenant.value, tid, [], [])
    errorText.value = 'Не удалось загрузить календарь матчей.'
  } finally {
    calendarLoading.value = false
  }
}

const calendarManualRefreshPending = ref(false)

async function refreshCalendar() {
  if (!selectedTournamentId.value || tenantNotFound.value) return
  const tid = selectedTournamentId.value
  calendarManualRefreshPending.value = true
  try {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['public', 'tenant', tenant.value, 'tournament', tid, 'detail'],
      }),
      queryClient.invalidateQueries({
        queryKey: publicTenantQueryKeys.tournamentRoster(tenant.value, tid),
      }),
      queryClient.invalidateQueries({
        queryKey: ['public', 'tenant', tenant.value, 'tournament', tid, 'table'],
      }),
    ])
    await fetchCalendar({ soft: true })
  } finally {
    calendarManualRefreshPending.value = false
  }
}

async function bootstrapCalendarPage() {
  await ensureTenantResolved()

  if (tenantNotFound.value) {
    errorText.value = 'Тенант не найден. Проверьте ссылку.'
    return
  }

  calendarViewMode.value = normalizeCalendarViewMode(route.query[CALENDAR_VIEW_QUERY_KEY] as string | undefined)
  syncCalendarViewToQuery(calendarViewMode.value)
  await fetchCalendar()
}

async function loadMoreCalendarMatches() {
  if (!canLoadMoreCalendarMatches.value || !selectedTournamentId.value || !calendarDetail.value) return
  const tid = selectedTournamentId.value
  const current = calendarDetail.value
  calendarLoadingMore.value = true
  try {
    debugRequestCounts.value.loadMore += 1
    debugLog('loadMoreCalendarMatches:start', { tid, loaded: current.matches.length })
    const page = await fetchTournamentDetail(tenant.value, tid, {
      matchesOffset: current.matches.length,
      matchesLimit: CALENDAR_MATCHES_PAGE_SIZE,
    })
    if (tid !== selectedTournamentId.value || !calendarDetail.value) return
    const mergedById = new Map<string, TournamentDetails['matches'][number]>()
    for (const m of current.matches ?? []) mergedById.set(m.id, m)
    for (const m of page.matches ?? []) mergedById.set(m.id, m)
    const mergedMatches = Array.from(mergedById.values()).sort(
      (a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id),
    )
    calendarDetail.value = {
      ...current,
      ...page,
      matches: mergedMatches,
      matchesTotal:
        typeof page.matchesTotal === 'number'
          ? page.matchesTotal
          : current.matchesTotal ?? mergedMatches.length,
    }
    calendarRounds.value = buildCalendarRoundsFromMatches(
      calendarDetail.value.matches ?? [],
      calendarDetail.value.groups ?? [],
      {
        totalPlayoffTeams: Number(
          calendarDetail.value.summary?.teamsExpectedTotal ??
            calendarDetail.value.minTeams ??
            0,
        ),
      },
    )
    calendarTours.value = buildTourSectionsFromMatches(
      calendarDetail.value.matches ?? [],
      {
        totalPlayoffTeams: Number(
          calendarDetail.value.summary?.teamsExpectedTotal ??
            calendarDetail.value.minTeams ??
            0,
        ),
      },
    )
    applyCalendarViewModeConstraints()
  } finally {
    calendarLoadingMore.value = false
  }
}

watch(selectedTournamentId, () => {
  if (isInitializing.value || suppressWatchEffects.value) return
  void fetchCalendar()
  syncTidToQuery(selectedTournamentId.value || null)
})

watch(
  () => route.query[CALENDAR_VIEW_QUERY_KEY],
  (q) => {
    if (suppressWatchEffects.value) return
    const next = enforceCalendarViewMode(normalizeCalendarViewMode(q as string | undefined))
    if (calendarViewMode.value !== next) calendarViewMode.value = next
  },
)

watch(calendarViewMode, (mode) => {
  if (suppressWatchEffects.value) return
  const next = enforceCalendarViewMode(mode)
  if (next !== mode) {
    calendarViewMode.value = next
    return
  }
  syncCalendarViewToQuery(next)
})

watch(showCalendarModeSwitch, (allowed) => {
  if (suppressWatchEffects.value) return
  if (!allowed && calendarViewMode.value !== 'tour') {
    calendarViewMode.value = 'tour'
    return
  }
  syncCalendarViewToQuery(calendarViewMode.value)
})

watch(calendarLoadMoreSentinel, () => {
  initCalendarLoadMoreObserver()
})

watch(debugPanelCollapsed, (next) => {
  if (!showDebugPanel.value || typeof window === 'undefined') return
  window.localStorage.setItem(DEBUG_PANEL_COLLAPSE_KEY, next ? '1' : '0')
})

watch(
  showPageSkeleton,
  (v) => {
    pageContentLoading.value = v
  },
  { immediate: true },
)

watch(
  workspaceReady,
  async (ready) => {
    if (!ready) return
    suppressWatchEffects.value = true
    try {
      await bootstrapCalendarPage()
    } finally {
      isInitializing.value = false
      pageReady.value = true
      await nextTick()
      suppressWatchEffects.value = false
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (showDebugPanel.value && typeof window !== 'undefined') {
    debugPanelCollapsed.value = window.localStorage.getItem(DEBUG_PANEL_COLLAPSE_KEY) === '1'
  }
})

onBeforeUnmount(() => {
  calendarLoadMoreObserver?.disconnect()
  calendarLoadMoreObserver = null
})
</script>

<template>
  <div class="contents overflow-anchor-none">
  <Transition name="public-view-fade" mode="out-in">
    <div
      v-if="showPageSkeleton"
      key="skeleton"
      class="space-y-4 min-h-[65vh]"
    >
      <div
        v-for="i in 3"
        :key="`cal-sk-${i}`"
        class="public-card"
      >
        <Skeleton width="55%" height="1.2rem" />
        <Skeleton class="mt-2" width="38%" height="0.9rem" />
        <Skeleton class="mt-3" width="100%" height="3.25rem" />
        <Skeleton class="mt-2" width="100%" height="3.25rem" />
      </div>
    </div>

    <div v-else key="content" class="space-y-4 min-h-[65vh]">
      <div v-if="errorText" class="public-error">
        {{ errorText }}
      </div>

      <div v-else class="space-y-6">
          <div class="public-card !p-3 flex flex-wrap items-center gap-3">
            <div
              v-if="showCalendarModeSwitch"
              class="inline-flex rounded-xl border border-surface-200 bg-surface-0 p-1"
            >
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                :class="calendarViewMode === 'grouped' ? 'bg-[#eef5ff] text-[#1a5a8c]' : 'text-[#4f6b8c] hover:bg-surface-50'"
                @click="calendarViewMode = 'grouped'"
              >
                По группам
              </button>
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                :class="calendarViewMode === 'tour' ? 'bg-[#eef5ff] text-[#1a5a8c]' : 'text-[#4f6b8c] hover:bg-surface-50'"
                @click="calendarViewMode = 'tour'"
              >
                По турам
              </button>
            </div>
            <Button
              type="button"
              icon="pi pi-refresh"
              label="Обновить"
              outlined
              size="small"
              class="ml-auto shrink-0 !border-[#d2e2f7] !text-[#1a5a8c] hover:!border-[#c80a48]/35 hover:!text-[#c80a48]"
              :loading="calendarManualRefreshPending"
              :disabled="
                !selectedTournamentId ||
                calendarManualRefreshPending ||
                calendarLoadingMore ||
                !pageReady
              "
              title="Запросить актуальные матчи, составы и турнирную таблицу"
              aria-label="Обновить календарь матчей"
              @click="refreshCalendar"
            />
          </div>

          <div v-if="calendarLoading" class="public-card">
            <div class="space-y-3">
              <Skeleton width="42%" height="1rem" />
              <Skeleton width="30%" height="0.9rem" />
              <Skeleton width="100%" height="3.2rem" />
              <Skeleton width="100%" height="3.2rem" />
            </div>
          </div>

          <div
            v-else-if="!calendarSections.length"
            class="public-empty"
          >
            В календаре пока нет матчей.
          </div>

          <div v-else class="space-y-3 public-stagger-appear">
            <div
              v-for="r in calendarSections"
              :key="r.key"
              class="rounded-2xl border border-surface-200 bg-surface-0 p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="font-semibold text-surface-900">{{ r.title }}</div>
                  <div class="text-sm text-muted-color">{{ r.dateLabel }}</div>
                </div>
                <div class="text-xs text-muted-color">
                  {{ r.matches.length }} {{ matchWordByCount(r.matches.length) }}
                </div>
              </div>

              <div class="mt-3 space-y-2">
                <template
                  v-if="calendarViewMode === 'tour' && (tourSectionBucketsByKey[r.key]?.length ?? 0) > 1"
                >
                  <div
                    v-for="bucket in tourSectionBucketsByKey[r.key]"
                    :key="`${r.key}:${bucket.dateKey}`"
                    class="space-y-2 rounded-xl border border-surface-200 bg-surface-50 p-2"
                  >
                    <div class="px-1 text-xs font-semibold text-[#4f6b8c]">
                      {{ bucket.dateLabel }}
                    </div>
                    <div
                      v-for="m in bucket.matches"
                      :key="m.id"
                      class="rounded-xl border border-surface-200 bg-surface-0 px-3 py-2 transition-colors hover:bg-[#eef5ff]"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <div class="min-w-0">
                          <div class="flex items-center gap-2 text-sm font-medium">
                            <RemoteImage
                              :src="resolveTeamLogo(displayedCalendarTeamId(m, 'home'))"
                              :alt="displayedCalendarTeamName(m, 'home')"
                              placeholder-icon="users"
                              icon-class="text-xs"
                              class="h-7 w-7 shrink-0 rounded-full"
                            />
                            <span class="truncate">{{ displayedCalendarTeamName(m, 'home') }}</span>
                            <span class="shrink-0 text-[#4f6b8c]">{{ teamsSeparator(m) }}</span>
                            <RemoteImage
                              :src="resolveTeamLogo(displayedCalendarTeamId(m, 'away'))"
                              :alt="displayedCalendarTeamName(m, 'away')"
                              placeholder-icon="users"
                              icon-class="text-xs"
                              class="h-7 w-7 shrink-0 rounded-full"
                            />
                            <span class="truncate">{{ displayedCalendarTeamName(m, 'away') }}</span>
                          </div>
                          <div class="text-xs text-muted-color">
                            {{ matchNumberLabel(m) }} · {{ matchMetaLabel(m) }}
                          </div>
                        </div>
                        <div class="flex items-center gap-3 shrink-0">
                          <div class="text-sm font-semibold">
                            <template v-if="isMatchCountedInPublicStandings(m)">
                              {{ formatMatchScoreDisplay(m) }}
                            </template>
                            <template v-else>—</template>
                          </div>
                          <Button
                            icon="pi pi-chart-bar"
                            size="small"
                            text
                            rounded
                            class="!text-[#1a5a8c] hover:!text-[#c80a48]"
                            aria-label="Статистика матча"
                            @click="openMatchStats(m)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div
                    v-for="m in r.matches"
                    :key="m.id"
                    class="rounded-xl border border-surface-200 bg-surface-0 px-3 py-2 transition-colors hover:bg-[#eef5ff]"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="min-w-0">
                        <div class="flex items-center gap-2 text-sm font-medium">
                          <RemoteImage
                            :src="resolveTeamLogo(displayedCalendarTeamId(m, 'home'))"
                            :alt="displayedCalendarTeamName(m, 'home')"
                            placeholder-icon="users"
                            icon-class="text-xs"
                            class="h-7 w-7 shrink-0 rounded-full"
                          />
                          <span class="truncate">{{ displayedCalendarTeamName(m, 'home') }}</span>
                          <span class="shrink-0 text-[#4f6b8c]">{{ teamsSeparator(m) }}</span>
                          <RemoteImage
                            :src="resolveTeamLogo(displayedCalendarTeamId(m, 'away'))"
                            :alt="displayedCalendarTeamName(m, 'away')"
                            placeholder-icon="users"
                            icon-class="text-xs"
                            class="h-7 w-7 shrink-0 rounded-full"
                          />
                          <span class="truncate">{{ displayedCalendarTeamName(m, 'away') }}</span>
                        </div>
                        <div class="text-xs text-muted-color">
                          {{ matchNumberLabel(m) }} · {{ matchMetaLabel(m) }}
                        </div>
                      </div>
                      <div class="flex items-center gap-3 shrink-0">
                        <div class="text-sm font-semibold">
                          <template v-if="isMatchCountedInPublicStandings(m)">
                            {{ formatMatchScoreDisplay(m) }}
                          </template>
                          <template v-else>—</template>
                        </div>
                        <Button
                          icon="pi pi-chart-bar"
                          size="small"
                          text
                          rounded
                          class="!text-[#1a5a8c] hover:!text-[#c80a48]"
                          aria-label="Статистика матча"
                          @click="openMatchStats(m)"
                        />
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
            <div
              v-if="canLoadMoreCalendarMatches || calendarLoadingMore"
              ref="calendarLoadMoreSentinel"
              class="flex flex-col items-center justify-center gap-2 pt-1"
            >
              <div class="text-xs text-muted-color">
                Загружено {{ calendarMatchesLoaded }} из {{ calendarMatchesTotal }} матчей
              </div>
              <div class="text-xs text-[#4f6b8c]">
                {{ calendarLoadingMore ? 'Загружаем еще матчи...' : 'Прокрутите ниже для автодогрузки' }}
              </div>
            </div>
          </div>
        </div>
    </div>
  </Transition>
  <Dialog
      :visible="matchStatsOpen"
      @update:visible="(v) => (matchStatsOpen = v)"
      modal
      :draggable="false"
      :style="{ width: '52rem', maxWidth: '96vw' }"
      :header="selectedMatchForStats ? `${selectedMatchForStats.homeTeam.name} — ${selectedMatchForStats.awayTeam.name}` : 'Статистика матча'"
      class="match-stats-dialog"
    >
      <div v-if="selectedMatchForStats" class="space-y-3">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="rounded-full bg-[#eef5ff] px-2.5 py-1 text-[#1a5a8c]">
            {{
              new Date(selectedMatchForStats.startTime).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            }}
          </span>
          <span class="rounded-full bg-surface-100 px-2.5 py-1 text-surface-700">
            {{ selectedMatchStageLabel }}
          </span>
          <span class="rounded-full bg-[#fff2f7] px-2.5 py-1 text-[#b10f46]">
            {{ statusLabel(selectedMatchForStats.status) }}
          </span>
        </div>

        <TabView :activeIndex="matchStatsTab" @update:activeIndex="(v) => (matchStatsTab = v)">
          <TabPanel value="summary" header="Общая">
            <div class="space-y-3">
              <div class="rounded-xl border border-[#d6e0ee] bg-white p-3">
                <div class="text-xs text-[#4f6b8c]">Счет</div>
                <div class="mt-1 text-xl font-semibold text-[#123c67]">
                  <template v-if="selectedMatchForStats && isMatchCountedInPublicStandings(selectedMatchForStats)">
                    {{ formatMatchScoreDisplay(selectedMatchForStats) }}
                  </template>
                  <template v-else>—</template>
                </div>
              </div>
              <div v-if="selectedMatchFacts.length" class="flex flex-wrap gap-2">
                <div
                  v-for="fact in selectedMatchFacts"
                  :key="fact.key"
                  class="rounded-full border border-[#d6e0ee] bg-[#f8fbff] px-3 py-1.5"
                >
                  <span class="text-xs text-[#4f6b8c]">{{ fact.label }}: </span>
                  <span class="text-sm font-semibold text-[#123c67]">{{ fact.value }}</span>
                </div>
              </div>
              <div v-else class="rounded-xl border border-[#d6e0ee] bg-[#f8fbff] px-3 py-2 text-sm text-[#4f6b8c]">
                Ключевых событий в матче пока нет.
              </div>
            </div>
          </TabPanel>

          <TabPanel value="goals" header="Голы">
            <div v-if="!selectedMatchGoals.length" class="text-sm text-muted-color">Событий нет.</div>
            <div v-else class="space-y-2">
              <div
                v-for="e in selectedMatchGoals"
                :key="e.id"
                class="flex items-center justify-between gap-3 rounded-lg border border-[#d6e0ee] px-3 py-2 text-sm"
              >
                <div class="min-w-0">
                  <span class="font-medium">{{ eventMinuteLabel(e.minute) }}</span>
                  <span class="ml-2 truncate">{{ playerNameByEvent(e) }}</span>
                </div>
                <span class="rounded-full px-2 py-0.5 text-xs" :class="sideBadgeClass(e.teamSide)">
                  {{ sideLabel(e.teamSide) }}
                </span>
              </div>
            </div>
          </TabPanel>

          <TabPanel value="cards" header="Карточки">
            <div v-if="!selectedMatchCards.length" class="text-sm text-muted-color">Событий нет.</div>
            <div v-else class="space-y-2">
              <div
                v-for="e in selectedMatchCards"
                :key="e.id"
                class="flex items-center justify-between gap-3 rounded-lg border border-[#d6e0ee] px-3 py-2 text-sm"
              >
                <div class="min-w-0">
                  <span class="font-medium">{{ eventMinuteLabel(e.minute) }}</span>
                  <span class="ml-2 truncate">{{ playerNameByEvent(e) }}</span>
                  <span
                    class="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    :class="cardTypeBadgeClass(e)"
                  >
                    {{ cardTypeLabel(e) }}
                  </span>
                </div>
                <span class="rounded-full px-2 py-0.5 text-xs" :class="sideBadgeClass(e.teamSide)">
                  {{ sideLabel(e.teamSide) }}
                </span>
              </div>
            </div>
          </TabPanel>

          <TabPanel value="subs" header="Замены">
            <div v-if="!selectedMatchSubs.length" class="text-sm text-muted-color">Событий нет.</div>
            <div v-else class="space-y-2">
              <div
                v-for="e in selectedMatchSubs"
                :key="e.id"
                class="flex items-center justify-between gap-3 rounded-lg border border-[#d6e0ee] px-3 py-2 text-sm"
              >
                <div class="min-w-0">
                  <span class="font-medium">{{ eventMinuteLabel(e.minute) }}</span>
                  <span class="ml-2 truncate">{{ playerNameByEvent(e) }}</span>
                </div>
                <span class="rounded-full px-2 py-0.5 text-xs" :class="sideBadgeClass(e.teamSide)">
                  {{ sideLabel(e.teamSide) }}
                </span>
              </div>
            </div>
          </TabPanel>
        </TabView>
      </div>
    </Dialog>
    <div
      v-if="showDebugPanel"
      class="fixed bottom-4 right-4 z-[60] rounded-lg border border-[#d6e0ee] bg-white/95 px-3 py-2 text-[11px] text-[#123c67] shadow-lg backdrop-blur"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="font-semibold">debug: calendar requests</div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="rounded border border-[#d6e0ee] px-1.5 py-0.5 text-[10px] text-[#4f6b8c] hover:bg-surface-50"
            @click="debugPanelCollapsed = !debugPanelCollapsed"
          >
            {{ debugPanelCollapsed ? 'expand' : 'collapse' }}
          </button>
          <button
            type="button"
            class="rounded border border-[#d6e0ee] px-1.5 py-0.5 text-[10px] text-[#4f6b8c] hover:bg-surface-50"
            @click="resetDebugRequestCounts"
          >
            reset
          </button>
        </div>
      </div>
      <template v-if="!debugPanelCollapsed">
        <div class="mt-1 text-[#4f6b8c]">tid: {{ selectedTournamentId || 'none' }}</div>
        <div class="text-[#4f6b8c]">mode: {{ calendarViewMode }}</div>
        <div class="mt-1">calendar: {{ debugRequestCounts.calendar }}</div>
        <div>roster: {{ debugRequestCounts.roster }}</div>
        <div>table: {{ debugRequestCounts.table }}</div>
        <div>loadMore: {{ debugRequestCounts.loadMore }}</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.match-stats-dialog :deep(.p-tabview-ink-bar) {
  background: #c80a48;
}

.match-stats-dialog :deep(.p-tabview-nav-link) {
  color: #4f6b8c;
}

.match-stats-dialog :deep(.p-tabview-nav-link[aria-selected='true']) {
  color: #123c67;
}
</style>


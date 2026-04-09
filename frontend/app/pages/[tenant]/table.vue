<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { publicTenantQueryKeys } from '~/composables/public/publicTenantQueryKeys'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import type { MatchRow, TableRow, TournamentDetails } from '~/types/tournament-admin'

import PublicChessboard from '~/app/components/public/PublicChessboard.vue'
import PublicPlayoff from '~/app/components/public/PublicPlayoff.vue'
import PublicProgress from '~/app/components/public/PublicProgress.vue'
import PublicTournamentTabs from '~/app/components/public/PublicTournamentTabs.vue'
import { getTournamentCapabilities } from '~/utils/tournamentFormatCapabilities'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { usePublicTournamentWorkspace } from '~/composables/usePublicTournamentWorkspace'
import { usePublicTournamentSidebarTopStatsStore } from '~/composables/usePublicTournamentSidebarTopStatsStore'

definePageMeta({
  layout: 'public-tournament',
  path: '/:tenant/tournaments/table',
  alias: ['/:tenant/tournaments', '/:tenant/table'],
})

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const { fetchTournamentDetail, fetchTable: fetchTablePublic, fetchTablePage, fetchRoster } = usePublicTournamentFetch()

/** Полный список строк таблицы на первой странице — дублируем в ключ `tournamentTable`, чтобы шахматка/календарь не делали лишний запрос. */
function primePublicTournamentTableFromPage(
  tenantSlug: string,
  tournamentId: string,
  rows: TableRow[],
  groupId?: string,
) {
  queryClient.setQueryData(publicTenantQueryKeys.tournamentTable(tenantSlug, tournamentId, ''), rows)
  if (groupId) {
    queryClient.setQueryData(publicTenantQueryKeys.tournamentTable(tenantSlug, tournamentId, groupId), rows)
  }
}

const { ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const {
  tenant,
  tenantMeta,
  selectedTournamentId,
  selectedTournament,
  loading,
  workspaceReady,
  pageContentLoading,
} = usePublicTournamentWorkspace()

const loadingTable = ref(false)
const errorText = ref('')
/** Становится true после первого полного цикла fetch в onMounted — убирает мигание пустого состояния до загрузки. */
const pageReady = ref(false)

const viewType = ref<'table' | 'chessboard' | 'progress' | 'playoff'>('table')
const teamLogosLoadedForTid = ref<string | null>(null)
const teamLogoById = ref<Record<string, string>>({})
const playerById = ref<Record<string, { fullName: string; teamName: string | null; photoUrl: string | null }>>({})
const isInitializing = ref(true)
const suppressWatchEffects = ref(true)
const detailsRequestId = ref(0)
const tableRequestId = ref(0)
// kept only for query sync / legacy; actual slider runs in sidebar
const topStatsSlideIndex = ref(0)
const { publish: publishSidebarTopStats, clear: clearSidebarTopStats } =
  usePublicTournamentSidebarTopStatsStore()
const TABLE_PAGE_SIZE = 50
const debugRequestCounts = ref({
  details: 0,
  roster: 0,
  table: 0,
  tableMore: 0,
})
const showDebugPanel = computed(() => {
  if (!import.meta.dev) return false
  const raw = String(route.query.debug ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true'
})
const debugPanelCollapsed = ref(false)
const DEBUG_PANEL_COLLAPSE_KEY = 'public-table-debug-panel-collapsed'
const resetDebugRequestCounts = () => {
  debugRequestCounts.value = {
    details: 0,
    roster: 0,
    table: 0,
    tableMore: 0,
  }
}

// Teleport удалён: top-stats теперь рендерится внутри `PublicTournamentSidebar.vue`.

const tournamentDetails = ref<TournamentDetails | null>(null)
/** Несколько групп: отдельная таблица на каждую (только групповой этап). */
const groupTableSections = ref<{ id: string; name: string; rows: TableRow[] }[]>([])
const groupTableViewMode = ref<'tabs' | 'list'>('tabs')
const activeGroupSectionId = ref<string | null>(null)
/** Одна группа или без деления — одна таблица. */
const singleTableRows = ref<TableRow[]>([])
const singleTableTotalRows = ref(0)
const factsLeaderRow = ref<TableRow | null>(null)
const factsLeaderLoadedForTid = ref<string | null>(null)
const tableLoadingMore = ref(false)
const tableLoadMoreSentinel = ref<HTMLElement | null>(null)
const tableSentinelIntersecting = ref(false)
let tableLoadMoreObserver: IntersectionObserver | null = null

const hasSplitGroups = computed(() => {
  const detailsGroups = tournamentDetails.value?.groups?.length ?? 0
  if (detailsGroups > 1) return true
  return groupTableSections.value.length > 1
})
const visibleGroupTableSections = computed(() => {
  if (!groupTableSections.value.length) return []
  if (groupTableViewMode.value === 'list') return groupTableSections.value
  const active = groupTableSections.value.find((sec) => sec.id === activeGroupSectionId.value)
  const first = groupTableSections.value[0]
  return active ? [active] : first ? [first] : []
})

const leader = computed(() => {
  if (hasSplitGroups.value) return null
  return singleTableRows.value[0] ?? factsLeaderRow.value ?? null
})

const isPlayoffTournament = computed(
  () => selectedTournament.value?.format === 'PLAYOFF',
)

const matchesCountDisplay = computed(() => {
  const s = tournamentDetails.value?.summary
  if (
    s &&
    typeof s.matchesPlayedTotal === 'number' &&
    typeof s.matchesTotal === 'number' &&
    s.matchesTotal >= 0
  ) {
    const played = s.matchesPlayedTotal
    const total = s.matchesTotal
    if (total === 0) return '0'
    /** Таблица/шахматка учитывают только матчи со счётом; в календаре может быть больше записей. */
    if (played < total) return `${played} из ${total}`
    return String(total)
  }

  const fromSummary = tournamentDetails.value?.summary?.matchesTotal
  if (typeof fromSummary === 'number' && fromSummary >= 0) return String(fromSummary)
  const fromTotal = tournamentDetails.value?.matchesTotal
  if (typeof fromTotal === 'number' && fromTotal >= 0) return String(fromTotal)
  const fromDetails = tournamentDetails.value?.matches?.length
  if (typeof fromDetails === 'number' && fromDetails > 0) return String(fromDetails)

  // Fallback for partial data: table stores team appearances, so divide by 2.
  const teamAppearances = groupTableSections.value.length
    ? groupTableSections.value.reduce(
        (sum, sec) => sum + sec.rows.reduce((acc, row) => acc + Number(row.played ?? 0), 0),
        0,
      )
    : singleTableRows.value.reduce((acc, row) => acc + Number(row.played ?? 0), 0)
  return String(Math.floor(teamAppearances / 2))
})

const teamsCountDisplay = computed(() => {
  const fromSummary = tournamentDetails.value?.summary
  if (fromSummary) {
    if (isPlayoffTournament.value) return fromSummary.teamsExpectedTotal
    return fromSummary.teamsRegisteredTotal
  }
  if (isPlayoffTournament.value && Number.isFinite(Number(tournamentDetails.value?.minTeams ?? NaN))) {
    return Number(tournamentDetails.value?.minTeams ?? 0)
  }
  if (groupTableSections.value.length) {
    return groupTableSections.value.reduce((s, g) => s + g.rows.length, 0)
  }
  return singleTableRows.value.length
})

const factsThirdLabel = computed(() => {
  if (isPlayoffTournament.value) return 'Победитель:'
  return 'Лидер:'
})

const factsThirdValue = computed(() => {
  if (isPlayoffTournament.value) {
    return tournamentDetails.value?.summary?.championTeamName ?? 'Определится после финала'
  }
  return hasSplitGroups.value ? 'Отдельно по группам' : (leader.value?.teamName ?? '—')
})

const hasSelectedTournament = computed(
  () => !!selectedTournamentId.value && !!selectedTournament.value,
)
const showPageSkeleton = computed(() => {
  return (
    !pageReady.value ||
    loading.value ||
    (loadingTable.value &&
      !groupTableSections.value.length &&
      !singleTableRows.value.length)
  )
})
const tournamentCapabilities = computed(() =>
  getTournamentCapabilities(selectedTournament.value?.format),
)

const availableViews = computed(() => {
  const views: Array<'table' | 'chessboard' | 'progress' | 'playoff'> = []
  if (tournamentCapabilities.value.showTable) views.push('table')
  if (tournamentCapabilities.value.showChessboard) views.push('chessboard')
  if (tournamentCapabilities.value.showProgress) views.push('progress')
  if (tournamentCapabilities.value.showPlayoff) views.push('playoff')
  return views
})
const tenantPublicSettings = computed(() => tenantMeta.value?.publicSettings ?? null)
const showLeaderInFacts = computed(() => tenantPublicSettings.value?.publicShowLeaderInFacts !== false)
const showTopStats = computed(() => tenantPublicSettings.value?.publicShowTopStats !== false)
const orderedAvailableViews = computed(() => {
  const views = availableViews.value
  const preferred = String(tenantPublicSettings.value?.publicTournamentTabsOrder ?? '')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(v => v === 'table' || v === 'chessboard' || v === 'progress' || v === 'playoff') as Array<'table' | 'chessboard' | 'progress' | 'playoff'>
  const ordered: Array<'table' | 'chessboard' | 'progress' | 'playoff'> = []
  for (const v of preferred) {
    if (views.includes(v) && !ordered.includes(v)) ordered.push(v)
  }
  for (const v of views) {
    if (!ordered.includes(v)) ordered.push(v)
  }
  return ordered
})

const playoffQualifiersPerGroup = computed(() => {
  const raw = tournamentDetails.value?.playoffQualifiersPerGroup
  if (!Number.isInteger(raw) || (raw as number) <= 0) return 0
  return raw as number
})

/** Несколько групп на турнире — есть «проходная зона» в плей-офф; одна таблица — только пьедестал без черты. */
const isMultiGroupStandings = computed(() => (tournamentDetails.value?.groups?.length ?? 0) > 1)

function rowClassGroupQualification(data: TableRow) {
  if (!isMultiGroupStandings.value || playoffQualifiersPerGroup.value <= 0) return ''
  return data.position === playoffQualifiersPerGroup.value ? 'qualifier-cut-row' : ''
}

function rowClassSingleTablePodium(data: TableRow) {
  if (isMultiGroupStandings.value) return ''
  return data.position >= 1 && data.position <= 3 ? 'podium-row' : ''
}

const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'

function resolveTeamLogo(teamId: string | null | undefined) {
  if (!teamId) return TEAM_PLACEHOLDER_SRC
  const logo = teamLogoById.value[teamId]
  if (typeof logo === 'string' && logo.trim().length > 0) return logo
  return TEAM_PLACEHOLDER_SRC
}

function readAssistPlayerId(payload: Record<string, unknown> | null | undefined): string | null {
  const p = payload ?? {}
  const assistId = String(
    p.assistId ??
      p.assistPlayerId ??
      p.assistantId ??
      p.assistantPlayerId ??
      p.assist_player_id ??
      '',
  ).trim()
  return assistId.length ? assistId : null
}

function parseCardType(event: NonNullable<MatchRow['events']>[number]): 'yellow' | 'red' | null {
  const payload = (event.payload ?? {}) as Record<string, unknown>
  const direct = String(payload.cardType ?? payload.color ?? payload.cardColor ?? '')
    .trim()
    .toLowerCase()
  if (direct === 'y' || direct === 'yellow_card' || direct === 'yellowcard') return 'yellow'
  if (direct === 'r' || direct === 'red_card' || direct === 'redcard') return 'red'
  if (direct === 'жк' || direct === 'yellow' || direct === 'yc') return 'yellow'
  if (direct === 'кк' || direct === 'red' || direct === 'rc') return 'red'
  if (direct.includes('yellow') || direct.includes('желт')) return 'yellow'
  if (direct.includes('red') || direct.includes('крас')) return 'red'

  const typeName = String(event.protocolEventType?.name ?? '').trim().toLowerCase()
  if (typeName === 'жк' || typeName === 'yellow' || typeName === 'yc') return 'yellow'
  if (typeName === 'кк' || typeName === 'red' || typeName === 'rc') return 'red'
  if (typeName.includes('yellow') || typeName.includes('желт')) return 'yellow'
  if (typeName.includes('red') || typeName.includes('крас')) return 'red'
  return null
}

function readMetaScore(
  events: MatchRow['events'],
  metaType: 'PENALTY_SCORE' | 'EXTRA_TIME_SCORE',
): { home: number; away: number } | null {
  for (const e of events ?? []) {
    const p = e.payload
    if (!p || p.metaType !== metaType) continue
    const h = p.homeScore
    const a = p.awayScore
    if (typeof h === 'number' && typeof a === 'number') return { home: h, away: a }
  }
  return null
}

function resolveWinnerLoser(m: MatchRow): { winner: string; loser: string } | null {
  if (m.homeScore == null || m.awayScore == null) return null
  if (m.homeScore !== m.awayScore) {
    return m.homeScore > m.awayScore
      ? { winner: m.homeTeam.name, loser: m.awayTeam.name }
      : { winner: m.awayTeam.name, loser: m.homeTeam.name }
  }
  const penalties = readMetaScore(m.events, 'PENALTY_SCORE')
  if (penalties && penalties.home !== penalties.away) {
    return penalties.home > penalties.away
      ? { winner: m.homeTeam.name, loser: m.awayTeam.name }
      : { winner: m.awayTeam.name, loser: m.homeTeam.name }
  }
  return null
}

function pickLatest(ms: MatchRow[]) {
  return ms
    .slice()
    .sort((a, b) => {
      const at = a.startTime ? new Date(a.startTime).getTime() : 0
      const bt = b.startTime ? new Date(b.startTime).getTime() : 0
      return bt - at
    })[0]
}

const podium = computed(() => {
  const details = tournamentDetails.value
  const slots = [
    { place: 1, label: '1 место', team: null as string | null },
    { place: 2, label: '2 место', team: null as string | null },
    { place: 3, label: '3 место', team: null as string | null },
  ]
  if (!details) return slots

  const playoffMatches = (details.matches ?? []).filter((m) => m.stage === 'PLAYOFF')
  if (playoffMatches.length) {
    const final = pickLatest(playoffMatches.filter((m) => m.playoffRound === 'FINAL'))
    const third = pickLatest(playoffMatches.filter((m) => m.playoffRound === 'THIRD_PLACE'))
    const finalResult = final ? resolveWinnerLoser(final) : null
    const thirdResult = third ? resolveWinnerLoser(third) : null

    if (finalResult) {
      slots[0]!.team = finalResult.winner
      slots[1]!.team = finalResult.loser
    }
    if (thirdResult) {
      slots[2]!.team = thirdResult.winner
    }
    return slots
  }

  if (!hasSplitGroups.value && singleTableRows.value.length) {
    const sorted = singleTableRows.value.slice().sort((a, b) => a.position - b.position)
    slots[0]!.team = sorted[0]?.teamName ?? null
    slots[1]!.team = sorted[1]?.teamName ?? null
    slots[2]!.team = sorted[2]?.teamName ?? null
  }
  return slots
})

const showPodium = computed(
  () => hasSelectedTournament.value && selectedTournament.value?.status === 'COMPLETED',
)

type TopPlayerMetric = 'goals' | 'assists' | 'yellowCards' | 'redCards'
type TopPlayerRow = {
  playerId: string
  fullName: string
  teamName: string | null
  value: number
  isPlaceholder?: boolean
}

const topPlayerStats = computed(() => {
  const stats = new Map<string, { goals: number; assists: number; yellowCards: number; redCards: number }>()
  for (const match of tournamentDetails.value?.matches ?? []) {
    for (const event of match.events ?? []) {
      const playerId = String(event.playerId ?? '').trim()
      if (!playerId) continue

      const base = stats.get(playerId) ?? { goals: 0, assists: 0, yellowCards: 0, redCards: 0 }
      if (event.type === 'GOAL') {
        base.goals += 1
        const assistPlayerId = readAssistPlayerId((event.payload ?? null) as Record<string, unknown> | null)
        if (assistPlayerId) {
          const assistBase = stats.get(assistPlayerId) ?? { goals: 0, assists: 0, yellowCards: 0, redCards: 0 }
          assistBase.assists += 1
          stats.set(assistPlayerId, assistBase)
        }
      } else if (event.type === 'CARD') {
        const card = parseCardType(event)
        if (card === 'yellow') base.yellowCards += 1
        if (card === 'red') base.redCards += 1
      }
      stats.set(playerId, base)
    }
  }

  const toTop = (metric: TopPlayerMetric): TopPlayerRow[] => {
    return Array.from(stats.entries())
      .map(([playerId, value]) => {
        const mapped = playerById.value[playerId]
        return {
          playerId,
          fullName: mapped?.fullName?.trim() || `Игрок ${playerId.slice(-4)}`,
          teamName: mapped?.teamName ?? null,
          value: value[metric] ?? 0,
        }
      })
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value || a.fullName.localeCompare(b.fullName, 'ru'))
      .slice(0, 3)
  }

  return {
    goals: toTop('goals'),
    assists: toTop('assists'),
    yellowCards: toTop('yellowCards'),
    redCards: toTop('redCards'),
  }
})

function fillTopRows(rows: TopPlayerRow[], key: string): TopPlayerRow[] {
  const filled = rows.slice(0, 3)
  while (filled.length < 3) {
    const idx = filled.length + 1
    filled.push({
      playerId: `${key}-placeholder-${idx}`,
      fullName: '—',
      teamName: '—',
      value: 0,
      isPlaceholder: true,
    })
  }
  return filled
}

const topStatsSlides = computed(() => {
  return [
    {
      key: 'goals',
      title: 'Топ-3 бомбардира',
      icon: 'pi pi-bolt',
      rows: fillTopRows(topPlayerStats.value.goals, 'goals'),
    },
    {
      key: 'assists',
      title: 'Топ-3 ассистента',
      icon: 'pi pi-send',
      rows: fillTopRows(topPlayerStats.value.assists, 'assists'),
    },
    {
      key: 'yellowCards',
      title: 'Топ-3 по ЖК',
      icon: 'pi pi-bookmark-fill',
      rows: fillTopRows(topPlayerStats.value.yellowCards, 'yellowCards'),
    },
    {
      key: 'redCards',
      title: 'Топ-3 по КК',
      icon: 'pi pi-bookmark-fill',
      rows: fillTopRows(topPlayerStats.value.redCards, 'redCards'),
    },
  ] as const
})

// no longer used (top-stats UI moved to sidebar)

// no-op

// no-op: слайдер крутится внутри сайдбара

watch(
  [hasSelectedTournament, showPageSkeleton, showTopStats, selectedTournamentId, tenant, topStatsSlides],
  () => {
    const t = String(tenant.value ?? '').trim()
    const tid = String(selectedTournamentId.value ?? '').trim()
    if (!hasSelectedTournament.value || !t || !tid || showPageSkeleton.value || !showTopStats.value) {
      if (t && tid) clearSidebarTopStats(t, tid)
      return
    }
    publishSidebarTopStats(t, tid, topStatsSlides.value as any)
  },
  { immediate: true },
)

function syncTidAndViewToQuery(nextId: string | null) {
  const q: Record<string, any> = { ...route.query, view: viewType.value }
  if (nextId) q.tid = nextId
  else delete q.tid
  void router.replace({ query: q })
}

function parseQueryView(
  value: unknown,
): 'table' | 'chessboard' | 'progress' | 'playoff' | null {
  const v = String(value ?? '').trim()
  if (v === 'table' || v === 'chessboard' || v === 'progress' || v === 'playoff') return v
  return null
}

function debugLog(event: string, meta?: Record<string, unknown>) {
  if (!import.meta.dev) return
   
  console.debug('[public-table]', event, { ...debugRequestCounts.value, ...(meta ?? {}) })
}

async function bootstrapTablePage(opts?: { syncTenantRoute?: boolean }) {
  await ensureTenantResolved()

  if (tenantNotFound.value) {
    errorText.value = 'Тенант не найден. Проверьте ссылку.'
    return
  }

  if (opts?.syncTenantRoute && String(route.params.tenant ?? '') !== tenant.value) {
    await router.replace({ params: { tenant: tenant.value }, query: route.query })
  }

  const qView = parseQueryView(route.query.view)
  if (qView) viewType.value = qView
  await fetchTournamentDetails()
  if (viewType.value !== 'table') {
    await ensureFactsLeaderLoaded()
  }
  if (viewType.value === 'table') {
    await fetchTable()
  }
}

async function fetchTournamentDetails() {
  if (!selectedTournamentId.value) {
    tournamentDetails.value = null
    singleTableRows.value = []
    groupTableSections.value = []
    factsLeaderRow.value = null
    factsLeaderLoadedForTid.value = null
    teamLogosLoadedForTid.value = null
    teamLogoById.value = {}
    playerById.value = {}
    return
  }

  errorText.value = ''
  const tid = selectedTournamentId.value
  const reqId = ++detailsRequestId.value
  factsLeaderRow.value = null
  factsLeaderLoadedForTid.value = null
  try {
    debugRequestCounts.value.details += 1
    debugLog('fetchTournamentDetails:start', { tid })
    const detail = await fetchTournamentDetail(tenant.value, tid)
    if (reqId !== detailsRequestId.value || tid !== selectedTournamentId.value) return
    tournamentDetails.value = detail
    if (teamLogosLoadedForTid.value !== tid) {
      debugRequestCounts.value.roster += 1
      debugLog('fetchRoster:start', { tid })
      const roster = await fetchRoster(tenant.value, tid)
      if (reqId !== detailsRequestId.value || tid !== selectedTournamentId.value) return
      const nextMap: Record<string, string> = {}
      const nextPlayerMap: Record<string, { fullName: string; teamName: string | null; photoUrl: string | null }> = {}
      for (const team of roster) {
        const logo = String(team.logoUrl ?? '').trim()
        if (logo) nextMap[team.teamId] = logo
        for (const p of team.players ?? []) {
          nextPlayerMap[p.id] = {
            fullName: `${String(p.lastName ?? '').trim()} ${String(p.firstName ?? '').trim()}`.trim(),
            teamName: team.teamName ?? null,
            photoUrl: p.photoUrl ?? null,
          }
        }
      }
      teamLogoById.value = nextMap
      playerById.value = nextPlayerMap
      teamLogosLoadedForTid.value = tid
    }
  } catch {
    if (reqId !== detailsRequestId.value || tid !== selectedTournamentId.value) return
    errorText.value = 'Не удалось загрузить данные турнира.'
  }
}

async function ensureFactsLeaderLoaded() {
  const tid = selectedTournamentId.value
  if (!tid) {
    factsLeaderRow.value = null
    factsLeaderLoadedForTid.value = null
    return
  }
  if (factsLeaderLoadedForTid.value === tid) return
  const details = tournamentDetails.value
  if (!details) return
  if (details.format === 'PLAYOFF') {
    factsLeaderRow.value = null
    factsLeaderLoadedForTid.value = tid
    return
  }
  if ((details.groups?.length ?? 0) > 1) {
    factsLeaderRow.value = null
    factsLeaderLoadedForTid.value = tid
    return
  }
  if (singleTableRows.value.length > 0) {
    factsLeaderRow.value = singleTableRows.value[0] ?? null
    factsLeaderLoadedForTid.value = tid
    return
  }
  try {
    const groupId = details.groups?.length === 1 ? details.groups[0]?.id : undefined
    const page = await fetchTablePage(tenant.value, tid, {
      groupId,
      offset: 0,
      limit: 1,
    })
    if (tid !== selectedTournamentId.value) return
    factsLeaderRow.value = page.items[0] ?? null
    factsLeaderLoadedForTid.value = tid
  } catch {
    // No-op: facts card can show fallback when table request fails.
  }
}

async function fetchTable() {
  if (!selectedTournamentId.value) {
    singleTableRows.value = []
    groupTableSections.value = []
    tournamentDetails.value = null
    return
  }

  await fetchTournamentDetails()
  if (!tournamentDetails.value) return

  const tid = selectedTournamentId.value

  const reqId = ++tableRequestId.value
  loadingTable.value = true
  errorText.value = ''
  try {
    debugRequestCounts.value.table += 1
    debugLog('fetchTable:start', { tid })
    const detail = tournamentDetails.value
    const groups = detail.groups ?? []

    if (groups.length > 1) {
      const sections = await Promise.all(
        groups.map(async (g) => ({
          id: g.id,
          name: g.name,
          rows: await fetchTablePublic(tenant.value, tid, g.id),
        })),
      )
      groupTableSections.value = sections
      singleTableRows.value = []
      singleTableTotalRows.value = 0
      factsLeaderRow.value = null
      factsLeaderLoadedForTid.value = tid
    } else if (groups.length === 1) {
      const onlyGroup = groups[0]!
      const page = await fetchTablePage(tenant.value, tid, {
        groupId: onlyGroup.id,
        offset: 0,
        limit: TABLE_PAGE_SIZE,
      })
      singleTableRows.value = page.items
      singleTableTotalRows.value = page.total
      groupTableSections.value = []
      factsLeaderRow.value = page.items[0] ?? null
      factsLeaderLoadedForTid.value = tid
      if (page.items.length >= page.total) {
        primePublicTournamentTableFromPage(tenant.value, tid, page.items, onlyGroup.id)
      }
    } else {
      const page = await fetchTablePage(tenant.value, tid, {
        offset: 0,
        limit: TABLE_PAGE_SIZE,
      })
      singleTableRows.value = page.items
      singleTableTotalRows.value = page.total
      groupTableSections.value = []
      factsLeaderRow.value = page.items[0] ?? null
      factsLeaderLoadedForTid.value = tid
      if (page.items.length >= page.total) {
        primePublicTournamentTableFromPage(tenant.value, tid, page.items)
      }
    }
    if (reqId !== tableRequestId.value || tid !== selectedTournamentId.value) return
  } catch {
    if (reqId !== tableRequestId.value || tid !== selectedTournamentId.value) return
    singleTableRows.value = []
    groupTableSections.value = []
    errorText.value = 'Не удалось загрузить турнирную таблицу.'
  } finally {
    if (reqId === tableRequestId.value) {
      loadingTable.value = false
    }
  }
}

const canLoadMoreTableRows = computed(
  () =>
    viewType.value === 'table' &&
    !loadingTable.value &&
    !tableLoadingMore.value &&
    !groupTableSections.value.length &&
    singleTableRows.value.length < singleTableTotalRows.value,
)

function initTableLoadMoreObserver() {
  tableLoadMoreObserver?.disconnect()
  tableLoadMoreObserver = null
  if (typeof window === 'undefined') return
  if (!tableLoadMoreSentinel.value) return
  tableLoadMoreObserver = new IntersectionObserver(
    (entries) => {
      const isIntersecting = entries.some((entry) => entry.isIntersecting)
      const becameVisible = isIntersecting && !tableSentinelIntersecting.value
      tableSentinelIntersecting.value = isIntersecting
      if (becameVisible && canLoadMoreTableRows.value) {
        void loadMoreTableRows()
      }
    },
    { root: null, rootMargin: '400px 0px', threshold: 0.01 },
  )
  tableLoadMoreObserver.observe(tableLoadMoreSentinel.value)
}

async function loadMoreTableRows() {
  if (!canLoadMoreTableRows.value || !selectedTournamentId.value) return
  const tid = selectedTournamentId.value
  tableLoadingMore.value = true
  try {
    debugRequestCounts.value.tableMore += 1
    debugLog('loadMoreTableRows:start', { tid, loaded: singleTableRows.value.length })
    const groupId =
      tournamentDetails.value?.groups?.length === 1
        ? tournamentDetails.value.groups[0]?.id
        : undefined
    const page = await fetchTablePage(tenant.value, tid, {
      groupId,
      offset: singleTableRows.value.length,
      limit: TABLE_PAGE_SIZE,
    })
    if (tid !== selectedTournamentId.value) return
    const merged = [...singleTableRows.value, ...page.items]
    const seen = new Set<string>()
    singleTableRows.value = merged.filter((row) => {
      if (seen.has(row.teamId)) return false
      seen.add(row.teamId)
      return true
    })
    singleTableTotalRows.value = page.total
    const details = tournamentDetails.value
    const singleGroupId = details?.groups?.[0]?.id
    if (
      tid === selectedTournamentId.value &&
      details?.groups?.length === 1 &&
      singleGroupId &&
      singleTableRows.value.length >= singleTableTotalRows.value
    ) {
      primePublicTournamentTableFromPage(
        tenant.value,
        tid,
        [...singleTableRows.value],
        singleGroupId,
      )
    }
  } finally {
    tableLoadingMore.value = false
  }
}

watch(selectedTournamentId, async () => {
  if (isInitializing.value || suppressWatchEffects.value) return
  factsLeaderLoadedForTid.value = null
  factsLeaderRow.value = null
  await fetchTournamentDetails()
  if (viewType.value === 'table') {
    await fetchTable()
  } else {
    await ensureFactsLeaderLoaded()
  }
  syncTidAndViewToQuery(selectedTournamentId.value || null)
})

watch(
  availableViews,
  (views) => {
    if (!views.length) return
    if (!views.includes(viewType.value)) {
      const first = views[0]
      if (first) viewType.value = first
    }
  },
  { immediate: true },
)

watch(viewType, async () => {
  if (isInitializing.value || suppressWatchEffects.value) return
  syncTidAndViewToQuery(selectedTournamentId.value || null)
  if (viewType.value === 'table') {
    await fetchTable()
  } else {
    await ensureFactsLeaderLoaded()
  }
})

watch(tableLoadMoreSentinel, () => {
  initTableLoadMoreObserver()
})

watch(selectedTournamentId, () => {
  topStatsSlideIndex.value = 0
})

watch(groupTableSections, (sections) => {
  if (!sections.length) {
    activeGroupSectionId.value = null
    return
  }
  const firstSec = sections[0]
  if (firstSec && !sections.some((sec) => sec.id === activeGroupSectionId.value)) {
    activeGroupSectionId.value = firstSec.id
  }
}, { immediate: true })

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
      await bootstrapTablePage({ syncTenantRoute: true })
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
  tableLoadMoreObserver?.disconnect()
  tableLoadMoreObserver = null
})
</script>

<template>
  <div class="contents">
  <Transition
    name="public-view-fade"
    mode="in-out"
  >
        <div v-if="showPageSkeleton" key="skeleton" class="space-y-4 min-h-[65vh]">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div
              v-for="i in 3"
              :key="`sk-stat-${i}`"
              class="public-card"
            >
              <Skeleton width="100%" height="0.85rem" />
              <Skeleton class="mt-3" width="100%" height="1.4rem" />
            </div>
          </div>
          <div class="public-card">
            <Skeleton width="100%" height="16rem" />
          </div>
        </div>

        <div v-else key="content" class="space-y-4 min-h-[65vh]">
        <div v-if="showPodium" class="podium-grid">
          <div
            v-for="slot in podium"
            :key="slot.place"
            :class="`podium-card podium-card--${slot.place}`"
          >
            <div class="podium-card__top">
              <span class="podium-medal" aria-hidden="true">
                <i class="pi pi-trophy text-[0.7rem]" />
              </span>
              <p class="text-xs uppercase tracking-wide text-[#4f6b8c]">{{ slot.label }}</p>
            </div>
            <p class="mt-2 text-xl font-semibold truncate text-[#123c67]">
              {{ slot.team ?? 'Определится' }}
            </p>
            <p class="mt-1 text-xs text-[#4f6b8c]">
              {{ slot.team ? 'Финальное место' : 'Определится после завершения матчей' }}
            </p>
          </div>
        </div>

        <div
          v-if="pageReady && !hasSelectedTournament && !errorText"
          class="rounded-3xl border border-[#d6e0ee] bg-white px-6 py-10 text-center shadow-sm"
        >
          <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#f4f7fc] ring-1 ring-[#d6e0ee]">
            <i class="pi pi-inbox text-xl text-[#4f6b8c]" />
          </div>
          <h2 class="text-3xl font-semibold text-[#123c67]">Турниры пока не опубликованы</h2>
          <p class="mt-3 text-lg text-[#4f6b8c]">
            Когда появится активный турнир, здесь автоматически отобразятся доступные разделы и статистика.
          </p>
        </div>

        <PublicTournamentTabs
          v-if="hasSelectedTournament && !(availableViews.length === 1 && availableViews[0] === 'playoff')"
          v-model="viewType"
          :capabilities="tournamentCapabilities"
          :tab-order="orderedAvailableViews"
        />

        <div
          v-if="errorText"
          class="public-error"
        >
          {{ errorText }}
        </div>

        <div v-else-if="hasSelectedTournament" class="public-card tournament-facts">
          <div class="tournament-fact">
            <span class="info-card__icon"><i class="pi pi-users text-sm" /></span>
            <span class="text-[#4f6b8c]">Команд:</span>
            <strong class="text-[#123c67]">{{ teamsCountDisplay }}</strong>
          </div>
          <div class="tournament-fact">
            <span class="info-card__icon"><i class="pi pi-calendar-clock text-sm" /></span>
            <span class="text-[#4f6b8c]">Матчей:</span>
            <strong class="text-[#123c67]">{{ matchesCountDisplay }}</strong>
          </div>
          <div v-if="showLeaderInFacts" class="tournament-fact">
            <span class="info-card__icon"><i class="pi pi-trophy text-sm" /></span>
            <span class="text-[#4f6b8c]">{{ factsThirdLabel }}</span>
            <strong class="truncate text-[#123c67]">
              {{ factsThirdValue }}
            </strong>
          </div>
        </div>

        <div class="min-h-[80vh]">
          <Transition
            name="public-view-fade"
            mode="in-out"
          >
          <div
              v-if="
                hasSelectedTournament &&
                tournamentCapabilities.showTable &&
                viewType === 'table'
              "
              class="overflow-hidden min-h-[65vh]"
            >
          <div
            v-if="isMultiGroupStandings && playoffQualifiersPerGroup > 0"
            class="mb-3 rounded-xl border border-[#d2e2f7] bg-[#eef5ff] px-3 py-2 text-sm text-[#1a5a8c]"
          >
            В плей-офф выходят первые {{ playoffQualifiersPerGroup }} из каждой группы (черта после проходной зоны).
          </div>
          <template v-if="groupTableSections.length">
            <div
              v-if="groupTableSections.length > 1"
              class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d6e0ee] bg-white px-3 py-2"
            >
              <span class="text-sm text-[#4f6b8c]">Отображение групп:</span>
              <div class="inline-flex rounded-lg border border-[#d6e0ee] bg-[#f8fbff] p-0.5">
                <button
                  type="button"
                  class="rounded-md px-2.5 py-1 text-xs font-medium transition"
                  :class="groupTableViewMode === 'tabs' ? 'bg-white text-[#123c67] shadow-sm' : 'text-[#4f6b8c] hover:bg-white/80'"
                  @click="groupTableViewMode = 'tabs'"
                >
                  Табы
                </button>
                <button
                  type="button"
                  class="rounded-md px-2.5 py-1 text-xs font-medium transition"
                  :class="groupTableViewMode === 'list' ? 'bg-white text-[#123c67] shadow-sm' : 'text-[#4f6b8c] hover:bg-white/80'"
                  @click="groupTableViewMode = 'list'"
                >
                  Список
                </button>
              </div>
            </div>
            <div
              v-if="groupTableSections.length > 1 && groupTableViewMode === 'tabs'"
              class="mb-3 overflow-x-auto"
            >
              <div class="inline-flex min-w-max gap-2">
                <button
                  v-for="sec in groupTableSections"
                  :key="`tab-${sec.id}`"
                  type="button"
                  class="rounded-full border px-3 py-1.5 text-sm font-medium transition"
                  :class="activeGroupSectionId === sec.id ? 'border-[#1a5a8c] bg-[#eef5ff] text-[#1a5a8c]' : 'border-[#d6e0ee] bg-white text-[#4f6b8c] hover:bg-surface-50'"
                  @click="activeGroupSectionId = sec.id"
                >
                  {{ sec.name }}
                </button>
              </div>
            </div>
            <div
              v-for="sec in visibleGroupTableSections"
              :key="sec.id"
              class="space-y-2 mb-6 last:mb-0"
            >
              <h2 class="text-lg font-semibold text-surface-900">{{ sec.name }}</h2>
              <div
                v-if="!sec.rows.length"
                class="rounded-2xl border border-surface-200 bg-surface-0 p-6 text-center text-muted-color"
              >
                Таблица группы пока пуста.
              </div>
              <div
                v-else
                class="public-table-wrap"
              >
                <div class="public-table-wrap__scroll">
                <table class="public-table public-stagger-tbody">
                  <thead>
                    <tr>
                      <th class="text-center" style="width: 3rem">#</th>
                      <th class="text-left">Команда</th>
                      <th class="text-center" style="width: 3rem">И</th>
                      <th class="text-center" style="width: 3rem">В</th>
                      <th class="text-center" style="width: 3rem">Н</th>
                      <th class="text-center" style="width: 3rem">П</th>
                      <th class="text-center" style="width: 5.25rem">Мячи</th>
                      <th class="text-center" style="width: 4rem">+/-</th>
                      <th class="text-center" style="width: 4.5rem">Очки</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in sec.rows"
                      :key="row.teamId"
                      :class="rowClassGroupQualification(row)"
                    >
                      <td class="text-center">{{ row.position }}</td>
                      <td>
                        <div class="flex items-center gap-2">
                          <RemoteImage
                            :src="resolveTeamLogo(row.teamId)"
                            :alt="row.teamName"
                            placeholder-icon="users"
                            icon-class="text-xs"
                            class="h-7 w-7 shrink-0 rounded-full"
                          />
                          <span class="table-team-name font-medium text-surface-900">{{ row.teamName }}</span>
                        </div>
                      </td>
                      <td class="text-center">{{ row.played }}</td>
                      <td class="text-center">{{ row.wins }}</td>
                      <td class="text-center">{{ row.draws }}</td>
                      <td class="text-center">{{ row.losses }}</td>
                      <td class="text-center">{{ row.goalsFor }}:{{ row.goalsAgainst }}</td>
                      <td class="text-center">{{ row.goalDiff }}</td>
                      <td class="text-center">
                        <span class="font-semibold tabular-nums">{{ row.points }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="public-table-wrap">
            <div
              v-if="!singleTableRows.length"
              class="py-10 text-center text-muted-color"
            >
              Таблица пока пуста. Матчи еще не сыграны.
            </div>
            <div v-else class="public-table-wrap__scroll">
            <table class="public-table public-stagger-tbody">
              <thead>
                <tr>
                  <th class="text-center" style="width: 3rem">#</th>
                  <th class="text-left">Команда</th>
                  <th class="text-center" style="width: 3rem">И</th>
                  <th class="text-center" style="width: 3rem">В</th>
                  <th class="text-center" style="width: 3rem">Н</th>
                  <th class="text-center" style="width: 3rem">П</th>
                  <th class="text-center" style="width: 5.25rem">Мячи</th>
                  <th class="text-center" style="width: 4rem">+/-</th>
                  <th class="text-center" style="width: 4.5rem">Очки</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in singleTableRows"
                  :key="row.teamId"
                  :class="rowClassSingleTablePodium(row)"
                >
                  <td class="text-center">{{ row.position }}</td>
                  <td>
                    <div class="flex items-center gap-2">
                      <RemoteImage
                        :src="resolveTeamLogo(row.teamId)"
                        :alt="row.teamName"
                        placeholder-icon="users"
                        icon-class="text-xs"
                        class="h-7 w-7 shrink-0 rounded-full"
                      />
                      <span class="table-team-name font-medium text-surface-900">{{ row.teamName }}</span>
                    </div>
                  </td>
                  <td class="text-center">{{ row.played }}</td>
                  <td class="text-center">{{ row.wins }}</td>
                  <td class="text-center">{{ row.draws }}</td>
                  <td class="text-center">{{ row.losses }}</td>
                  <td class="text-center">{{ row.goalsFor }}:{{ row.goalsAgainst }}</td>
                  <td class="text-center">{{ row.goalDiff }}</td>
                  <td class="text-center">
                    <span class="font-semibold tabular-nums">{{ row.points }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
            <div
              v-if="canLoadMoreTableRows || tableLoadingMore"
              ref="tableLoadMoreSentinel"
              class="flex items-center justify-center py-3"
            >
              <div class="flex flex-col items-center gap-2">
                <div class="text-xs text-muted-color">
                  Загружено {{ singleTableRows.length }} из {{ singleTableTotalRows }} команд
                </div>
                <div class="text-xs text-[#4f6b8c]">
                  {{ tableLoadingMore ? 'Загружаем еще команды...' : 'Прокрутите ниже для автодогрузки' }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          v-else-if="
            hasSelectedTournament &&
            tournamentCapabilities.showChessboard &&
            viewType === 'chessboard'
          "
          class="w-full max-w-full overflow-hidden min-h-[65vh]"
        >
          <template v-if="groupTableSections.length">
            <div
              v-for="sec in groupTableSections"
              :key="`ch-${sec.id}`"
              class="space-y-2 mb-6 last:mb-0 w-full max-w-full"
            >
              <h2 class="text-lg font-semibold text-surface-900 px-1">{{ sec.name }}</h2>
              <PublicChessboard :tournament-id="selectedTournamentId" :group-id="sec.id" :team-logos="teamLogoById" />
            </div>
          </template>
          <PublicChessboard v-else :tournament-id="selectedTournamentId" :team-logos="teamLogoById" />
        </div>

        <div
          v-else-if="
            hasSelectedTournament &&
            tournamentCapabilities.showProgress &&
            viewType === 'progress'
          "
          class="w-full max-w-full overflow-hidden min-h-[65vh]"
        >
          <template v-if="groupTableSections.length">
            <div
              v-for="sec in groupTableSections"
              :key="`pr-${sec.id}`"
              class="space-y-2 mb-6 last:mb-0 w-full max-w-full"
            >
              <h2 class="text-lg font-semibold text-surface-900 px-1">{{ sec.name }}</h2>
              <PublicProgress :tournament-id="selectedTournamentId" :group-id="sec.id" :team-logos="teamLogoById" />
            </div>
          </template>
          <PublicProgress v-else :tournament-id="selectedTournamentId" :team-logos="teamLogoById" />
        </div>

        <div
          v-else-if="
            hasSelectedTournament &&
            tournamentCapabilities.showPlayoff &&
            viewType === 'playoff'
          "
          class="overflow-hidden min-h-[65vh]"
        >
          <PublicPlayoff :tournament-id="selectedTournamentId" :team-logos="teamLogoById" />
        </div>
          </Transition>
        </div>
        </div>
    </Transition>
    <div
      v-if="showDebugPanel"
      class="fixed bottom-4 right-4 z-[60] rounded-lg border border-[#d6e0ee] bg-white/95 px-3 py-2 text-[11px] text-[#123c67] shadow-lg backdrop-blur"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="font-semibold">debug: table requests</div>
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
        <div class="text-[#4f6b8c]">view: {{ viewType }}</div>
        <div class="mt-1">detail: {{ debugRequestCounts.details }}</div>
        <div>roster: {{ debugRequestCounts.roster }}</div>
        <div>table: {{ debugRequestCounts.table }}</div>
        <div>tableMore: {{ debugRequestCounts.tableMore }}</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
:deep(.qualifier-cut-row td) {
  border-bottom-width: 2px !important;
  border-bottom-color: #1a5a8c !important;
}

:deep(.podium-row td) {
  background-color: rgba(26, 90, 140, 0.07);
}

.podium-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}

@media (min-width: 640px) {
  .podium-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
  }

  .podium-card--1 {
    order: 2;
    transform: translateY(-0.35rem);
  }

  .podium-card--2 {
    order: 1;
    margin-top: 0.85rem;
  }

  .podium-card--3 {
    order: 3;
    margin-top: 1.15rem;
  }
}

.podium-card {
  position: relative;
  overflow: hidden;
  border: 1px solid #d6e0ee;
  border-radius: 0.9rem;
  background: #fff;
  padding: 0.95rem 1rem;
}

.podium-card::before {
  content: '';
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
  height: 0.28rem;
}

.podium-card__top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.podium-medal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.45rem;
  height: 1.45rem;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.78rem;
}

.podium-card--1 {
  background: linear-gradient(180deg, #fffaf0 0%, #ffffff 58%);
}

.podium-card--1::before {
  background: #f5b701;
}

.podium-card--1 .podium-medal {
  background: #fde68a;
  color: #9a6700;
}

.podium-card--2::before {
  background: #94a3b8;
}

.podium-card--2 .podium-medal {
  background: #e2e8f0;
  color: #475569;
}

.podium-card--3::before {
  background: #d97706;
}

.podium-card--3 .podium-medal {
  background: #fed7aa;
  color: #9a3412;
}

.tournament-facts {
  border: 1px solid #d6e0ee;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 247, 252, 0.85) 100%);
  display: grid;
  gap: 0.55rem;
  grid-template-columns: 1fr;
  padding-top: 0.7rem;
  padding-bottom: 0.7rem;
}

@media (min-width: 768px) {
  .tournament-facts {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.tournament-fact {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.info-card__head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.info-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.55rem;
  height: 1.55rem;
  border-radius: 999px;
  color: #1a5a8c;
  background: #eef5ff;
  border: 1px solid #d2e2f7;
}

.table-team-name {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  line-height: 1.2;
  max-height: 2.4em;
}
</style>


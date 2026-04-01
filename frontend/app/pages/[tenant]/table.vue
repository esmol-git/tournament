<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import type { MatchRow, TableRow, TournamentDetails } from '~/types/tournament-admin'

import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import PublicChessboard from '~/app/components/public/PublicChessboard.vue'
import PublicPlayoff from '~/app/components/public/PublicPlayoff.vue'
import PublicProgress from '~/app/components/public/PublicProgress.vue'
import PublicTournamentSidebar from '~/app/components/public/PublicTournamentSidebar.vue'
import PublicTournamentTabs from '~/app/components/public/PublicTournamentTabs.vue'
import PublicTournamentContextCard from '~/app/components/public/PublicTournamentContextCard.vue'
import { getTournamentCapabilities } from '~/utils/tournamentFormatCapabilities'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { usePublicTournamentSelection } from '~/composables/usePublicTournamentSelection'
import type { PublicTenantMeta } from '~/composables/usePublicTournamentFetch'

definePageMeta({
  layout: 'public',
  path: '/:tenant/tournaments/table',
  alias: ['/:tenant/tournaments', '/:tenant/table'],
})

const route = useRoute()
const router = useRouter()
const { loadAllTournaments, fetchTournamentDetail, fetchTable: fetchTablePublic, fetchTenantMeta, fetchRoster } =
  usePublicTournamentFetch()

const { tenantSlug, selectedTid, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug

const loadingTable = ref(false)
const errorText = ref('')
/** Становится true после первого полного цикла fetch в onMounted — убирает мигание пустого состояния до загрузки. */
const pageReady = ref(false)

const viewType = ref<'table' | 'chessboard' | 'progress' | 'playoff'>('table')
const tableDataLoadedForTid = ref<string | null>(null)
const teamLogosLoadedForTid = ref<string | null>(null)
const teamLogoById = ref<Record<string, string>>({})
const playerById = ref<Record<string, { fullName: string; teamName: string | null; photoUrl: string | null }>>({})
const isInitializing = ref(true)
const detailsRequestId = ref(0)
const tableRequestId = ref(0)
const topStatsSlideIndex = ref(0)
let topStatsSlideTimer: ReturnType<typeof setInterval> | null = null

const tournamentDetails = ref<TournamentDetails | null>(null)
const tenantMeta = ref<PublicTenantMeta | null>(null)
const {
  tournaments,
  selectedTournamentId,
  selectedTournament,
  loading,
  initializeSelectionFromContext,
  fetchTournaments,
} = usePublicTournamentSelection({
  tenant,
  selectedTid,
  loadAllTournaments,
})
/** Несколько групп: отдельная таблица на каждую (только групповой этап). */
const groupTableSections = ref<{ id: string; name: string; rows: TableRow[] }[]>([])
/** Одна группа или без деления — одна таблица. */
const singleTableRows = ref<TableRow[]>([])

const tournamentStatusLabel = computed(() => {
  switch (selectedTournament.value?.status) {
    case 'ACTIVE':
      return 'Идет'
    case 'COMPLETED':
      return 'Завершен'
    case 'ARCHIVED':
      return 'Архив'
    case 'DRAFT':
      return 'Черновик'
    default:
      return 'Не указан'
  }
})

const tournamentStatusBadgeClass = computed(() => {
  switch (selectedTournament.value?.status) {
    case 'ACTIVE':
      return 'bg-[#eef5ff] text-[#1a5a8c] ring-1 ring-[#d2e2f7]'
    case 'COMPLETED':
      return 'bg-[#fff2f7] text-[#b10f46] ring-1 ring-[#f4c8d8]'
    case 'ARCHIVED':
      return 'bg-slate-100 text-slate-700 ring-1 ring-slate-300'
    case 'DRAFT':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
    default:
      return 'bg-surface-100 text-surface-700 ring-1 ring-surface-200'
  }
})

const dateLabel = computed(() => {
  const t = selectedTournament.value
  if (!t) return 'Даты не указаны'
  const s = t.startsAt ? new Date(t.startsAt).toLocaleDateString('ru-RU') : null
  const e = t.endsAt ? new Date(t.endsAt).toLocaleDateString('ru-RU') : null
  if (s && e) return `${s} - ${e}`
  if (s) return `С ${s}`
  if (e) return `До ${e}`
  return 'Даты не указаны'
})

const hasSplitGroups = computed(() => groupTableSections.value.length > 1)

const leader = computed(() => {
  if (hasSplitGroups.value) return null
  return singleTableRows.value[0] ?? null
})

const matchesPlayed = computed(() => {
  if (groupTableSections.value.length) {
    return groupTableSections.value.reduce(
      (sum, sec) => sum + sec.rows.reduce((acc, row) => acc + Number(row.played ?? 0), 0),
      0,
    )
  }
  return singleTableRows.value.reduce((acc, row) => acc + Number(row.played ?? 0), 0)
})

const teamsCountDisplay = computed(() => {
  if (groupTableSections.value.length) {
    return groupTableSections.value.reduce((s, g) => s + g.rows.length, 0)
  }
  return singleTableRows.value.length
})

const groupsCountLabel = computed(() => {
  const count = groupTableSections.value.length
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} группа`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} группы`
  return `${count} групп`
})

const hasSelectedTournament = computed(
  () => !!selectedTournamentId.value && !!selectedTournament.value,
)
const showTournamentSidebar = computed(() => hasSelectedTournament.value)
const tableLayoutClass = computed(() => (showTournamentSidebar.value ? 'public-grid' : 'public-container'))
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

function handleTeamLogoError(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLImageElement)) return
  if (target.src.endsWith(TEAM_PLACEHOLDER_SRC)) return
  target.src = TEAM_PLACEHOLDER_SRC
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
      slots[0].team = finalResult.winner
      slots[1].team = finalResult.loser
    }
    if (thirdResult) {
      slots[2].team = thirdResult.winner
    }
    return slots
  }

  if (!hasSplitGroups.value && singleTableRows.value.length) {
    const sorted = singleTableRows.value.slice().sort((a, b) => a.position - b.position)
    slots[0].team = sorted[0]?.teamName ?? null
    slots[1].team = sorted[1]?.teamName ?? null
    slots[2].team = sorted[2]?.teamName ?? null
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

const currentTopStatsSlide = computed(() => {
  const slides = topStatsSlides.value
  if (!slides.length) return null
  const idx = Math.max(0, Math.min(topStatsSlideIndex.value, slides.length - 1))
  return slides[idx] ?? null
})

function setTopStatsSlide(index: number) {
  const total = topStatsSlides.value.length
  if (!total) return
  topStatsSlideIndex.value = ((index % total) + total) % total
}

function startTopStatsSlider() {
  if (topStatsSlideTimer) clearInterval(topStatsSlideTimer)
  topStatsSlideTimer = setInterval(() => {
    setTopStatsSlide(topStatsSlideIndex.value + 1)
  }, 4500)
}

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

async function fetchTournamentDetails() {
  if (!selectedTournamentId.value) {
    tournamentDetails.value = null
    singleTableRows.value = []
    groupTableSections.value = []
    tableDataLoadedForTid.value = null
    teamLogosLoadedForTid.value = null
    teamLogoById.value = {}
    playerById.value = {}
    return
  }

  errorText.value = ''
  const tid = selectedTournamentId.value
  if (tournamentDetails.value?.id === tid) return
  const reqId = ++detailsRequestId.value
  tableDataLoadedForTid.value = null
  try {
    const detail = await fetchTournamentDetail(tenant.value, tid)
    if (reqId !== detailsRequestId.value || tid !== selectedTournamentId.value) return
    tournamentDetails.value = detail
    if (teamLogosLoadedForTid.value !== tid) {
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

async function fetchTable() {
  if (!selectedTournamentId.value) {
    singleTableRows.value = []
    groupTableSections.value = []
    tournamentDetails.value = null
    tableDataLoadedForTid.value = null
    return
  }

  await fetchTournamentDetails()
  if (!tournamentDetails.value) return

  const tid = selectedTournamentId.value
  if (tableDataLoadedForTid.value === tid) return

  const reqId = ++tableRequestId.value
  loadingTable.value = true
  errorText.value = ''
  try {
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
    } else if (groups.length === 1) {
      singleTableRows.value = await fetchTablePublic(tenant.value, tid, groups[0].id)
      groupTableSections.value = []
    } else {
      singleTableRows.value = await fetchTablePublic(tenant.value, tid)
      groupTableSections.value = []
    }
    if (reqId !== tableRequestId.value || tid !== selectedTournamentId.value) return
    tableDataLoadedForTid.value = tid
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

watch(selectedTournamentId, async () => {
  if (isInitializing.value) return
  tableDataLoadedForTid.value = null
  await fetchTournamentDetails()
  if (viewType.value === 'table') {
    await fetchTable()
  }
  syncTidAndViewToQuery(selectedTournamentId.value || null)
})

watch(
  availableViews,
  (views) => {
    if (!views.length) return
    if (!views.includes(viewType.value)) {
      viewType.value = views[0]
    }
  },
  { immediate: true },
)

watch(viewType, async () => {
  if (isInitializing.value) return
  syncTidAndViewToQuery(selectedTournamentId.value || null)
  if (viewType.value === 'table') {
    await fetchTable()
  }
})

watch(selectedTournamentId, () => {
  topStatsSlideIndex.value = 0
})

onMounted(async () => {
  try {
    await ensureTenantResolved()

    if (tenantNotFound.value) {
      errorText.value = 'Тенант не найден. Проверьте ссылку.'
      return
    }

    // Синхронизируем сегмент `/{tenant}` в URL с реальным tenantSlug в БД,
    // чтобы ссылки внутри публичного сайта не уводили в другой tenant.
    if (String(route.params.tenant ?? '') !== tenant.value) {
      await router.replace({ params: { tenant: tenant.value }, query: route.query })
    }

    initializeSelectionFromContext()
    tenantMeta.value = await fetchTenantMeta(tenant.value)
    const qView = parseQueryView(route.query.view)
    if (qView) viewType.value = qView
    await fetchTournaments({
      onError: (e: any) => {
        singleTableRows.value = []
        groupTableSections.value = []
        const status = e?.response?.status ?? e?.statusCode
        errorText.value =
          status === 404 ? 'Тенант не найден. Проверьте ссылку.' : 'Не удалось загрузить турниры.'
      },
    })
    await fetchTournamentDetails()
    if (viewType.value === 'table') {
      await fetchTable()
    }
  } finally {
    isInitializing.value = false
    pageReady.value = true
    startTopStatsSlider()
  }
})

onBeforeUnmount(() => {
  if (topStatsSlideTimer) {
    clearInterval(topStatsSlideTimer)
    topStatsSlideTimer = null
  }
})
</script>

<template>
  <div class="public-shell">
    <PublicHeader :tenant="tenant" />

    <div :class="tableLayoutClass">
      <div class="space-y-4">
        <div class="public-stage">
        <Transition name="public-fade" mode="out-in">
        <div v-if="showPageSkeleton" key="skeleton" class="space-y-4">
          <div class="public-card">
            <Skeleton width="100%" height="2rem" />
            <Skeleton class="mt-2" width="100%" height="1rem" />
            <Skeleton class="mt-4" width="100%" height="2.75rem" />
          </div>
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

        <div v-else key="content" class="space-y-4">
        <PublicTournamentContextCard
          v-if="hasSelectedTournament"
          v-model="selectedTournamentId"
          :options="tournaments"
          :loading="loading"
          :title="selectedTournament?.name || `Турнир тенанта ${tenant}`"
          :subtitle="dateLabel"
          :status-label="tournamentStatusLabel"
          :status-class="tournamentStatusBadgeClass"
        />

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
          v-if="hasSelectedTournament"
          v-model="viewType"
          :capabilities="tournamentCapabilities"
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
            <strong class="text-[#123c67]">{{ matchesPlayed }}</strong>
          </div>
          <div class="tournament-fact">
            <span class="info-card__icon"><i class="pi pi-trophy text-sm" /></span>
            <span class="text-[#4f6b8c]">Лидер:</span>
            <strong class="truncate text-[#123c67]">
              {{ hasSplitGroups ? 'Отдельно по группам' : (leader?.teamName ?? '—') }}
            </strong>
          </div>
        </div>

        <div
          v-if="
            hasSelectedTournament &&
            tournamentCapabilities.showTable &&
            viewType === 'table'
          "
        >
          <div
            v-if="isMultiGroupStandings && playoffQualifiersPerGroup > 0"
            class="mb-3 rounded-xl border border-[#d2e2f7] bg-[#eef5ff] px-3 py-2 text-sm text-[#1a5a8c]"
          >
            В плей-офф выходят первые {{ playoffQualifiersPerGroup }} из каждой группы (черта после проходной зоны).
          </div>
          <template v-if="groupTableSections.length">
            <div
              v-for="sec in groupTableSections"
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
                <table class="public-table">
                  <thead>
                    <tr>
                      <th class="text-center" style="width: 4rem">#</th>
                      <th class="text-left">Команда</th>
                      <th class="text-center" style="width: 4rem">И</th>
                      <th class="text-center" style="width: 4rem">В</th>
                      <th class="text-center" style="width: 4rem">Н</th>
                      <th class="text-center" style="width: 4rem">П</th>
                      <th class="text-center" style="width: 8rem">Мячи</th>
                      <th class="text-center" style="width: 5rem">+/-</th>
                      <th class="text-center" style="width: 6rem">Очки</th>
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
                          <div class="h-7 w-7 shrink-0 overflow-hidden rounded-full">
                            <img
                              :src="resolveTeamLogo(row.teamId)"
                              :alt="row.teamName"
                              class="h-full w-full object-cover"
                              loading="lazy"
                              @error="handleTeamLogoError"
                            />
                          </div>
                          <span class="font-medium text-surface-900">{{ row.teamName }}</span>
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
          </template>
          <div v-else class="public-table-wrap">
            <div
              v-if="!singleTableRows.length"
              class="py-10 text-center text-muted-color"
            >
              Таблица пока пуста. Матчи еще не сыграны.
            </div>
            <table v-else class="public-table">
              <thead>
                <tr>
                  <th class="text-center" style="width: 4rem">#</th>
                  <th class="text-left">Команда</th>
                  <th class="text-center" style="width: 4rem">И</th>
                  <th class="text-center" style="width: 4rem">В</th>
                  <th class="text-center" style="width: 4rem">Н</th>
                  <th class="text-center" style="width: 4rem">П</th>
                  <th class="text-center" style="width: 8rem">Мячи</th>
                  <th class="text-center" style="width: 5rem">+/-</th>
                  <th class="text-center" style="width: 6rem">Очки</th>
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
                      <div class="h-7 w-7 shrink-0 overflow-hidden rounded-full">
                        <img
                          :src="resolveTeamLogo(row.teamId)"
                          :alt="row.teamName"
                          class="h-full w-full object-cover"
                          loading="lazy"
                          @error="handleTeamLogoError"
                        />
                      </div>
                      <span class="font-medium text-surface-900">{{ row.teamName }}</span>
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

        <div
          v-else-if="
            hasSelectedTournament &&
            tournamentCapabilities.showChessboard &&
            viewType === 'chessboard'
          "
        >
          <template v-if="groupTableSections.length">
            <div
              v-for="sec in groupTableSections"
              :key="`ch-${sec.id}`"
              class="space-y-2 mb-6 last:mb-0"
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
        >
          <template v-if="groupTableSections.length">
            <div
              v-for="sec in groupTableSections"
              :key="`pr-${sec.id}`"
              class="space-y-2 mb-6 last:mb-0"
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
        >
          <PublicPlayoff :tournament-id="selectedTournamentId" :team-logos="teamLogoById" />
        </div>
        </div>
        </Transition>
        </div>
      </div>

      <div v-if="showTournamentSidebar" class="space-y-3">
        <PublicTournamentSidebar
          :tenant="tenant"
          :tid="selectedTournamentId"
          :tournament-name="selectedTournament?.name"
          :social-links="tenantMeta?.socialLinks ?? null"
          :loading="showPageSkeleton"
          active="table"
        />
        <div
          v-if="hasSelectedTournament && currentTopStatsSlide && !showPageSkeleton"
          :class="['public-card stats-slider-card', `stats-slider-card--${currentTopStatsSlide.key}`]"
        >
          <div class="flex items-center gap-2">
            <span class="info-card__icon">
              <i :class="['pi', currentTopStatsSlide.icon, 'text-sm']" />
            </span>
            <p class="text-sm font-semibold text-[#123c67]">{{ currentTopStatsSlide.title }}</p>
          </div>
          <div v-if="currentTopStatsSlide.rows.length" class="mt-2.5 space-y-1.5">
            <div
              v-for="(row, idx) in currentTopStatsSlide.rows"
              :key="`${currentTopStatsSlide.key}-${row.playerId}`"
              class="stats-slide-row"
              :class="row.isPlaceholder ? 'stats-slide-row--placeholder' : ''"
            >
              <span class="stats-slide-rank">{{ idx + 1 }}</span>
              <div class="min-w-0 stats-slide-meta">
                <p class="truncate text-[13px] font-semibold text-[#123c67]">{{ row.fullName }}</p>
                <p
                  class="truncate text-[11px] text-[#4f6b8c]"
                  :class="row.isPlaceholder || !row.teamName || row.teamName === '—' ? 'opacity-0' : ''"
                >
                  {{ row.teamName || '—' }}
                </p>
              </div>
              <span class="stats-slide-value">{{ row.isPlaceholder ? '—' : row.value }}</span>
            </div>
          </div>
          <div class="mt-2.5 flex items-center justify-center gap-1.5">
            <button
              v-for="(slide, idx) in topStatsSlides"
              :key="`dot-${slide.key}`"
              type="button"
              class="stats-dot"
              :class="idx === topStatsSlideIndex ? 'stats-dot--active' : ''"
              :aria-label="`Показать слайд ${idx + 1}`"
              @click="setTopStatsSlide(idx)"
            />
          </div>
        </div>
      </div>
    </div>
    <PublicFooter />
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

.stats-slider-card {
  border: 1px solid #d6e0ee;
  min-height: 8.2rem;
  padding: 0.65rem 0.75rem;
  position: relative;
  overflow: hidden;
}

.stats-slider-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: #c7d6ea;
}

.stats-slider-card--goals::before {
  background: #c80a48;
}

.stats-slider-card--assists::before {
  background: #1a5a8c;
}

.stats-slider-card--yellowCards::before {
  background: #d97706;
}

.stats-slider-card--redCards::before {
  background: #e11d48;
}

.stats-slide-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 0.55rem;
  padding: 0.28rem 0.28rem;
  background: transparent;
  border: 1px solid #edf2fa;
  min-height: 2.9rem;
}

.stats-slide-row--placeholder {
  opacity: 0.62;
}

.stats-slide-meta {
  min-height: 2rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.stats-slide-rank {
  width: 1.3rem;
  height: 1.3rem;
  border-radius: 999px;
  background: #eef5ff;
  color: #1a5a8c;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  flex: 0 0 auto;
}

.stats-slide-value {
  margin-left: auto;
  border-radius: 999px;
  padding: 0.11rem 0.48rem;
  background: #fff2f7;
  color: #c80a48;
  font-weight: 700;
  font-size: 0.75rem;
  line-height: 1;
}

.stats-dot {
  width: 0.36rem;
  height: 0.36rem;
  border-radius: 999px;
  border: 0;
  background: #c7d6ea;
  cursor: pointer;
  transition: all 0.15s ease;
}

.stats-dot--active {
  width: 0.9rem;
  background: #c80a48;
}
</style>


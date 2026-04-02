<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Bracket from 'vue-tournament-bracket'
import type { MatchRow, TournamentDetails } from '~/types/tournament-admin'
import { formatMatchScoreDisplay, statusLabel } from '~/utils/tournamentAdminUi'
import { buildPlayoffSlotLabels } from '~/utils/playoffSlotResolver'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'

const props = defineProps<{
  tournamentId: string
  teamLogos?: Record<string, string>
}>()

const { tenantSlug, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const { fetchTournamentDetail } = usePublicTournamentFetch()

const loading = ref(false)
const loadingMore = ref(false)
const bracketPriming = ref(false)
const isBracketFullscreen = ref(false)
const errorText = ref('')
const detail = ref<TournamentDetails | null>(null)
const matches = computed<MatchRow[]>(() => detail.value?.matches ?? [])
const PLAYOFF_MATCHES_PAGE_SIZE = 50
const loadMoreSentinel = ref<HTMLElement | null>(null)
const bracketViewportEl = ref<HTMLElement | null>(null)
const sentinelIntersecting = ref(false)
let loadMoreObserver: IntersectionObserver | null = null
let detailRequestSeq = 0
const matchesLoaded = computed(() => matches.value.length)
const matchesTotal = computed(() => {
  const total = detail.value?.matchesTotal
  if (typeof total === 'number' && total >= 0) return total
  return matchesLoaded.value
})
const canLoadMoreMatches = computed(
  () =>
    !loading.value &&
    !loadingMore.value &&
    !!props.tournamentId &&
    matchesLoaded.value < matchesTotal.value,
)
const playedMatchesCount = computed(
  () => (matches.value ?? []).filter((m) => m.stage === 'PLAYOFF' && m.homeScore != null && m.awayScore != null)
    .length,
)
const hasPlayoffMatches = computed(() => (matches.value ?? []).some((m) => m.stage === 'PLAYOFF'))
const playoffViewMode = ref<'bracket' | 'list'>('list')
const slotLabelsByMatchId = computed(() =>
  buildPlayoffSlotLabels(detail.value, {
    winnerOfMatch: (n) => `Победитель матча ${n}`,
    loserOfMatch: (n) => `Проигравший матча ${n}`,
  }),
)

function playoffRoundLabel(round?: string | null) {
  switch (round) {
    case 'FINAL':
      return 'Финал'
    case 'THIRD_PLACE':
      return 'Матч за 3 место'
    case 'SEMIFINAL':
      return 'Полуфинал'
    case 'QUARTERFINAL':
      return 'Четвертьфинал'
    default:
      return null
  }
}

const allPlayoffMatchesSorted = computed(() =>
  (matches.value ?? [])
    .filter((m) => m.stage === 'PLAYOFF')
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)),
)

function readPenaltyScore(m: MatchRow): { home: number; away: number } | null {
  for (const e of m.events ?? []) {
    const p = e.payload
    if (!p || p.metaType !== 'PENALTY_SCORE') continue
    const h = p.homeScore
    const a = p.awayScore
    if (typeof h === 'number' && typeof a === 'number') return { home: h, away: a }
  }
  return null
}

function resolvedWinnerSide(m: MatchRow): 'HOME' | 'AWAY' | null {
  if (m.homeScore == null || m.awayScore == null) return null
  if (m.homeScore !== m.awayScore) {
    return m.homeScore > m.awayScore ? 'HOME' : 'AWAY'
  }
  const p = readPenaltyScore(m)
  if (!p || p.home === p.away) return null
  return p.home > p.away ? 'HOME' : 'AWAY'
}

const bracketRounds = computed(() => {
  const playoffMatches = (matches.value ?? [])
    .filter((m) => m.stage === 'PLAYOFF' && m.playoffRound !== 'THIRD_PLACE')
    .slice()
    .sort((a, b) => {
      const ar = Number(a.roundNumber ?? 0)
      const br = Number(b.roundNumber ?? 0)
      if (ar !== br) return ar - br
      return a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)
    })

  const byRound = new Map<number, MatchRow[]>()
  for (const m of playoffMatches) {
    const rn = Number(m.roundNumber ?? 0)
    const arr = byRound.get(rn) ?? []
    arr.push(m)
    byRound.set(rn, arr)
  }
  const roundNumbers = Array.from(byRound.keys()).sort((a, b) => a - b)

  return roundNumbers.map((rn) => {
    const roundMatches = byRound.get(rn) ?? []
    const games = roundMatches.map((m) => {
      const winnerSide = resolvedWinnerSide(m)
      const homeName = displayedTeamName(m, 'home')
      const awayName = displayedTeamName(m, 'away')
      const homeId = displayedTeamId(m, 'home') ?? `slot-home-${m.id}`
      const awayId = displayedTeamId(m, 'away') ?? `slot-away-${m.id}`
      const homeScore = m.homeScore == null ? '-' : String(m.homeScore)
      const awayScore = m.awayScore == null ? '-' : String(m.awayScore)
      return {
        id: m.id,
        player1: {
          id: homeId,
          name: homeName,
          score: homeScore,
          winner: winnerSide === 'HOME' ? true : winnerSide === 'AWAY' ? false : null,
        },
        player2: {
          id: awayId,
          name: awayName,
          score: awayScore,
          winner: winnerSide === 'AWAY' ? true : winnerSide === 'HOME' ? false : null,
        },
        match: m,
        stageTitle: stageLabelForMatch(m),
      }
    })
    return { games, roundNumber: rn }
  })
})

const thirdPlaceMatch = computed(() =>
  (matches.value ?? [])
    .filter((m) => m.stage === 'PLAYOFF' && m.playoffRound === 'THIRD_PLACE')
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))[0] ?? null,
)

const playoffMatchesByRoundNumber = computed(() => {
  const map = new Map<number, MatchRow[]>()
  for (const m of matches.value ?? []) {
    if (m.stage !== 'PLAYOFF') continue
    if (typeof m.roundNumber !== 'number') continue
    const rn = m.roundNumber as number
    const arr = map.get(rn) ?? []
    arr.push(m)
    map.set(rn, arr)
  }
  for (const [rn, arr] of map.entries()) {
    arr.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))
    map.set(rn, arr)
  }
  return map
})

const matchNumberById = computed<Record<string, number>>(() => {
  if (detail.value?.matchNumberById) return detail.value.matchNumberById
  const sorted = (matches.value ?? [])
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))
  const map: Record<string, number> = {}
  for (let i = 0; i < sorted.length; i++) {
    map[sorted[i].id] = i + 1
  }
  return map
})

function playoffSlotLabels(m: MatchRow): { home: string; away: string } | null {
  return slotLabelsByMatchId.value[m.id] ?? null
}

function displayedTeamName(m: MatchRow, side: 'home' | 'away') {
  const labels = playoffSlotLabels(m)
  if (!labels) return side === 'home' ? m.homeTeam.name : m.awayTeam.name
  return side === 'home' ? labels.home : labels.away
}

function displayedTeamId(m: MatchRow, side: 'home' | 'away') {
  const labels = playoffSlotLabels(m)
  if (labels) return null
  return side === 'home' ? m.homeTeam.id : m.awayTeam.id
}

function matchNumberLabel(m: MatchRow) {
  const n = matchNumberById.value[m.id]
  return n ? `Матч #${n}` : 'Матч'
}

function stageLabelForMatch(m: MatchRow) {
  if (m.playoffRound === 'FINAL') return 'Финал'
  if (m.playoffRound === 'THIRD_PLACE') return 'Матч за 3 место'
  const rn = Number(m.roundNumber ?? 0)
  const roundMatchesCount = playoffMatchesByRoundNumber.value.get(rn)?.length ?? 0
  if (roundMatchesCount > 2) return `1/${roundMatchesCount} финала`
  if (roundMatchesCount === 2) return 'Полуфинал'
  if (roundMatchesCount === 1) return 'Финал'
  return `Стадия ${rn || 1}`
}

function extraTimeLabel(m: MatchRow): string | null {
  for (const e of m.events ?? []) {
    const p = e.payload
    if (!p || p.metaType !== 'EXTRA_TIME_SCORE') continue
    const h = p.homeScore
    const a = p.awayScore
    if (typeof h === 'number' && typeof a === 'number') return `ДВ ${h}:${a}`
    return 'ДВ'
  }
  return null
}

function penaltyLabel(m: MatchRow): string | null {
  const p = readPenaltyScore(m)
  if (!p) return null
  return `Пен ${p.home}:${p.away}`
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Дата не назначена'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return 'Дата не назначена'
  return dt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function matchStatusClass(status: MatchRow['status']) {
  switch (status) {
    case 'FINISHED':
      return 'border-[#d2e2f7] bg-[#eef5ff] text-[#1a5a8c]'
    case 'LIVE':
      return 'border-[#f2c5d6] bg-[#fff2f7] text-[#c80a48]'
    case 'SCHEDULED':
      return 'border-[#d6e0ee] bg-[#f4f7fc] text-[#123c67]'
    case 'POSTPONED':
      return 'border-amber-200 bg-amber-50 text-amber-800'
    case 'CANCELLED':
      return 'border-slate-300 bg-slate-100 text-slate-700'
    default:
      return 'border-[#d6e0ee] bg-[#f4f7fc] text-[#123c67]'
  }
}

function teamNameClass(match: MatchRow, side: 'home' | 'away') {
  if (match.homeScore == null || match.awayScore == null) return 'text-[#123c67]'
  const homeWins = Number(match.homeScore) > Number(match.awayScore)
  const awayWins = Number(match.awayScore) > Number(match.homeScore)
  if ((side === 'home' && homeWins) || (side === 'away' && awayWins)) return 'text-[#1a5a8c]'
  return 'text-[#123c67]/75'
}

const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'

function resolveTeamLogo(teamId: string | null | undefined) {
  if (!teamId) return TEAM_PLACEHOLDER_SRC
  const logo = props.teamLogos?.[teamId]
  if (typeof logo === 'string' && logo.trim().length > 0) return logo
  return TEAM_PLACEHOLDER_SRC
}

function handleTeamLogoError(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLImageElement)) return
  if (target.src.endsWith(TEAM_PLACEHOLDER_SRC)) return
  target.src = TEAM_PLACEHOLDER_SRC
}

function initLoadMoreObserver() {
  loadMoreObserver?.disconnect()
  loadMoreObserver = null
  sentinelIntersecting.value = false
  if (playoffViewMode.value !== 'list') return
  if (typeof window === 'undefined') return
  if (!loadMoreSentinel.value) return
  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      const isIntersecting = entries.some((entry) => entry.isIntersecting)
      const becameVisible = isIntersecting && !sentinelIntersecting.value
      sentinelIntersecting.value = isIntersecting
      if (becameVisible && canLoadMoreMatches.value) {
        void loadMore()
      }
    },
    { root: null, rootMargin: '400px 0px', threshold: 0.01 },
  )
  loadMoreObserver.observe(loadMoreSentinel.value)
}

function syncBracketFullscreenState() {
  if (typeof document === 'undefined') return
  const target = bracketViewportEl.value
  if (!target) {
    isBracketFullscreen.value = false
    return
  }
  const active = document.fullscreenElement
  isBracketFullscreen.value = !!active && (active === target || target.contains(active))
}

async function toggleBracketFullscreen() {
  if (typeof document === 'undefined') return
  const target = bracketViewportEl.value
  if (!target) return
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await target.requestFullscreen()
    }
  } catch {
    // ignore fullscreen API failures (browser policies / permissions)
  }
}

async function load() {
  const reqSeq = ++detailRequestSeq
  errorText.value = ''
  detail.value = null
  if (!props.tournamentId) return

  await ensureTenantResolved()
  if (tenantNotFound.value) {
    errorText.value = 'Тенант не найден. Проверьте ссылку.'
    return
  }
  loading.value = true
  try {
    const nextDetail =
      playoffViewMode.value === 'bracket'
        ? await fetchTournamentDetail(tenant.value, props.tournamentId, {
          stage: 'PLAYOFF',
        })
        : await fetchTournamentDetail(tenant.value, props.tournamentId, {
          stage: 'PLAYOFF',
          matchesOffset: 0,
          matchesLimit: PLAYOFF_MATCHES_PAGE_SIZE,
        })
    if (reqSeq !== detailRequestSeq) return
    detail.value = nextDetail
  } catch {
    if (reqSeq !== detailRequestSeq) return
    errorText.value = 'Не удалось загрузить плей-офф.'
  } finally {
    if (reqSeq !== detailRequestSeq) return
    loading.value = false
  }
  if (playoffViewMode.value === 'list') {
    await nextTick()
    initLoadMoreObserver()
  }
}

async function loadMore(limit: number = PLAYOFF_MATCHES_PAGE_SIZE) {
  if (!canLoadMoreMatches.value || !detail.value) return
  const reqSeq = ++detailRequestSeq
  loadingMore.value = true
  try {
    const current = detail.value
    const pageSize = Math.max(1, Math.min(200, Number(limit) || PLAYOFF_MATCHES_PAGE_SIZE))
    const page = await fetchTournamentDetail(tenant.value, props.tournamentId, {
      stage: 'PLAYOFF',
      matchesOffset: current.matches.length,
      matchesLimit: pageSize,
    })
    if (reqSeq !== detailRequestSeq) return
    const mergedById = new Map<string, MatchRow>()
    for (const m of current.matches ?? []) mergedById.set(m.id, m)
    for (const m of page.matches ?? []) mergedById.set(m.id, m)
    const mergedMatches = Array.from(mergedById.values()).sort(
      (a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id),
    )
    detail.value = {
      ...current,
      ...page,
      matches: mergedMatches,
      matchesTotal:
        typeof page.matchesTotal === 'number'
          ? page.matchesTotal
          : current.matchesTotal ?? mergedMatches.length,
    }
  } finally {
    if (reqSeq === detailRequestSeq) loadingMore.value = false
  }
  if (playoffViewMode.value === 'list') {
    await nextTick()
    initLoadMoreObserver()
  }
}

async function ensureBracketFullyLoaded() {
  if (playoffViewMode.value !== 'bracket') return
  if (bracketPriming.value || loading.value) return
  if ((detail.value?.matchesTotal ?? 0) > 0 && (detail.value?.matches.length ?? 0) >= (detail.value?.matchesTotal ?? 0)) {
    return
  }
  const reqSeq = ++detailRequestSeq
  bracketPriming.value = true
  try {
    const fullDetail = await fetchTournamentDetail(tenant.value, props.tournamentId, {
      stage: 'PLAYOFF',
    })
    if (reqSeq !== detailRequestSeq) return
    detail.value = fullDetail
  } finally {
    if (reqSeq === detailRequestSeq) bracketPriming.value = false
  }
}

watch(
  () => props.tournamentId,
  () => {
    void load()
  },
  { immediate: true },
)

watch(loadMoreSentinel, () => {
  initLoadMoreObserver()
})

watch(playoffViewMode, (mode) => {
  initLoadMoreObserver()
  if (mode === 'bracket') {
    void ensureBracketFullyLoaded()
  }
})

watch(
  () => detail.value?.id,
  () => {
    if (playoffViewMode.value === 'bracket') {
      void ensureBracketFullyLoaded()
    }
  },
)

onBeforeUnmount(() => {
  loadMoreObserver?.disconnect()
  loadMoreObserver = null
  if (typeof document !== 'undefined') {
    document.removeEventListener('fullscreenchange', syncBracketFullscreenState)
  }
})

onMounted(() => {
  if (typeof document !== 'undefined') {
    document.addEventListener('fullscreenchange', syncBracketFullscreenState)
  }
})
</script>

<template>
  <div class="rounded-2xl border border-[#b7c7dd] bg-white p-4">
    <div class="rounded-xl border border-[#d6e0ee] bg-gradient-to-r from-[#f5f9ff] to-[#fff4f8] px-4 py-3">
      <div class="text-sm font-semibold text-[#123c67]">Плей-офф</div>
      <div class="mt-1 text-xs text-[#4f6b8c]">
        Матчи на вылет вынесены отдельно от группового этапа.
      </div>
    </div>

    <div v-if="errorText" class="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
      {{ errorText }}
    </div>
    <div v-else-if="loading" class="mt-4 space-y-4">
      <section
        v-for="i in 2"
        :key="`playoff-sk-${i}`"
        class="overflow-hidden rounded-xl border border-[#d6e0ee]"
      >
        <header class="border-b border-[#d6e0ee] bg-[#f4f7fc] px-4 py-3">
          <Skeleton width="7rem" height="0.95rem" />
        </header>
        <div class="space-y-0">
          <article
            v-for="j in 2"
            :key="`playoff-sk-match-${i}-${j}`"
            class="grid grid-cols-1 items-center gap-2 border-b border-[#e1e8f2] px-4 py-3 md:grid-cols-[1fr_auto_1fr_auto_auto]"
          >
            <Skeleton width="8rem" height="1rem" />
            <Skeleton width="3rem" height="1rem" />
            <Skeleton width="8rem" height="1rem" class="md:ml-auto" />
            <Skeleton width="7.5rem" height="0.9rem" />
            <Skeleton width="5.5rem" height="1.6rem" borderRadius="999px" />
          </article>
        </div>
      </section>
    </div>
    <div
      v-else-if="!hasPlayoffMatches"
      class="mt-4 rounded-xl border border-[#b7c7dd] bg-[#f8fbff] p-5 text-center text-[#4f6b8c]"
    >
      Сетка плей-офф пока не сформирована.
    </div>

    <div v-else class="mt-4 space-y-4">
      <div class="rounded-xl border border-[#d6e0ee] bg-white p-2">
        <div class="flex items-center justify-between gap-2">
          <div class="inline-flex rounded-xl border border-surface-200 bg-surface-0 p-1">
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              :class="playoffViewMode === 'list' ? 'bg-[#eef5ff] text-[#1a5a8c]' : 'text-[#4f6b8c] hover:bg-surface-50'"
              @click="playoffViewMode = 'list'"
            >
              Все матчи
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              :class="playoffViewMode === 'bracket' ? 'bg-[#eef5ff] text-[#1a5a8c]' : 'text-[#4f6b8c] hover:bg-surface-50'"
              @click="playoffViewMode = 'bracket'"
            >
              Сетка
            </button>
          </div>
          <button
            v-if="playoffViewMode === 'bracket'"
            type="button"
            class="rounded-lg border border-[#d6e0ee] bg-white px-3 py-1.5 text-xs font-semibold text-[#123c67] transition-colors hover:bg-[#f4f7fc]"
            @click="toggleBracketFullscreen"
          >
            {{ isBracketFullscreen ? 'Свернуть' : 'На весь экран' }}
          </button>
        </div>
      </div>
      <div
        v-if="playedMatchesCount === 0"
        class="rounded-lg border border-[#d6e0ee] bg-[#f4f7fc] px-3 py-2 text-xs text-[#4f6b8c]"
      >
        Матчи плей-офф пока не сыграны. Результаты появятся после завершения игр.
      </div>
      <template v-if="playoffViewMode === 'bracket'">
        <section class="overflow-hidden rounded-xl border border-[#b7c7dd]">
          <header class="border-b border-[#d6e0ee] bg-[#f4f7fc] px-4 py-3">
            <h3 class="text-sm font-semibold text-[#123c67]">Сетка плей-офф по стадиям</h3>
            <div class="mt-1 text-xs text-[#4f6b8c]">
              Сыграно {{ playedMatchesCount }} из {{ matchesTotal }} матчей
            </div>
          </header>
          <div class="bg-[#f8fbff] p-2">
            <div
              v-if="canLoadMoreMatches || loadingMore || bracketPriming"
              class="mb-2 text-xs text-[#4f6b8c]"
            >
              Подготавливаем полную сетку...
            </div>
            <div ref="bracketViewportEl" class="bracket-left-fit" :class="{ 'is-fullscreen': isBracketFullscreen }">
              <div class="bracket-scroll bracket-tree-scroll">
                <ClientOnly>
                  <Bracket :rounds="bracketRounds">
                    <template #player="{ player }">
                      <span class="flex w-full items-center justify-between gap-2 text-xs">
                        <span class="truncate">{{ player.name }}</span>
                        <span class="shrink-0 font-semibold text-[#1a5a8c]">{{ player.score }}</span>
                      </span>
                    </template>
                    <template #player-extension-bottom="{ match }">
                      <div class="flex flex-wrap items-center gap-1.5 px-1 pb-1">
                        <span class="rounded border border-[#d6e0ee] bg-[#f4f7fc] px-1.5 py-0.5 text-[9px] text-[#4f6b8c]">
                          {{ match.stageTitle }}
                        </span>
                        <span class="text-[9px] text-[#4f6b8c]">
                          {{ matchNumberLabel(match.match) }}
                        </span>
                        <span
                          v-if="extraTimeLabel(match.match)"
                          class="rounded border border-[#d6e0ee] bg-white px-1.5 py-0.5 text-[9px] text-[#4f6b8c]"
                        >
                          {{ extraTimeLabel(match.match) }}
                        </span>
                        <span
                          v-if="penaltyLabel(match.match)"
                          class="rounded border border-[#d6e0ee] bg-white px-1.5 py-0.5 text-[9px] text-[#4f6b8c]"
                        >
                          {{ penaltyLabel(match.match) }}
                        </span>
                      </div>
                    </template>
                  </Bracket>
                  <template #fallback>
                    <div class="text-sm text-[#4f6b8c]">Загрузка сетки...</div>
                  </template>
                </ClientOnly>
                <div class="mt-3 max-w-[220px] rounded-lg border border-[#dce5f2] bg-white p-2 text-xs text-[#123c67]">
                  <div class="mb-1 font-semibold">Матч за 3 место</div>
                  <template v-if="thirdPlaceMatch">
                    <div class="flex items-center justify-between gap-2">
                      <span class="truncate">{{ displayedTeamName(thirdPlaceMatch, 'home') }}</span>
                      <span class="font-semibold text-[#1a5a8c]">{{ thirdPlaceMatch.homeScore ?? '-' }}</span>
                    </div>
                    <div class="mt-0.5 flex items-center justify-between gap-2">
                      <span class="truncate">{{ displayedTeamName(thirdPlaceMatch, 'away') }}</span>
                      <span class="font-semibold text-[#1a5a8c]">{{ thirdPlaceMatch.awayScore ?? '-' }}</span>
                    </div>
                    <div class="mt-1 text-[10px] text-[#4f6b8c]">
                      {{ matchNumberLabel(thirdPlaceMatch) }}
                    </div>
                  </template>
                  <div v-else class="text-[10px] text-[#4f6b8c]">
                    Для этого турнира матч за 3 место не создан.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </template>
      <section
        v-else
        class="overflow-hidden rounded-xl border border-[#b7c7dd]"
      >
        <header class="border-b border-[#d6e0ee] bg-[#f4f7fc] px-4 py-3">
          <h3 class="text-sm font-semibold text-[#123c67]">Все матчи плей-офф</h3>
        </header>
        <div class="space-y-2 bg-[#f8fbff] p-2">
          <article
            v-for="m in allPlayoffMatchesSorted"
            :key="`list-${m.id}`"
            class="rounded-lg border border-[#dce5f2] bg-white px-3 py-3 shadow-[0_1px_0_rgba(18,60,103,0.03)]"
          >
            <div class="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <div class="flex min-w-0 items-center gap-2" :class="teamNameClass(m, 'home')">
                <div class="h-8 w-8 shrink-0 overflow-hidden rounded-full">
                  <img
                    :src="resolveTeamLogo(displayedTeamId(m, 'home'))"
                    :alt="displayedTeamName(m, 'home')"
                    class="h-full w-full object-cover"
                    loading="lazy"
                    @error="handleTeamLogoError"
                  />
                </div>
                <span class="truncate text-base font-semibold">{{ displayedTeamName(m, 'home') }}</span>
              </div>
              <div
                class="inline-flex items-center justify-center rounded-full border border-[#d2e2f7] bg-[#eef5ff] px-3 py-1 text-sm font-bold text-[#1a5a8c]"
              >
                {{ formatMatchScoreDisplay(m) }}
              </div>
              <div class="flex min-w-0 items-center gap-2 md:justify-end" :class="teamNameClass(m, 'away')">
                <span class="truncate text-base font-semibold md:text-right">{{ displayedTeamName(m, 'away') }}</span>
                <div class="h-8 w-8 shrink-0 overflow-hidden rounded-full">
                  <img
                    :src="resolveTeamLogo(displayedTeamId(m, 'away'))"
                    :alt="displayedTeamName(m, 'away')"
                    class="h-full w-full object-cover"
                    loading="lazy"
                    @error="handleTeamLogoError"
                  />
                </div>
              </div>
            </div>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#eef3fa] pt-2">
              <div class="flex items-center gap-2 text-xs text-[#4f6b8c]">
                <span class="rounded-full border border-[#d6e0ee] bg-[#f4f7fc] px-2 py-0.5 font-semibold text-[#123c67]">
                  {{ matchNumberLabel(m) }}
                </span>
                <span>{{ formatDateTime(m.startTime) }}</span>
              </div>
              <span
                class="inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold"
                :class="matchStatusClass(m.status)"
              >
                {{ statusLabel(m.status) }}
              </span>
            </div>
          </article>
        </div>
      </section>
      <div
        v-if="playoffViewMode === 'list' && (canLoadMoreMatches || loadingMore)"
        ref="loadMoreSentinel"
        class="flex flex-col items-center justify-center gap-2 py-2"
      >
        <div class="text-xs text-[#4f6b8c]">
          Загружено {{ matchesLoaded }} из {{ matchesTotal }} матчей
        </div>
        <div class="text-xs text-[#4f6b8c]">
          {{ loadingMore ? 'Загружаем еще матчи...' : 'Прокрутите ниже для автодогрузки' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bracket-left-fit {
  width: min(100%, 760px);
  max-width: 760px;
}

.bracket-left-fit.is-fullscreen {
  width: 100%;
  max-width: 100%;
  background: #f8fbff;
  padding: 0.5rem;
}

.bracket-scroll {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 0.5rem;
}

.bracket-tree-scroll {
  max-height: min(72vh, 760px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.bracket-left-fit.is-fullscreen .bracket-tree-scroll {
  max-height: calc(100vh - 120px);
}

:deep(.vtb-wrapper) {
  min-width: max-content;
  padding: 0 0.2rem 0.2rem;
}

:deep(.vtb-item-players) {
  width: 200px;
  border-radius: 8px;
  border: 1px solid #d6e0ee;
  background: #fff;
  overflow: hidden;
}

:deep(.vtb-item-players .vtb-player) {
  padding: 4px 6px !important;
  font-size: 11px;
  line-height: 1.2;
  color: #123c67;
}

:deep(.vtb-item-players .winner) {
  background: #eef5ff !important;
  color: #1a5a8c !important;
}

:deep(.vtb-item-players .defeated) {
  background: #f6f8fb !important;
  color: #123c67 !important;
}

:deep(.vtb-item-child:before),
:deep(.vtb-item-parent:after),
:deep(.vtb-item-child:after) {
  background-color: #b7c7dd !important;
}

:deep(.vtb-item-child) {
  margin-top: 6px !important;
  margin-bottom: 6px !important;
}

:deep(.vtb-item-child:after) {
  height: calc(50% + 18px) !important;
}

@media (max-width: 768px) {
  .bracket-left-fit {
    width: 100%;
    max-width: 100%;
  }

  :deep(.vtb-item-players) {
    width: 170px;
  }
}
</style>

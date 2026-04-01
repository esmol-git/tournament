<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import type { TournamentDetails, CalendarRound, CalendarViewMode, TableRow } from '~/types/tournament-admin'
import { buildCalendarRoundsFromMatches } from '~/utils/tournamentMatchCalendar'
import { formatMatchScoreDisplay, statusLabel } from '~/utils/tournamentAdminUi'

import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import PublicTournamentSidebar from '~/app/components/public/PublicTournamentSidebar.vue'
import PublicTournamentContextCard from '~/app/components/public/PublicTournamentContextCard.vue'
import { usePublicTournamentSelection } from '~/composables/usePublicTournamentSelection'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import type { PublicTenantMeta } from '~/composables/usePublicTournamentFetch'

definePageMeta({
  layout: 'public',
  path: '/:tenant/tournaments/calendar',
  alias: ['/:tenant/calendar'],
})

const { loadAllTournaments, fetchTournamentDetail, fetchTenantMeta, fetchRoster, fetchTable } = usePublicTournamentFetch()

const { tenantSlug, selectedTid, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const errorText = ref('')
const pageReady = ref(false)
const isInitializing = ref(true)

const tenantMeta = ref<PublicTenantMeta | null>(null)
const {
  tournaments,
  selectedTournamentId,
  selectedTournament,
  loading,
  syncTidToQuery,
  initializeSelectionFromContext,
  fetchTournaments,
} = usePublicTournamentSelection({
  tenant,
  selectedTid,
  loadAllTournaments,
})

const calendarLoading = ref(false)
const calendarRounds = ref<CalendarRound[]>([])
const calendarRequestId = ref(0)
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
const sidebarStandingsPreview = ref<Array<{ teamId: string; teamName: string; points: number; played: number; goalDiff: number; logoUrl: string | null }>>([])
const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'

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

function sideLabel(side?: 'HOME' | 'AWAY' | null) {
  if (side === 'HOME') return 'Хозяева'
  if (side === 'AWAY') return 'Гости'
  return '—'
}

function eventMinuteLabel(minute?: number | null) {
  if (minute == null) return '—'
  return `${minute}'`
}

function playerNameByEvent(event: TournamentDetails['matches'][number]['events'][number]) {
  const id = String(event.playerId ?? '').trim()
  if (!id) return 'Игрок не указан'
  return playerNameById.value[id] ?? 'Игрок'
}

function sideBadgeClass(side?: 'HOME' | 'AWAY' | null) {
  if (side === 'HOME') return 'bg-[#eef5ff] text-[#1a5a8c]'
  if (side === 'AWAY') return 'bg-[#fff2f7] text-[#b10f46]'
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

function handleTeamLogoError(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLImageElement)) return
  if (target.src.endsWith(TEAM_PLACEHOLDER_SRC)) return
  target.src = TEAM_PLACEHOLDER_SRC
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

async function fetchCalendar() {
  if (!selectedTournamentId.value) {
    calendarRounds.value = []
    teamLogoById.value = {}
    playerNameById.value = {}
    sidebarStandingsPreview.value = []
    return
  }

  const tid = selectedTournamentId.value
  const reqId = ++calendarRequestId.value
  calendarLoading.value = true
  errorText.value = ''
  try {
    const [res, roster, tableRows] = await Promise.all([
      fetchTournamentDetail(tenant.value, tid),
      fetchRoster(tenant.value, tid),
      fetchTable(tenant.value, tid),
    ])
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
    sidebarStandingsPreview.value = (tableRows as TableRow[])
      .slice()
      .sort(
        (a, b) =>
          Number(b.points ?? 0) - Number(a.points ?? 0) ||
          Number(b.goalDiff ?? 0) - Number(a.goalDiff ?? 0) ||
          Number(b.goalsFor ?? 0) - Number(a.goalsFor ?? 0),
      )
      .slice(0, 3)
      .map((row) => ({
        teamId: row.teamId,
        teamName: row.teamName,
        points: Number(row.points ?? 0),
        played: Number(row.played ?? 0),
        goalDiff: Number(row.goalDiff ?? 0),
        logoUrl: nextMap[row.teamId] ?? null,
      }))

    calendarRounds.value = buildCalendarRoundsFromMatches(
      res.matches ?? [],
      res.groups ?? [],
    )
  } catch {
    if (reqId !== calendarRequestId.value || tid !== selectedTournamentId.value) return
    calendarRounds.value = []
    errorText.value = 'Не удалось загрузить календарь матчей.'
  } finally {
    if (reqId === calendarRequestId.value) {
      calendarLoading.value = false
    }
  }
}

watch(selectedTournamentId, () => {
  if (isInitializing.value) return
  void fetchCalendar()
  syncTidToQuery(selectedTournamentId.value || null)
})

onMounted(async () => {
  try {
    await ensureTenantResolved()

    if (tenantNotFound.value) {
      errorText.value = 'Тенант не найден. Проверьте ссылку.'
      return
    }

    initializeSelectionFromContext()
    tenantMeta.value = await fetchTenantMeta(tenant.value)
    await fetchTournaments({
      onError: (e: any) => {
        calendarRounds.value = []
        const status = e?.response?.status ?? e?.statusCode
        errorText.value =
          status === 404 ? 'Тенант не найден. Проверьте ссылку.' : 'Не удалось загрузить турниры.'
      },
    })
    await fetchCalendar()
  } finally {
    isInitializing.value = false
    pageReady.value = true
  }
})
</script>

<template>
  <div class="public-shell">
    <PublicHeader :tenant="tenant" />

    <div class="public-grid">
      <div class="space-y-4">
        <div class="public-stage">
        <Transition name="public-fade" mode="out-in">
        <div v-if="showPageSkeleton" key="skeleton" class="space-y-4">
          <div class="public-card">
            <Skeleton width="46%" height="2rem" />
            <Skeleton class="mt-2" width="34%" height="1rem" />
            <Skeleton class="mt-4" width="100%" height="2.75rem" />
          </div>
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

        <div v-else key="content" class="space-y-4">
        <PublicTournamentContextCard
          v-model="selectedTournamentId"
          :options="tournaments"
          :loading="loading"
          :title="selectedTournament?.name || `Турнир тенанта ${tenant}`"
          :subtitle="dateLabel"
          :status-label="tournamentStatusLabel"
          :status-class="tournamentStatusBadgeClass"
        />

        <div v-if="errorText" class="public-error">
          {{ errorText }}
        </div>

        <div v-else class="space-y-4">
          <div v-if="calendarLoading" class="public-card">
            <div class="space-y-3">
              <Skeleton width="42%" height="1rem" />
              <Skeleton width="30%" height="0.9rem" />
              <Skeleton width="100%" height="3.2rem" />
              <Skeleton width="100%" height="3.2rem" />
            </div>
          </div>

          <div
            v-else-if="!calendarRounds.length"
            class="public-empty"
          >
            В календаре пока нет матчей.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="r in calendarRounds"
              :key="r.key"
              class="rounded-2xl border border-surface-200 bg-surface-0 p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="font-semibold text-surface-900">{{ r.title }}</div>
                  <div class="text-sm text-muted-color">{{ r.dateLabel }}</div>
                </div>
                <div class="text-xs text-muted-color">
                  {{ r.matches.length }} {{ r.matches.length === 1 ? 'матч' : 'матча' }}
                </div>
              </div>

              <div class="mt-3 space-y-2">
                <div
                  v-for="m in r.matches"
                  :key="m.id"
                  class="rounded-xl border border-surface-200 bg-surface-0 px-3 py-2 transition-colors hover:bg-[#eef5ff]"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2 text-sm font-medium">
                        <div class="h-7 w-7 shrink-0 overflow-hidden rounded-full">
                          <img
                            :src="resolveTeamLogo(m.homeTeam.id)"
                            :alt="m.homeTeam.name"
                            class="h-full w-full object-cover"
                            loading="lazy"
                            @error="handleTeamLogoError"
                          />
                        </div>
                        <span class="truncate">{{ m.homeTeam.name }}</span>
                        <span class="shrink-0 text-[#4f6b8c]">vs</span>
                        <div class="h-7 w-7 shrink-0 overflow-hidden rounded-full">
                          <img
                            :src="resolveTeamLogo(m.awayTeam.id)"
                            :alt="m.awayTeam.name"
                            class="h-full w-full object-cover"
                            loading="lazy"
                            @error="handleTeamLogoError"
                          />
                        </div>
                        <span class="truncate">{{ m.awayTeam.name }}</span>
                      </div>
                      <div class="text-xs text-muted-color">
                        {{
                          new Date(m.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                        }}
                        <span v-if="m.stage">· {{ m.stage === 'GROUP' ? 'Группа' : 'Плей-офф' }}</span>
                      </div>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                      <div class="text-sm font-semibold">
                        <template v-if="m.homeScore != null && m.awayScore != null">
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
            </div>
          </div>
        </div>
        </div>
        </Transition>
        </div>
      </div>

      <PublicTournamentSidebar
        :tenant="tenant"
        :tid="selectedTournamentId"
        :tournament-name="selectedTournament?.name"
        :social-links="tenantMeta?.socialLinks ?? null"
      :standings-preview="sidebarStandingsPreview"
        :loading="showPageSkeleton"
        active="calendar"
      />
    </div>
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
          <TabPanel header="Общая">
            <div class="space-y-3">
              <div class="rounded-xl border border-[#d6e0ee] bg-white p-3">
                <div class="text-xs text-[#4f6b8c]">Счет</div>
                <div class="mt-1 text-xl font-semibold text-[#123c67]">{{ formatMatchScoreDisplay(selectedMatchForStats) }}</div>
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

          <TabPanel header="Голы">
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

          <TabPanel header="Карточки">
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
                </div>
                <span class="rounded-full px-2 py-0.5 text-xs" :class="sideBadgeClass(e.teamSide)">
                  {{ sideLabel(e.teamSide) }}
                </span>
              </div>
            </div>
          </TabPanel>

          <TabPanel header="Замены">
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
    <PublicFooter />
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


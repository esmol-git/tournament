<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MatchRow } from '~/types/tournament-admin'
import { formatMatchScoreDisplay, statusLabel } from '~/utils/tournamentAdminUi'
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
const errorText = ref('')
const matches = ref<MatchRow[]>([])
const playedMatchesCount = computed(
  () => (matches.value ?? []).filter((m) => m.stage === 'PLAYOFF' && m.homeScore != null && m.awayScore != null)
    .length,
)

type PlayoffSection = {
  key: string
  title: string
  matches: MatchRow[]
  sortRank: number
}

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

function sectionTitleFor(matchesInSection: MatchRow[], roundNumber: number) {
  const explicit = matchesInSection[0]?.playoffRound ?? null
  const explicitLabel = playoffRoundLabel(explicit)
  if (explicit === 'FINAL' || explicit === 'THIRD_PLACE') return explicitLabel as string

  const byCount = matchesInSection.length
  if (byCount === 2) return 'Полуфинал'
  if (byCount === 4) return 'Четвертьфинал'
  if (byCount === 8) return '1/8 финала'
  return `Раунд ${roundNumber || 1}`
}

function sectionSortRank(matchesInSection: MatchRow[], roundNumber: number) {
  const explicit = matchesInSection[0]?.playoffRound ?? null
  if (explicit === 'FINAL') return 10_000
  if (explicit === 'THIRD_PLACE') return 9_000
  return roundNumber
}

const playoffSections = computed<PlayoffSection[]>(() => {
  const playoffMatches = (matches.value ?? []).filter((m) => m.stage === 'PLAYOFF')
  const buckets = new Map<string, MatchRow[]>()

  for (const m of playoffMatches) {
    const roundNumber = m.roundNumber ?? 0
    const roundKey = m.playoffRound ?? `ROUND_${roundNumber}`
    const key = `${roundNumber}:${roundKey}`
    const arr = buckets.get(key) ?? []
    arr.push(m)
    buckets.set(key, arr)
  }

  const sections: PlayoffSection[] = []
  for (const [key, bucket] of buckets.entries()) {
    const [roundStr] = key.split(':')
    const roundNumber = Number(roundStr) || 0
    sections.push({
      key,
      title: sectionTitleFor(bucket, roundNumber),
      matches: bucket
        .slice()
        .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)),
      sortRank: sectionSortRank(bucket, roundNumber),
    })
  }

  return sections.sort((a, b) => a.sortRank - b.sortRank || a.key.localeCompare(b.key))
})

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

async function load() {
  errorText.value = ''
  matches.value = []
  if (!props.tournamentId) return

  await ensureTenantResolved()
  if (tenantNotFound.value) {
    errorText.value = 'Тенант не найден. Проверьте ссылку.'
    return
  }
  loading.value = true
  try {
    const detail = await fetchTournamentDetail(tenant.value, props.tournamentId)
    matches.value = detail.matches ?? []
  } catch {
    errorText.value = 'Не удалось загрузить плей-офф.'
  } finally {
    loading.value = false
  }
}

watch(
  () => props.tournamentId,
  () => {
    void load()
  },
  { immediate: true },
)
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
      v-else-if="!playoffSections.length"
      class="mt-4 rounded-xl border border-[#b7c7dd] bg-[#f8fbff] p-5 text-center text-[#4f6b8c]"
    >
      Сетка плей-офф пока не сформирована.
    </div>

    <div v-else class="mt-4 space-y-4">
      <div
        v-if="playedMatchesCount === 0"
        class="rounded-lg border border-[#d6e0ee] bg-[#f4f7fc] px-3 py-2 text-xs text-[#4f6b8c]"
      >
        Матчи плей-офф пока не сыграны. Результаты появятся после завершения игр.
      </div>
      <section v-for="section in playoffSections" :key="section.key" class="overflow-hidden rounded-xl border border-[#b7c7dd]">
        <header class="border-b border-[#d6e0ee] bg-[#f4f7fc] px-4 py-3">
          <h3 class="text-sm font-semibold text-[#123c67]">{{ section.title }}</h3>
        </header>
        <div class="space-y-2 bg-[#f8fbff] p-2">
          <article
            v-for="m in section.matches"
            :key="m.id"
            class="rounded-lg border border-[#dce5f2] bg-white px-3 py-3 shadow-[0_1px_0_rgba(18,60,103,0.03)]"
          >
            <div class="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <div class="flex min-w-0 items-center gap-2" :class="teamNameClass(m, 'home')">
                <div class="h-8 w-8 shrink-0 overflow-hidden rounded-full">
                  <img
                    :src="resolveTeamLogo(m.homeTeam.id)"
                    :alt="m.homeTeam.name"
                    class="h-full w-full object-cover"
                    loading="lazy"
                    @error="handleTeamLogoError"
                  />
                </div>
                <span class="truncate text-base font-semibold">{{ m.homeTeam.name }}</span>
              </div>
              <div
                class="inline-flex items-center justify-center rounded-full border border-[#d2e2f7] bg-[#eef5ff] px-3 py-1 text-sm font-bold text-[#1a5a8c]"
              >
                {{ formatMatchScoreDisplay(m) }}
              </div>
              <div class="flex min-w-0 items-center gap-2 md:justify-end" :class="teamNameClass(m, 'away')">
                <span class="truncate text-base font-semibold md:text-right">{{ m.awayTeam.name }}</span>
                <div class="h-8 w-8 shrink-0 overflow-hidden rounded-full">
                  <img
                    :src="resolveTeamLogo(m.awayTeam.id)"
                    :alt="m.awayTeam.name"
                    class="h-full w-full object-cover"
                    loading="lazy"
                    @error="handleTeamLogoError"
                  />
                </div>
              </div>
            </div>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#eef3fa] pt-2">
              <div class="text-xs text-[#4f6b8c]">{{ formatDateTime(m.startTime) }}</div>
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
    </div>
  </div>
</template>

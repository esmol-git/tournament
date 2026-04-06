<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'

import type { MatchRow, TableRow } from '~/types/tournament-admin'
import {
  arePublicTableAndDetailFresh,
  getCachedTableAndTournamentDetail,
} from '~/composables/public/readPublicTournamentViewCache'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { isMatchCountedInPublicStandings } from '~/utils/publicTournamentStandingsMatch'

const props = defineProps<{
  tournamentId: string
  groupId?: string | null
  teamLogos?: Record<string, string>
}>()

const { tenantSlug, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const { fetchTable, fetchTournamentDetail } = usePublicTournamentFetch()
const queryClient = useQueryClient()

const loading = ref(!!props.tournamentId)
const errorText = ref('')

const rows = ref<TableRow[]>([])
const matches = ref<MatchRow[]>([])

const sortedRows = computed(() => rows.value.slice().sort((a, b) => a.position - b.position))
const groupStageMatches = computed(() =>
  (matches.value ?? []).filter((m) => {
    if (m.stage === 'PLAYOFF') return false
    if (props.groupId) return m.groupId === props.groupId
    return true
  }),
)

const playedMatchesCount = computed(() =>
  groupStageMatches.value.filter(isMatchCountedInPublicStandings).length,
)

type ResultVariant = 'wins' | 'draws' | 'losses'
type TeamResultToken = {
  key: string
  text: string
  variant: ResultVariant
}

function resultTokenClass(variant: ResultVariant) {
  switch (variant) {
    case 'wins':
      return 'inline-flex items-center justify-center rounded-md border border-[#d2e2f7] bg-[#eef5ff] px-2 py-1 text-xs font-semibold text-[#1a5a8c]'
    case 'draws':
      return 'inline-flex items-center justify-center rounded-md border border-[#d7c8e8] bg-[#f6f0ff] px-2 py-1 text-xs font-semibold text-[#6f3fa3]'
    case 'losses':
      return 'inline-flex items-center justify-center rounded-md border border-[#f2c5d6] bg-[#fff2f7] px-2 py-1 text-xs font-semibold text-[#c80a48]'
  }
}

const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'

function resolveTeamLogo(teamId: string | null | undefined) {
  if (!teamId) return TEAM_PLACEHOLDER_SRC
  const logo = props.teamLogos?.[teamId]
  if (typeof logo === 'string' && logo.trim().length > 0) return logo
  return TEAM_PLACEHOLDER_SRC
}

const resultsByTeamId = computed<Record<string, TeamResultToken[]>>(() => {
  const map: Record<string, TeamResultToken[]> = {}

  // Ensure stable ordering in UI even if some teams have no results.
  for (const r of sortedRows.value) map[r.teamId] = []

  const played = groupStageMatches.value.filter(isMatchCountedInPublicStandings)
  played.sort((a, b) => {
    const at = a.startTime ? new Date(a.startTime).getTime() : 0
    const bt = b.startTime ? new Date(b.startTime).getTime() : 0
    return at - bt
  })

  const push = (teamId: string, token: TeamResultToken) => {
    if (!map[teamId]) map[teamId] = []
    map[teamId].push(token)
  }

  for (const m of played) {
    const hs = m.homeScore as number
    const as = m.awayScore as number

    const homeId = m.homeTeam.id
    const awayId = m.awayTeam.id

    // Team perspective: team score first.
    const homeOutcome: ResultVariant = hs > as ? 'wins' : hs === as ? 'draws' : 'losses'
    const awayOutcome: ResultVariant = as > hs ? 'wins' : as === hs ? 'draws' : 'losses'

    push(homeId, {
      key: `m:${m.id}|t:${homeId}`,
      text: `${hs}:${as}`,
      variant: homeOutcome,
    })
    push(awayId, {
      key: `m:${m.id}|t:${awayId}`,
      text: `${as}:${hs}`,
      variant: awayOutcome,
    })
  }

  return map
})

async function load() {
  errorText.value = ''

  if (!props.tournamentId) {
    rows.value = []
    matches.value = []
    loading.value = false
    return
  }

  await ensureTenantResolved()
  if (tenantNotFound.value) {
    rows.value = []
    matches.value = []
    errorText.value = 'Тенант не найден. Проверьте ссылку.'
    loading.value = false
    return
  }

  const cached = getCachedTableAndTournamentDetail(
    queryClient,
    tenant.value,
    props.tournamentId,
    props.groupId,
  )
  if (cached) {
    rows.value = cached.table
    matches.value = cached.detail.matches ?? []
    loading.value = false
  } else {
    rows.value = []
    matches.value = []
    loading.value = true
  }

  try {
    if (
      arePublicTableAndDetailFresh(queryClient, tenant.value, props.tournamentId, props.groupId)
    ) {
      return
    }
    const [table, details] = await Promise.all([
      fetchTable(tenant.value, props.tournamentId, props.groupId ?? undefined),
      fetchTournamentDetail(tenant.value, props.tournamentId),
    ])
    rows.value = table
    matches.value = details.matches ?? []
  } catch {
    errorText.value = 'Не удалось загрузить прогресс.'
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.tournamentId, props.groupId] as const,
  () => {
    void load()
  },
  { immediate: true },
)

</script>

<template>
  <div class="w-full max-w-full rounded-2xl border border-[#b7c7dd] bg-white p-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <div class="text-sm font-semibold text-[#123c67]">Прогресс</div>
        <div class="mt-1 text-xs text-[#4f6b8c]">Все результаты турнира по командам.</div>
      </div>
    </div>

    <div v-if="errorText" class="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
      {{ errorText }}
    </div>

    <div v-else-if="loading" class="mt-4 space-y-2">
      <div class="grid grid-cols-[1fr_2fr] gap-3 rounded-xl border border-[#d6e0ee] bg-[#f4f7fc] px-3 py-2">
        <Skeleton width="6rem" height="0.8rem" />
        <Skeleton width="7rem" height="0.8rem" />
      </div>
      <div
        v-for="i in 6"
        :key="`progress-sk-${i}`"
        class="grid grid-cols-[1fr_2fr] items-start gap-3 rounded-xl border border-[#e1e8f2] bg-white px-3 py-3"
      >
        <Skeleton width="8rem" height="0.9rem" />
        <div class="flex gap-2">
          <Skeleton width="2.2rem" height="1.6rem" />
          <Skeleton width="2.2rem" height="1.6rem" />
          <Skeleton width="2.2rem" height="1.6rem" />
        </div>
      </div>
    </div>

    <div v-else-if="!sortedRows.length" class="mt-4 rounded-xl border border-[#b7c7dd] bg-[#f8fbff] py-10 text-center text-[#4f6b8c]">
      Пока нет команд.
    </div>

    <div v-else class="mt-4 overflow-hidden rounded-xl border border-[#b7c7dd]">
      <div
        v-if="playedMatchesCount === 0"
        class="border-b border-[#d6e0ee] bg-[#f4f7fc] px-3 py-2 text-xs text-[#4f6b8c]"
      >
        Матчей с зафиксированным счетом пока нет. Прогресс заполнится после первых игр.
      </div>
      <div class="grid grid-cols-1">
        <div
          class="grid grid-cols-[1fr_2fr] gap-3 border-b border-[#d6e0ee] bg-[#f4f7fc] px-3 py-2 text-xs font-semibold text-[#123c67]"
        >
          <div>Название</div>
          <div>Результаты</div>
        </div>

        <div
          v-for="r in sortedRows"
          :key="r.teamId"
          class="grid grid-cols-[1fr_2fr] items-start gap-3 border-b border-[#e1e8f2] px-3 py-3 odd:bg-white even:bg-[#f9fbff]"
        >
          <div class="flex min-w-0 items-center gap-2">
            <RemoteImage
              :src="resolveTeamLogo(r.teamId)"
              :alt="r.teamName"
              placeholder-icon="users"
              icon-class="text-xs"
              class="h-7 w-7 shrink-0 rounded-full"
            />
            <div class="truncate text-sm font-medium text-[#123c67]">#{{ r.position }} {{ r.teamName }}</div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span
              v-for="t in resultsByTeamId[r.teamId] ?? []"
              :key="t.key"
              :class="resultTokenClass(t.variant)"
            >
              {{ t.text }}
            </span>

            <span
              v-if="(resultsByTeamId[r.teamId] ?? []).length === 0"
              class="text-sm text-[#4f6b8c]"
            >
              —
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


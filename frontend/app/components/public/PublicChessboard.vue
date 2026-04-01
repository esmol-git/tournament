<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { TableRow, TournamentDetails, MatchRow } from '~/types/tournament-admin'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'

const props = defineProps<{
  tournamentId: string
  /** Если задан — только эта группа (матчи группового этапа), отдельная шахматка. */
  groupId?: string | null
  teamLogos?: Record<string, string>
}>()

const { tenantSlug, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const { fetchTable, fetchTournamentDetail } = usePublicTournamentFetch()

const loading = ref(false)
const errorText = ref('')

const tableRows = ref<TableRow[]>([])
const matches = ref<MatchRow[]>([])

const teamsInOrder = computed(() => {
  return tableRows.value
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ id: r.teamId, name: r.teamName, position: r.position }))
})

const groupMatches = computed(() => {
  const all = matches.value ?? []
  return all.filter((m) => {
    if (m.stage === 'PLAYOFF') return false
    if (props.groupId) return m.groupId === props.groupId
    return true
  })
})

const playedMatchesCount = computed(() => {
  return groupMatches.value.filter((m) => m.homeScore != null && m.awayScore != null).length
})

const hasRenderableGrid = computed(() => teamsInOrder.value.length >= 2)

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

const cellTextByKey = computed(() => {
  const grid: Record<string, string> = {}
  const played = groupMatches.value.filter((m) => m.homeScore != null && m.awayScore != null)

  const push = (rowId: string, colId: string, text: string) => {
    const key = `${rowId}|${colId}`
    const cur = grid[key]
    if (!cur) grid[key] = text
    else grid[key] = `${cur} / ${text}`
  }

  for (const m of played) {
    const homeId = m.homeTeam.id
    const awayId = m.awayTeam.id
    const hs = m.homeScore as number
    const as = m.awayScore as number

    // row perspective: row team score first
    push(homeId, awayId, `${hs}:${as}`)
    push(awayId, homeId, `${as}:${hs}`)
  }

  return grid
})

const load = async () => {
  errorText.value = ''
  tableRows.value = []
  matches.value = []

  if (!props.tournamentId) return
  await ensureTenantResolved()
  if (tenantNotFound.value) {
    errorText.value = 'Тенант не найден. Проверьте ссылку.'
    return
  }
  loading.value = true
  try {
    const [table, details] = await Promise.all([
      fetchTable(tenant.value, props.tournamentId, props.groupId ?? undefined),
      fetchTournamentDetail(tenant.value, props.tournamentId),
    ])

    tableRows.value = table
    matches.value = details.matches ?? []
  } catch (e: any) {
    errorText.value = 'Не удалось загрузить шахматку.'
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
  <div class="rounded-2xl border border-surface-200 bg-surface-0 p-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <div class="text-sm font-semibold text-surface-900">Шахматка</div>
        <div class="text-xs text-muted-color mt-1">
          Счёт между командами
        </div>
      </div>
    </div>

    <div v-if="errorText" class="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
      {{ errorText }}
    </div>

    <div v-else-if="loading" class="mt-4 overflow-x-auto">
      <table class="min-w-full text-xs border-separate border-spacing-0">
        <thead>
          <tr>
            <th class="sticky left-0 z-10 border border-[#d6e0ee] bg-[#f4f7fc] px-2 py-2 text-left">
              <Skeleton width="5rem" height="0.8rem" />
            </th>
            <th
              v-for="i in 8"
              :key="`chess-sk-h-${i}`"
              class="border border-[#d6e0ee] bg-[#f4f7fc] px-2 py-2 text-center"
            >
              <Skeleton width="1rem" height="0.8rem" class="mx-auto" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in 6" :key="`chess-sk-r-${r}`">
            <th class="sticky left-0 z-10 border border-[#e1e8f2] bg-white px-2 py-2 text-left">
              <Skeleton width="7rem" height="0.8rem" />
            </th>
            <td
              v-for="c in 8"
              :key="`chess-sk-c-${r}-${c}`"
              class="border border-[#e1e8f2] px-2 py-2 text-center"
              :class="r === c ? 'bg-[#fff2f7]' : c % 2 === 0 ? 'bg-[#f9fbff]' : 'bg-white'"
            >
              <Skeleton width="1.8rem" height="0.8rem" class="mx-auto" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-else-if="!hasRenderableGrid"
      class="mt-4 rounded-xl border border-[#b7c7dd] bg-white p-5 text-center text-[#4f6b8c]"
    >
      Недостаточно команд для построения шахматки.
    </div>

    <div v-else class="mt-4 overflow-x-auto">
      <div
        v-if="playedMatchesCount === 0"
        class="mb-3 rounded-lg border border-[#d6e0ee] bg-[#f4f7fc] px-3 py-2 text-xs text-[#4f6b8c]"
      >
        Матчей с зафиксированным счетом пока нет. Таблица будет заполняться по мере игр.
      </div>
      <table class="min-w-full text-xs border-separate border-spacing-0">
        <thead>
          <tr>
            <th
              class="sticky left-0 z-10 border border-[#d6e0ee] bg-[#f4f7fc] px-2 py-2 text-left font-medium text-[#123c67]"
            >
              Команда
            </th>
            <th
              v-for="t in teamsInOrder"
              :key="t.id"
              class="whitespace-nowrap border border-[#d6e0ee] bg-[#f4f7fc] px-2 py-2 text-center font-medium text-[#123c67]"
            >
              {{ t.position }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in teamsInOrder" :key="row.id">
            <th
              class="sticky left-0 z-10 whitespace-nowrap border border-[#e1e8f2] bg-white px-2 py-2 text-left font-medium text-[#123c67]"
            >
              <div class="flex items-center gap-2">
                <div class="h-7 w-7 shrink-0 overflow-hidden rounded-full">
                  <img
                    :src="resolveTeamLogo(row.id)"
                    :alt="row.name"
                    class="h-full w-full object-cover"
                    loading="lazy"
                    @error="handleTeamLogoError"
                  />
                </div>
                <span>{{ row.position }}. {{ row.name }}</span>
              </div>
            </th>
            <td
              v-for="col in teamsInOrder"
              :key="col.id"
              class="whitespace-nowrap border border-[#e1e8f2] px-2 py-2 text-center"
              :class="{
                'bg-[#fff2f7]': row.id === col.id,
                'bg-[#f9fbff]': row.id !== col.id && col.position % 2 === 0,
                'bg-white': row.id !== col.id && col.position % 2 !== 0,
              }"
            >
              <span v-if="row.id === col.id" class="font-semibold text-[#c80a48]/70">—</span>
              <span v-else class="font-medium text-[#123c67]">
                {{ cellTextByKey[`${row.id}|${col.id}`] ?? '—' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>


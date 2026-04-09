<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import type { TournamentDetails } from '~/types/tournament-admin'
import type { TournamentPlayerStatRow } from '~/types/admin/tournaments-index'
import { getApiErrorMessage } from '~/utils/apiError'
import AdminTournamentStatsShareImageDialog from '~/app/components/admin/AdminTournamentStatsShareImageDialog.vue'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  tournamentId: string
  tournament: TournamentDetails | null
  /** Запрос к API только пока вкладка активна; при каждом заходе и после обновления турнира с страницы — перезагрузка. */
  active: boolean
}>()

const { t } = useI18n()
const toast = useToast()
const { token, authFetch } = useAuth()
const { apiUrl } = useApiUrl()

type StatMetric =
  | 'goals'
  | 'assists'
  | 'goals_plus_assists'
  | 'yellow_cards'
  | 'red_cards'

const metric = ref<StatMetric>('goals')
const topN = ref(20)
const teamFilterIds = ref<string[]>([])
const rawRows = ref<TournamentPlayerStatRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const shareOpen = ref(false)

const metricOptions = computed(() => [
  { label: t('admin.tournament_page.stats_metric_goals'), value: 'goals' as const },
  { label: t('admin.tournament_page.stats_metric_assists'), value: 'assists' as const },
  {
    label: t('admin.tournament_page.stats_metric_goals_plus_assists'),
    value: 'goals_plus_assists' as const,
  },
  { label: t('admin.tournament_page.stats_metric_yellow'), value: 'yellow_cards' as const },
  { label: t('admin.tournament_page.stats_metric_red'), value: 'red_cards' as const },
])

const topNOptions = computed(() => [
  { label: '10', value: 10 },
  { label: '20', value: 20 },
  { label: '50', value: 50 },
  { label: t('admin.tournament_page.stats_top_all'), value: 9999 },
])

const teamOptions = computed(() => {
  const teams = props.tournament?.tournamentTeams ?? []
  return teams
    .map((tt) => ({
      label: tt.team?.name?.trim() || tt.teamId,
      value: tt.teamId,
    }))
    .filter((x) => x.value)
})

function playerName(r: TournamentPlayerStatRow) {
  return [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || '—'
}

function metricValue(r: TournamentPlayerStatRow, m: StatMetric): number {
  switch (m) {
    case 'goals':
      return r.goals
    case 'assists':
      return r.assists
    case 'goals_plus_assists':
      return r.goals + r.assists
    case 'yellow_cards':
      return r.yellowCards
    case 'red_cards':
      return r.redCards
    default:
      return 0
  }
}

function rowPassesTeamFilter(r: TournamentPlayerStatRow): boolean {
  if (!teamFilterIds.value.length) return true
  if (!r.teamId) return false
  return teamFilterIds.value.includes(r.teamId)
}

const sortedTableRows = computed(() => {
  const m = metric.value
  const list = rawRows.value.filter(rowPassesTeamFilter)
  const withVal = list
    .map((r) => ({ r, v: metricValue(r, m) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v || playerName(a.r).localeCompare(playerName(b.r)))
  const limit = topN.value >= 9999 ? withVal.length : Math.min(topN.value, withVal.length)
  return withVal.slice(0, limit).map((x, idx) => ({
    rank: idx + 1,
    playerName: playerName(x.r),
    teamName: x.r.teamName ?? '',
    value: x.v,
    _key: x.r.playerId,
  }))
})

const valueColumnLabel = computed(() => {
  switch (metric.value) {
    case 'goals':
      return t('admin.tournament_page.stats_col_goals_short')
    case 'assists':
      return t('admin.tournament_page.stats_col_assists_short')
    case 'goals_plus_assists':
      return t('admin.tournament_page.stats_col_g_a_short')
    case 'yellow_cards':
      return t('admin.tournament_page.stats_col_yellow_short')
    case 'red_cards':
      return t('admin.tournament_page.stats_col_red_short')
    default:
      return ''
  }
})

const boardTitle = computed(() => {
  const opt = metricOptions.value.find((o) => o.value === metric.value)
  return opt?.label ?? ''
})

const shareRows = computed(() =>
  sortedTableRows.value.map((x) => ({
    rank: x.rank,
    playerName: x.playerName,
    teamName: x.teamName,
    value: x.value,
  })),
)

const STATS_TABLE_SKELETON_ROWS = 10

function clearTeamFilter() {
  teamFilterIds.value = []
}

/** Защита от гонок: быстрые повторы watch (турнир + вкладка) не затирают ответ более поздним запросом. */
let loadStatsSeq = 0

async function loadStats() {
  if (!token.value || !props.tournamentId) return
  const seq = ++loadStatsSeq
  loading.value = true
  error.value = null
  try {
    const rows = await authFetch<TournamentPlayerStatRow[]>(
      apiUrl(`/tournaments/${props.tournamentId}/player-stats`),
    )
    if (seq !== loadStatsSeq) return
    rawRows.value = rows
  } catch (e: unknown) {
    if (seq !== loadStatsSeq) return
    error.value = getApiErrorMessage(e, t('admin.errors.request_failed'))
    rawRows.value = []
  } finally {
    if (seq === loadStatsSeq) loading.value = false
  }
}

watch(
  () => props.tournamentId,
  (id, prev) => {
    if (id !== prev) {
      rawRows.value = []
      error.value = null
    }
  },
)

/**
 * Синхронизация с матчами/протоколом: первый показ вкладки, повторный заход, обновление турнира с родителя.
 * `immediate: true` обязателен: иначе при монтировании с уже готовым `tournament` и `active` запрос не уходит.
 */
watch(
  () =>
    [props.active, props.tournamentId, props.tournament, token.value] as const,
  ([active, tid, tourn, tok]) => {
    if (!active || !tid || !tok || !tourn) return
    void loadStats()
  },
  { immediate: true, flush: 'post' },
)

watch(metric, () => {
  shareOpen.value = false
})
</script>

<template>
  <div class="rounded-xl border border-surface-200 bg-surface-0 dark:border-surface-700 dark:bg-surface-900 p-4">
    <div class="admin-toolbar-responsive flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
          {{ t('admin.tournament_page.stats_title') }}
        </h2>
        <p class="mt-1 text-xs text-muted-color">
          {{ t('admin.tournament_page.stats_lead') }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          size="small"
          :loading="loading"
          :label="t('admin.tournament_page.refresh')"
          @click="loadStats"
        />
        <Button
          type="button"
          icon="pi pi-image"
          severity="secondary"
          outlined
          size="small"
          :disabled="sortedTableRows.length === 0"
          :label="t('admin.tournament_page.stats_share_image')"
          @click="shareOpen = true"
        />
      </div>
    </div>

    <div
      v-if="loading"
      class="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end"
      aria-hidden="true"
    >
      <div class="min-w-[12rem] flex-1 space-y-1">
        <Skeleton width="7rem" height="0.75rem" class="rounded" />
        <Skeleton height="2.5rem" width="100%" class="rounded-md" />
      </div>
      <div class="w-full min-w-[10rem] max-w-xs space-y-1">
        <Skeleton width="6.5rem" height="0.75rem" class="rounded" />
        <Skeleton height="2.5rem" width="100%" class="rounded-md" />
      </div>
      <div class="min-w-[14rem] flex-1 space-y-1">
        <Skeleton width="5.5rem" height="0.75rem" class="rounded" />
        <Skeleton height="2.5rem" width="100%" class="rounded-md" />
      </div>
    </div>
    <div v-else class="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
      <div class="min-w-[12rem] flex-1 space-y-1">
        <label class="text-xs font-medium text-surface-700 dark:text-surface-200">
          {{ t('admin.tournament_page.stats_filter_metric') }}
        </label>
        <Select
          v-model="metric"
          :options="metricOptions"
          option-label="label"
          option-value="value"
          class="w-full"
        />
      </div>
      <div class="w-full min-w-[10rem] max-w-xs space-y-1">
        <label class="text-xs font-medium text-surface-700 dark:text-surface-200">
          {{ t('admin.tournament_page.stats_filter_top') }}
        </label>
        <Select
          v-model="topN"
          :options="topNOptions"
          option-label="label"
          option-value="value"
          class="w-full"
        />
      </div>
      <div class="min-w-[14rem] flex-1 space-y-1">
        <label class="text-xs font-medium text-surface-700 dark:text-surface-200">
          {{ t('admin.tournament_page.stats_filter_teams') }}
        </label>
        <MultiSelect
          v-model="teamFilterIds"
          :options="teamOptions"
          option-label="label"
          option-value="value"
          display="chip"
          filter
          :placeholder="t('admin.tournament_page.stats_teams_placeholder')"
          class="w-full"
          :max-selected-labels="2"
        />
      </div>
    </div>

    <AdminDataState
      class="mt-4"
      :loading="loading"
      :error="error"
      :empty="!loading && !error && sortedTableRows.length === 0"
      :empty-title="t('admin.tournament_page.stats_empty_title')"
      :empty-description="t('admin.tournament_page.stats_empty_hint')"
      empty-icon="pi pi-chart-bar"
      :error-title="t('admin.tournament_page.stats_error_title')"
      :content-card="false"
      @retry="loadStats"
    >
      <template #loading>
        <div
          class="overflow-x-auto rounded-lg border border-surface-200 bg-surface-0 dark:border-surface-700 dark:bg-surface-900"
          aria-hidden="true"
        >
          <table class="w-full min-w-[28rem] border-collapse text-left text-sm">
            <thead>
              <tr class="border-b border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800/80">
                <th class="w-10 px-3 py-2.5">
                  <Skeleton width="1.25rem" height="0.75rem" class="rounded" />
                </th>
                <th class="px-3 py-2.5">
                  <Skeleton width="40%" height="0.75rem" class="max-w-[7rem] rounded" />
                </th>
                <th class="px-3 py-2.5">
                  <Skeleton width="35%" height="0.75rem" class="max-w-[6rem] rounded" />
                </th>
                <th class="w-24 px-3 py-2.5 text-right">
                  <Skeleton width="2rem" height="0.75rem" class="ml-auto rounded" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="n in STATS_TABLE_SKELETON_ROWS"
                :key="n"
                class="border-b border-surface-100 dark:border-surface-800"
              >
                <td class="px-3 py-2.5">
                  <Skeleton width="1.25rem" height="0.875rem" class="rounded" />
                </td>
                <td class="px-3 py-2.5">
                  <Skeleton
                    :width="`${58 + ((n * 7) % 28)}%`"
                    height="0.875rem"
                    class="max-w-[14rem] rounded"
                  />
                </td>
                <td class="px-3 py-2.5">
                  <Skeleton
                    :width="`${42 + ((n * 5) % 24)}%`"
                    height="0.875rem"
                    class="max-w-[12rem] rounded"
                  />
                </td>
                <td class="px-3 py-2.5 text-right">
                  <Skeleton width="1.75rem" height="0.875rem" class="ml-auto rounded" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <template #empty-actions>
        <Button
          v-if="teamFilterIds.length"
          type="button"
          icon="pi pi-filter-slash"
          severity="secondary"
          outlined
          :label="t('admin.tournament_page.stats_empty_reset_teams')"
          @click="clearTeamFilter"
        />
      </template>
    </AdminDataState>

    <div
      v-if="!loading && !error && sortedTableRows.length > 0"
      class="mt-2 overflow-x-auto rounded-lg border border-surface-200 dark:border-surface-700"
    >
      <table class="w-full min-w-[28rem] border-collapse text-left text-sm">
        <thead>
          <tr class="border-b border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800/80">
            <th class="px-3 py-2.5 font-semibold tabular-nums text-surface-700 dark:text-surface-200">
              #
            </th>
            <th class="px-3 py-2.5 font-semibold text-surface-700 dark:text-surface-200">
              {{ t('admin.tournament_page.stats_col_player') }}
            </th>
            <th class="px-3 py-2.5 font-semibold text-surface-700 dark:text-surface-200">
              {{ t('admin.tournament_page.stats_col_team') }}
            </th>
            <th class="px-3 py-2.5 text-right font-semibold tabular-nums text-surface-700 dark:text-surface-200">
              {{ valueColumnLabel }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in sortedTableRows"
            :key="row._key"
            class="border-b border-surface-100 dark:border-surface-800"
          >
            <td class="px-3 py-2 tabular-nums text-surface-800 dark:text-surface-100">
              {{ row.rank }}
            </td>
            <td class="px-3 py-2 font-medium text-surface-900 dark:text-surface-0">
              {{ row.playerName }}
            </td>
            <td class="px-3 py-2 text-muted-color">
              {{ row.teamName || '—' }}
            </td>
            <td class="px-3 py-2 text-right tabular-nums font-semibold text-surface-900 dark:text-surface-0">
              {{ row.value }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AdminTournamentStatsShareImageDialog
      v-model:visible="shareOpen"
      :tournament-name="tournament?.name ?? ''"
      :file-slug="tournament?.slug ?? tournamentId"
      :board-title="boardTitle"
      :value-column-label="valueColumnLabel"
      :rows="shareRows"
    />
  </div>
</template>

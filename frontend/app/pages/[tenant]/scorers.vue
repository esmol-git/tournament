<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { MatchRow, TableRow } from '~/types/tournament-admin'

type MatchEventRow = NonNullable<MatchRow['events']>[number]
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { usePublicTournamentSidebarPreviewStore } from '~/composables/usePublicTournamentSidebarPreviewStore'
import { usePublicTournamentWorkspace } from '~/composables/usePublicTournamentWorkspace'

definePageMeta({
  layout: 'public-tournament',
  path: '/:tenant/tournaments/scorers',
  alias: ['/:tenant/scorers'],
})

type PlayerStatsRow = {
  playerId: string
  firstName: string
  lastName: string
  birthDate: string | null
  teamId: string | null
  teamName: string | null
  teamLogoUrl: string | null
  playerPhotoUrl: string | null
  goals: number
  assists: number
  yellowCards: number
  redCards: number
}

type SortKey =
  | 'lastName'
  | 'firstName'
  | 'teamName'
  | 'goals'
  | 'assists'
  | 'yellowCards'
  | 'redCards'

const DEFAULT_SORT_KEY: SortKey = 'goals'
const DEFAULT_SORT_DIR: 'asc' | 'desc' = 'desc'
const DEFAULT_ROWS_PER_PAGE = 11

const { fetchTournamentDetail, fetchRoster, fetchTable } = usePublicTournamentFetch()
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

const route = useRoute()
const router = useRouter()
const errorText = ref('')
const pageReady = ref(false)
const isInitializing = ref(true)
const suppressWatchEffects = ref(true)
const loadingRows = ref(false)
const rows = ref<PlayerStatsRow[]>([])
const requestId = ref(0)

const searchQuery = ref('')
const selectedTeamId = ref<string | null>(null)
const sortKey = ref<SortKey>(DEFAULT_SORT_KEY)
const sortDir = ref<'asc' | 'desc'>(DEFAULT_SORT_DIR)
const first = ref(0)
const rowsPerPage = ref(DEFAULT_ROWS_PER_PAGE)
const pageSizeOptions = [11, 25, 50, 100]

const PLAYER_PLACEHOLDER_SRC = '/placeholders/player.svg'
const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'
const SORT_QUERY_KEY = 'sort'
const DIR_QUERY_KEY = 'dir'
const PAGE_QUERY_KEY = 'page'
const ROWS_QUERY_KEY = 'rows'

/** Первая отрисовка workspace (турниры/тенант) — скелетон всего блока; далее только таблица. */
const showWorkspaceBootSkeleton = computed(() => !pageReady.value || loading.value)
/** Только таблица статистики при смене турнира или перезапросе. */
const showTableSkeleton = computed(() => loadingRows.value && !!selectedTournamentId.value)

watch(
  () => showWorkspaceBootSkeleton.value || showTableSkeleton.value,
  (v) => {
    pageContentLoading.value = v
  },
  { immediate: true },
)

const teamOptions = computed(() => {
  const map = new Map<string, string>()
  for (const row of rows.value) {
    if (row.teamId && row.teamName) map.set(row.teamId, row.teamName)
  }
  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
})

function resolveImageUrl(url: string | null | undefined, fallback: string) {
  const normalized = String(url ?? '').trim()
  return normalized.length ? normalized : fallback
}

function parseCardColor(event: MatchEventRow): 'yellow' | 'red' | null {
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

function parseAssistPlayerId(event: MatchEventRow): string {
  const payload = (event.payload ?? {}) as Record<string, unknown>
  return String(
    payload.assistId ??
      payload.assistPlayerId ??
      payload.assistantId ??
      payload.assistantPlayerId ??
      payload.assist_player_id ??
      '',
  ).trim()
}

function playerNameParts(p: { firstName: string; lastName: string } | null | undefined) {
  return {
    firstName: String(p?.firstName ?? '').trim(),
    lastName: String(p?.lastName ?? '').trim(),
  }
}

function toggleSort(next: SortKey) {
  if (sortKey.value === next) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = next
  sortDir.value =
    next === 'lastName' || next === 'firstName' || next === 'teamName'
      ? 'asc'
      : 'desc'
}

function sortIndicator(next: SortKey) {
  if (sortKey.value !== next) return ''
  return sortDir.value === 'asc' ? ' ↑' : ' ↓'
}

function ariaSortFor(next: SortKey): 'ascending' | 'descending' | 'none' {
  if (sortKey.value !== next) return 'none'
  return sortDir.value === 'asc' ? 'ascending' : 'descending'
}

function sortButtonAriaLabel(next: SortKey, label: string) {
  if (sortKey.value !== next) return `Сортировать по: ${label}`
  return `Сортировка по: ${label}, ${sortDir.value === 'asc' ? 'по возрастанию' : 'по убыванию'}`
}

function sortButtonClass(next: SortKey) {
  return sortKey.value === next
    ? 'players-sort-btn players-sort-btn--active'
    : 'players-sort-btn'
}

function normalizeSortKey(value: unknown): SortKey | null {
  const raw = String(Array.isArray(value) ? value[0] : value ?? '').trim()
  const allowed: SortKey[] = ['lastName', 'firstName', 'teamName', 'goals', 'assists', 'yellowCards', 'redCards']
  return allowed.includes(raw as SortKey) ? (raw as SortKey) : null
}

function normalizeSortDir(value: unknown): 'asc' | 'desc' | null {
  const raw = String(Array.isArray(value) ? value[0] : value ?? '').trim().toLowerCase()
  return raw === 'asc' || raw === 'desc' ? raw : null
}

function normalizePositiveInt(value: unknown): number | null {
  const raw = String(Array.isArray(value) ? value[0] : value ?? '').trim()
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

function syncSortQuery() {
  const currentSort = String(route.query[SORT_QUERY_KEY] ?? '')
  const currentDir = String(route.query[DIR_QUERY_KEY] ?? '')
  if (currentSort === sortKey.value && currentDir === sortDir.value) return
  void router.replace({
    query: {
      ...route.query,
      [SORT_QUERY_KEY]: sortKey.value,
      [DIR_QUERY_KEY]: sortDir.value,
    },
  })
}

function syncPaginationQuery() {
  const nextPage = String(Math.floor(first.value / rowsPerPage.value) + 1)
  const nextRows = String(rowsPerPage.value)
  const currentPage = String(route.query[PAGE_QUERY_KEY] ?? '')
  const currentRows = String(route.query[ROWS_QUERY_KEY] ?? '')
  if (currentPage === nextPage && currentRows === nextRows) return
  void router.replace({
    query: {
      ...route.query,
      [PAGE_QUERY_KEY]: nextPage,
      [ROWS_QUERY_KEY]: nextRows,
    },
  })
}

const filteredRows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const teamId = selectedTeamId.value

  return rows.value.filter((row) => {
    if (teamId && row.teamId !== teamId) return false
    if (!q) return true
    const text = `${row.lastName} ${row.firstName}`.toLowerCase()
    return text.includes(q)
  })
})

const sortedRows = computed(() => {
  const dir = sortDir.value === 'asc' ? 1 : -1
  return filteredRows.value.slice().sort((a, b) => {
    const str = (v: string | null | undefined) => String(v ?? '').toLowerCase()
    const num = (v: number | null | undefined) => Number(v ?? 0)
    switch (sortKey.value) {
      case 'lastName':
        return dir * str(a.lastName).localeCompare(str(b.lastName), 'ru')
      case 'firstName':
        return dir * str(a.firstName).localeCompare(str(b.firstName), 'ru')
      case 'teamName':
        return dir * str(a.teamName).localeCompare(str(b.teamName), 'ru')
      case 'goals':
        return dir * (num(a.goals) - num(b.goals))
      case 'assists':
        return dir * (num(a.assists) - num(b.assists))
      case 'yellowCards':
        return dir * (num(a.yellowCards) - num(b.yellowCards))
      case 'redCards':
        return dir * (num(a.redCards) - num(b.redCards))
      default:
        return 0
    }
  })
})

const totalRows = computed(() => sortedRows.value.length)
const showPaginator = computed(() => totalRows.value > 11)
const pagedRows = computed(() => {
  const start = first.value
  return sortedRows.value.slice(start, start + rowsPerPage.value)
})

watch([searchQuery, selectedTeamId, sortKey, sortDir], () => {
  first.value = 0
})
watch([sortKey, sortDir], () => {
  syncSortQuery()
})
watch([first, rowsPerPage], () => {
  syncPaginationQuery()
})

watch([totalRows, rowsPerPage], () => {
  const lastPageFirst =
    totalRows.value > 0
      ? Math.floor((totalRows.value - 1) / rowsPerPage.value) * rowsPerPage.value
      : 0
  if (first.value > lastPageFirst) first.value = lastPageFirst
})

function onPageChange(event: { first: number; rows: number }) {
  first.value = event.first
  rowsPerPage.value = event.rows
}

function resetViewState() {
  sortKey.value = DEFAULT_SORT_KEY
  sortDir.value = DEFAULT_SORT_DIR
  rowsPerPage.value = DEFAULT_ROWS_PER_PAGE
  first.value = 0
}

function toCsvCell(value: string | number | null | undefined) {
  const raw = String(value ?? '')
  const escaped = raw.replace(/"/g, '""')
  return `"${escaped}"`
}

function exportCsv() {
  const head = [
    'Фамилия',
    'Имя',
    'Команда',
    'Голы',
    'Ассисты',
    'Желтые карточки',
    'Красные карточки',
  ]
  const body = sortedRows.value.map((row) => [
    row.lastName,
    row.firstName,
    row.teamName ?? '—',
    row.goals,
    row.assists,
    row.yellowCards,
    row.redCards,
  ])
  const csv = [head, ...body]
    .map((line) => line.map((x) => toCsvCell(x)).join(';'))
    .join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tournament-players-${selectedTournamentId.value ?? 'all'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function fetchTournamentPlayerStats() {
  if (!selectedTournamentId.value) {
    rows.value = []
    return
  }

  const tid = selectedTournamentId.value
  const rid = ++requestId.value
  loadingRows.value = true
  rows.value = []
  errorText.value = ''
  try {
    const [detail, roster, tableRows] = await Promise.all([
      fetchTournamentDetail(tenant.value, tid),
      fetchRoster(tenant.value, tid),
      fetchTable(tenant.value, tid),
    ])
    if (rid !== requestId.value || tid !== selectedTournamentId.value) return

    const byPlayer = new Map<string, PlayerStatsRow>()
    for (const team of roster) {
      for (const p of team.players) {
        const names = playerNameParts(p)
        if (byPlayer.has(p.id)) continue
        byPlayer.set(p.id, {
          playerId: p.id,
          firstName: names.firstName,
          lastName: names.lastName,
          birthDate: p.birthDate ?? null,
          teamId: team.teamId ?? null,
          teamName: team.teamName ?? null,
          teamLogoUrl: team.logoUrl ?? null,
          playerPhotoUrl: p.photoUrl ?? null,
          goals: 0,
          assists: 0,
          yellowCards: 0,
          redCards: 0,
        })
      }
    }
    const logoByTeamId: Record<string, string | null> = {}
    for (const team of roster) {
      logoByTeamId[team.teamId] = team.logoUrl ?? null
    }
    const mapSidebarRow = (row: TableRow) => ({
      teamId: row.teamId,
      teamName: row.teamName,
      points: Number(row.points ?? 0),
      played: Number(row.played ?? 0),
      goalDiff: Number(row.goalDiff ?? 0),
      logoUrl: logoByTeamId[row.teamId] ?? null,
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
    const groups = detail.groups ?? []
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
      if (rid !== requestId.value || tid !== selectedTournamentId.value) return
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

    for (const match of detail.matches ?? []) {
      for (const event of match.events ?? []) {
        const playerId = event.playerId ?? null
        if (!playerId) continue
        const row = byPlayer.get(playerId)
        if (!row) continue

        if (event.type === 'GOAL') {
          row.goals += 1
          const assistId = parseAssistPlayerId(event)
          if (assistId) {
            const assistRow = byPlayer.get(assistId)
            if (assistRow) assistRow.assists += 1
          }
          continue
        }

        if (event.type === 'CARD') {
          const card = parseCardColor(event)
          if (card === 'yellow') row.yellowCards += 1
          if (card === 'red') row.redCards += 1
        }
      }
    }

    rows.value = Array.from(byPlayer.values())
  } catch {
    if (rid !== requestId.value || tid !== selectedTournamentId.value) return
    rows.value = []
    publishSidebarStandings(tenant.value, tid, [], [])
    errorText.value = 'Не удалось загрузить статистику игроков.'
  } finally {
    if (rid === requestId.value) loadingRows.value = false
  }
}

function applyQueryFromRoute() {
  const qSort = normalizeSortKey(route.query[SORT_QUERY_KEY])
  const qDir = normalizeSortDir(route.query[DIR_QUERY_KEY])
  const qPage = normalizePositiveInt(route.query[PAGE_QUERY_KEY])
  const qRows = normalizePositiveInt(route.query[ROWS_QUERY_KEY])
  if (qSort) sortKey.value = qSort
  if (qDir) sortDir.value = qDir
  if (qRows && pageSizeOptions.includes(qRows)) rowsPerPage.value = qRows
  if (qPage) first.value = (qPage - 1) * rowsPerPage.value
}

watch(selectedTournamentId, () => {
  if (isInitializing.value || suppressWatchEffects.value) return
  void fetchTournamentPlayerStats()
  syncTidToQuery(selectedTournamentId.value || null)
})

async function bootstrapScorersPage() {
  await ensureTenantResolved()
  if (tenantNotFound.value) {
    errorText.value = 'Тенант не найден. Проверьте ссылку.'
    return
  }
  applyQueryFromRoute()
  await fetchTournamentPlayerStats()
}

watch(
  workspaceReady,
  async (ready) => {
    if (!ready) return
    suppressWatchEffects.value = true
    try {
      applyQueryFromRoute()
      await bootstrapScorersPage()
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
  applyQueryFromRoute()
})
</script>

<template>
  <div class="contents">
    <Transition
      name="public-view-fade"
      mode="out-in"
    >
      <div
        v-if="showWorkspaceBootSkeleton"
        key="skeleton"
        class="space-y-4 overflow-hidden min-h-[65vh]"
      >
        <div class="public-card">
          <Skeleton width="46%" height="2rem" />
          <Skeleton class="mt-4" width="100%" height="2.75rem" />
        </div>
        <div class="public-card">
          <Skeleton width="44%" height="1rem" />
          <Skeleton class="mt-3" width="100%" height="14rem" />
        </div>
      </div>

      <div v-else key="content" class="space-y-4 overflow-hidden min-h-[65vh]">
        <div v-if="errorText" class="public-error">
          {{ errorText }}
        </div>

        <div v-else class="space-y-4">
          <div class="public-card space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="public-text-primary text-lg font-semibold">Игроки турнира</h2>
              <div class="flex flex-wrap items-center gap-2">
                <Button
                  label="Сброс вида"
                  icon="pi pi-filter-slash"
                  size="small"
                  outlined
                  aria-label="Сброс вида"
                  class="reset-view-btn public-btn-outline-accent"
                  @click="resetViewState"
                />
                <Button
                  label="Экспорт CSV"
                  icon="pi pi-download"
                  size="small"
                  outlined
                  aria-label="Экспорт CSV"
                  class="export-csv-btn public-btn-outline-accent"
                  :disabled="!selectedTournamentId || !sortedRows.length"
                  @click="exportCsv"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <InputText
                  v-model="searchQuery"
                  class="w-full"
                  placeholder="Поиск по имени и фамилии"
                  :disabled="!selectedTournamentId || showTableSkeleton"
                />
              </div>
              <div>
                <Select
                  v-model="selectedTeamId"
                  :options="teamOptions"
                  option-label="label"
                  option-value="value"
                  show-clear
                  class="w-full"
                  placeholder="Фильтр по команде"
                  :disabled="!selectedTournamentId || showTableSkeleton"
                />
              </div>
            </div>

            <div v-if="!selectedTournamentId" class="public-empty">
              Выберите турнир в карточке выше — здесь появится статистика игроков.
            </div>

            <template v-else>
              <div v-if="showTableSkeleton" class="public-card space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <Skeleton class="max-w-[14rem] rounded-md" height="1.35rem" width="100%" />
                  <Skeleton height="2.15rem" width="6rem" class="rounded-lg" />
                </div>
                <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <Skeleton v-for="i in 2" :key="`sc-sk-f-${i}`" height="2.65rem" width="100%" class="rounded-lg" />
                </div>
                <div class="space-y-2 rounded-xl border border-[#d6e0ee] bg-[#f4f7fc] p-3">
                  <Skeleton height="2.25rem" width="100%" class="rounded-md" />
                  <Skeleton v-for="i in 7" :key="`sc-sk-r-${i}`" height="2.5rem" width="100%" class="rounded-md" />
                </div>
              </div>

              <div v-else-if="!rows.length" class="public-empty">
                В заявке выбранного турнира пока нет игроков.
              </div>

              <div v-else-if="!sortedRows.length" class="public-empty">
                По выбранным фильтрам игроки не найдены.
              </div>

              <div v-else class="space-y-3">
                <div class="public-text-muted flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>Найдено: {{ totalRows }}</span>
                  <div v-if="showPaginator" class="flex items-center gap-2">
                    <Paginator
                      :first="first"
                      :rows="rowsPerPage"
                      :total-records="totalRows"
                      :rows-per-page-options="pageSizeOptions"
                      template="PrevPageLink CurrentPageReport NextPageLink RowsPerPageDropdown"
                      current-page-report-template="{currentPage} / {totalPages}"
                      @page="onPageChange"
                    />
                  </div>
                </div>

                <div class="public-table-wrap players-table-wrap">
                  <div class="public-table-wrap__scroll">
                  <table class="public-table public-stagger-tbody">
                    <thead>
                      <tr>
                        <th style="width: 3.5rem"></th>
                        <th class="text-left players-table-col-player" :aria-sort="ariaSortFor('lastName')">
                          <button
                            type="button"
                            :class="sortButtonClass('lastName')"
                            :aria-label="sortButtonAriaLabel('lastName', 'игрок')"
                            @click="toggleSort('lastName')"
                          >
                            Игрок{{ sortIndicator('lastName') }}
                          </button>
                        </th>
                        <th class="players-table-col-team" :aria-sort="ariaSortFor('teamName')">
                          <button :class="sortButtonClass('teamName')" :aria-label="sortButtonAriaLabel('teamName', 'команда')" @click="toggleSort('teamName')">Команда{{ sortIndicator('teamName') }}</button>
                        </th>
                        <th class="text-center players-table-col-num" :aria-sort="ariaSortFor('goals')">
                          <button
                            type="button"
                            :class="sortButtonClass('goals')"
                            title="Голы"
                            :aria-label="sortButtonAriaLabel('goals', 'голы')"
                            @click="toggleSort('goals')"
                          >
                            Г{{ sortIndicator('goals') }}
                          </button>
                        </th>
                        <th class="text-center players-table-col-num" :aria-sort="ariaSortFor('assists')">
                          <button
                            type="button"
                            :class="sortButtonClass('assists')"
                            title="Ассисты"
                            :aria-label="sortButtonAriaLabel('assists', 'ассисты')"
                            @click="toggleSort('assists')"
                          >
                            А{{ sortIndicator('assists') }}
                          </button>
                        </th>
                        <th class="text-center players-table-col-card" :aria-sort="ariaSortFor('yellowCards')">
                          <button :class="`${sortButtonClass('yellowCards')} inline-flex items-center justify-center gap-1`" :aria-label="sortButtonAriaLabel('yellowCards', 'желтые карточки')" @click="toggleSort('yellowCards')">
                            <span class="card-mini card-mini-yellow" />
                            {{ sortIndicator('yellowCards') }}
                          </button>
                        </th>
                        <th class="text-center players-table-col-card" :aria-sort="ariaSortFor('redCards')">
                          <button :class="`${sortButtonClass('redCards')} inline-flex items-center justify-center gap-1`" :aria-label="sortButtonAriaLabel('redCards', 'красные карточки')" @click="toggleSort('redCards')">
                            <span class="card-mini card-mini-red" />
                            {{ sortIndicator('redCards') }}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in pagedRows" :key="row.playerId">
                        <td>
                          <RemoteImage
                            :src="resolveImageUrl(row.playerPhotoUrl, PLAYER_PLACEHOLDER_SRC)"
                            :alt="`${row.lastName} ${row.firstName}`"
                            placeholder-icon="user"
                            class="h-9 w-9 shrink-0 rounded-full"
                          />
                        </td>
                        <td class="players-table-cell-player font-medium">
                          <span
                            class="player-name-clamp"
                            :title="`${row.lastName || ''} ${row.firstName || ''}`.trim() || '—'"
                          >
                            {{ `${row.lastName || ''} ${row.firstName || ''}`.trim() || '—' }}
                          </span>
                        </td>
                        <td class="players-table-cell-team">
                          <div class="flex items-center gap-2">
                            <RemoteImage
                              :src="resolveImageUrl(row.teamLogoUrl, TEAM_PLACEHOLDER_SRC)"
                              :alt="row.teamName ?? 'Команда'"
                              placeholder-icon="users"
                              icon-class="text-[0.55rem]"
                              class="h-5 w-5 shrink-0 rounded-full"
                            />
                            <span class="team-name-clamp" :title="row.teamName || '—'">{{ row.teamName || '—' }}</span>
                          </div>
                        </td>
                        <td class="text-center tabular-nums">{{ row.goals }}</td>
                        <td class="text-center tabular-nums">{{ row.assists }}</td>
                        <td class="text-center tabular-nums">
                          <span class="card-pill card-pill-yellow">{{ row.yellowCards }}</span>
                        </td>
                        <td class="text-center tabular-nums">
                          <span class="card-pill card-pill-red">{{ row.redCards }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.players-table-wrap :deep(thead th) {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f4f7fc;
}

.players-table-wrap :deep(.players-sort-btn) {
  border-radius: 0.4rem;
  padding: 0.16rem 0.35rem;
  font-weight: 600;
  color: #355a82;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.players-table-wrap :deep(.players-sort-btn:hover) {
  background: #eef5ff;
}

.players-table-wrap :deep(.players-sort-btn--active) {
  background: #e8f2ff;
  color: #123c67;
}

.players-table-col-num {
  width: 5.1rem;
}

.players-table-col-player,
.players-table-cell-player {
  min-width: 12rem;
}

.players-table-wrap :deep(.players-table-col-player .players-sort-btn) {
  display: inline-flex;
  width: 100%;
  justify-content: flex-start;
  align-items: center;
  text-align: left;
}

.players-table-col-team,
.players-table-cell-team {
  min-width: 11rem;
}

.players-table-col-card {
  width: 4.3rem;
}

.card-mini {
  display: inline-block;
  width: 0.7rem;
  height: 0.9rem;
  border-radius: 0.12rem;
  border: 1px solid transparent;
}

.card-mini-yellow {
  background: #fde047;
  border-color: #facc15;
}

.card-mini-red {
  background: #fb7185;
  border-color: #f43f5e;
}

.card-pill {
  display: inline-flex;
  min-width: 1.65rem;
  justify-content: center;
  border-radius: 999px;
  padding: 0.12rem 0.45rem;
  font-weight: 600;
}

.card-pill-yellow {
  background: #fef9c3;
  color: #854d0e;
}

.card-pill-red {
  background: #ffe4e6;
  color: #9f1239;
}

.player-name-clamp,
.team-name-clamp {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  line-height: 1.2;
  max-height: 2.4em;
}

@media (max-width: 640px) {
  .reset-view-btn :deep(.p-button-label),
  .export-csv-btn :deep(.p-button-label) {
    display: none;
  }

  .reset-view-btn :deep(.p-button-icon),
  .export-csv-btn :deep(.p-button-icon) {
    margin-right: 0;
  }

  .reset-view-btn,
  .export-csv-btn {
    min-width: 2.5rem;
  }

  .players-table-col-player,
  .players-table-cell-player {
    min-width: 9.5rem;
  }

  .players-table-col-team,
  .players-table-cell-team {
    min-width: 8.5rem;
  }

  .players-table-wrap :deep(.public-table th),
  .players-table-wrap :deep(.public-table td) {
    padding: 0.45rem 0.4rem;
  }

  .players-table-wrap :deep(.public-table th) {
    font-size: 0.76rem;
  }

  .players-table-wrap :deep(.public-table td) {
    font-size: 0.82rem;
    line-height: 1.2;
  }

  .players-table-wrap :deep(.card-pill) {
    min-width: 1.5rem;
    padding: 0.08rem 0.36rem;
  }
}
</style>

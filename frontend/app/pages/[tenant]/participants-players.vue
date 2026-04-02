<script setup lang="ts">
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import {
  usePublicTournamentFetch,
  type PublicOrganizationPlayersResponse,
} from '~/composables/usePublicTournamentFetch'
import { PUBLIC_AUTO_ANIMATE } from '~/constants/publicMotion'

definePageMeta({ layout: 'public' })

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

type TournamentPlayerStatsRow = PlayerStatsRow & {
  tournamentId: string
  tournamentName: string
}

type SortKey =
  | 'lastName'
  | 'firstName'
  | 'teamName'
  | 'goals'
  | 'assists'
  | 'yellowCards'
  | 'redCards'

const DEFAULT_SORT_KEY: SortKey = 'lastName'
const DEFAULT_SORT_DIR: 'asc' | 'desc' = 'asc'
const DEFAULT_ROWS_PER_PAGE = 11

const { tenantSlug, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const { fetchOrganizationPlayers } = usePublicTournamentFetch()
const route = useRoute()
const router = useRouter()

const loading = ref(true)
const errorText = ref('')
const allRows = ref<TournamentPlayerStatsRow[]>([])
const tournamentOptions = ref<Array<{ value: string; label: string }>>([])

const selectedTournamentId = ref<string | null>(null)
const selectedTeamId = ref<string | null>(null)
const searchQuery = ref('')
const sortKey = ref<SortKey>(DEFAULT_SORT_KEY)
const sortDir = ref<'asc' | 'desc'>(DEFAULT_SORT_DIR)
const first = ref(0)
const rowsPerPage = ref(DEFAULT_ROWS_PER_PAGE)
const pageSizeOptions = [11, 25, 50, 100]

const PLAYER_PLACEHOLDER_SRC = '/placeholders/player.svg'
const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'

const [playersFiltersRef] = useAutoAnimate({ ...PUBLIC_AUTO_ANIMATE })
const [playersTbodyRef] = useAutoAnimate({ ...PUBLIC_AUTO_ANIMATE })
const SORT_QUERY_KEY = 'sort'
const DIR_QUERY_KEY = 'dir'
const PAGE_QUERY_KEY = 'page'
const ROWS_QUERY_KEY = 'rows'

function resolveImageUrl(url: string | null | undefined, fallback: string) {
  const normalized = String(url ?? '').trim()
  return normalized.length ? normalized : fallback
}

function handleImageError(event: Event, fallback: string) {
  const target = event.target
  if (!(target instanceof HTMLImageElement)) return
  if (target.src.endsWith(fallback)) return
  target.src = fallback
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

const rowsByTournament = computed(() => {
  if (!selectedTournamentId.value) return allRows.value
  return allRows.value.filter((row) => row.tournamentId === selectedTournamentId.value)
})

const aggregatedRows = computed<PlayerStatsRow[]>(() => {
  const byPlayer = new Map<string, PlayerStatsRow>()
  for (const row of rowsByTournament.value) {
    const existing = byPlayer.get(row.playerId)
    if (!existing) {
      byPlayer.set(row.playerId, {
        playerId: row.playerId,
        firstName: row.firstName,
        lastName: row.lastName,
        birthDate: row.birthDate,
        teamId: row.teamId,
        teamName: row.teamName,
        teamLogoUrl: row.teamLogoUrl,
        playerPhotoUrl: row.playerPhotoUrl,
        goals: row.goals,
        assists: row.assists,
        yellowCards: row.yellowCards,
        redCards: row.redCards,
      })
      continue
    }
    existing.goals += row.goals
    existing.assists += row.assists
    existing.yellowCards += row.yellowCards
    existing.redCards += row.redCards
  }
  return Array.from(byPlayer.values())
})

const teamOptions = computed(() => {
  const map = new Map<string, string>()
  for (const row of aggregatedRows.value) {
    if (row.teamId && row.teamName) map.set(row.teamId, row.teamName)
  }
  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
})

const filteredRows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const teamId = selectedTeamId.value
  return aggregatedRows.value.filter((row) => {
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
const hasAnyPlayers = computed(() => allRows.value.length > 0)
const pagedRows = computed(() => {
  const start = first.value
  return sortedRows.value.slice(start, start + rowsPerPage.value)
})

watch([selectedTournamentId, selectedTeamId, searchQuery, sortKey, sortDir], () => {
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
  a.download = `organization-players-${selectedTournamentId.value ?? 'all'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(async () => {
  const qSort = normalizeSortKey(route.query[SORT_QUERY_KEY])
  const qDir = normalizeSortDir(route.query[DIR_QUERY_KEY])
  const qPage = normalizePositiveInt(route.query[PAGE_QUERY_KEY])
  const qRows = normalizePositiveInt(route.query[ROWS_QUERY_KEY])
  if (qSort) sortKey.value = qSort
  if (qDir) sortDir.value = qDir
  if (qRows && pageSizeOptions.includes(qRows)) rowsPerPage.value = qRows
  if (qPage) first.value = (qPage - 1) * rowsPerPage.value
  loading.value = true
  errorText.value = ''
  try {
    await ensureTenantResolved()
    if (tenantNotFound.value) {
      errorText.value = 'Тенант не найден. Проверьте ссылку.'
      return
    }

    const payload = (await fetchOrganizationPlayers(
      tenant.value,
    )) as PublicOrganizationPlayersResponse
    tournamentOptions.value = (payload.tournaments ?? []).map((t) => ({
      value: t.id,
      label: t.name,
    }))
    allRows.value = (payload.rows ?? []) as TournamentPlayerStatsRow[]
  } catch {
    errorText.value = 'Не удалось загрузить игроков организации.'
    allRows.value = []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="public-shell">
    <PublicHeader :tenant="tenant" />
    <section class="public-container">
      <div class="public-hero">
        <p class="text-xs font-semibold uppercase tracking-wide text-[#4f6b8c]">Участники организации</p>
        <h1 class="mt-2 text-2xl font-semibold text-[#123c67]">Игроки</h1>
      </div>

      <div v-if="errorText" class="public-error mt-4">{{ errorText }}</div>

      <div v-else class="mt-4 public-stage">
        <Transition name="public-fade" mode="out-in">
          <div v-if="loading" key="loading" class="rounded-xl border border-[#d6e0ee] bg-[#f7f9fc] p-4">
            <Skeleton width="100%" height="12rem" />
          </div>
          <div
            v-else-if="!hasAnyPlayers"
            key="empty-no-data"
            class="rounded-3xl border border-[#d6e0ee] bg-white px-6 py-10 text-center shadow-sm"
          >
            <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#f4f7fc] ring-1 ring-[#d6e0ee]">
              <i class="pi pi-users text-xl text-[#4f6b8c]" />
            </div>
            <h3 class="text-2xl font-semibold text-[#123c67]">Игроков пока нет</h3>
            <p class="mt-3 text-base text-[#4f6b8c]">
              После публикации турниров и протоколов здесь появится общий реестр игроков организации.
            </p>
          </div>
          <div v-else key="content" class="public-card space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-lg font-semibold text-[#123c67]">Реестр игроков</h2>
              <div class="flex flex-wrap items-center gap-2">
                <Button
                  label="Сброс вида"
                  icon="pi pi-filter-slash"
                  size="small"
                  outlined
                  aria-label="Сброс вида"
                  class="reset-view-btn !border-[#d2e2f7] !text-[#1a5a8c] hover:!border-[#f4c8d8] hover:!text-[#c80a48]"
                  @click="resetViewState"
                />
                <Button
                  label="Экспорт CSV"
                  icon="pi pi-download"
                  size="small"
                  outlined
                  aria-label="Экспорт CSV"
                  class="export-csv-btn !border-[#d2e2f7] !text-[#1a5a8c] hover:!border-[#f4c8d8] hover:!text-[#c80a48]"
                  @click="exportCsv"
                />
              </div>
            </div>

            <div ref="playersFiltersRef" class="public-stagger-appear grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div>
                <InputText
                  v-model="searchQuery"
                  class="w-full"
                  placeholder="Поиск по имени и фамилии"
                />
              </div>
              <div>
                <Select
                  v-model="selectedTournamentId"
                  :options="tournamentOptions"
                  option-label="label"
                  option-value="value"
                  show-clear
                  class="w-full"
                  placeholder="Фильтр по турниру"
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
                />
              </div>
            </div>

            <div v-if="!sortedRows.length" class="rounded-3xl border border-[#d6e0ee] bg-white px-6 py-10 text-center shadow-sm">
              <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#f4f7fc] ring-1 ring-[#d6e0ee]">
                <i class="pi pi-user-minus text-xl text-[#4f6b8c]" />
              </div>
              <h3 class="text-2xl font-semibold text-[#123c67]">Игроки не найдены</h3>
              <p class="mt-3 text-base text-[#4f6b8c]">
                По выбранным фильтрам записей нет. Измените параметры поиска или очистите фильтры.
              </p>
            </div>
            <div v-else class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-[#4f6b8c]">
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
              <table class="public-table public-stagger-tbody">
                <thead>
                  <tr>
                    <th style="width: 3.5rem"></th>
                    <th class="players-table-col-player" :aria-sort="ariaSortFor('lastName')"><button :class="sortButtonClass('lastName')" :aria-label="sortButtonAriaLabel('lastName', 'игрок')" @click="toggleSort('lastName')">Игрок{{ sortIndicator('lastName') }}</button></th>
                    <th class="players-table-col-team" :aria-sort="ariaSortFor('teamName')"><button :class="sortButtonClass('teamName')" :aria-label="sortButtonAriaLabel('teamName', 'команда')" @click="toggleSort('teamName')">Команда{{ sortIndicator('teamName') }}</button></th>
                    <th class="text-center players-table-col-num" :aria-sort="ariaSortFor('goals')"><button :class="sortButtonClass('goals')" :aria-label="sortButtonAriaLabel('goals', 'голы')" @click="toggleSort('goals')">Голы{{ sortIndicator('goals') }}</button></th>
                    <th class="text-center players-table-col-num" :aria-sort="ariaSortFor('assists')"><button :class="sortButtonClass('assists')" :aria-label="sortButtonAriaLabel('assists', 'ассисты')" @click="toggleSort('assists')">Ассисты{{ sortIndicator('assists') }}</button></th>
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
                <tbody ref="playersTbodyRef">
                  <tr v-for="row in pagedRows" :key="row.playerId">
                    <td>
                      <div class="h-9 w-9 overflow-hidden rounded-full">
                        <img
                          :src="resolveImageUrl(row.playerPhotoUrl, PLAYER_PLACEHOLDER_SRC)"
                          :alt="`${row.lastName} ${row.firstName}`"
                          class="h-full w-full object-cover"
                          loading="lazy"
                          @error="(e) => handleImageError(e, PLAYER_PLACEHOLDER_SRC)"
                        />
                      </div>
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
                        <img
                          :src="resolveImageUrl(row.teamLogoUrl, TEAM_PLACEHOLDER_SRC)"
                          :alt="row.teamName ?? 'Команда'"
                          class="h-5 w-5 rounded-full object-cover"
                          loading="lazy"
                          @error="(e) => handleImageError(e, TEAM_PLACEHOLDER_SRC)"
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
        </Transition>
      </div>
    </section>
    <PublicFooter />
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

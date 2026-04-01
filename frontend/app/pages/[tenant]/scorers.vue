<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { TournamentDetails, TableRow } from '~/types/tournament-admin'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { usePublicTournamentSelection } from '~/composables/usePublicTournamentSelection'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import PublicTournamentSidebar from '~/app/components/public/PublicTournamentSidebar.vue'
import PublicTournamentContextCard from '~/app/components/public/PublicTournamentContextCard.vue'
import type { PublicTenantMeta } from '~/composables/usePublicTournamentFetch'

definePageMeta({
  layout: 'public',
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
  | 'birthDate'
  | 'teamName'
  | 'goals'
  | 'assists'
  | 'yellowCards'
  | 'redCards'

const { loadAllTournaments, fetchTournamentDetail, fetchRoster, fetchTenantMeta, fetchTable } = usePublicTournamentFetch()
const { tenantSlug, selectedTid, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug

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

const tenantMeta = ref<PublicTenantMeta | null>(null)
const errorText = ref('')
const pageReady = ref(false)
const isInitializing = ref(true)
const loadingRows = ref(false)
const rows = ref<PlayerStatsRow[]>([])
const requestId = ref(0)
const sidebarStandingsPreview = ref<Array<{ teamId: string; teamName: string; points: number; played: number; goalDiff: number; logoUrl: string | null }>>([])

const searchQuery = ref('')
const selectedTeamId = ref<string | null>(null)
const birthYearFilter = ref<string | null>(null)
const sortKey = ref<SortKey>('goals')
const sortDir = ref<'asc' | 'desc'>('desc')
const first = ref(0)
const rowsPerPage = ref(11)
const pageSizeOptions = [11, 25, 50, 100]

const PLAYER_PLACEHOLDER_SRC = '/placeholders/player.svg'
const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'

const showPageSkeleton = computed(
  () => !pageReady.value || loading.value || (loadingRows.value && !rows.value.length),
)

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

const teamOptions = computed(() => {
  const map = new Map<string, string>()
  for (const row of rows.value) {
    if (row.teamId && row.teamName) map.set(row.teamId, row.teamName)
  }
  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
})

const birthYearOptions = computed(() => {
  const years = new Set<string>()
  for (const row of rows.value) {
    const y = normalizeDateIso(row.birthDate).slice(0, 4)
    if (y) years.add(y)
  }
  return Array.from(years)
    .sort((a, b) => Number(b) - Number(a))
    .map((year) => ({ value: year, label: year }))
})

function normalizeDateIso(value: string | Date | null | undefined) {
  if (!value) return ''
  const dt = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(dt.getTime())) return ''
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatBirthDate(value: string | null) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('ru-RU')
}

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

function parseCardColor(event: TournamentDetails['matches'][number]['events'][number]): 'yellow' | 'red' | null {
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

function parseAssistPlayerId(event: TournamentDetails['matches'][number]['events'][number]): string {
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
    next === 'lastName' || next === 'firstName' || next === 'teamName' || next === 'birthDate'
      ? 'asc'
      : 'desc'
}

function sortIndicator(next: SortKey) {
  if (sortKey.value !== next) return ''
  return sortDir.value === 'asc' ? ' ↑' : ' ↓'
}

const filteredRows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const teamId = selectedTeamId.value
  const birthYear = String(birthYearFilter.value ?? '').trim()

  return rows.value.filter((row) => {
    if (teamId && row.teamId !== teamId) return false
    if (birthYear && normalizeDateIso(row.birthDate).slice(0, 4) !== birthYear) return false
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
      case 'birthDate':
        return dir * str(a.birthDate).localeCompare(str(b.birthDate), 'ru')
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

watch([searchQuery, selectedTeamId, birthYearFilter, sortKey, sortDir], () => {
  first.value = 0
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

function toCsvCell(value: string | number | null | undefined) {
  const raw = String(value ?? '')
  const escaped = raw.replace(/"/g, '""')
  return `"${escaped}"`
}

function exportCsv() {
  const head = [
    'Фамилия',
    'Имя',
    'Дата рождения',
    'Команда',
    'Голы',
    'Ассисты',
    'Желтые карточки',
    'Красные карточки',
  ]
  const body = sortedRows.value.map((row) => [
    row.lastName,
    row.firstName,
    formatBirthDate(row.birthDate),
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
    sidebarStandingsPreview.value = []
    return
  }

  const tid = selectedTournamentId.value
  const rid = ++requestId.value
  loadingRows.value = true
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
        logoUrl: logoByTeamId[row.teamId] ?? null,
      }))

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
    errorText.value = 'Не удалось загрузить статистику игроков.'
  } finally {
    if (rid === requestId.value) loadingRows.value = false
  }
}

watch(selectedTournamentId, () => {
  if (isInitializing.value) return
  syncTidToQuery(selectedTournamentId.value || null)
  void fetchTournamentPlayerStats()
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
        const status = e?.response?.status ?? e?.statusCode
        errorText.value =
          status === 404 ? 'Тенант не найден. Проверьте ссылку.' : 'Не удалось загрузить турниры.'
      },
    })
    await fetchTournamentPlayerStats()
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
            <Skeleton class="mt-4" width="100%" height="2.75rem" />
          </div>
          <div class="public-card">
            <Skeleton width="44%" height="1rem" />
            <Skeleton class="mt-3" width="100%" height="14rem" />
          </div>
        </div>

        <div v-else key="content" class="space-y-4">
          <PublicTournamentContextCard
            v-model="selectedTournamentId"
            :options="tournaments"
            :loading="loading"
            :title="selectedTournament?.name || 'Статистика игроков'"
            subtitle="Игроки выбранного турнира"
            :status-label="tournamentStatusLabel"
            :status-class="tournamentStatusBadgeClass"
          />

          <div v-if="errorText" class="public-error">
            {{ errorText }}
          </div>

          <div class="public-card space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-lg font-semibold text-[#123c67]">Игроки турнира</h2>
              <Button
                label="Экспорт CSV"
                icon="pi pi-download"
                size="small"
                outlined
                class="!border-[#d2e2f7] !text-[#1a5a8c] hover:!border-[#f4c8d8] hover:!text-[#c80a48]"
                @click="exportCsv"
              />
            </div>

            <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div>
                <InputText
                  v-model="searchQuery"
                  class="w-full"
                  placeholder="Поиск по имени и фамилии"
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
              <div>
                <Select
                  v-model="birthYearFilter"
                  :options="birthYearOptions"
                  option-label="label"
                  option-value="value"
                  show-clear
                  class="w-full"
                  placeholder="Год рождения"
                />
              </div>
            </div>

            <div v-if="loadingRows" class="rounded-xl border border-[#d6e0ee] bg-[#f7f9fc] p-4">
              <Skeleton width="100%" height="10rem" />
            </div>

            <div v-else-if="!sortedRows.length" class="public-empty">
              По выбранным фильтрам игроки не найдены.
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
              <table class="public-table">
                <thead>
                  <tr>
                    <th style="width: 3.5rem"></th>
                    <th>
                      <button class="font-semibold" @click="toggleSort('lastName')">Игрок{{ sortIndicator('lastName') }}</button>
                    </th>
                    <th>
                      <button class="font-semibold" @click="toggleSort('birthDate')">Дата рожд.{{ sortIndicator('birthDate') }}</button>
                    </th>
                    <th>
                      <button class="font-semibold" @click="toggleSort('teamName')">Команда{{ sortIndicator('teamName') }}</button>
                    </th>
                    <th class="text-center"><button class="font-semibold" @click="toggleSort('goals')">Голы{{ sortIndicator('goals') }}</button></th>
                    <th class="text-center"><button class="font-semibold" @click="toggleSort('assists')">Ассисты{{ sortIndicator('assists') }}</button></th>
                    <th class="text-center">
                      <button class="inline-flex items-center gap-1 font-semibold" @click="toggleSort('yellowCards')">
                        <span class="card-mini card-mini-yellow" />
                        ЖК{{ sortIndicator('yellowCards') }}
                      </button>
                    </th>
                    <th class="text-center">
                      <button class="inline-flex items-center gap-1 font-semibold" @click="toggleSort('redCards')">
                        <span class="card-mini card-mini-red" />
                        КК{{ sortIndicator('redCards') }}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
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
                    <td class="font-medium">{{ `${row.lastName || ''} ${row.firstName || ''}`.trim() || '—' }}</td>
                    <td>{{ formatBirthDate(row.birthDate) }}</td>
                    <td>
                      <div class="flex items-center gap-2">
                        <img
                          :src="resolveImageUrl(row.teamLogoUrl, TEAM_PLACEHOLDER_SRC)"
                          :alt="row.teamName ?? 'Команда'"
                          class="h-5 w-5 rounded-full object-cover"
                          loading="lazy"
                          @error="(e) => handleImageError(e, TEAM_PLACEHOLDER_SRC)"
                        />
                        <span>{{ row.teamName || '—' }}</span>
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
        active="players"
      />
    </div>
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
</style>

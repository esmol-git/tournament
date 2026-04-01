<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { TournamentDetails } from '~/types/tournament-admin'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'

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
  | 'birthDate'
  | 'teamName'
  | 'goals'
  | 'assists'
  | 'yellowCards'
  | 'redCards'

const { tenantSlug, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const { loadAllTournaments, fetchRoster, fetchTournamentDetail } = usePublicTournamentFetch()

const loading = ref(true)
const errorText = ref('')
const allRows = ref<TournamentPlayerStatsRow[]>([])
const tournamentOptions = ref<Array<{ value: string; label: string }>>([])

const selectedTournamentId = ref<string | null>(null)
const selectedTeamId = ref<string | null>(null)
const birthYearFilter = ref<string | null>(null)
const searchQuery = ref('')
const sortKey = ref<SortKey>('lastName')
const sortDir = ref<'asc' | 'desc'>('asc')
const first = ref(0)
const rowsPerPage = ref(11)
const pageSizeOptions = [11, 25, 50, 100]

const PLAYER_PLACEHOLDER_SRC = '/placeholders/player.svg'
const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'

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

const birthYearOptions = computed(() => {
  const years = new Set<string>()
  for (const row of aggregatedRows.value) {
    const y = normalizeDateIso(row.birthDate).slice(0, 4)
    if (y) years.add(y)
  }
  return Array.from(years)
    .sort((a, b) => Number(b) - Number(a))
    .map((year) => ({ value: year, label: year }))
})

const filteredRows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const teamId = selectedTeamId.value
  const birthYear = String(birthYearFilter.value ?? '').trim()
  return aggregatedRows.value.filter((row) => {
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
const hasAnyPlayers = computed(() => allRows.value.length > 0)
const pagedRows = computed(() => {
  const start = first.value
  return sortedRows.value.slice(start, start + rowsPerPage.value)
})

watch([selectedTournamentId, selectedTeamId, birthYearFilter, searchQuery, sortKey, sortDir], () => {
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
  a.download = `organization-players-${selectedTournamentId.value ?? 'all'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(async () => {
  loading.value = true
  errorText.value = ''
  try {
    await ensureTenantResolved()
    if (tenantNotFound.value) {
      errorText.value = 'Тенант не найден. Проверьте ссылку.'
      return
    }

    const tournaments = await loadAllTournaments(tenant.value)
    tournamentOptions.value = tournaments.map((t) => ({ value: t.id, label: t.name }))
    const chunks = await Promise.all(
      tournaments.slice(0, 20).map(async (t) => {
        const [roster, detail] = await Promise.all([
          fetchRoster(tenant.value, t.id),
          fetchTournamentDetail(tenant.value, t.id),
        ])
        const byPlayer = new Map<string, TournamentPlayerStatsRow>()
        for (const team of roster) {
          for (const p of team.players) {
            const names = playerNameParts(p)
            byPlayer.set(p.id, {
              tournamentId: t.id,
              tournamentName: t.name,
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

        return Array.from(byPlayer.values())
      }),
    )
    allRows.value = chunks.flat()
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
              <Button
                label="Экспорт CSV"
                icon="pi pi-download"
                size="small"
                outlined
                class="!border-[#d2e2f7] !text-[#1a5a8c] hover:!border-[#f4c8d8] hover:!text-[#c80a48]"
                @click="exportCsv"
              />
            </div>

            <div class="grid grid-cols-1 gap-3 lg:grid-cols-4">
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
              <table class="public-table">
                <thead>
                  <tr>
                    <th style="width: 3.5rem"></th>
                    <th><button class="font-semibold" @click="toggleSort('lastName')">Игрок{{ sortIndicator('lastName') }}</button></th>
                    <th><button class="font-semibold" @click="toggleSort('birthDate')">Дата рожд.{{ sortIndicator('birthDate') }}</button></th>
                    <th><button class="font-semibold" @click="toggleSort('teamName')">Команда{{ sortIndicator('teamName') }}</button></th>
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

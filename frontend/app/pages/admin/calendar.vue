<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventInput } from '@fullcalendar/core'
import ruLocale from '@fullcalendar/core/locales/ru'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { MatchRow, TeamLite, TenantTournamentMatchRow } from '~/types/tournament-admin'
import {
  formatMatchScoreDisplay,
  isMatchEditLocked,
  statusLabel,
  statusOptions,
} from '~/utils/tournamentAdminUi'
import { getApiErrorMessage } from '~/utils/apiError'

definePageMeta({ layout: 'admin' })

const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()

const loading = ref(false)
const standaloneMatches = ref<MatchRow[]>([])
const tournamentMatches = ref<TenantTournamentMatchRow[]>([])
const teams = ref<TeamLite[]>([])
const selectedTournamentId = ref('')
const selectedTeamId = ref('')
const selectedStatus = ref('')
const sourceFilter = ref<'all' | 'standalone' | 'tournament'>('all')
const showLocked = ref(true)
const slotMinutes = ref<15 | 30>(15)
const eventColors = ref<Record<string, string>>({})
const eventDurationsMin = ref<Record<string, number>>({})
const editVisible = ref(false)
const editSaving = ref(false)
const editSubmitAttempted = ref(false)
const editModel = ref<{
  eventId: string
  source: 'standalone' | 'tournament'
  matchId: string
  tournamentId: string | null
  locked: boolean
  title: string
  status: string | null
  startIso: string
  startLocal: string
  endLocal: string
  color: string
} | null>(null)
const createVisible = ref(false)
const createSaving = ref(false)
const createSubmitAttempted = ref(false)
const createModel = ref<{
  startLocal: string
  endLocal: string
  homeTeamId: string
  awayTeamId: string
  color: string
} | null>(null)

type CalendarMeta = {
  source: 'standalone' | 'tournament'
  matchId: string
  tournamentId: string | null
  locked: boolean
  status: string | null
}

function colorStorageKey() {
  return `admin_calendar_match_colors_${tenantId.value}`
}

function loadColors() {
  if (!process.client) return
  try {
    const raw = localStorage.getItem(colorStorageKey())
    eventColors.value = raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    eventColors.value = {}
  }
}

function saveColors() {
  if (!process.client) return
  localStorage.setItem(colorStorageKey(), JSON.stringify(eventColors.value))
}

function durationStorageKey() {
  return `admin_calendar_match_durations_${tenantId.value}`
}

function loadDurations() {
  if (!process.client) return
  try {
    const raw = localStorage.getItem(durationStorageKey())
    eventDurationsMin.value = raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    eventDurationsMin.value = {}
  }
}

function saveDurations() {
  if (!process.client) return
  localStorage.setItem(durationStorageKey(), JSON.stringify(eventDurationsMin.value))
}

function defaultColor(locked: boolean, source: 'standalone' | 'tournament') {
  if (locked) return '#6b7280'
  return source === 'standalone' ? '#10b981' : '#6366f1'
}

function defaultDurationMin() {
  return 60
}

function addMinutes(iso: string, minutes: number) {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

function toLocalDatetimeValue(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hh = pad(d.getHours())
  const mm = pad(d.getMinutes())
  return `${y}-${m}-${day}T${hh}:${mm}`
}

function matchTitleWithScore(m: MatchRow | TenantTournamentMatchRow) {
  const base = `${m.homeTeam.name} - ${m.awayTeam.name}`
  const hasScore = m.homeScore !== null && m.homeScore !== undefined && m.awayScore !== null && m.awayScore !== undefined
  if (!hasScore) return base
  return `${base} (${formatMatchScoreDisplay(m)})`
}

function isUnknownPlayoffTeamName(name: string) {
  const normalized = name.trim().toLowerCase()
  // Examples:
  // - "Победитель матча 13", "Проигравший матча 14"
  // - "A1", "B2"
  return (
    normalized.includes('победитель матча') ||
    normalized.includes('проигравший матча') ||
    /^[a-z]\d+$/i.test(normalized)
  )
}

function shouldHideUnknownPlayoffMatch(m: MatchRow | TenantTournamentMatchRow) {
  if (m.stage !== 'PLAYOFF') return false
  return (
    isUnknownPlayoffTeamName(m.homeTeam.name) ||
    isUnknownPlayoffTeamName(m.awayTeam.name)
  )
}

const teamOptions = computed(() =>
  teams.value.map((t) => ({ label: t.name, value: t.id })),
)
const tournamentOptions = computed(() => {
  const map = new Map<string, { label: string; value: string }>()
  for (const m of tournamentMatches.value) {
    map.set(m.tournament.id, {
      label: m.tournament.name,
      value: m.tournament.id,
    })
  }
  return Array.from(map.values())
})
const statusFilterOptions = computed(() =>
  statusOptions.map((s) => ({ label: s.label, value: s.value })),
)
const editErrors = computed(() => {
  const m = editModel.value
  if (!m) return { startLocal: '', endLocal: '', range: '' }
  const start = new Date(m.startLocal)
  const end = new Date(m.endLocal)
  const startOk = !Number.isNaN(start.getTime())
  const endOk = !Number.isNaN(end.getTime())
  const rangeOk = !m.locked && startOk && endOk ? end > start : true
  return {
    startLocal: startOk ? '' : t('admin.validation.required_start_time'),
    endLocal: endOk ? '' : t('admin.validation.required_end_date'),
    range: rangeOk ? '' : t('admin.validation.end_after_start'),
  }
})
const canSaveEdit = computed(
  () =>
    !editErrors.value.startLocal &&
    !editErrors.value.endLocal &&
    !editErrors.value.range,
)
const createErrors = computed(() => {
  const m = createModel.value
  if (!m) return { homeTeamId: '', awayTeamId: '', sameTeams: '', startLocal: '', endLocal: '', range: '' }
  const start = new Date(m.startLocal)
  const end = new Date(m.endLocal)
  const startOk = !Number.isNaN(start.getTime())
  const endOk = !Number.isNaN(end.getTime())
  return {
    homeTeamId: m.homeTeamId ? '' : t('admin.validation.required'),
    awayTeamId: m.awayTeamId ? '' : t('admin.validation.required'),
    sameTeams:
      !m.homeTeamId || !m.awayTeamId || m.homeTeamId !== m.awayTeamId
        ? ''
        : t('admin.validation.different_values'),
    startLocal: startOk ? '' : t('admin.validation.required_start_time'),
    endLocal: endOk ? '' : t('admin.validation.required_end_date'),
    range: startOk && endOk && end > start ? '' : t('admin.validation.end_after_start'),
  }
})
const canCreateFromSlot = computed(
  () =>
    !createErrors.value.homeTeamId &&
    !createErrors.value.awayTeamId &&
    !createErrors.value.sameTeams &&
    !createErrors.value.startLocal &&
    !createErrors.value.endLocal &&
    !createErrors.value.range,
)

const calendarEvents = computed<EventInput[]>(() => {
  const standalone = standaloneMatches.value.map((m) => ({
    id: `standalone:${m.id}`,
    start: m.startTime,
    end: addMinutes(
      m.startTime,
      eventDurationsMin.value[`standalone:${m.id}`] ?? defaultDurationMin(),
    ),
    title: matchTitleWithScore(m),
    allDay: false,
    editable: !isMatchEditLocked(m.status),
    backgroundColor:
      eventColors.value[`standalone:${m.id}`] ??
      defaultColor(isMatchEditLocked(m.status), 'standalone'),
    borderColor:
      eventColors.value[`standalone:${m.id}`] ??
      defaultColor(isMatchEditLocked(m.status), 'standalone'),
    extendedProps: {
      source: 'standalone',
      matchId: m.id,
      tournamentId: null,
      locked: isMatchEditLocked(m.status),
      status: m.status ?? null,
    } satisfies CalendarMeta,
  }))

  const tournament = tournamentMatches.value
    .filter((m) => !shouldHideUnknownPlayoffMatch(m))
    .map((m) => ({
    id: `tournament:${m.id}`,
    start: m.startTime,
    end: addMinutes(
      m.startTime,
      eventDurationsMin.value[`tournament:${m.id}`] ?? defaultDurationMin(),
    ),
    title: matchTitleWithScore(m),
    allDay: false,
    editable: !isMatchEditLocked(m.status),
    backgroundColor:
      eventColors.value[`tournament:${m.id}`] ??
      defaultColor(isMatchEditLocked(m.status), 'tournament'),
    borderColor:
      eventColors.value[`tournament:${m.id}`] ??
      defaultColor(isMatchEditLocked(m.status), 'tournament'),
    extendedProps: {
      source: 'tournament',
      matchId: m.id,
      tournamentId: m.tournament.id,
      locked: isMatchEditLocked(m.status),
      status: m.status ?? null,
    } satisfies CalendarMeta,
    }))

  return [...standalone, ...tournament]
})

async function fetchMatches() {
  if (!token.value) return
  loading.value = true
  try {
    const common = new URLSearchParams()
    if (selectedTeamId.value) common.set('teamId', selectedTeamId.value)
    if (selectedStatus.value) common.set('status', selectedStatus.value)
    if (!showLocked.value) common.set('includeLocked', 'false')

    const shouldLoadStandalone =
      sourceFilter.value === 'all' || sourceFilter.value === 'standalone'
    const shouldLoadTournament =
      sourceFilter.value === 'all' || sourceFilter.value === 'tournament'

    const standalonePromise = shouldLoadStandalone
      ? authFetch<MatchRow[]>(
          apiUrl(
            `/tenants/${tenantId.value}/standalone-matches${
              common.toString() ? `?${common.toString()}` : ''
            }`,
          ),
        )
      : Promise.resolve([] as MatchRow[])

    const allTournamentMatches: TenantTournamentMatchRow[] = []
    if (shouldLoadTournament) {
      let page = 1
      let total = 0
      do {
        const params = new URLSearchParams(common.toString())
        params.set('page', String(page))
        params.set('pageSize', '100')
        params.set('excludeUndeterminedPlayoff', 'true')
        if (selectedTournamentId.value) {
          params.set('tournamentId', selectedTournamentId.value)
        }
        const chunk = await authFetch<{ items: TenantTournamentMatchRow[]; total: number }>(
          apiUrl(`/tenants/${tenantId.value}/matches?${params.toString()}`),
        )
        const items = chunk.items ?? []
        total = chunk.total ?? items.length
        allTournamentMatches.push(...items)
        page += 1
        if (!items.length) break
      } while (allTournamentMatches.length < total)
    }

    const standalone = await standalonePromise

    const inTournament = {
      items: allTournamentMatches,
    }
    standaloneMatches.value = standalone ?? []
    tournamentMatches.value = inTournament.items ?? []
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось загрузить матчи',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 5000,
    })
  } finally {
    loading.value = false
  }
}

async function fetchTeams() {
  if (!token.value) return
  try {
    const all: TeamLite[] = []
    let page = 1
    let total = 0
    do {
      const res = await authFetch<{ items: TeamLite[]; total: number }>(
        apiUrl(`/tenants/${tenantId.value}/teams?page=${page}&pageSize=100`),
      )
      const items = res.items ?? []
      total = res.total ?? items.length
      all.push(...items)
      page += 1
      if (!items.length) break
    } while (all.length < total)
    teams.value = all
  } catch {
    teams.value = []
  }
}

function onEventClick(arg: any) {
  const meta = arg.event.extendedProps as CalendarMeta | undefined
  if (!meta) return
  const eventId = arg.event.id as string
  const startIso = (arg.event.start as Date)?.toISOString()
  if (!startIso) return
  const startDate = arg.event.start as Date
  const endDate = (arg.event.end as Date | null) ?? new Date(startDate.getTime() + defaultDurationMin() * 60 * 1000)
  editModel.value = {
    eventId,
    source: meta.source,
    matchId: meta.matchId,
    tournamentId: meta.tournamentId,
    locked: meta.locked,
    title: arg.event.title as string,
    status: meta.status,
    startIso,
    startLocal: toLocalDatetimeValue(startIso),
    endLocal: toLocalDatetimeValue(endDate.toISOString()),
    color: eventColors.value[eventId] ?? defaultColor(meta.locked, meta.source),
  }
  editSubmitAttempted.value = false
  editVisible.value = true
}

async function saveEventEdit() {
  const model = editModel.value
  if (!model) return
  editSubmitAttempted.value = true
  if (!canSaveEdit.value) {
    return
  }
  editSaving.value = true
  try {
    eventColors.value[model.eventId] = model.color
    saveColors()

    if (!model.locked) {
      const newStartDate = new Date(model.startLocal)
      const newEndDate = new Date(model.endLocal)
      if (Number.isNaN(newStartDate.getTime()) || Number.isNaN(newEndDate.getTime())) {
        throw new Error('Некорректные дата/время')
      }
      if (newEndDate <= newStartDate) {
        throw new Error('Время окончания должно быть позже времени начала')
      }
      const durationMin = Math.max(
        15,
        Math.round((newEndDate.getTime() - newStartDate.getTime()) / 60000),
      )
      eventDurationsMin.value[model.eventId] = durationMin
      saveDurations()

      const newStartIso = newStartDate.toISOString()
      if (newStartIso !== model.startIso) {
        if (model.source === 'standalone') {
          await authFetch(apiUrl(`/tenants/${tenantId.value}/standalone-matches/${model.matchId}`), {
            method: 'PATCH',
            body: { startTime: newStartIso },
          })
        } else if (model.tournamentId) {
          await authFetch(apiUrl(`/tournaments/${model.tournamentId}/matches/${model.matchId}`), {
            method: 'PATCH',
            body: { startTime: newStartIso },
          })
        }
      }
    }

    await fetchMatches()
    editVisible.value = false
    toast.add({ severity: 'success', summary: 'Матч обновлён', life: 2200 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 5000,
    })
  } finally {
    editSaving.value = false
  }
}

function onSelectRange(arg: any) {
  const start = arg.start as Date | null
  const end = arg.end as Date | null
  if (!start || !end) return
  createModel.value = {
    startLocal: toLocalDatetimeValue(start.toISOString()),
    endLocal: toLocalDatetimeValue(end.toISOString()),
    homeTeamId: '',
    awayTeamId: '',
    color: '#10b981',
  }
  createSubmitAttempted.value = false
  createVisible.value = true
  arg.view?.calendar?.unselect?.()
}

async function createMatchFromSlot() {
  const m = createModel.value
  if (!m) return
  createSubmitAttempted.value = true
  if (!canCreateFromSlot.value) {
    return
  }
  const start = new Date(m.startLocal)
  const end = new Date(m.endLocal)

  createSaving.value = true
  try {
    const created = await authFetch<MatchRow>(
      apiUrl(`/tenants/${tenantId.value}/standalone-matches`),
      {
        method: 'POST',
        body: {
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          startTime: start.toISOString(),
        },
      },
    )

    const eventId = `standalone:${created.id}`
    eventColors.value[eventId] = m.color
    saveColors()
    eventDurationsMin.value[eventId] = Math.max(
      15,
      Math.round((end.getTime() - start.getTime()) / 60000),
    )
    saveDurations()

    createVisible.value = false
    await fetchMatches()
    toast.add({ severity: 'success', summary: 'Матч создан', life: 2200 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось создать матч',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 5000,
    })
  } finally {
    createSaving.value = false
  }
}

async function onEventDrop(arg: any) {
  const meta = arg.event.extendedProps as CalendarMeta | undefined
  if (!meta) {
    arg.revert()
    return
  }
  if (meta.locked) {
    arg.revert()
    toast.add({
      severity: 'warn',
      summary: 'Матч завершён',
      detail: 'Завершённые матчи нельзя перетаскивать',
      life: 3500,
    })
    return
  }

  const start = arg.event.start
  if (!start) {
    arg.revert()
    return
  }

  try {
    if (meta.source === 'standalone') {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/standalone-matches/${meta.matchId}`), {
        method: 'PATCH',
        body: { startTime: start.toISOString() },
      })
    } else if (meta.tournamentId) {
      await authFetch(apiUrl(`/tournaments/${meta.tournamentId}/matches/${meta.matchId}`), {
        method: 'PATCH',
        body: { startTime: start.toISOString() },
      })
    }
    await fetchMatches()
    toast.add({
      severity: 'success',
      summary: 'Дата матча обновлена',
      life: 2200,
    })
  } catch (e: unknown) {
    arg.revert()
    toast.add({
      severity: 'error',
      summary: 'Не удалось изменить дату',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 5000,
    })
  }
}

const calendarOptions = computed(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
  initialView: 'timeGridWeek',
  locale: ruLocale,
  firstDay: 1,
  editable: true,
  eventStartEditable: true,
  eventDurationEditable: false,
  selectable: true,
  selectMirror: true,
  slotMinTime: '08:00:00',
  // FullCalendar treats slotMaxTime as exclusive.
  // 21:00 makes the 20:00 line visible as the last slot.
  slotMaxTime: '21:00:00',
  slotDuration: slotMinutes.value === 15 ? '00:15:00' : '00:30:00',
  snapDuration: slotMinutes.value === 15 ? '00:15:00' : '00:30:00',
  slotLabelInterval: slotMinutes.value === 15 ? '00:15:00' : '00:30:00',
  slotLabelFormat: {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  },
  eventTimeFormat: {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  },
  allDaySlot: false,
  nowIndicator: true,
  contentHeight: 'auto',
  expandRows: false,
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'dayGridMonth,timeGridWeek,timeGridDay',
  },
  eventDrop: onEventDrop,
  eventClick: onEventClick,
  select: onSelectRange,
  events: calendarEvents.value,
}))

onMounted(async () => {
  syncWithStorage()
  if (!loggedIn.value) {
    await router.push('/admin/login')
    return
  }
  loadColors()
  loadDurations()
  await Promise.all([fetchMatches(), fetchTeams()])
})

watch(
  [selectedTournamentId, selectedTeamId, selectedStatus, sourceFilter, showLocked],
  () => {
    void fetchMatches()
  },
)
</script>

<template>
  <section class="p-6 space-y-4">
    <header>
      <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
        Календарь матчей
      </h1>
      <p class="mt-1 text-sm text-muted-color">
        Показаны созданные матчи tenant-а. Перетаскивание меняет дату. Статусы {{ statusLabel('FINISHED') }}, {{ statusLabel('PLAYED') }}, {{ statusLabel('CANCELED') }} — заблокированы для переноса.
      </p>
    </header>

    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
      <Select
        v-model="sourceFilter"
        :options="[
          { label: 'Все матчи', value: 'all' },
          { label: 'Только турнирные', value: 'tournament' },
          { label: 'Только вне турнира', value: 'standalone' },
        ]"
        option-label="label"
        option-value="value"
        placeholder="Тип матча"
      />
      <Select
        v-model="selectedTournamentId"
        :options="[{ label: 'Все турниры', value: '' }, ...tournamentOptions]"
        option-label="label"
        option-value="value"
        placeholder="Турнир"
      />
      <Select
        v-model="selectedTeamId"
        :options="[{ label: 'Все команды', value: '' }, ...teamOptions]"
        option-label="label"
        option-value="value"
        placeholder="Команда"
      />
      <Select
        v-model="selectedStatus"
        :options="[{ label: 'Любой статус', value: '' }, ...statusFilterOptions]"
        option-label="label"
        option-value="value"
        placeholder="Статус"
      />
      <Select
        v-model="slotMinutes"
        :options="[
          { label: 'Сетка 15 мин', value: 15 },
          { label: 'Сетка 30 мин', value: 30 },
        ]"
        option-label="label"
        option-value="value"
        placeholder="Сетка"
      />
      <div class="flex items-center gap-2 rounded border border-surface-200 px-3">
        <Checkbox v-model="showLocked" binary input-id="showLocked" />
        <label for="showLocked" class="text-sm">Показывать завершённые</label>
      </div>
    </div>

    <div class="admin-calendar rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-3">
      <ClientOnly>
        <FullCalendar :options="calendarOptions" />
      </ClientOnly>
      <div v-if="loading" class="mt-3 text-sm text-muted-color">
        Загрузка матчей...
      </div>
    </div>

    <Dialog
      v-model:visible="editVisible"
      modal
      :style="{ width: '30rem', maxWidth: '95vw' }"
      header="Редактирование матча"
    >
      <div v-if="editModel" class="space-y-3">
        <div>
          <div class="text-sm font-medium">{{ editModel.title }}</div>
          <div class="text-xs text-muted-color">Статус: {{ statusLabel(editModel.status) }}</div>
        </div>

        <div>
          <label class="text-sm block mb-1">Дата и время</label>
          <InputText
            v-model="editModel.startLocal"
            type="datetime-local"
            class="w-full"
            :invalid="(editSubmitAttempted && !!editErrors.startLocal) || (editSubmitAttempted && !!editErrors.range)"
            :disabled="editModel.locked"
          />
          <p v-if="editModel.locked" class="mt-1 text-xs text-amber-600">
            Завершённые матчи нельзя сдвигать по дате.
          </p>
          <p v-if="editSubmitAttempted && editErrors.startLocal" class="mt-0 text-[11px] leading-3 text-red-500">{{ editErrors.startLocal }}</p>
        </div>

        <div>
          <label class="text-sm block mb-1">Время окончания</label>
          <InputText
            v-model="editModel.endLocal"
            type="datetime-local"
            class="w-full"
            :invalid="(editSubmitAttempted && !!editErrors.endLocal) || (editSubmitAttempted && !!editErrors.range)"
            :disabled="editModel.locked"
          />
          <p v-if="editSubmitAttempted && editErrors.endLocal" class="mt-0 text-[11px] leading-3 text-red-500">{{ editErrors.endLocal }}</p>
          <p v-if="editSubmitAttempted && editErrors.range" class="mt-0 text-[11px] leading-3 text-red-500">{{ editErrors.range }}</p>
        </div>

        <div>
          <label class="text-sm block mb-1">Цвет выделения</label>
          <InputText
            v-model="editModel.color"
            type="color"
            class="h-10 w-16 p-1"
          />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <Button label="Отмена" text @click="editVisible = false" />
          <Button label="Сохранить" icon="pi pi-check" :loading="editSaving" :disabled="editSaving || (editSubmitAttempted && !canSaveEdit)" @click="saveEventEdit" />
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="createVisible"
      modal
      :style="{ width: '32rem', maxWidth: '95vw' }"
      header="Создание матча"
    >
      <div v-if="createModel" class="space-y-3">
        <div>
          <label class="text-sm block mb-1">Команда 1</label>
          <Select
            v-model="createModel.homeTeamId"
            :options="teamOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            :invalid="(createSubmitAttempted && !!createErrors.homeTeamId) || (createSubmitAttempted && !!createErrors.sameTeams)"
            placeholder="Выберите команду"
          />
          <p v-if="createSubmitAttempted && createErrors.homeTeamId" class="mt-0 text-[11px] leading-3 text-red-500">{{ createErrors.homeTeamId }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Команда 2</label>
          <Select
            v-model="createModel.awayTeamId"
            :options="teamOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            :invalid="(createSubmitAttempted && !!createErrors.awayTeamId) || (createSubmitAttempted && !!createErrors.sameTeams)"
            placeholder="Выберите команду"
          />
          <p v-if="createSubmitAttempted && createErrors.awayTeamId" class="mt-0 text-[11px] leading-3 text-red-500">{{ createErrors.awayTeamId }}</p>
          <p v-if="createSubmitAttempted && createErrors.sameTeams" class="mt-0 text-[11px] leading-3 text-red-500">{{ createErrors.sameTeams }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Время начала</label>
          <InputText v-model="createModel.startLocal" type="datetime-local" class="w-full" :invalid="(createSubmitAttempted && !!createErrors.startLocal) || (createSubmitAttempted && !!createErrors.range)" />
          <p v-if="createSubmitAttempted && createErrors.startLocal" class="mt-0 text-[11px] leading-3 text-red-500">{{ createErrors.startLocal }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Время окончания</label>
          <InputText v-model="createModel.endLocal" type="datetime-local" class="w-full" :invalid="(createSubmitAttempted && !!createErrors.endLocal) || (createSubmitAttempted && !!createErrors.range)" />
          <p v-if="createSubmitAttempted && createErrors.endLocal" class="mt-0 text-[11px] leading-3 text-red-500">{{ createErrors.endLocal }}</p>
          <p v-if="createSubmitAttempted && createErrors.range" class="mt-0 text-[11px] leading-3 text-red-500">{{ createErrors.range }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Цвет выделения</label>
          <InputText v-model="createModel.color" type="color" class="h-10 w-16 p-1" />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <Button label="Отмена" text @click="createVisible = false" />
          <Button label="Создать" icon="pi pi-check" :loading="createSaving" :disabled="createSaving || (createSubmitAttempted && !canCreateFromSlot)" @click="createMatchFromSlot" />
        </div>
      </div>
    </Dialog>
  </section>
</template>

<style scoped>
.admin-calendar :deep(.fc .fc-timegrid-slot) {
  height: 2.5rem;
}
</style>

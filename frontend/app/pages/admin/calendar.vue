<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { CalendarApi, EventInput } from '@fullcalendar/core'
import ruLocale from '@fullcalendar/core/locales/ru'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import { useAdminTenantTeamsAllQuery } from '~/composables/admin/useAdminTenantListQueries'
import { useMatchStatusSelectOptions } from '~/composables/useMatchStatusSelectOptions'
import type { MatchRow, TenantTournamentMatchRow } from '~/types/tournament-admin'
import {
  formatMatchScoreDisplay,
  isMatchEditLocked,
  statusLabel,
} from '~/utils/tournamentAdminUi'
import { getApiErrorMessage } from '~/utils/apiError'
import { toastMatchScheduleCreateApiError } from '~/utils/matchCreateToast'
import { displayTeamNameForUi } from '~/utils/teamDisplayName'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'
import { useAdminAsyncState } from '~/composables/admin/useAdminAsyncState'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()
const matchStatusSelectOptions = useMatchStatusSelectOptions()

const {
  loading,
  error: calendarLoadError,
  run: runCalendarFetch,
  retry: retryCalendarFetch,
} = useAdminAsyncState()
const standaloneMatches = ref<MatchRow[]>([])
const tournamentMatches = ref<TenantTournamentMatchRow[]>([])
const { teams } = useAdminTenantTeamsAllQuery()
const selectedTournamentId = ref('')
const selectedTeamId = ref('')
const selectedStatus = ref('')
const sourceFilter = ref<'all' | 'standalone' | 'tournament'>('all')
const showLocked = ref(true)
const slotMinutes = ref<15 | 30>(15)
/** Узкий экран (меньше md): компактная сетка, вид «день» по умолчанию */
const isWideLayout = ref(true)
const fullCalendarRef = ref<InstanceType<typeof FullCalendar> | null>(null)

let layoutMedia: MediaQueryList | null = null

function applyLayoutFromMedia() {
  if (!layoutMedia) return
  isWideLayout.value = layoutMedia.matches
  if (!layoutMedia.matches && slotMinutes.value === 15) {
    slotMinutes.value = 30
  }
}

function onLayoutMediaChange() {
  applyLayoutFromMedia()
}

function calendarApi(): CalendarApi | null {
  const inst = fullCalendarRef.value as unknown as { getApi?: () => CalendarApi } | null
  return inst?.getApi?.() ?? null
}

function calendarMatchTitle(m: MatchRow | TenantTournamentMatchRow) {
  const base = `${displayTeamNameForUi(m.homeTeam.name)} – ${displayTeamNameForUi(m.awayTeam.name)}`
  const hasScore =
    m.homeScore !== null &&
    m.homeScore !== undefined &&
    m.awayScore !== null &&
    m.awayScore !== undefined
  if (!hasScore) return base
  return `${base} (${formatMatchScoreDisplay(m)})`
}
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
  /** Цвет турнира с сервера (если есть), без учёта локального переопределения */
  tournamentStripeColor?: string | null
}

function colorStorageKey() {
  return `admin_calendar_match_colors_${tenantId.value}`
}

function loadColors() {
  if (!process.client) return
  try {
    const raw = localStorage.getItem(colorStorageKey())
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    /** Раньше цвет турнирных матчей можно было класть в localStorage — теперь только цвет турнира с сервера. */
    eventColors.value = Object.fromEntries(
      Object.entries(parsed).filter(([k]) => !k.startsWith('tournament:')),
    )
    if (Object.keys(eventColors.value).length !== Object.keys(parsed).length) {
      saveColors()
    }
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

function tournamentMatchStripeColor(m: TenantTournamentMatchRow) {
  const tc = m.tournament?.calendarColor?.trim()
  if (tc && /^#[0-9A-Fa-f]{6}$/.test(tc)) return tc
  return null
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
  matchStatusSelectOptions.value.map((s) => ({ label: s.label, value: s.value })),
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
    title: calendarMatchTitle(m),
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
    .map((m) => {
    const eventId = `tournament:${m.id}`
    const locked = isMatchEditLocked(m.status)
    const stripe = tournamentMatchStripeColor(m)
    const fallback = defaultColor(locked, 'tournament')
    /** Цвет турнира с сервера; локальные переопределения для турнирных матчей не используем. */
    const fill = stripe ?? fallback
    return {
    id: eventId,
    start: m.startTime,
    end: addMinutes(
      m.startTime,
      eventDurationsMin.value[eventId] ?? defaultDurationMin(),
    ),
    title: calendarMatchTitle(m),
    allDay: false,
    editable: !locked,
    backgroundColor: fill,
    borderColor: fill,
    extendedProps: {
      source: 'tournament',
      matchId: m.id,
      tournamentId: m.tournament.id,
      locked,
      status: m.status ?? null,
      tournamentStripeColor: stripe,
    } satisfies CalendarMeta,
    }
    })

  return [...standalone, ...tournament]
})

async function fetchMatches() {
  if (!token.value) return
  await runCalendarFetch(async () => {
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
      standaloneMatches.value = []
      tournamentMatches.value = []
      throw e
    }
  })
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
    color:
      meta.source === 'tournament'
        ? meta.tournamentStripeColor ?? defaultColor(meta.locked, meta.source)
        : eventColors.value[eventId] ?? defaultColor(meta.locked, meta.source),
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
    if (model.source === 'tournament') {
      delete eventColors.value[model.eventId]
      saveColors()
    } else {
      eventColors.value[model.eventId] = model.color
      saveColors()
    }

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
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
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
    toastMatchScheduleCreateApiError((m) => toast.add(m), t, e, {
      genericErrorLifeMs: 5000,
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
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 5000,
    })
  }
}

const calendarOptions = computed(() => {
  const wide = isWideLayout.value
  const slot = slotMinutes.value === 15 ? '00:15:00' : '00:30:00'
  return {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: wide ? 'timeGridWeek' : 'timeGridDay',
    locale: ruLocale,
    firstDay: 1,
    editable: true,
    eventStartEditable: true,
    eventDurationEditable: false,
    selectable: true,
    selectMirror: true,
    slotMinTime: '08:00:00',
    slotMaxTime: '21:00:00',
    slotDuration: slot,
    snapDuration: slot,
    slotLabelInterval: slot,
    slotLabelFormat: {
      hour: 'numeric' as const,
      minute: '2-digit' as const,
      hour12: false,
    },
    eventTimeFormat: {
      hour: '2-digit' as const,
      minute: '2-digit' as const,
      hour12: false,
    },
    allDaySlot: false,
    nowIndicator: true,
    contentHeight: 'auto',
    expandRows: false,
    headerToolbar: wide
      ? {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }
      : {
          left: 'prev,next',
          center: 'title',
          right: 'today,timeGridDay,timeGridWeek,dayGridMonth',
        },
    eventDrop: onEventDrop,
    eventClick: onEventClick,
    select: onSelectRange,
    events: calendarEvents.value,
  }
})

watch(isWideLayout, () => {
  nextTick(() => {
    const api = calendarApi()
    if (!api || isWideLayout.value) return
    const type = api.view.type
    if (type === 'timeGridWeek' || type === 'dayGridMonth') {
      api.changeView('timeGridDay')
    }
  })
})

onMounted(async () => {
  syncWithStorage()
  if (!loggedIn.value) {
    await router.push('/admin/login')
    return
  }
  if (import.meta.client) {
    layoutMedia = window.matchMedia('(min-width: 768px)')
    applyLayoutFromMedia()
    layoutMedia.addEventListener('change', onLayoutMediaChange)
  }
  loadColors()
  loadDurations()
  await fetchMatches()
})

onBeforeUnmount(() => {
  layoutMedia?.removeEventListener('change', onLayoutMediaChange)
  layoutMedia = null
})

watch(
  [selectedTournamentId, selectedTeamId, selectedStatus, sourceFilter, showLocked],
  () => {
    void fetchMatches()
  },
)
</script>

<template>
  <section class="admin-page space-y-3 sm:space-y-4">
    <header class="space-y-1">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-0 sm:text-xl">
        Календарь матчей
      </h1>
      <p class="text-xs leading-snug text-muted-color sm:text-sm sm:leading-normal">
        Матчи организации. Перетаскивание меняет дату.
        <span class="max-md:hidden">
          Статусы {{ statusLabel('FINISHED') }}, {{ statusLabel('PLAYED') }}, {{ statusLabel('CANCELED') }} —
          без переноса.
        </span>
      </p>
    </header>

    <div
      class="rounded-xl border border-surface-200 bg-surface-0 p-3 shadow-sm dark:border-surface-700 dark:bg-surface-900 sm:p-4"
    >
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Select
          v-model="sourceFilter"
          class="w-full min-w-0"
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
          class="w-full min-w-0"
          :options="[{ label: 'Все турниры', value: '' }, ...tournamentOptions]"
          option-label="label"
          option-value="value"
          placeholder="Турнир"
        />
        <Select
          v-model="selectedTeamId"
          class="w-full min-w-0"
          :options="[{ label: 'Все команды', value: '' }, ...teamOptions]"
          option-label="label"
          option-value="value"
          placeholder="Команда"
        />
        <Select
          v-model="selectedStatus"
          class="w-full min-w-0"
          :options="[{ label: 'Любой статус', value: '' }, ...statusFilterOptions]"
          option-label="label"
          option-value="value"
          placeholder="Статус"
        />
        <Select
          v-model="slotMinutes"
          class="w-full min-w-0"
          :options="[
            { label: 'Сетка 15 мин', value: 15 },
            { label: 'Сетка 30 мин', value: 30 },
          ]"
          option-label="label"
          option-value="value"
          placeholder="Сетка"
        />
        <div
          class="flex min-h-[2.75rem] items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 px-3 dark:border-surface-600 dark:bg-surface-800/50"
        >
          <Checkbox v-model="showLocked" binary input-id="showLocked" />
          <label for="showLocked" class="cursor-pointer text-xs sm:text-sm">Показывать завершённые</label>
        </div>
      </div>
    </div>

    <div
      class="admin-calendar rounded-xl border border-surface-200 bg-surface-0 p-2 shadow-sm dark:border-surface-700 dark:bg-surface-900 sm:p-3"
    >
      <AdminDataState
        :loading="loading"
        :error="calendarLoadError"
        :empty="false"
        :content-card="false"
        @retry="retryCalendarFetch"
      >
        <template #loading>
          <div class="space-y-3 p-2 sm:p-3" aria-busy="true">
            <div class="flex flex-wrap gap-2">
              <Skeleton height="2.25rem" class="min-w-[8rem] flex-1 rounded-lg" />
              <Skeleton height="2.25rem" class="min-w-[8rem] flex-1 rounded-lg" />
              <Skeleton height="2.25rem" class="min-w-[6rem] w-24 rounded-lg" />
            </div>
            <div class="flex gap-1.5 sm:gap-2">
              <Skeleton
                v-for="d in 7"
                :key="'cal-hd-' + d"
                height="2rem"
                class="min-w-0 flex-1 rounded-md"
              />
            </div>
            <div v-for="row in 5" :key="'cal-row-' + row" class="grid grid-cols-7 gap-1.5 sm:gap-2">
              <Skeleton
                v-for="col in 7"
                :key="'cal-row-' + row + '-c-' + col"
                height="3.25rem"
                class="rounded-lg"
              />
            </div>
          </div>
        </template>
        <div class="-mx-2 overflow-x-auto sm:mx-0">
          <div class="min-w-[36rem] sm:min-w-0">
            <ClientOnly>
              <FullCalendar ref="fullCalendarRef" :options="calendarOptions" />
            </ClientOnly>
          </div>
        </div>
      </AdminDataState>
    </div>

    <Dialog
      v-model:visible="editVisible"
      modal
      block-scroll
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

        <div v-if="editModel.source === 'standalone'">
          <label class="text-sm block mb-1">Цвет выделения</label>
          <InputText
            v-model="editModel.color"
            type="color"
            class="h-10 w-16 p-1"
          />
        </div>
        <div v-else class="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-600 dark:bg-surface-800/60">
          <div class="text-xs font-medium text-surface-800 dark:text-surface-100">
            {{ t('admin.calendar_page.tournament_color_readonly_title') }}
          </div>
          <p class="mt-1 text-xs leading-relaxed text-muted-color">
            {{ t('admin.calendar_page.tournament_color_readonly_hint') }}
          </p>
          <div class="mt-2 flex items-center gap-2">
            <span
              class="inline-block h-8 w-10 rounded border border-surface-300 dark:border-surface-600"
              :style="{ backgroundColor: editModel.color }"
              aria-hidden="true"
            />
            <span class="text-xs font-mono text-muted-color">{{ editModel.color }}</span>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" label="Отмена" text @click="editVisible = false" />
          <Button
            type="button"
            label="Сохранить"
            icon="pi pi-check"
            :loading="editSaving"
            :disabled="editSaving || (editSubmitAttempted && !canSaveEdit)"
            @click="saveEventEdit"
          />
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="createVisible"
      modal
      block-scroll
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
          <Button type="button" label="Отмена" text @click="createVisible = false" />
          <Button
            type="button"
            label="Создать"
            icon="pi pi-check"
            :loading="createSaving"
            :disabled="createSaving || (createSubmitAttempted && !canCreateFromSlot)"
            @click="createMatchFromSlot"
          />
        </div>
      </div>
    </Dialog>
  </section>
</template>

<style scoped>
.admin-calendar :deep(.fc) {
  --fc-border-color: rgb(226 232 240);
  --fc-page-bg-color: transparent;
  --fc-neutral-bg-color: rgb(248 250 252);
  font-size: 0.75rem;
}

.dark-mode .admin-calendar :deep(.fc) {
  --fc-border-color: rgb(51 65 85);
  --fc-neutral-bg-color: rgb(30 41 59 / 0.45);
}

@media (min-width: 768px) {
  .admin-calendar :deep(.fc) {
    font-size: 0.8125rem;
  }
}

.admin-calendar :deep(.fc-theme-standard td),
.admin-calendar :deep(.fc-theme-standard th) {
  border-color: var(--fc-border-color);
}

.admin-calendar :deep(.fc-scrollgrid) {
  border-radius: 0.5rem;
}

.admin-calendar :deep(.fc-header-toolbar) {
  @apply mb-2 flex flex-col gap-2 sm:mb-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between;
}

.admin-calendar :deep(.fc-toolbar-chunk) {
  @apply flex flex-wrap items-center justify-center gap-1 sm:justify-start;
}

.admin-calendar :deep(.fc-toolbar-chunk:last-child) {
  @apply justify-center sm:justify-end;
}

.admin-calendar :deep(.fc-toolbar-title) {
  @apply px-1 text-center text-sm font-semibold text-surface-800 dark:text-surface-100 sm:text-base;
}

.admin-calendar :deep(.fc-button) {
  @apply rounded-lg border border-surface-300 bg-surface-0 px-2 py-1.5 text-xs font-medium text-surface-700 shadow-sm outline-none transition hover:bg-surface-50 focus-visible:ring-2 focus-visible:ring-primary dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 dark:hover:bg-surface-700;
}

.admin-calendar :deep(.fc-button-primary:not(:disabled)) {
  @apply border-primary bg-primary text-primary-contrast hover:opacity-90;
}

.admin-calendar :deep(.fc-button:disabled) {
  @apply opacity-50;
}

/**
 * Переключатель вида (Месяц / Неделя / День): общая primary-плашка, активный — светлая кнопка с контуром
 * (вместо стандартного тёмного оверлея FullCalendar).
 */
.admin-calendar :deep(.fc-button-group) {
  @apply inline-flex gap-0.5 rounded-[10px] border border-primary/25 bg-primary p-0.5 shadow-sm dark:border-primary/35;
}

.admin-calendar :deep(.fc-button-group .fc-button) {
  background-image: none !important;
  text-shadow: none !important;
  @apply m-0 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-xs font-semibold text-white shadow-none outline-none transition;
}

.admin-calendar :deep(.fc-button-group .fc-button.fc-button-primary) {
  @apply border-0 bg-transparent text-white hover:bg-white/15;
}

.admin-calendar :deep(.fc-button-group .fc-button.fc-button-primary:disabled) {
  @apply text-white/50 hover:bg-transparent;
}

.admin-calendar :deep(.fc-button-group .fc-button.fc-button-active) {
  background-image: none !important;
  opacity: 1 !important;
  @apply rounded-md bg-surface-0 font-semibold text-primary shadow-sm ring-2 ring-white/90 ring-offset-0 dark:bg-surface-900 dark:text-primary dark:ring-primary/55;
}

.admin-calendar :deep(.fc-button-group .fc-button.fc-button-active:hover) {
  @apply bg-surface-0 text-primary dark:bg-surface-900;
}

/** «Сегодня» и др. снаружи группы — лёгкое кольцо, без заливки primary/15 */
.admin-calendar :deep(.fc-toolbar-chunk > .fc-button.fc-button-active) {
  @apply border-primary bg-primary text-primary-contrast ring-2 ring-primary ring-offset-2 ring-offset-surface-0 dark:ring-offset-surface-900;
}

.admin-calendar :deep(.fc-timegrid-slot) {
  height: 1.5rem;
}

@media (min-width: 640px) {
  .admin-calendar :deep(.fc-timegrid-slot) {
    height: 1.85rem;
  }
}

@media (min-width: 768px) {
  .admin-calendar :deep(.fc-timegrid-slot) {
    height: 2.15rem;
  }
}

.admin-calendar :deep(.fc-timegrid-slot-label) {
  @apply align-top text-[0.65rem] text-muted-color sm:text-xs;
}

.admin-calendar :deep(.fc-timegrid-slot-label-cushion) {
  @apply py-0;
}

.admin-calendar :deep(.fc-col-header-cell) {
  @apply py-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-surface-700 dark:text-surface-200 sm:text-xs;
}

.admin-calendar :deep(.fc-day-today .fc-col-header-cell-cushion) {
  @apply text-primary;
}

.admin-calendar :deep(.fc-event) {
  @apply cursor-pointer rounded border-0 shadow-sm;
  font-size: 0.65rem;
  line-height: 1.25;
}

@media (min-width: 768px) {
  .admin-calendar :deep(.fc-event) {
    font-size: 0.7rem;
  }
}

.admin-calendar :deep(.fc-event-title) {
  @apply font-medium;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.admin-calendar :deep(.fc-v-event .fc-event-main-frame) {
  @apply p-0.5 sm:p-1;
}

.admin-calendar :deep(.fc-now-indicator-line) {
  @apply border-primary;
}

.admin-calendar :deep(.fc-now-indicator-arrow) {
  @apply border-t-primary;
}
</style>

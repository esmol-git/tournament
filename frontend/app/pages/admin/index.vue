<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Chart from 'primevue/chart'
import { useAuth } from '~/composables/useAuth'
import { useGlobalModeratorReadOnly } from '~/composables/useGlobalModeratorReadOnly'
import { useApiUrl } from '~/composables/useApiUrl'
import { useDashboardChartTheme } from '~/composables/useDashboardChartTheme'
import { useTenantId } from '~/composables/useTenantId'
import type { TenantTournamentMatchRow } from '~/types/tournament-admin'
import { getApiErrorMessage } from '~/utils/apiError'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'
import {
  formatDateTimeNoSeconds,
  formatMatchScoreDisplay,
  tournamentFormatLabel,
} from '~/utils/tournamentAdminUi'
import { formatUserFullNameFromParts } from '~/utils/userDisplayName'
import { readTenantStaffRole } from '~/utils/tenantStaffRole'

definePageMeta({
  layout: 'admin',
  /** Дашборд не в реестре org read-only; см. `useGlobalModeratorReadOnly` для сокращённой сводки. */
  adminOrgModeratorReadOnly: false,
})

const { t } = useI18n()
const router = useRouter()
const { token, user, syncWithStorage, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()
const { isDark: chartDark } = useDashboardChartTheme()

/** Полный дашборд с графиками и сводкой по тенанту — только администратор организации (и супер-админ). */
const userRole = computed(() => readTenantStaffRole(user.value) ?? '')
const isOrganizationAdminDashboard = computed(() =>
  ['TENANT_ADMIN', 'SUPER_ADMIN'].includes(userRole.value),
)
/** Узкая сводка для глобального MODERATOR (без графиков матчей) — та же проверка, что в `useAdminOrgModeratorReadOnly`. */
const isGlobalModeratorStaff = useGlobalModeratorReadOnly()

const loading = ref(true)
const loadError = ref<string | null>(null)

const tournamentsTotal = ref(0)
const tournamentsActive = ref(0)
const tournamentsCompleted = ref(0)
const tournamentsDraft = ref(0)
const teamsTotal = ref(0)
const playersTotal = ref(0)
const liveMatchesTotal = ref(0)
const scheduledMatchesTotal = ref(0)
const upcomingMatches = ref<TenantTournamentMatchRow[]>([])

/** Показ приветствия с именем из localStorage только после mount — без рассинхрона с SSR. */
const greetingMounted = ref(false)

/** Узкий viewport: вертикальная столбчатая диаграмма и чуть ниже графики */
const dashboardViewportNarrow = ref(false)
let dashboardViewportMql: MediaQueryList | null = null

function syncDashboardViewportNarrow() {
  dashboardViewportNarrow.value =
    dashboardViewportMql != null && dashboardViewportMql.matches
}

const greetingName = computed(() => {
  if (!user.value) return ''
  const full = formatUserFullNameFromParts(user.value)
  if (full) return full
  const u = user.value as { email?: string | null; username?: string }
  return u.email?.split('@')[0] ?? u.username ?? ''
})

const todayLabel = computed(() =>
  new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
)

type ListWithTotal = { total: number }

async function fetchCount(
  url: string,
  params: Record<string, string | number | undefined>,
): Promise<number> {
  const res = await authFetch<ListWithTotal>(apiUrl(url), {
    headers: { Authorization: `Bearer ${token.value}` },
    params,
  })
  return res.total ?? 0
}

async function loadDashboard() {
  if (!token.value) {
    loadError.value = null
    loading.value = false
    return
  }
  loading.value = true
  loadError.value = null
  try {
    const base = `/tenants/${tenantId.value}`
    const [allT, activeT, completedT, draftT] = await Promise.all([
      fetchCount(`${base}/tournaments`, { page: 1, pageSize: 1 }),
      fetchCount(`${base}/tournaments`, { page: 1, pageSize: 1, status: 'ACTIVE' }),
      fetchCount(`${base}/tournaments`, { page: 1, pageSize: 1, status: 'COMPLETED' }),
      fetchCount(`${base}/tournaments`, { page: 1, pageSize: 1, status: 'DRAFT' }),
    ])

    tournamentsTotal.value = allT
    tournamentsActive.value = activeT
    tournamentsCompleted.value = completedT
    tournamentsDraft.value = draftT

    if (isGlobalModeratorStaff.value) {
      const [teams, players] = await Promise.all([
        fetchCount(`${base}/teams`, { page: 1, pageSize: 1 }),
        fetchCount(`${base}/players`, { page: 1, pageSize: 1 }),
      ])
      teamsTotal.value = teams
      playersTotal.value = players
      liveMatchesTotal.value = 0
      scheduledMatchesTotal.value = 0
      upcomingMatches.value = []
    } else {
      const [teams, players, live, upcomingRes] = await Promise.all([
        fetchCount(`${base}/teams`, { page: 1, pageSize: 1 }),
        fetchCount(`${base}/players`, { page: 1, pageSize: 1 }),
        fetchCount(`${base}/matches`, { page: 1, pageSize: 1, status: 'LIVE' }),
        authFetch<{ items: TenantTournamentMatchRow[]; total: number }>(apiUrl(`${base}/matches`), {
          headers: { Authorization: `Bearer ${token.value}` },
          params: {
            page: 1,
            pageSize: 5,
            status: 'SCHEDULED',
          },
        }),
      ])
      teamsTotal.value = teams
      playersTotal.value = players
      liveMatchesTotal.value = live
      scheduledMatchesTotal.value = upcomingRes.total ?? 0
      upcomingMatches.value = upcomingRes.items ?? []
    }
  } catch (e: unknown) {
    loadError.value = getApiErrorMessage(e, t('admin.dashboard.load_error'))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  greetingMounted.value = true
  if (typeof window !== 'undefined') {
    dashboardViewportMql = window.matchMedia('(max-width: 639px)')
    syncDashboardViewportNarrow()
    dashboardViewportMql.addEventListener('change', syncDashboardViewportNarrow)
  }
  syncWithStorage()
  await loadDashboard()
})

onBeforeUnmount(() => {
  dashboardViewportMql?.removeEventListener('change', syncDashboardViewportNarrow)
})

const tournamentDoughnutData = computed(() => ({
  labels: [
    t('admin.dashboard.charts.legend_active'),
    t('admin.dashboard.charts.legend_draft'),
    t('admin.dashboard.charts.legend_done'),
  ],
  datasets: [
    {
      data: [tournamentsActive.value, tournamentsDraft.value, tournamentsCompleted.value],
      backgroundColor: ['#059669', '#64748b', '#6366f1'],
      hoverBackgroundColor: ['#10b981', '#94a3b8', '#818cf8'],
      borderWidth: 0,
      borderRadius: 8,
    },
  ],
}))

const tournamentDoughnutOptions = computed(() => {
  const legendColor = chartDark.value ? '#cbd5e1' : '#475569'
  const narrow = dashboardViewportNarrow.value
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 520 },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: legendColor,
          padding: narrow ? 8 : 14,
          usePointStyle: true,
          boxWidth: 8,
          font: { size: narrow ? 10 : 12 },
        },
      },
    },
    cutout: narrow ? '58%' : '64%',
  }
})

const entitiesBarData = computed(() => ({
  labels: [
    t('admin.dashboard.kpi.teams'),
    t('admin.dashboard.kpi.players'),
    t('admin.dashboard.kpi.matches'),
  ],
  datasets: [
    {
      data: [teamsTotal.value, playersTotal.value, scheduledMatchesTotal.value],
      backgroundColor: [
        'rgba(14, 165, 233, 0.88)',
        'rgba(139, 92, 246, 0.88)',
        'rgba(245, 158, 11, 0.92)',
      ],
      borderRadius: 8,
      borderSkipped: false,
    },
  ],
}))

const entitiesBarOptions = computed(() => {
  const tick = chartDark.value ? '#cbd5e1' : '#475569'
  const grid = chartDark.value ? 'rgba(148, 163, 184, 0.22)' : 'rgba(15, 23, 42, 0.08)'
  const narrow = dashboardViewportNarrow.value

  if (narrow) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'x' as const,
      animation: { duration: 520 },
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: tick, maxRotation: 45, minRotation: 0 },
          border: { display: false },
        },
        y: {
          grid: { color: grid },
          ticks: { color: tick, precision: 0 },
          border: { display: false },
        },
      },
    }
  }

  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const,
    animation: { duration: 520 },
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        grid: { color: grid },
        ticks: { color: tick, precision: 0 },
        border: { display: false },
      },
      y: {
        grid: { display: false },
        ticks: { color: tick },
        border: { display: false },
      },
    },
  }
})
</script>

<template>
  <section class="mx-auto min-w-0 max-w-[100rem] space-y-4 p-3 sm:space-y-5 sm:p-4 lg:space-y-6 lg:p-6">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div class="min-w-0">
        <h1 class="text-xl font-semibold leading-tight text-surface-900 dark:text-surface-0 sm:text-2xl">
          {{ t('admin.dashboard.title') }}
        </h1>
        <p class="mt-1 break-words text-sm text-muted-color">
          {{
            isOrganizationAdminDashboard
              ? t('admin.dashboard.subtitle')
              : t('admin.dashboard.staff_subtitle')
          }}
        </p>
        <p
          v-if="greetingMounted && greetingName"
          class="mt-1 break-words text-sm text-muted-color"
        >
          {{ t('admin.dashboard.greeting', { name: greetingName }) }}
        </p>
        <p class="mt-1 break-words text-xs leading-snug text-muted-color sm:capitalize">
          {{ todayLabel }}
        </p>
      </div>
      <Button
        icon="pi pi-refresh"
        :label="t('admin.dashboard.refresh')"
        text
        severity="secondary"
        class="w-full shrink-0 sm:w-auto sm:self-center"
        :loading="loading"
        @click="loadDashboard"
      />
    </header>

    <AdminDataState
      :loading="loading"
      :error="loadError"
      :empty="false"
      :content-card="false"
      :error-title="t('admin.dashboard.load_error_title')"
      @retry="loadDashboard"
    >
      <template #loading>
        <div class="space-y-3 sm:space-y-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            <div v-for="i in 4" :key="`sk-${i}`" class="min-w-0 rounded-2xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900 sm:p-5">
              <Skeleton width="40%" height="0.75rem" />
              <Skeleton class="mt-4" width="55%" height="2rem" />
              <Skeleton class="mt-3" width="70%" height="0.75rem" />
            </div>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            <div class="min-w-0 rounded-2xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900 sm:p-5">
              <Skeleton width="10rem" height="1.1rem" />
              <Skeleton class="mt-4 h-[200px] w-full rounded-xl sm:h-[240px]" />
            </div>
            <div class="min-w-0 rounded-2xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900 sm:p-5">
              <Skeleton width="12rem" height="1.1rem" />
              <Skeleton class="mt-4 h-[200px] w-full rounded-xl sm:h-[240px]" />
            </div>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
            <div class="min-w-0 lg:col-span-2 rounded-2xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900 sm:p-5">
              <Skeleton width="12rem" height="1.25rem" />
              <Skeleton class="mt-4" width="100%" height="4rem" />
              <Skeleton class="mt-2" width="100%" height="4rem" />
            </div>
            <div class="min-w-0 rounded-2xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900 sm:p-5">
              <Skeleton width="8rem" height="1rem" />
              <Skeleton class="mt-4" width="100%" height="2.5rem" />
              <Skeleton class="mt-2" width="100%" height="2.5rem" />
            </div>
          </div>
        </div>
      </template>
      <template v-if="isOrganizationAdminDashboard">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <div
          class="group relative min-w-0 overflow-hidden rounded-2xl border border-surface-200 bg-gradient-to-br from-surface-0 to-primary-50/30 p-4 shadow-sm transition hover:border-primary/30 dark:border-surface-700 dark:from-surface-900 dark:to-primary-950/20 sm:p-5"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-muted-color">
                {{ t('admin.dashboard.kpi.tournaments') }}
              </p>
              <p class="mt-2 text-3xl font-semibold tabular-nums text-surface-900 dark:text-surface-0">
                {{ tournamentsTotal }}
              </p>
              <div class="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span class="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                  {{ t('admin.dashboard.kpi.active_short') }}: {{ tournamentsActive }}
                </span>
                <span class="rounded-full bg-surface-100 px-2 py-0.5 text-muted-color dark:bg-surface-800">
                  {{ t('admin.dashboard.kpi.draft_short') }}: {{ tournamentsDraft }}
                </span>
                <span class="rounded-full bg-surface-100 px-2 py-0.5 text-muted-color dark:bg-surface-800">
                  {{ t('admin.dashboard.kpi.done_short') }}: {{ tournamentsCompleted }}
                </span>
              </div>
            </div>
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <i class="pi pi-trophy text-xl" aria-hidden="true" />
            </div>
          </div>
          <button
            type="button"
            class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            @click="router.push('/admin/tournaments')"
          >
            {{ t('admin.dashboard.kpi.go_tournaments') }}
            <i class="pi pi-arrow-right text-xs" aria-hidden="true" />
          </button>
        </div>

        <div
          class="min-w-0 rounded-2xl border border-surface-200 bg-surface-0 p-4 shadow-sm transition hover:border-primary/25 dark:border-surface-700 dark:bg-surface-900 sm:p-5"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-muted-color">
                {{ t('admin.dashboard.kpi.teams') }}
              </p>
              <p class="mt-2 text-3xl font-semibold tabular-nums text-surface-900 dark:text-surface-0">
                {{ teamsTotal }}
              </p>
            </div>
            <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300">
              <i class="pi pi-shield text-xl" aria-hidden="true" />
            </div>
          </div>
          <button
            type="button"
            class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            @click="router.push('/admin/teams')"
          >
            {{ t('admin.dashboard.kpi.go_teams') }}
            <i class="pi pi-arrow-right text-xs" aria-hidden="true" />
          </button>
        </div>

        <div
          class="min-w-0 rounded-2xl border border-surface-200 bg-surface-0 p-4 shadow-sm transition hover:border-primary/25 dark:border-surface-700 dark:bg-surface-900 sm:p-5"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-muted-color">
                {{ t('admin.dashboard.kpi.players') }}
              </p>
              <p class="mt-2 text-3xl font-semibold tabular-nums text-surface-900 dark:text-surface-0">
                {{ playersTotal }}
              </p>
            </div>
            <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300">
              <i class="pi pi-users text-xl" aria-hidden="true" />
            </div>
          </div>
          <button
            type="button"
            class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            @click="router.push('/admin/players')"
          >
            {{ t('admin.dashboard.kpi.go_players') }}
            <i class="pi pi-arrow-right text-xs" aria-hidden="true" />
          </button>
        </div>

        <div
          class="min-w-0 rounded-2xl border border-surface-200 bg-surface-0 p-4 shadow-sm transition hover:border-primary/25 dark:border-surface-700 dark:bg-surface-900 sm:p-5"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-muted-color">
                {{ t('admin.dashboard.kpi.matches') }}
              </p>
              <p class="mt-2 text-3xl font-semibold tabular-nums text-surface-900 dark:text-surface-0">
                {{ scheduledMatchesTotal }}
              </p>
              <p class="mt-1 text-xs text-muted-color">
                {{ t('admin.dashboard.kpi.live_now', { n: liveMatchesTotal }) }}
              </p>
            </div>
            <div
              class="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <i class="pi pi-calendar text-xl" aria-hidden="true" />
            </div>
          </div>
          <button
            type="button"
            class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            @click="router.push('/admin/matches')"
          >
            {{ t('admin.dashboard.kpi.go_matches') }}
            <i class="pi pi-arrow-right text-xs" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <div
          class="min-w-0 overflow-x-auto rounded-2xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 sm:p-5"
        >
          <div class="border-b border-surface-200 pb-3 dark:border-surface-700">
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-0">
              {{ t('admin.dashboard.charts.tournaments_title') }}
            </h2>
            <p class="mt-0.5 text-xs text-muted-color">
              {{ t('admin.dashboard.charts.tournaments_subtitle') }}
            </p>
          </div>
          <div class="relative mt-4 min-h-[200px] sm:min-h-[240px]">
            <div
              v-if="tournamentsTotal === 0"
              class="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-surface-200 bg-surface-50/80 px-3 text-center text-sm text-muted-color dark:border-surface-600 dark:bg-surface-800/40 sm:min-h-[220px] sm:px-4"
            >
              <i class="pi pi-chart-pie text-2xl opacity-60" aria-hidden="true" />
              <span>{{ t('admin.dashboard.charts.tournaments_empty') }}</span>
            </div>
            <ClientOnly v-else>
              <Chart
                type="doughnut"
                :data="tournamentDoughnutData"
                :options="tournamentDoughnutOptions"
                class="mx-auto h-[200px] max-w-full sm:h-[240px]"
              />
              <template #fallback>
                <Skeleton height="240px" class="w-full rounded-xl" />
              </template>
            </ClientOnly>
          </div>
        </div>

        <div
          class="min-w-0 overflow-x-auto rounded-2xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 sm:p-5"
        >
          <div class="border-b border-surface-200 pb-3 dark:border-surface-700">
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-0">
              {{ t('admin.dashboard.charts.entities_title') }}
            </h2>
            <p class="mt-0.5 text-xs text-muted-color">
              {{ t('admin.dashboard.charts.entities_hint') }}
            </p>
          </div>
          <div class="relative mt-4 min-h-[200px] sm:min-h-[240px]">
            <ClientOnly>
              <Chart
                type="bar"
                :data="entitiesBarData"
                :options="entitiesBarOptions"
                class="h-[200px] w-full min-w-[16rem] max-w-full sm:h-[240px] sm:min-w-0"
              />
              <template #fallback>
                <Skeleton height="240px" class="w-full rounded-xl" />
              </template>
            </ClientOnly>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
        <div
          class="min-w-0 lg:col-span-2 rounded-2xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900 sm:p-5"
        >
          <div
            class="flex flex-col gap-1 border-b border-surface-200 pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2 dark:border-surface-700"
          >
            <h2 class="min-w-0 text-base font-semibold text-surface-900 dark:text-surface-0">
              {{ t('admin.dashboard.upcoming.title') }}
            </h2>
            <span class="shrink-0 text-xs text-muted-color">
              {{ t('admin.dashboard.upcoming.subtitle', { n: scheduledMatchesTotal }) }}
            </span>
          </div>

          <div v-if="!upcomingMatches.length" class="py-10 text-center text-sm text-muted-color">
            {{ t('admin.dashboard.upcoming.empty') }}
          </div>
          <ul v-else class="divide-y divide-surface-200 dark:divide-surface-700">
            <li
              v-for="m in upcomingMatches"
              :key="m.id"
              class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-surface-900 dark:text-surface-0">
                  {{ m.homeTeam.name }}
                  <span class="text-muted-color"> — </span>
                  {{ m.awayTeam.name }}
                </p>
                <p class="mt-0.5 truncate text-xs text-muted-color">
                  {{ m.tournament?.name }}
                  <span v-if="m.tournament?.format"> · {{ tournamentFormatLabel(m.tournament.format) }}</span>
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end sm:gap-1">
                <span class="text-xs text-muted-color tabular-nums">
                  {{ formatDateTimeNoSeconds(m.startTime) }}
                </span>
                <span class="text-sm font-semibold tabular-nums text-muted-color">
                  {{ m.homeScore != null && m.awayScore != null ? formatMatchScoreDisplay(m) : '—' }}
                </span>
              </div>
            </li>
          </ul>
        </div>

        <div
          class="min-w-0 rounded-2xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900 sm:p-5"
        >
          <h2 class="border-b border-surface-200 pb-3 text-base font-semibold text-surface-900 dark:border-surface-700 dark:text-surface-0">
            {{ t('admin.dashboard.quick.title') }}
          </h2>
          <div class="mt-4 flex flex-col gap-2">
            <Button
              :label="t('admin.nav.tournaments')"
              icon="pi pi-trophy"
              outlined
              class="w-full justify-start"
              @click="router.push('/admin/tournaments')"
            />
            <Button
              :label="t('admin.nav.matches')"
              icon="pi pi-list"
              outlined
              class="w-full justify-start"
              @click="router.push('/admin/matches')"
            />
            <Button
              :label="t('admin.nav.calendar')"
              icon="pi pi-calendar"
              outlined
              class="w-full justify-start"
              @click="router.push('/admin/calendar')"
            />
            <Button
              :label="t('admin.nav.teams')"
              icon="pi pi-shield"
              outlined
              class="w-full justify-start"
              @click="router.push('/admin/teams')"
            />
          </div>
          <p class="mt-4 text-xs leading-relaxed text-muted-color">
            {{ t('admin.dashboard.quick.hint') }}
          </p>
        </div>
      </div>
      </template>

      <template v-else>
        <Message severity="info" :closable="false" class="w-full text-sm">
          {{ t('admin.dashboard.staff_intro') }}
        </Message>

        <div
          class="grid grid-cols-1 gap-3 sm:gap-4"
          :class="
            isGlobalModeratorStaff ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4'
          "
        >
          <div
            class="group relative min-w-0 overflow-hidden rounded-2xl border border-surface-200 bg-gradient-to-br from-surface-0 to-primary-50/30 p-4 shadow-sm transition hover:border-primary/30 dark:border-surface-700 dark:from-surface-900 dark:to-primary-950/20 sm:p-5"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted-color">
                  {{ t('admin.dashboard.kpi.tournaments') }}
                </p>
                <p class="mt-2 text-3xl font-semibold tabular-nums text-surface-900 dark:text-surface-0">
                  {{ tournamentsTotal }}
                </p>
                <div class="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span
                    class="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
                  >
                    {{ t('admin.dashboard.kpi.active_short') }}: {{ tournamentsActive }}
                  </span>
                  <span class="rounded-full bg-surface-100 px-2 py-0.5 text-muted-color dark:bg-surface-800">
                    {{ t('admin.dashboard.kpi.draft_short') }}: {{ tournamentsDraft }}
                  </span>
                  <span class="rounded-full bg-surface-100 px-2 py-0.5 text-muted-color dark:bg-surface-800">
                    {{ t('admin.dashboard.kpi.done_short') }}: {{ tournamentsCompleted }}
                  </span>
                </div>
              </div>
              <div
                class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
              >
                <i class="pi pi-trophy text-xl" aria-hidden="true" />
              </div>
            </div>
            <button
              type="button"
              class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              @click="router.push('/admin/tournaments')"
            >
              {{ t('admin.dashboard.kpi.go_tournaments') }}
              <i class="pi pi-arrow-right text-xs" aria-hidden="true" />
            </button>
          </div>

          <div
            class="min-w-0 rounded-2xl border border-surface-200 bg-surface-0 p-4 shadow-sm transition hover:border-primary/25 dark:border-surface-700 dark:bg-surface-900 sm:p-5"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted-color">
                  {{ t('admin.dashboard.kpi.teams') }}
                </p>
                <p class="mt-2 text-3xl font-semibold tabular-nums text-surface-900 dark:text-surface-0">
                  {{ teamsTotal }}
                </p>
              </div>
              <div
                class="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300"
              >
                <i class="pi pi-shield text-xl" aria-hidden="true" />
              </div>
            </div>
            <button
              type="button"
              class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              @click="router.push('/admin/teams')"
            >
              {{ t('admin.dashboard.kpi.go_teams') }}
              <i class="pi pi-arrow-right text-xs" aria-hidden="true" />
            </button>
          </div>

          <div
            class="min-w-0 rounded-2xl border border-surface-200 bg-surface-0 p-4 shadow-sm transition hover:border-primary/25 dark:border-surface-700 dark:bg-surface-900 sm:p-5"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted-color">
                  {{ t('admin.dashboard.kpi.players') }}
                </p>
                <p class="mt-2 text-3xl font-semibold tabular-nums text-surface-900 dark:text-surface-0">
                  {{ playersTotal }}
                </p>
              </div>
              <div
                class="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300"
              >
                <i class="pi pi-users text-xl" aria-hidden="true" />
              </div>
            </div>
            <button
              type="button"
              class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              @click="router.push('/admin/players')"
            >
              {{ t('admin.dashboard.kpi.go_players') }}
              <i class="pi pi-arrow-right text-xs" aria-hidden="true" />
            </button>
          </div>

          <div
            v-if="!isGlobalModeratorStaff"
            class="min-w-0 rounded-2xl border border-surface-200 bg-surface-0 p-4 shadow-sm transition hover:border-primary/25 dark:border-surface-700 dark:bg-surface-900 sm:p-5"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted-color">
                  {{ t('admin.dashboard.kpi.matches') }}
                </p>
                <p class="mt-2 text-3xl font-semibold tabular-nums text-surface-900 dark:text-surface-0">
                  {{ scheduledMatchesTotal }}
                </p>
                <p class="mt-1 text-xs text-muted-color">
                  {{ t('admin.dashboard.kpi.live_now', { n: liveMatchesTotal }) }}
                </p>
              </div>
              <div
                class="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
              >
                <i class="pi pi-calendar text-xl" aria-hidden="true" />
              </div>
            </div>
            <button
              type="button"
              class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              @click="router.push('/admin/matches')"
            >
              {{ t('admin.dashboard.kpi.go_matches') }}
              <i class="pi pi-arrow-right text-xs" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div v-if="!isGlobalModeratorStaff" class="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
          <div
            class="min-w-0 lg:col-span-2 rounded-2xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900 sm:p-5"
          >
            <div
              class="flex flex-col gap-1 border-b border-surface-200 pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2 dark:border-surface-700"
            >
              <h2 class="min-w-0 text-base font-semibold text-surface-900 dark:text-surface-0">
                {{ t('admin.dashboard.upcoming.title') }}
              </h2>
              <span class="shrink-0 text-xs text-muted-color">
                {{ t('admin.dashboard.upcoming.subtitle', { n: scheduledMatchesTotal }) }}
              </span>
            </div>

            <div v-if="!upcomingMatches.length" class="py-10 text-center text-sm text-muted-color">
              {{ t('admin.dashboard.upcoming.empty') }}
            </div>
            <ul v-else class="divide-y divide-surface-200 dark:divide-surface-700">
              <li
                v-for="m in upcomingMatches"
                :key="m.id"
                class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-surface-900 dark:text-surface-0">
                    {{ m.homeTeam.name }}
                    <span class="text-muted-color"> — </span>
                    {{ m.awayTeam.name }}
                  </p>
                  <p class="mt-0.5 truncate text-xs text-muted-color">
                    {{ m.tournament?.name }}
                    <span v-if="m.tournament?.format"> · {{ tournamentFormatLabel(m.tournament.format) }}</span>
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end sm:gap-1">
                  <span class="text-xs text-muted-color tabular-nums">
                    {{ formatDateTimeNoSeconds(m.startTime) }}
                  </span>
                  <span class="text-sm font-semibold tabular-nums text-muted-color">
                    {{ m.homeScore != null && m.awayScore != null ? formatMatchScoreDisplay(m) : '—' }}
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div
            class="min-w-0 rounded-2xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900 sm:p-5"
          >
            <h2
              class="border-b border-surface-200 pb-3 text-base font-semibold text-surface-900 dark:border-surface-700 dark:text-surface-0"
            >
              {{ t('admin.dashboard.quick.title') }}
            </h2>
            <div class="mt-4 flex flex-col gap-2">
              <Button
                :label="t('admin.nav.tournaments')"
                icon="pi pi-trophy"
                outlined
                class="w-full justify-start"
                @click="router.push('/admin/tournaments')"
              />
              <Button
                :label="t('admin.nav.matches')"
                icon="pi pi-list"
                outlined
                class="w-full justify-start"
                @click="router.push('/admin/matches')"
              />
              <Button
                :label="t('admin.nav.calendar')"
                icon="pi pi-calendar"
                outlined
                class="w-full justify-start"
                @click="router.push('/admin/calendar')"
              />
              <Button
                :label="t('admin.nav.teams')"
                icon="pi pi-shield"
                outlined
                class="w-full justify-start"
                @click="router.push('/admin/teams')"
              />
              <Button
                :label="t('admin.nav.players')"
                icon="pi pi-users"
                outlined
                class="w-full justify-start"
                @click="router.push('/admin/players')"
              />
            </div>
            <p class="mt-4 text-xs leading-relaxed text-muted-color">
              {{ t('admin.dashboard.quick.hint_staff') }}
            </p>
          </div>
        </div>

        <div v-else class="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
          <div class="min-w-0 lg:col-span-2">
            <Message severity="secondary" :closable="false" class="text-sm">
              {{ t('admin.dashboard.staff_moderator_matches_hint') }}
            </Message>
          </div>
          <div
            class="min-w-0 rounded-2xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900 sm:p-5"
          >
            <h2
              class="border-b border-surface-200 pb-3 text-base font-semibold text-surface-900 dark:border-surface-700 dark:text-surface-0"
            >
              {{ t('admin.dashboard.quick.title') }}
            </h2>
            <div class="mt-4 flex flex-col gap-2">
              <Button
                :label="t('admin.nav.tournaments')"
                icon="pi pi-trophy"
                outlined
                class="w-full justify-start"
                @click="router.push('/admin/tournaments')"
              />
              <Button
                :label="t('admin.nav.teams')"
                icon="pi pi-shield"
                outlined
                class="w-full justify-start"
                @click="router.push('/admin/teams')"
              />
              <Button
                :label="t('admin.nav.players')"
                icon="pi pi-users"
                outlined
                class="w-full justify-start"
                @click="router.push('/admin/players')"
              />
            </div>
            <p class="mt-4 text-xs leading-relaxed text-muted-color">
              {{ t('admin.dashboard.quick.hint_staff') }}
            </p>
          </div>
        </div>
      </template>
    </AdminDataState>
  </section>
</template>

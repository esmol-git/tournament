<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { MatchRow, TenantTournamentMatchRow } from '~/types/tournament-admin'
import { getApiErrorMessage } from '~/utils/apiError'
import { parseYmdLocal, toYmdLocal } from '~/utils/dateYmd'
import {
  formatDateTimeNoSeconds,
  isMatchEditLocked,
  statusPillClass,
} from '~/utils/tournamentAdminUi'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()

const tournamentId = computed(() => String(route.params.id ?? ''))
const tournamentName = ref('')
const dayMatches = ref<TenantTournamentMatchRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const matchDayDate = ref<Date | null>(null)
const matchDayQuickLoadingId = ref<string | null>(null)
const protocolVisible = ref(false)
const protocolMatch = ref<MatchRow | TenantTournamentMatchRow | null>(null)
const autoRefreshMs = 45_000
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null

const localizedStatusLabel = (status: string) =>
  status === 'SCHEDULED'
    ? 'Запланирован'
    : status === 'LIVE'
      ? 'Идет'
      : status === 'FINISHED'
        ? 'Завершен'
        : status === 'CANCELED'
          ? 'Отменен'
          : status === 'PLAYED'
            ? 'Сыгран'
            : status

const isSameLocalDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const matchDayTimelineMatches = computed(() => {
  const day = matchDayDate.value
  const items = dayMatches.value.slice()
  if (!day) return items
  return items
    .filter((m) => isSameLocalDate(new Date(m.startTime), day))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
})

const matchDayNextMatch = computed(() => {
  const now = Date.now()
  const rows = matchDayTimelineMatches.value
  const live = rows.find((m) => m.status === 'LIVE')
  if (live) return live
  return rows.find((m) => new Date(m.startTime).getTime() >= now) ?? rows[0] ?? null
})

const fetchMatchDayMatches = async () => {
  if (!token.value || !tournamentId.value || !tenantId.value) return
  const ymd = matchDayDate.value ? toYmdLocal(matchDayDate.value) : ''
  const params = new URLSearchParams()
  params.set('tournamentId', tournamentId.value)
  params.set('page', '1')
  params.set('pageSize', '100')
  params.set('excludeUndeterminedPlayoff', 'true')
  if (ymd) {
    params.set('dateFrom', ymd)
    params.set('dateTo', ymd)
  }
  loading.value = true
  error.value = null
  try {
    const res = await authFetch<{
      items: TenantTournamentMatchRow[]
      total: number
    }>(
      apiUrl(`/tenants/${tenantId.value}/matches?${params.toString()}`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
    dayMatches.value = res.items ?? []
    tournamentName.value = dayMatches.value[0]?.tournament?.name ?? ''
  } catch (e: unknown) {
    error.value = getApiErrorMessage(e, t('admin.errors.request_failed'))
    dayMatches.value = []
    tournamentName.value = ''
  } finally {
    loading.value = false
  }
}

const shiftMatch = async (match: MatchRow, minutes: number) => {
  if (!token.value || isMatchEditLocked(match.status)) return
  matchDayQuickLoadingId.value = match.id
  try {
    const nextStart = new Date(new Date(match.startTime).getTime() + minutes * 60_000)
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}/matches/${match.id}`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: {
        startTime: nextStart.toISOString(),
        scheduleChangeNote: `Быстрый сдвиг в режиме дня тура (${minutes > 0 ? '+' : ''}${minutes} мин)`,
      },
    })
    await fetchMatchDayMatches()
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сдвинуть матч',
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 5000,
    })
  } finally {
    matchDayQuickLoadingId.value = null
  }
}

const quickSetStatus = async (match: MatchRow, status: 'LIVE' | 'FINISHED') => {
  if (!token.value || isMatchEditLocked(match.status)) return
  matchDayQuickLoadingId.value = match.id
  try {
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}/matches/${match.id}/status`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { status },
    })
    await fetchMatchDayMatches()
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось обновить статус',
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 5000,
    })
  } finally {
    matchDayQuickLoadingId.value = null
  }
}

const openProtocol = (m: MatchRow) => {
  protocolMatch.value = m
  protocolVisible.value = true
}

const startAutoRefresh = () => {
  if (autoRefreshTimer) return
  autoRefreshTimer = setInterval(() => {
    if (document.hidden) return
    if (loading.value || matchDayQuickLoadingId.value) return
    void fetchMatchDayMatches()
  }, autoRefreshMs)
}

const stopAutoRefresh = () => {
  if (!autoRefreshTimer) return
  clearInterval(autoRefreshTimer)
  autoRefreshTimer = null
}

watch(matchDayDate, (d) => {
  if (!d) return
  void router.replace({
    query: { ...route.query, date: toYmdLocal(d) },
  })
  void fetchMatchDayMatches()
})

onMounted(async () => {
  if (typeof window !== 'undefined') {
    syncWithStorage()
    if (!loggedIn.value) {
      await router.push('/admin/login')
      return
    }
  }
  const rawDate = typeof route.query.date === 'string' ? route.query.date : ''
  matchDayDate.value = rawDate ? parseYmdLocal(rawDate) : new Date()
  await fetchMatchDayMatches()
  startAutoRefresh()
})

onBeforeUnmount(() => {
  stopAutoRefresh()
})
</script>

<template>
  <section class="admin-page space-y-4 sm:space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-lg sm:text-2xl font-semibold">День тура</h1>
        <p class="mt-1 text-xs sm:text-sm text-muted-color">
          Полноэкранный режим быстрых действий по матчам выбранной даты.
        </p>
        <p v-if="tournamentName" class="mt-1 text-xs text-muted-color">
          {{ tournamentName }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <DatePicker
          v-model="matchDayDate"
          class="w-52"
          dateFormat="yy-mm-dd"
          showIcon
        />
        <Button
          icon="pi pi-arrow-left"
          label="К турниру"
          severity="secondary"
          outlined
          @click="router.push(`/admin/tournaments/${tournamentId}?tab=matches`)"
        />
      </div>
    </div>

    <AdminDataState
      :loading="loading"
      :error="error"
      :empty="!dayMatches.length"
      empty-title="Матчи не найдены"
      empty-description="На выбранную дату в этом турнире матчей нет."
      :content-card="false"
      @retry="fetchMatchDayMatches"
    >
      <div class="grid gap-4 xl:grid-cols-4">
        <div class="rounded-xl border border-primary/30 bg-primary/5 p-4 xl:col-span-1">
          <div class="text-xs uppercase tracking-wide text-primary/90">Следующий матч</div>
          <template v-if="matchDayNextMatch">
            <div class="mt-2 text-sm font-semibold">
              {{ matchDayNextMatch.homeTeam.name }} - {{ matchDayNextMatch.awayTeam.name }}
            </div>
            <div class="mt-1 text-xs text-muted-color">
              {{ formatDateTimeNoSeconds(matchDayNextMatch.startTime) }} ·
              <span :class="statusPillClass(matchDayNextMatch.status)">
                {{ localizedStatusLabel(matchDayNextMatch.status) }}
              </span>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <Button size="small" icon="pi pi-book" label="Протокол" @click="openProtocol(matchDayNextMatch)" />
              <Button
                v-if="matchDayNextMatch.status === 'SCHEDULED'"
                size="small"
                severity="success"
                outlined
                icon="pi pi-play"
                label="Начать"
                :loading="matchDayQuickLoadingId === matchDayNextMatch.id"
                @click="quickSetStatus(matchDayNextMatch, 'LIVE')"
              />
              <Button
                v-if="matchDayNextMatch.status === 'LIVE'"
                size="small"
                severity="warn"
                outlined
                icon="pi pi-check"
                label="Завершить"
                :loading="matchDayQuickLoadingId === matchDayNextMatch.id"
                @click="quickSetStatus(matchDayNextMatch, 'FINISHED')"
              />
              <Button
                size="small"
                severity="secondary"
                outlined
                icon="pi pi-clock"
                label="+15"
                :loading="matchDayQuickLoadingId === matchDayNextMatch.id"
                :disabled="isMatchEditLocked(matchDayNextMatch.status)"
                @click="shiftMatch(matchDayNextMatch, 15)"
              />
            </div>
          </template>
          <p v-else class="mt-2 text-sm text-muted-color">На выбранную дату матчей нет.</p>
        </div>

        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4 xl:col-span-3">
          <div class="text-sm font-semibold">Таймлайн дня</div>
          <div v-if="!matchDayTimelineMatches.length" class="mt-2 text-sm text-muted-color">
            Матчи на эту дату не найдены.
          </div>
          <div v-else class="mt-3 space-y-2">
            <div
              v-for="m in matchDayTimelineMatches"
              :key="m.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-200 px-3 py-2 dark:border-surface-700"
            >
              <div class="min-w-0">
                <div class="text-sm font-medium">
                  {{ m.homeTeam.name }} - {{ m.awayTeam.name }}
                </div>
                <div class="mt-1 text-xs text-muted-color">
                  {{ formatDateTimeNoSeconds(m.startTime) }} ·
                  <span :class="statusPillClass(m.status)">{{ localizedStatusLabel(m.status) }}</span>
                </div>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <Button size="small" text icon="pi pi-book" label="Протокол" @click="openProtocol(m)" />
                <Button
                  v-if="m.status === 'SCHEDULED'"
                  size="small"
                  text
                  severity="success"
                  icon="pi pi-play"
                  label="Начать"
                  :loading="matchDayQuickLoadingId === m.id"
                  @click="quickSetStatus(m, 'LIVE')"
                />
                <Button
                  v-if="m.status === 'LIVE'"
                  size="small"
                  text
                  severity="warn"
                  icon="pi pi-check"
                  label="Завершить"
                  :loading="matchDayQuickLoadingId === m.id"
                  @click="quickSetStatus(m, 'FINISHED')"
                />
                <Button
                  size="small"
                  text
                  severity="secondary"
                  icon="pi pi-angle-left"
                  label="-15"
                  :disabled="isMatchEditLocked(m.status)"
                  :loading="matchDayQuickLoadingId === m.id"
                  @click="shiftMatch(m, -15)"
                />
                <Button
                  size="small"
                  text
                  severity="secondary"
                  icon="pi pi-angle-right"
                  label="+15"
                  :disabled="isMatchEditLocked(m.status)"
                  :loading="matchDayQuickLoadingId === m.id"
                  @click="shiftMatch(m, 15)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminDataState>

    <AdminMatchProtocolDialog
      v-model:visible="protocolVisible"
      :standalone="false"
      :tournament-id="tournamentId"
      :tournament="null"
      :match="protocolMatch"
      @saved="fetchMatchDayMatches"
    />
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import SelectButton from 'primevue/selectbutton'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import {
  AUDIT_LOG_ACTION_CODES,
  AUDIT_LOG_ACTION_LABELS,
} from '~/constants/auditLogActionLabels'
import { USER_ROLE_LABELS_RU } from '~/constants/userRoles'
import type {
  AdminAuditLogDetail,
  AdminAuditLogListResponse,
  AdminAuditLogRow,
  AdminAuditLogSummaryResponse,
} from '~/types/admin/audit-log'
import type { UserRow } from '~/types/admin/user'
import { getApiErrorMessage } from '~/utils/apiError'
import { adminTooltip } from '~/utils/adminTooltip'
import { MIN_SKELETON_DISPLAY_MS } from '~/utils/minimumLoadingDelay'
import { toYmdLocal } from '~/utils/dateYmd'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const { t, locale } = useI18n()

const auditListLocale = computed(() => (locale.value === 'en' ? 'en' : 'ru'))

const auditDatePickerFormat = computed(() =>
  locale.value === 'en' ? 'mm/dd/yy' : 'dd.mm.yy',
)

function resourceTypeLabel(resourceType: string): string {
  const key = `admin.audit_log.resource_type.${resourceType}` as const
  const s = t(key)
  return s === key ? resourceType : s
}

/** Значения `resourceType` в журнале (см. `admin-audit-resolve`). */
const AUDIT_LOG_RESOURCE_TYPES = [
  'admin_api',
  'match',
  'match_schedule_reason',
  'news_tag',
  'tenant',
  'tenant_news',
  'tournament',
  'tournament_gallery',
  'tournament_gallery_image',
  'tournament_news',
  'tournament_team',
] as const

const auditResourceTypeOptions = computed(() => {
  const mapped = AUDIT_LOG_RESOURCE_TYPES.map((value) => ({
    value,
    label: resourceTypeLabel(value),
  }))
  const loc = locale.value === 'en' ? 'en' : 'ru'
  mapped.sort((a, b) => a.label.localeCompare(b.label, loc, { sensitivity: 'base' }))
  return [
    { value: '', label: t('admin.audit_log.filter_all') },
    ...mapped,
  ]
})

function auditActionLabel(code: string): string {
  const lang = locale.value === 'en' ? 'en' : 'ru'
  return AUDIT_LOG_ACTION_LABELS[lang][code] ?? code
}

const auditActionOptions = computed(() => {
  const loc = locale.value === 'en' ? 'en' : 'ru'
  const mapped = AUDIT_LOG_ACTION_CODES.map((code) => {
    const human = auditActionLabel(code)
    return {
      value: code,
      label: `${human} (${code})`,
    }
  })
  mapped.sort((a, b) =>
    a.label.localeCompare(b.label, loc, { sensitivity: 'base' }),
  )
  return [
    { value: '', label: t('admin.audit_log.filter_all') },
    ...mapped,
  ]
})

const toast = useToast()
const route = useRoute()
const router = useRouter()
const { token, user, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()

const tenantId = computed(() => {
  const id = (user.value as { tenantId?: string } | null)?.tenantId
  return typeof id === 'string' && id.trim() ? id.trim() : ''
})

const {
  items,
  loading,
  error,
  isEmpty,
  run,
  retry,
} = useAdminAsyncListState<AdminAuditLogRow>({
  initialLoading: true,
  clearItemsOnError: true,
  minLoadingMs: MIN_SKELETON_DISPLAY_MS,
})
const total = ref(0)

watch(error, (e) => {
  if (e) total.value = 0
})
const page = ref(1)
const pageSize = ref(10)

const filters = reactive({
  userId: '',
  role: '' as string,
  httpStatus: '' as string,
  errorCode: '',
  action: '',
  resourceType: '',
})

/** Диапазон дат для API (dateFrom / dateTo в YYYY-MM-DD). */
const auditDateRange = ref<Date[] | null>(null)

const AUDIT_USER_SELECT_PAGE_SIZE = 500

const auditUserOptionsLoading = ref(false)
const auditUserOptions = ref<{ label: string; value: string }[]>([])

const auditUserSelectOptions = computed(() => [
  { label: t('admin.audit_log.filter_all'), value: '' },
  ...auditUserOptions.value,
])

function formatAuditUserOptionLabel(u: UserRow): string {
  const full = `${u.name} ${u.lastName ?? ''}`.trim()
  const base = full.length > 0 ? full : u.username
  const email = u.email?.trim()
  if (email) return `${base} · ${email}`
  return `${base} (@${u.username})`
}

function ensureAuditUserOption(userId: string, label?: string | null) {
  const id = userId.trim()
  if (!id) return
  if (auditUserOptions.value.some((o) => o.value === id)) return
  const text = label?.trim() || shortId(id)
  auditUserOptions.value = [{ value: id, label: text }, ...auditUserOptions.value]
}

async function loadAuditUserOptions() {
  const tid = tenantId.value?.trim()
  if (!tid || !token.value || !loggedIn.value) {
    auditUserOptions.value = []
    return
  }
  auditUserOptionsLoading.value = true
  try {
    const res = await authFetch<{
      items: UserRow[]
      total: number
    }>(apiUrl('/users'), {
      query: {
        page: 1,
        pageSize: AUDIT_USER_SELECT_PAGE_SIZE,
      },
    })
    auditUserOptions.value = (res.items ?? []).map((u) => ({
      value: u.id,
      label: formatAuditUserOptionLabel(u),
    }))
    const total = typeof res.total === 'number' ? res.total : auditUserOptions.value.length
    if (total > AUDIT_USER_SELECT_PAGE_SIZE) {
      toast.add({
        severity: 'info',
        summary: t('admin.audit_log.filter_user_list_truncated', {
          n: total,
          shown: AUDIT_USER_SELECT_PAGE_SIZE,
        }),
        life: 8000,
      })
    }
  } catch (e: unknown) {
    auditUserOptions.value = []
    toast.add({
      severity: 'warn',
      summary: t('admin.audit_log.filter_user_load_error'),
      detail: getApiErrorMessage(e, t('admin.audit_log.filter_user_load_error')),
      life: 6000,
    })
  } finally {
    auditUserOptionsLoading.value = false
  }
}

const roleOptions = computed(() => {
  const roles = [
    'TENANT_ADMIN',
    'TOURNAMENT_ADMIN',
    'MODERATOR',
    'TEAM_ADMIN',
    'USER',
    'REFEREE',
  ] as const
  return [
    { value: '', label: t('admin.audit_log.role_all') },
    ...roles.map((r) => ({
      value: r,
      label: USER_ROLE_LABELS_RU[r] ?? r,
    })),
  ]
})

type QuickFilterValue = 'all' | 'success' | 'forbidden' | 'error' | 'delete'

const quickFilter = ref<QuickFilterValue>('all')

const quickFilterOptions = computed(() => [
  { value: 'all' as const, label: t('admin.audit_log.quick_all') },
  { value: 'success' as const, label: t('admin.audit_log.quick_success') },
  { value: 'forbidden' as const, label: t('admin.audit_log.quick_forbidden') },
  { value: 'error' as const, label: t('admin.audit_log.quick_error') },
  { value: 'delete' as const, label: t('admin.audit_log.quick_delete') },
])

function setQuickFilterFromSelect(v: unknown) {
  const s = v == null ? '' : String(v)
  if (
    s === 'all'
    || s === 'success'
    || s === 'forbidden'
    || s === 'error'
    || s === 'delete'
  ) {
    quickFilter.value = s
  } else {
    quickFilter.value = 'all'
  }
}

/** На узком экране блок фильтров по умолчанию свёрнут (кроме случая с активными фильтрами из URL). */
const auditFiltersMobileOpen = ref(false)

const hasActiveAuditFilters = computed(() => {
  if (quickFilter.value !== 'all') return true
  if (filters.userId.trim()) return true
  if (filters.role.trim()) return true
  if (filters.httpStatus.trim()) return true
  if (filters.errorCode.trim()) return true
  if (filters.action.trim()) return true
  if (filters.resourceType.trim()) return true
  const dr = auditDateRange.value
  if (Array.isArray(dr) && dr.length > 0 && dr[0] != null) return true
  return false
})

/** Ключи query для журнала (остальные параметры при replace сохраняем). */
const AUDIT_LOG_URL_KEYS = [
  'userId',
  'role',
  'httpStatus',
  'errorCode',
  'action',
  'resourceType',
  'dateFrom',
  'dateTo',
  'quick',
  'page',
  'rows',
] as const

/** После `router.replace` один раз пропускаем watch (иначе второй `load`). */
const skipNextAuditRouteQueryWatch = ref(false)

function firstQueryParam(
  q: (typeof route)['query'],
  key: string,
): string {
  const v = q[key]
  if (typeof v === 'string') return v
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
  return ''
}

function fromYmdLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
  return Number.isNaN(d.getTime()) ? null : d
}

function buildAuditLogRouteQuery(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(route.query)) {
    if ((AUDIT_LOG_URL_KEYS as readonly string[]).includes(k)) continue
    if (typeof v === 'string' && v !== '') out[k] = v
    else if (Array.isArray(v) && v[0] != null && String(v[0]) !== '') {
      out[k] = String(v[0])
    }
  }
  const u = filters.userId.trim()
  if (u) out.userId = u
  if (filters.role) out.role = filters.role
  const hs = filters.httpStatus.trim()
  if (hs) out.httpStatus = hs
  const ec = filters.errorCode.trim()
  if (ec) out.errorCode = ec
  const ac = filters.action.trim()
  if (ac) out.action = ac
  const rt = filters.resourceType.trim()
  if (rt) out.resourceType = rt
  const dr = auditDateRange.value
  if (Array.isArray(dr) && dr[0]) {
    out.dateFrom = toYmdLocal(dr[0])
    if (dr[1]) out.dateTo = toYmdLocal(dr[1])
  }
  if (quickFilter.value !== 'all') out.quick = quickFilter.value
  if (page.value > 1) out.page = String(page.value)
  if (pageSize.value !== 10) out.rows = String(pageSize.value)
  return out
}

function auditLogUrlQueryEquals(
  routeQuery: (typeof route)['query'],
  built: Record<string, string>,
): boolean {
  for (const k of AUDIT_LOG_URL_KEYS) {
    const a = firstQueryParam(routeQuery, k)
    const b = built[k] ?? ''
    if (a !== b) return false
  }
  return true
}

async function syncAuditLogUrl() {
  if (!import.meta.client || !tenantId.value.trim()) return
  const next = buildAuditLogRouteQuery()
  if (auditLogUrlQueryEquals(route.query, next)) return
  skipNextAuditRouteQueryWatch.value = true
  try {
    await router.replace({ path: route.path, query: next })
  } catch (e) {
    skipNextAuditRouteQueryWatch.value = false
    throw e
  }
  await nextTick()
  await nextTick()
  if (skipNextAuditRouteQueryWatch.value) {
    skipNextAuditRouteQueryWatch.value = false
  }
}

function applyAuditRouteQuery(q: (typeof route)['query']) {
  filters.userId = firstQueryParam(q, 'userId')
  filters.role = firstQueryParam(q, 'role')
  filters.httpStatus = firstQueryParam(q, 'httpStatus')
  filters.errorCode = firstQueryParam(q, 'errorCode')
  filters.action = firstQueryParam(q, 'action')
  filters.resourceType = firstQueryParam(q, 'resourceType')

  const quick = firstQueryParam(q, 'quick')
  if (
    quick === 'success'
    || quick === 'forbidden'
    || quick === 'error'
    || quick === 'delete'
  ) {
    quickFilter.value = quick
  } else {
    quickFilter.value = 'all'
  }

  const p = Number.parseInt(firstQueryParam(q, 'page'), 10)
  page.value = Number.isFinite(p) && p > 0 ? p : 1

  const rows = Number.parseInt(firstQueryParam(q, 'rows'), 10)
  if (rows === 10 || rows === 25 || rows === 50 || rows === 100) {
    pageSize.value = rows
  } else {
    pageSize.value = 10
  }

  const df = firstQueryParam(q, 'dateFrom')
  const dt = firstQueryParam(q, 'dateTo')
  const d1 = df ? fromYmdLocalDate(df) : null
  const d2 = dt ? fromYmdLocalDate(dt) : null
  if (d1 && d2) auditDateRange.value = [d1, d2]
  else if (d1) auditDateRange.value = [d1]
  else auditDateRange.value = null

  if (filters.userId) ensureAuditUserOption(filters.userId)
}

const first = computed(() => (page.value - 1) * pageSize.value)

/** Узкий экран — меньше номеров страниц в пагинаторе PrimeVue */
const paginatorPageLinkSize = ref(5)
let auditPaginatorMediaQuery: MediaQueryList | null = null

function syncAuditPaginatorPageLinkSize() {
  paginatorPageLinkSize.value =
    auditPaginatorMediaQuery && !auditPaginatorMediaQuery.matches ? 3 : 5
}

const summary = ref<AdminAuditLogSummaryResponse | null>(null)
const summaryLoading = ref(false)

const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref<AdminAuditLogDetail | null>(null)

const userStatsOpen = ref(false)
const userStatsLoading = ref(false)
const userStats = ref<AdminAuditLogSummaryResponse | null>(null)

function resultSeverity(
  r: string,
): 'success' | 'danger' | 'warn' | 'secondary' | 'info' {
  if (r === 'success') return 'success'
  if (r === 'denied') return 'warn'
  if (r === 'error') return 'danger'
  return 'secondary'
}

/** CSS-классы для колонки HTTP (цвет по коду ответа). */
function statusClass(status: number | null | undefined): string {
  if (status === null || status === undefined) return 'status-info'
  if (status === 200) return 'status-success'
  if (status === 403) return 'status-forbidden'
  if (status === 401) return 'status-unauthorized'
  if (status >= 500) return 'status-error'
  return 'status-info'
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString()
  } catch {
    return iso
  }
}

/** Короткий id в таблице; полный — в title. */
function shortId(id: string | null | undefined): string {
  if (id == null || id === '') return '—'
  const s = String(id).trim()
  if (s.length <= 14) return s
  return `${s.slice(0, 8)}…${s.slice(-4)}`
}

function auditHumanTooltipText(data: AdminAuditLogRow): string | null {
  const lines: string[] = []
  const d = data.humanActionDetail?.trim()
  if (d) lines.push(d)
  const id = (data.displayResourceId ?? data.resourceId)?.trim()
  if (id && d !== id) lines.push(`ID: ${id}`)
  if (lines.length > 0) return lines.join('\n\n')
  return null
}

function auditHumanVTooltip(data: AdminAuditLogRow) {
  const text = auditHumanTooltipText(data)
  return text ? adminTooltip(text) : undefined
}

function auditResourceTooltipText(data: AdminAuditLogRow): string | null {
  const lines: string[] = []
  if (data.resourceLabel?.trim()) lines.push(data.resourceLabel.trim())
  const id = (data.displayResourceId ?? data.resourceId)?.trim()
  if (id) lines.push(`ID: ${id}`)
  if (lines.length === 0) return null
  return lines.join('\n\n')
}

function auditResourceVTooltip(data: AdminAuditLogRow) {
  const text = auditResourceTooltipText(data)
  return text ? adminTooltip(text) : undefined
}

function auditUserTooltipText(data: AdminAuditLogRow): string | null {
  const id = data.userId?.trim()
  if (!id) return null
  const label = data.userLabel?.trim()
  if (label) return `${label}\n\nID: ${id}`
  return id
}

function auditUserVTooltip(data: AdminAuditLogRow) {
  const text = auditUserTooltipText(data)
  return text ? adminTooltip(text) : undefined
}

/** Человекочитаемая подпись кода действия (как в фильтре). */
function auditActionCodeLabel(action: string | undefined | null): string | null {
  const a = action?.trim()
  if (!a) return null
  const lang = locale.value === 'en' ? 'en' : 'ru'
  const row = AUDIT_LOG_ACTION_LABELS[lang]
  return row[a] ?? null
}

const refreshing = ref(false)

async function refreshAll() {
  refreshing.value = true
  try {
    await Promise.all([load(), loadSummary(), loadAuditUserOptions()])
  } finally {
    refreshing.value = false
  }
}

function tournamentAdminPath(
  log: Pick<
    AdminAuditLogRow,
    | 'path'
    | 'resourceType'
    | 'resourceId'
    | 'displayResourceType'
    | 'displayResourceId'
  >,
): string | null {
  const fromDisplay =
    log.displayResourceType === 'tournament'
      ? log.displayResourceId?.trim()
      : ''
  const fromStored =
    log.resourceType === 'tournament' ? log.resourceId?.trim() : ''
  const rid = fromDisplay || fromStored
  if (rid) {
    return `/admin/tournaments/${rid}`
  }
  const p = log.path?.trim() ?? ''
  const m = p.match(/^\/tournaments\/([^/?#]+)/)
  return m ? `/admin/tournaments/${m[1]}` : null
}

function prettySnapshot(raw: string | null): string {
  if (raw == null || raw === '') return '—'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

async function loadSummary() {
  const tid = tenantId.value?.trim()
  if (!tid || !token.value) {
    summary.value = null
    return
  }
  summaryLoading.value = true
  try {
    summary.value = await authFetch<AdminAuditLogSummaryResponse>(
      apiUrl(`/tenants/${tid}/admin-audit-log/summary`),
    )
  } catch (e: unknown) {
    summary.value = null
    toast.add({
      severity: 'error',
      summary: t('admin.audit_log.summary_load_error'),
      detail: getApiErrorMessage(e, t('admin.audit_log.summary_load_error')),
      life: 5000,
    })
  } finally {
    summaryLoading.value = false
  }
}

async function openDetail(row: AdminAuditLogRow) {
  const tid = tenantId.value?.trim()
  if (!tid) return
  detailOpen.value = true
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await authFetch<AdminAuditLogDetail>(
      apiUrl(`/tenants/${tid}/admin-audit-log/${row.id}`),
      { query: { locale: auditListLocale.value } },
    )
  } catch (e: unknown) {
    detailOpen.value = false
    toast.add({
      severity: 'error',
      summary: t('admin.audit_log.detail_load_error'),
      detail: getApiErrorMessage(e, t('admin.audit_log.detail_load_error')),
      life: 6000,
    })
  } finally {
    detailLoading.value = false
  }
}

async function showUserStats(
  userId: string | null | undefined,
  presetLabel?: string | null,
) {
  const id = userId?.trim()
  if (!id) {
    toast.add({
      severity: 'warn',
      summary: t('admin.audit_log.user_stats_no_user'),
      life: 4000,
    })
    return
  }
  const tid = tenantId.value?.trim()
  if (!tid) return

  ensureAuditUserOption(id, presetLabel)
  filters.userId = id
  quickFilter.value = 'all'
  page.value = 1

  userStatsOpen.value = true
  userStatsLoading.value = true
  userStats.value = null

  try {
    const sumPromise = authFetch<AdminAuditLogSummaryResponse>(
      apiUrl(`/tenants/${tid}/admin-audit-log/summary`),
      { query: { forUser: id } },
    )
    await Promise.all([load(), sumPromise])
    userStats.value = await sumPromise
    await syncAuditLogUrl()
  } catch (e: unknown) {
    userStatsOpen.value = false
    toast.add({
      severity: 'error',
      summary: t('admin.audit_log.summary_load_error'),
      detail: getApiErrorMessage(e, t('admin.audit_log.summary_load_error')),
      life: 6000,
    })
  } finally {
    userStatsLoading.value = false
  }
}

function buildQuery(): Record<string, string | number | undefined> {
  const q: Record<string, string | number | undefined> = {
    limit: pageSize.value,
    offset: first.value,
  }
  const u = String(filters.userId ?? '').trim()
  if (u) q.userId = u
  if (filters.role) q.role = filters.role
  const hs = filters.httpStatus.trim()
  if (hs && /^\d+$/.test(hs)) q.httpStatus = Number(hs)
  const ec = filters.errorCode.trim()
  if (ec) q.errorCode = ec
  const ac = String(filters.action ?? '').trim()
  if (ac) q.action = ac
  const rt = String(filters.resourceType ?? '').trim()
  if (rt) q.resourceType = rt
  const dr = auditDateRange.value
  if (Array.isArray(dr) && dr[0]) {
    q.dateFrom = toYmdLocal(dr[0])
    if (dr[1]) q.dateTo = toYmdLocal(dr[1])
  }
  if (quickFilter.value !== 'all') q.quickFilter = quickFilter.value
  q.locale = auditListLocale.value
  return q
}

async function load() {
  const tid = tenantId.value?.trim()
  if (!tid) {
    loading.value = false
    items.value = []
    total.value = 0
    return
  }
  if (!token.value) {
    loading.value = false
    return
  }
  await run(async () => {
    const res = await authFetch<AdminAuditLogListResponse>(
      apiUrl(`/tenants/${tid}/admin-audit-log`),
      { query: buildQuery() },
    )
    items.value = res.items
    total.value = res.total
  })
}

function applyFilters() {
  page.value = 1
  void load().then(() => syncAuditLogUrl())
}

function resetFilters() {
  const hadQuickPreset = quickFilter.value !== 'all'
  quickFilter.value = 'all'
  filters.userId = ''
  filters.role = ''
  filters.httpStatus = ''
  filters.errorCode = ''
  filters.action = ''
  filters.resourceType = ''
  auditDateRange.value = null
  page.value = 1
  if (!hadQuickPreset) {
    void load().then(() => syncAuditLogUrl())
  }
}

function onPage(event: { first?: number; rows?: number }) {
  const nextFirst = Number(event.first ?? 0)
  const nextSizeCandidate = Number(event.rows ?? pageSize.value)
  const nextSize = nextSizeCandidate > 0 ? nextSizeCandidate : pageSize.value
  pageSize.value = nextSize
  page.value = Math.floor(nextFirst / nextSize) + 1
  void load().then(() => syncAuditLogUrl())
}

watch(
  () => loggedIn.value,
  (v) => {
    if (v) {
      applyAuditRouteQuery(route.query)
      void refreshAll()
    }
  },
)

watch(quickFilter, () => {
  page.value = 1
  void load().then(() => syncAuditLogUrl())
})

watch(
  () => locale.value,
  () => {
    if (loggedIn.value && tenantId.value.trim()) {
      void load()
    }
  },
)

watch(
  () => tenantId.value,
  (tid) => {
    if (!tid.trim()) {
      auditUserOptions.value = []
      return
    }
    if (loggedIn.value && token.value) {
      void loadAuditUserOptions()
    }
  },
)

watch(
  () => route.query,
  () => {
    if (skipNextAuditRouteQueryWatch.value) {
      skipNextAuditRouteQueryWatch.value = false
      return
    }
    if (!tenantId.value.trim() || !loggedIn.value) return
    applyAuditRouteQuery(route.query)
    void load()
  },
  { deep: true },
)

onMounted(async () => {
  if (typeof window !== 'undefined') {
    auditPaginatorMediaQuery = window.matchMedia('(min-width: 640px)')
    syncAuditPaginatorPageLinkSize()
    auditPaginatorMediaQuery.addEventListener('change', syncAuditPaginatorPageLinkSize)
  }
  syncWithStorage()
  applyAuditRouteQuery(route.query)
  if (
    typeof window !== 'undefined'
    && window.matchMedia('(max-width: 639px)').matches
    && hasActiveAuditFilters.value
  ) {
    auditFiltersMobileOpen.value = true
  }
  if (loggedIn.value) {
    await refreshAll()
  } else {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  auditPaginatorMediaQuery?.removeEventListener(
    'change',
    syncAuditPaginatorPageLinkSize,
  )
})
</script>

<template>
  <section class="mx-auto min-w-0 max-w-[100rem] space-y-3 p-4 sm:space-y-4 sm:p-6">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-0">
          {{ t('admin.audit_log.title') }}
        </h1>
        <p class="mt-1 max-w-3xl text-sm text-muted-color">
          {{ t('admin.audit_log.intro') }}
        </p>
      </div>
      <Button
        v-if="tenantId"
        :label="t('admin.audit_log.refresh')"
        icon="pi pi-refresh"
        text
        severity="secondary"
        class="shrink-0 self-start"
        :loading="refreshing || loading || summaryLoading"
        @click="refreshAll"
      />
    </header>

    <Message
      v-if="!tenantId"
      severity="warn"
      :closable="false"
      class="text-sm"
    >
      {{ t('admin.audit_log.no_tenant') }}
    </Message>

    <div
      v-if="tenantId"
      class="rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900"
    >
      <div class="border-b border-surface-200 px-3 py-3 dark:border-surface-700 sm:px-5">
        <h2 class="text-base font-semibold text-surface-900 dark:text-surface-0">
          {{ t('admin.audit_log.summary_title') }}
        </h2>
      </div>
      <div class="min-w-0 p-3 sm:p-5">
        <div v-if="summaryLoading" class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton v-for="i in 3" :key="i" height="5.5rem" class="rounded-lg" />
        </div>
        <div v-else-if="summary" class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <div
            class="min-w-0 rounded-lg border border-surface-200 bg-surface-50/90 p-3 sm:p-4 dark:border-surface-600 dark:bg-surface-800/50"
          >
            <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-color">
              {{ t('admin.audit_log.stat_24h') }}
            </p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-surface-900 dark:text-surface-0">
              {{ summary.last24h.total }}
            </p>
            <p class="mt-0.5 text-xs text-muted-color">
              {{ t('admin.audit_log.stat_24h_hint') }}
            </p>
            <p class="mt-2 break-words text-xs text-surface-700 dark:text-surface-200">
              {{
                t('admin.audit_log.stat_errors_denied', {
                  errors: summary.last24h.errors,
                  denied: summary.last24h.denied,
                })
              }}
            </p>
          </div>
          <div
            class="min-w-0 rounded-lg border border-surface-200 bg-surface-50/90 p-3 sm:p-4 dark:border-surface-600 dark:bg-surface-800/50"
          >
            <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-color">
              {{ t('admin.audit_log.stat_deletes_title') }}
            </p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-surface-900 dark:text-surface-0">
              {{ summary.todayTournamentDeletesUtc }}
            </p>
            <p class="mt-2 break-words text-xs text-muted-color">
              {{ t('admin.audit_log.stat_deletes_hint') }}
            </p>
          </div>
          <div
            class="min-w-0 rounded-lg border border-surface-200 bg-surface-50/90 p-3 sm:p-4 dark:border-surface-600 dark:bg-surface-800/50"
          >
            <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-color">
              {{ t('admin.audit_log.stat_top_title') }}
            </p>
            <template v-if="summary.topUser">
              <button
                type="button"
                class="mt-1 max-w-full truncate text-left text-sm font-semibold text-primary hover:underline"
                :class="{ 'font-mono': !summary.topUser.userLabel }"
                :title="
                  summary.topUser.userLabel
                    ? `${summary.topUser.userLabel} · ${summary.topUser.userId}`
                    : summary.topUser.userId
                "
                @click="
                  showUserStats(summary.topUser.userId, summary.topUser.userLabel)
                "
              >
                {{
                  summary.topUser.userLabel
                    || shortId(summary.topUser.userId)
                }}
              </button>
              <p class="mt-1 break-words text-xs text-surface-700 dark:text-surface-200">
                {{ t('admin.audit_log.stat_top_actions', { count: summary.topUser.count }) }}
              </p>
              <p class="mt-1 break-words text-[11px] leading-snug text-muted-color">
                {{ t('admin.audit_log.stat_top_hint') }}
              </p>
            </template>
            <p v-else class="mt-2 break-words text-sm text-muted-color">
              {{ t('admin.audit_log.reports_top_user_none') }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="tenantId"
      class="rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900"
    >
      <div
        class="flex flex-wrap items-center justify-between gap-2 border-b border-surface-200 px-3 py-3 dark:border-surface-700 sm:px-5"
      >
        <h2 class="min-w-0 text-base font-semibold text-surface-900 dark:text-surface-0">
          {{ t('admin.audit_log.filters_title') }}
        </h2>
        <Button
          type="button"
          class="shrink-0 sm:hidden"
          :icon="auditFiltersMobileOpen ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
          severity="secondary"
          text
          rounded
          :aria-expanded="auditFiltersMobileOpen"
          :aria-label="
            auditFiltersMobileOpen
              ? t('admin.audit_log.filters_toggle_collapse')
              : t('admin.audit_log.filters_toggle_expand')
          "
          @click="auditFiltersMobileOpen = !auditFiltersMobileOpen"
        />
      </div>
      <div
        class="min-w-0 space-y-4 p-3 sm:p-5"
        :class="auditFiltersMobileOpen ? 'block' : 'hidden sm:block'"
      >
        <div class="flex min-w-0 flex-col gap-2">
          <span class="text-xs font-medium text-muted-color">{{
            t('admin.audit_log.quick_filter_label')
          }}</span>
          <Select
            :model-value="quickFilter"
            :options="quickFilterOptions"
            option-label="label"
            option-value="value"
            class="w-full min-w-0 sm:hidden"
            :disabled="loading"
            @update:model-value="setQuickFilterFromSelect($event)"
          />
          <div class="audit-quick-filter hidden min-w-0 w-full max-w-full sm:block">
            <SelectButton
              v-model="quickFilter"
              :options="quickFilterOptions"
              option-label="label"
              option-value="value"
              :disabled="loading"
            />
          </div>
        </div>

        <div
          class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        >
          <div class="flex min-w-0 flex-col gap-1">
            <label class="text-xs font-medium text-muted-color">{{
              t('admin.audit_log.filter_user')
            }}</label>
            <Select
              :model-value="filters.userId"
              :options="auditUserSelectOptions"
              option-label="label"
              option-value="value"
              class="w-full min-w-0"
              :placeholder="t('admin.audit_log.filter_all')"
              filter
              :filter-placeholder="t('admin.audit_log.filter_user_search')"
              :loading="auditUserOptionsLoading"
              :disabled="loading"
              @update:model-value="filters.userId = $event == null ? '' : String($event)"
            />
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label class="text-xs font-medium text-muted-color">{{
              t('admin.audit_log.filter_role')
            }}</label>
            <Select
              :model-value="filters.role"
              :options="roleOptions"
              option-label="label"
              option-value="value"
              class="w-full min-w-0"
              :placeholder="t('admin.audit_log.role_all')"
              @update:model-value="filters.role = $event == null ? '' : String($event)"
            />
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label class="text-xs font-medium text-muted-color">{{
              t('admin.audit_log.filter_http_status')
            }}</label>
            <InputText
              v-model="filters.httpStatus"
              class="w-full min-w-0"
              inputmode="numeric"
              placeholder="403"
            />
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label class="text-xs font-medium text-muted-color">{{
              t('admin.audit_log.filter_error_code')
            }}</label>
            <InputText v-model="filters.errorCode" class="w-full min-w-0" />
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label class="text-xs font-medium text-muted-color">{{
              t('admin.audit_log.filter_action')
            }}</label>
            <Select
              :model-value="filters.action"
              :options="auditActionOptions"
              option-label="label"
              option-value="value"
              class="w-full min-w-0"
              :placeholder="t('admin.audit_log.filter_all')"
              filter
              :filter-placeholder="t('admin.audit_log.filter_action_search')"
              :disabled="loading"
              @update:model-value="filters.action = $event == null ? '' : String($event)"
            />
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label class="text-xs font-medium text-muted-color">{{
              t('admin.audit_log.filter_resource_type')
            }}</label>
            <Select
              :model-value="filters.resourceType"
              :options="auditResourceTypeOptions"
              option-label="label"
              option-value="value"
              class="w-full min-w-0"
              :placeholder="t('admin.audit_log.filter_all')"
              filter
              :filter-placeholder="t('admin.audit_log.filter_resource_type_search')"
              :disabled="loading"
              @update:model-value="
                filters.resourceType = $event == null ? '' : String($event)
              "
            />
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label class="text-xs font-medium text-muted-color">{{
              t('admin.audit_log.filter_date_range')
            }}</label>
            <DatePicker
              v-model="auditDateRange"
              selection-mode="range"
              :date-format="auditDatePickerFormat"
              show-icon
              icon-display="input"
              fluid
              class="audit-filter-datepicker w-full min-w-0"
              :placeholder="t('admin.audit_log.filter_date_range_placeholder')"
              :disabled="loading"
            />
          </div>
        </div>

        <div
          class="flex flex-col gap-2 border-t border-surface-100 pt-4 dark:border-surface-800 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2"
        >
          <Button
            class="w-full shrink-0 sm:w-auto"
            :label="t('admin.audit_log.apply')"
            icon="pi pi-filter"
            :loading="loading"
            @click="applyFilters"
          />
          <Button
            class="w-full shrink-0 sm:w-auto"
            :label="t('admin.audit_log.reset')"
            icon="pi pi-times"
            severity="secondary"
            outlined
            :disabled="loading"
            @click="resetFilters"
          />
        </div>
      </div>
    </div>

    <div
      v-if="tenantId"
      class="min-w-0 rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900"
    >
      <AdminDataState
        :loading="loading"
        :error="error"
        :empty="isEmpty"
        :empty-title="t('admin.audit_log.empty')"
        :content-card="false"
        @retry="retry"
      >
      <div
        class="audit-log-table-scroll min-w-0 w-full overflow-x-auto [-webkit-overflow-scrolling:touch]"
      >
        <DataTable
          :value="items"
          data-key="id"
          striped-rows
          size="small"
          class="!min-w-0 !border-0"
          :pt="{
            root: { class: 'w-max min-w-full !border-0 !shadow-none !rounded-none' },
          }"
        >
      <template #empty>
        <span class="sr-only">{{ t('admin.audit_log.empty') }}</span>
      </template>
      <Column :header="t('admin.audit_log.col_time')" style="min-width: 8.5rem">
        <template #body="{ data }">
          <span class="whitespace-nowrap text-xs tabular-nums">{{
            formatTime(data.createdAt)
          }}</span>
        </template>
      </Column>
      <Column :header="t('admin.audit_log.col_result')" style="min-width: 5.5rem">
        <template #body="{ data }">
          <Tag
            :value="data.result"
            :severity="resultSeverity(data.result)"
            class="text-xs"
          />
        </template>
      </Column>

      <Column :header="t('admin.audit_log.col_human_action')" style="min-width: 10rem">
        <template #body="{ data }">
          <span
            v-tooltip.top="auditHumanVTooltip(data)"
            class="block min-w-0 cursor-default truncate text-xs leading-snug text-surface-800 dark:text-surface-100"
          >{{
            data.humanActionSummary ?? data.humanAction
          }}</span>
        </template>
      </Column>
      <Column :header="t('admin.audit_log.col_user')" style="min-width: 9rem">
        <template #body="{ data }">
          <span
            v-tooltip.top="auditUserVTooltip(data)"
            class="block min-w-0 cursor-default truncate text-xs font-medium text-surface-800 dark:text-surface-100"
          >{{ data.userLabel || shortId(data.userId) || '—' }}</span>
        </template>
      </Column>
      <Column :header="t('admin.audit_log.col_action_code')" style="min-width: 11rem">
        <template #body="{ data }">
          <div
            v-tooltip.top="adminTooltip(data.action ?? '—')"
            class="min-w-0 cursor-default space-y-1"
          >
            <div
              v-if="auditActionCodeLabel(data.action)"
              class="text-xs font-medium leading-snug text-surface-800 dark:text-surface-0"
            >
              {{ auditActionCodeLabel(data.action) }}
            </div>
            <code
              class="block font-mono text-[11px] leading-snug text-muted-color [overflow-wrap:anywhere] [word-break:break-word]"
            >{{ data.action }}</code>
          </div>
        </template>
      </Column>
      <Column :header="t('admin.audit_log.col_resource')" style="min-width: 7rem">
        <template #body="{ data }">
          <span
            v-tooltip.top="auditResourceVTooltip(data)"
            class="block min-w-0 cursor-default truncate text-xs font-medium text-surface-800 dark:text-surface-100"
          >{{ resourceTypeLabel(data.displayResourceType) }}</span>
        </template>
      </Column>
      <Column :header="t('admin.audit_log.col_role')" style="min-width: 5.5rem">
        <template #body="{ data }">
          <span class="text-xs">{{ data.role ?? '—' }}</span>
        </template>
      </Column>
      <Column :header="t('admin.audit_log.col_method_path')" style="min-width: 14rem">
        <template #body="{ data }">
          <div class="min-w-0 text-xs">
            <span class="font-mono text-muted-color">{{ data.method ?? '—' }}</span>
            <div
              class="font-mono leading-snug [overflow-wrap:anywhere] [word-break:break-word]"
              :title="data.path ?? ''"
            >{{ data.path ?? '—' }}</div>
          </div>
        </template>
      </Column>
      <Column :header="t('admin.audit_log.col_http')" style="min-width: 3.25rem">
        <template #body="{ data }">
          <span
            class="audit-http-status tabular-nums text-xs"
            :class="statusClass(data.httpStatus)"
          >{{ data.httpStatus ?? '—' }}</span>
        </template>
      </Column>
      <Column :header="t('admin.audit_log.col_error')" style="min-width: 5.5rem">
        <template #body="{ data }">
          <code class="text-xs break-all">{{ data.errorCode ?? '—' }}</code>
        </template>
      </Column>
      <Column
        style="min-width: 6.75rem"
        :pt="{
          headerCell: { class: 'text-end' },
          bodyCell: { class: '!p-2 align-middle' },
        }"
      >
        <template #header>
          <span
            class="block truncate text-end text-xs font-semibold leading-tight"
            :title="t('admin.audit_log.col_actions')"
          >{{ t('admin.audit_log.col_actions') }}</span>
        </template>
        <template #body="{ data }">
          <div
            class="flex flex-nowrap items-center justify-end gap-1"
          >
            <NuxtLink
              v-if="tournamentAdminPath(data)"
              v-tooltip.top="adminTooltip(t('admin.audit_log.action_open_tournament'))"
              :to="String(tournamentAdminPath(data))"
              class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-surface-300 bg-transparent text-primary hover:bg-surface-100 dark:border-surface-600 dark:hover:bg-surface-800"
              :aria-label="t('admin.audit_log.action_open_tournament')"
            >
              <i class="pi pi-external-link text-sm leading-none" aria-hidden="true" />
            </NuxtLink>
            <Button
              icon="pi pi-eye"
              size="small"
              severity="secondary"
              outlined
              rounded
              class="!h-8 !w-8 !min-w-8 shrink-0 !p-0"
              :aria-label="t('admin.audit_log.action_detail')"
              v-tooltip.top="adminTooltip(t('admin.audit_log.action_detail'))"
              @click="openDetail(data)"
            />
            <Button
              icon="pi pi-chart-bar"
              size="small"
              severity="secondary"
              outlined
              rounded
              class="!h-8 !w-8 !min-w-8 shrink-0 !p-0"
              :aria-label="t('admin.audit_log.action_user_stats')"
              v-tooltip.top="adminTooltip(t('admin.audit_log.action_user_stats'))"
              :disabled="!data.userId"
              @click="showUserStats(data.userId, data.userLabel)"
            />
          </div>
        </template>
      </Column>
        </DataTable>
      </div>

      <div
        v-if="total > 0"
        class="min-w-0 border-t border-surface-200 px-2 py-3 dark:border-surface-700 sm:px-4"
      >
        <div class="audit-log-paginator w-full min-w-0">
          <Paginator
            :rows="pageSize"
            :total-records="total"
            :first="first"
            :page-link-size="paginatorPageLinkSize"
            :rows-per-page-options="[10, 25, 50, 100]"
            template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport"
            :current-page-report-template="t('admin.audit_log.paginator_page_report')"
            @page="onPage"
          />
        </div>
        <p
          class="mt-2 px-1 text-center text-[11px] leading-snug text-muted-color sm:text-xs"
        >
          {{ t('admin.audit_log.paginator_hint', { total, pageSize: pageSize }) }}
        </p>
      </div>
      </AdminDataState>
    </div>

    <Dialog
      v-model:visible="detailOpen"
      modal
      block-scroll
      :header="t('admin.audit_log.detail_title')"
      :style="{ width: 'min(44rem, 94vw)' }"
      :dismissable-mask="true"
    >
      <div v-if="detailLoading" class="space-y-2 py-4">
        <Skeleton height="1rem" class="rounded" />
        <Skeleton height="6rem" class="rounded" />
      </div>
      <div v-else-if="detail" class="max-h-[70vh] space-y-4 overflow-y-auto text-sm">
        <div>
          <div class="text-xs font-medium text-muted-color">{{ t('admin.audit_log.detail_method') }}</div>
          <code class="text-xs">{{ detail.method ?? '—' }}</code>
        </div>
        <div>
          <div class="text-xs font-medium text-muted-color">{{ t('admin.audit_log.detail_path') }}</div>
          <pre class="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded border border-surface-200 bg-surface-50 p-2 text-xs dark:border-surface-700 dark:bg-surface-950">{{ detail.path ?? '—' }}</pre>
        </div>
        <div>
          <div class="text-xs font-medium text-muted-color">{{ t('admin.audit_log.detail_body') }}</div>
          <pre class="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded border border-surface-200 bg-surface-50 p-2 text-xs dark:border-surface-700 dark:bg-surface-950">{{ prettySnapshot(detail.requestBody) }}</pre>
        </div>
        <div>
          <div class="text-xs font-medium text-muted-color">{{ t('admin.audit_log.detail_headers') }}</div>
          <pre class="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded border border-surface-200 bg-surface-50 p-2 text-xs dark:border-surface-700 dark:bg-surface-950">{{ prettySnapshot(detail.requestHeaders) }}</pre>
        </div>
        <p
          v-if="!detail.requestBody && !detail.requestHeaders"
          class="text-xs text-muted-color"
        >
          {{ t('admin.audit_log.detail_empty_snapshot') }}
        </p>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="userStatsOpen"
      modal
      block-scroll
      :header="t('admin.audit_log.user_stats_title')"
      :style="{ width: 'min(32rem, 94vw)' }"
      :dismissable-mask="true"
    >
      <div v-if="userStatsLoading" class="space-y-2 py-4">
        <Skeleton height="1rem" class="rounded" />
        <Skeleton height="3rem" class="rounded" />
      </div>
      <div v-else-if="userStats?.forUser" class="space-y-4 text-sm">
        <p class="font-medium">
          {{ t('admin.audit_log.user_stats_user', { id: userStats.forUser.userId }) }}
        </p>
        <div>
          <div class="text-xs font-medium text-muted-color">{{ t('admin.audit_log.user_stats_last24h') }}</div>
          <p class="mt-1">
            {{
              t('admin.audit_log.user_stats_bucket', {
                total: userStats.forUser.last24h.total,
                errors: userStats.forUser.last24h.errors,
                denied: userStats.forUser.last24h.denied,
              })
            }}
          </p>
        </div>
        <div>
          <div class="text-xs font-medium text-muted-color">{{ t('admin.audit_log.user_stats_last7d') }}</div>
          <p class="mt-1">
            {{
              t('admin.audit_log.user_stats_bucket', {
                total: userStats.forUser.last7d.total,
                errors: userStats.forUser.last7d.errors,
                denied: userStats.forUser.last7d.denied,
              })
            }}
          </p>
        </div>
        <p class="text-xs text-muted-color">
          {{ t('admin.audit_log.user_stats_filter_applied') }}
        </p>
      </div>
    </Dialog>
  </section>
</template>

<style scoped>
.audit-http-status.status-success {
  @apply font-semibold text-green-700 dark:text-green-400;
}

.audit-http-status.status-forbidden {
  @apply font-semibold text-amber-700 dark:text-amber-400;
}

.audit-http-status.status-unauthorized {
  @apply font-semibold text-red-600 dark:text-red-400;
}

.audit-http-status.status-error {
  @apply font-semibold text-red-900 dark:text-red-300;
}

.audit-http-status.status-info {
  @apply text-muted-color;
}

/* Быстрые фильтры: перенос сегментов вместо горизонтального скролла */
.audit-quick-filter :deep(.p-selectbutton) {
  @apply flex w-full min-w-0 flex-wrap gap-2;
}

.audit-quick-filter :deep(.p-togglebutton) {
  @apply shrink-0;
}

.audit-quick-filter :deep(.p-togglebutton-label) {
  @apply whitespace-nowrap;
}

/* Период: не вылезает за сетку на узкой ширине */
.audit-filter-datepicker :deep(.p-datepicker) {
  @apply w-full min-w-0 max-w-full;
}

.audit-filter-datepicker :deep(.p-datepicker-input) {
  @apply min-w-0 max-w-full;
}

/* Скролл на .audit-log-table-scroll: у DataTable контейнер с overflow:auto иначе «съедает» полосу прокрутки */
.audit-log-table-scroll :deep(.p-datatable-table-container) {
  overflow-x: visible !important;
  overflow-y: visible !important;
  max-width: none;
}

.audit-log-table-scroll :deep(table.p-datatable-table) {
  width: max(100%, 88rem) !important;
  table-layout: auto !important;
}

/* min-w-0 у ячеек — длинный путь/код переносятся внутри колонки при auto layout */
.audit-log-table-scroll :deep(.p-datatable-tbody > tr > td),
.audit-log-table-scroll :deep(.p-datatable-thead > tr > th) {
  min-width: 0;
  vertical-align: top;
}

/* Пагинатор: перенос строк, без обрезки на узкой ширине */
.audit-log-paginator :deep(nav) {
  @apply block w-full min-w-0 max-w-full;
}

.audit-log-paginator :deep(.p-paginator) {
  @apply w-full min-w-0 flex-wrap justify-center gap-x-2 gap-y-3 border-0 bg-transparent p-0;
}

.audit-log-paginator :deep(.p-paginator-content) {
  @apply flex min-w-0 flex-wrap items-center justify-center gap-x-1 gap-y-2 sm:gap-x-2;
}

@media (max-width: 639px) {
  .audit-log-paginator :deep(.p-paginator-content) {
    /* items-center + перенос давали смещение куска «… из N» относительно номеров страниц */
    @apply items-stretch;
  }

  .audit-log-paginator :deep(.p-paginator-first),
  .audit-log-paginator :deep(.p-paginator-last) {
    @apply hidden;
  }

  /* Диапазон «1–10 из N» на xs ломался (оставался «— из»); снизу есть paginator_hint */
  .audit-log-paginator :deep(.p-paginator-current) {
    @apply hidden;
  }

  .audit-log-paginator :deep(.p-paginator-rpp-dropdown) {
    @apply flex w-full min-w-0 shrink-0 basis-full justify-center self-center;
  }

  .audit-log-paginator :deep(.p-paginator-rpp-dropdown .p-select) {
    @apply w-full max-w-[12rem];
  }

  /* кнопки страниц — выравнивание по центру полосы (first/last скрыты выше) */
  .audit-log-paginator :deep(.p-paginator-prev),
  .audit-log-paginator :deep(.p-paginator-pages),
  .audit-log-paginator :deep(.p-paginator-next) {
    @apply self-center;
  }
}
</style>

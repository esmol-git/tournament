import { appendUniqueById, buildTournamentListParams } from '~/composables/admin/useTournamentList'
import { MIN_SKELETON_DISPLAY_MS, sleepRemainingAfter } from '~/utils/minimumLoadingDelay'
import { getApiErrorMessage } from '~/utils/apiError'
import type {
  TournamentListResponse,
  TournamentRow,
  TournamentStatus,
} from '~/types/admin/tournaments-index'
import type { ComputedRef, Ref } from 'vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { LocationQuery } from 'vue-router'

type AuthFetchFn = <T = unknown>(
  url: string,
  options?: Record<string, unknown>,
) => Promise<T>

/**
 * Список турниров на `/admin/tournaments`: пагинация, фильтры, синхронизация с query, infinite scroll.
 */
export function useAdminTournamentsList(options: {
  token: Ref<string | null>
  tenantId: ComputedRef<string>
  authFetch: AuthFetchFn
  apiUrl: (path: string) => string
  isTemplatesTab: ComputedRef<boolean>
}) {
  const route = useRoute()
  const router = useRouter()
  const { token, tenantId, authFetch, apiUrl, isTemplatesTab } = options

  const loading = ref(true)
  /** Ошибка первичной/сброшенной загрузки списка (не «load more»). */
  const listError = ref<string | null>(null)
  const tournaments = ref<TournamentRow[]>([])
  const tournamentsTotal = ref(0)
  const tournamentsPage = ref(0)
  const tournamentsPageSize = 5
  const skeletonTournamentRows = Array.from({ length: tournamentsPageSize }, (_, i) => ({
    id: `__tsk-${i}`,
  }))
  const loadingMoreTournaments = ref(false)
  const tournamentsSearch = ref('')
  const loadMoreAnchor = ref<HTMLElement | null>(null)
  const hasUserInteractedForInfinite = ref(false)

  const statusFilter = ref<'all' | TournamentStatus>('all')
  const seasonFilter = ref('')
  const competitionFilter = ref('')
  const ageGroupFilter = ref('')

  let searchDebounce: ReturnType<typeof setTimeout> | null = null
  let tournamentsObserver: IntersectionObserver | null = null
  let detachScrollUnlock: (() => void) | null = null

  const hasMoreTournaments = computed(
    () => tournaments.value.length < tournamentsTotal.value,
  )

  const tournamentsFiltersActive = computed(
    () =>
      !!tournamentsSearch.value.trim() ||
      statusFilter.value !== 'all' ||
      seasonFilter.value !== '' ||
      competitionFilter.value !== '' ||
      ageGroupFilter.value !== '',
  )

  const tournamentsListSemanticallyEmpty = computed(
    () =>
      tournamentsTotal.value === 0 &&
      !tournamentsFiltersActive.value &&
      tournaments.value.length === 0,
  )

  const LIST_FILTER_QUERY_KEYS = ['status', 'search', 'season', 'competition', 'age'] as const

  function firstQueryString(val: unknown): string {
    if (val == null || val === '') return ''
    if (Array.isArray(val)) return val.length ? String(val[0]) : ''
    return String(val)
  }

  function parseStatusFromQuery(raw: string): 'all' | TournamentStatus {
    const u = raw.trim().toUpperCase()
    if (!u || u === 'ALL') return 'all'
    const allowed: TournamentStatus[] = ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']
    return allowed.includes(u as TournamentStatus) ? (u as TournamentStatus) : 'all'
  }

  function readListFiltersFromQuery(query: LocationQuery) {
    return {
      status: parseStatusFromQuery(firstQueryString(query.status)),
      search: firstQueryString(query.search),
      season: firstQueryString(query.season),
      competition: firstQueryString(query.competition),
      age: firstQueryString(query.age),
    }
  }

  function listFiltersMatchQuery(q: ReturnType<typeof readListFiltersFromQuery>) {
    return (
      statusFilter.value === q.status &&
      tournamentsSearch.value === q.search &&
      seasonFilter.value === q.season &&
      competitionFilter.value === q.competition &&
      ageGroupFilter.value === q.age
    )
  }

  function normalizeQueryComparable(q: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {}
    for (const key of Object.keys(q).sort()) {
      const val = q[key]
      if (val == null || val === '') continue
      const s = Array.isArray(val) ? val.map(String).join(',') : String(val)
      if (s !== '') out[key] = s
    }
    return out
  }

  function buildListFiltersQuery(): Record<string, string | string[]> {
    const next: Record<string, string | string[]> = {}
    for (const [key, val] of Object.entries(route.query)) {
      if ((LIST_FILTER_QUERY_KEYS as readonly string[]).includes(key)) continue
      if (val === null || val === undefined || val === '') continue
      next[key] = val as string | string[]
    }
    if (statusFilter.value !== 'all') next.status = statusFilter.value
    const st = tournamentsSearch.value.trim()
    if (st) next.search = st
    if (seasonFilter.value) next.season = seasonFilter.value
    if (competitionFilter.value) next.competition = competitionFilter.value
    if (ageGroupFilter.value) next.age = ageGroupFilter.value
    return next
  }

  function writeListFiltersToRoute() {
    if (isTemplatesTab.value) return
    const desired = buildListFiltersQuery()
    const a = normalizeQueryComparable(route.query as Record<string, unknown>)
    const b = normalizeQueryComparable(desired as Record<string, unknown>)
    if (JSON.stringify(a) === JSON.stringify(b)) return
    void router.replace({ path: route.path, query: desired })
  }

  let listFiltersSyncFromRoute = false

  const fetchTournaments = async (opts: { reset?: boolean } = {}) => {
    if (!token.value) {
      loading.value = false
      loadingMoreTournaments.value = false
      return
    }
    const reset = opts.reset !== false
    const nextPage = reset ? 1 : tournamentsPage.value + 1
    const loadStartedAt = Date.now()
    if (reset) loading.value = true
    else loadingMoreTournaments.value = true
    try {
      if (reset) listError.value = null
      const res = await authFetch<TournamentListResponse>(
        apiUrl(`/tenants/${tenantId.value}/tournaments`),
        {
          headers: { Authorization: `Bearer ${token.value}` },
          params: buildTournamentListParams({
            page: nextPage,
            pageSize: tournamentsPageSize,
            statusFilter: statusFilter.value,
            search: tournamentsSearch.value,
            seasonId: seasonFilter.value,
            competitionId: competitionFilter.value,
            ageGroupId: ageGroupFilter.value,
          }),
        },
      )
      const items = res.items ?? []
      tournamentsTotal.value = res.total ?? 0
      tournamentsPage.value = res.page ?? nextPage
      if (reset) {
        tournaments.value = items
        return
      }
      tournaments.value = appendUniqueById(tournaments.value, items)
    } catch (e: unknown) {
      if (reset) {
        tournaments.value = []
        tournamentsTotal.value = 0
        listError.value = getApiErrorMessage(e) || 'Не удалось загрузить турниры'
      }
    } finally {
      if (reset) {
        await sleepRemainingAfter(MIN_SKELETON_DISPLAY_MS, loadStartedAt)
        loading.value = false
      } else {
        loadingMoreTournaments.value = false
      }
    }
  }

  function retryList() {
    void fetchTournaments({ reset: true })
  }

  function applyListFiltersFromQuery(query: LocationQuery, opts: { fetch?: boolean } = {}) {
    const r = readListFiltersFromQuery(query)
    listFiltersSyncFromRoute = true
    statusFilter.value = r.status
    tournamentsSearch.value = r.search
    seasonFilter.value = r.season
    competitionFilter.value = r.competition
    ageGroupFilter.value = r.age
    listFiltersSyncFromRoute = false
    if (opts.fetch !== false) void fetchTournaments({ reset: true })
  }

  const onTournamentsSearchInput = (v: string) => {
    if (searchDebounce) clearTimeout(searchDebounce)
    searchDebounce = setTimeout(() => {
      searchDebounce = null
      tournamentsSearch.value = v
      void fetchTournaments({ reset: true })
      writeListFiltersToRoute()
    }, 250)
  }

  const onStatusFilterChange = (value: string) => {
    statusFilter.value = value === 'all' ? 'all' : (value as TournamentStatus)
  }

  function disconnectObserverAndScroll() {
    tournamentsObserver?.disconnect()
    tournamentsObserver = null
    detachScrollUnlock?.()
    detachScrollUnlock = null
  }

  /**
   * После авторизации: первая загрузка списка согласно URL (без дублирования fetch).
   */
  function bootstrapListFromCurrentRoute() {
    if (isTemplatesTab.value) return
    const q = readListFiltersFromQuery(route.query)
    if (listFiltersMatchQuery(q)) {
      void fetchTournaments({ reset: true })
    } else {
      applyListFiltersFromQuery(route.query)
    }
  }

  /**
   * Колесо / тач / якорь внизу — подгрузка следующей страницы (клиент только).
   */
  function installInfiniteScrollAndObserver() {
    if (typeof window === 'undefined') return

    disconnectObserverAndScroll()

    const unlockAndMaybeLoad = () => {
      hasUserInteractedForInfinite.value = true
      if (
        !loading.value &&
        !loadingMoreTournaments.value &&
        hasMoreTournaments.value &&
        loadMoreAnchor.value
      ) {
        const rect = loadMoreAnchor.value.getBoundingClientRect()
        if (rect.top <= window.innerHeight + 200) {
          void fetchTournaments({ reset: false })
        }
      }
    }
    const unlockOnKeydown = (e: KeyboardEvent) => {
      if (
        e.key === 'ArrowDown' ||
        e.key === 'PageDown' ||
        e.key === 'End' ||
        e.key === ' '
      ) {
        unlockAndMaybeLoad()
      }
    }
    window.addEventListener('wheel', unlockAndMaybeLoad, { passive: true })
    window.addEventListener('touchmove', unlockAndMaybeLoad, { passive: true })
    window.addEventListener('keydown', unlockOnKeydown)
    detachScrollUnlock = () => {
      window.removeEventListener('wheel', unlockAndMaybeLoad)
      window.removeEventListener('touchmove', unlockAndMaybeLoad)
      window.removeEventListener('keydown', unlockOnKeydown)
    }

    tournamentsObserver = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (!first?.isIntersecting) return
        if (!hasUserInteractedForInfinite.value) return
        if (loading.value || loadingMoreTournaments.value || !hasMoreTournaments.value) return
        void fetchTournaments({ reset: false })
      },
      { root: null, rootMargin: '120px 0px 200px 0px', threshold: 0 },
    )
    if (loadMoreAnchor.value) tournamentsObserver.observe(loadMoreAnchor.value)
  }

  watch(loadMoreAnchor, (el) => {
    if (!tournamentsObserver) return
    tournamentsObserver.disconnect()
    if (el) tournamentsObserver.observe(el)
  })

  watch(statusFilter, () => {
    if (listFiltersSyncFromRoute) return
    void fetchTournaments({ reset: true })
    writeListFiltersToRoute()
  })

  watch(seasonFilter, () => {
    if (listFiltersSyncFromRoute) return
    void fetchTournaments({ reset: true })
    writeListFiltersToRoute()
  })

  watch(competitionFilter, () => {
    if (listFiltersSyncFromRoute) return
    void fetchTournaments({ reset: true })
    writeListFiltersToRoute()
  })

  watch(ageGroupFilter, () => {
    if (listFiltersSyncFromRoute) return
    void fetchTournaments({ reset: true })
    writeListFiltersToRoute()
  })

  watch(
    () => route.query,
    () => {
      if (isTemplatesTab.value) return
      const r = readListFiltersFromQuery(route.query)
      if (listFiltersMatchQuery(r)) return
      applyListFiltersFromQuery(route.query)
    },
    { deep: true },
  )

  watch(
    () => route.query.tab,
    (tab, prev) => {
      const wasTemplates =
        prev === 'templates' || (Array.isArray(prev) && prev.includes('templates'))
      const nowTemplates =
        tab === 'templates' || (Array.isArray(tab) && tab.includes('templates'))
      if (wasTemplates && !nowTemplates && token.value) {
        const r = readListFiltersFromQuery(route.query)
        if (listFiltersMatchQuery(r)) {
          void fetchTournaments({ reset: true })
        } else {
          applyListFiltersFromQuery(route.query)
        }
      }
    },
  )

  onBeforeUnmount(() => {
    if (searchDebounce) clearTimeout(searchDebounce)
    disconnectObserverAndScroll()
  })

  return {
    loading,
    listError,
    retryList,
    tournaments,
    tournamentsTotal,
    tournamentsPage,
    tournamentsPageSize,
    skeletonTournamentRows,
    loadingMoreTournaments,
    tournamentsSearch,
    loadMoreAnchor,
    hasUserInteractedForInfinite,
    statusFilter,
    seasonFilter,
    competitionFilter,
    ageGroupFilter,
    hasMoreTournaments,
    tournamentsFiltersActive,
    tournamentsListSemanticallyEmpty,
    fetchTournaments,
    readListFiltersFromQuery,
    listFiltersMatchQuery,
    applyListFiltersFromQuery,
    writeListFiltersToRoute,
    onTournamentsSearchInput,
    onStatusFilterChange,
    bootstrapListFromCurrentRoute,
    installInfiniteScrollAndObserver,
  }
}

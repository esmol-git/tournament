import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TournamentRow } from '~/types/admin/tournaments-index'

type Params = {
  tenant: MaybeRefOrGetter<string>
  selectedTid: MaybeRefOrGetter<string | null>
  loadAllTournaments: (tenantSlug: string) => Promise<TournamentRow[]>
}

/**
 * Список турниров для публичных страниц кэшируется в `useState` по тенанту.
 * Иначе при каждом переходе календарь ↔ таблица монтируется новая страница с пустым списком,
 * снова включается `loading` и скелетон — ощущение «всё перезагружается», хотя данные уже были.
 */
const tournamentsByTenant = useState<Record<string, TournamentRow[]>>(
  'public-tournament-list-by-tenant',
  () => ({}),
)

export function usePublicTournamentSelection(params: Params) {
  const route = useRoute()
  const router = useRouter()

  const tournaments = ref<TournamentRow[]>([])
  const selectedTournamentId = ref<string>('')
  const loading = ref(false)

  const selectedTournament = computed(
    () => tournaments.value.find((t) => t.id === selectedTournamentId.value) ?? null,
  )

  function syncTidToQuery(nextId: string | null) {
    const cur = typeof route.query.tid === 'string' ? route.query.tid.trim() : ''
    const next = (nextId ?? '').trim()
    if (next && cur === next) return
    if (!next && !cur) return
    const q: Record<string, unknown> = { ...route.query }
    if (next) q.tid = next
    else delete q.tid
    void router.replace({ query: q as Record<string, any> })
  }

  function initializeSelectionFromContext() {
    selectedTournamentId.value = toValue(params.selectedTid) ?? ''
  }

  function applyPreferredTournament(loaded: TournamentRow[]) {
    tournaments.value = loaded
    const ids = new Set(loaded.map((t) => t.id))
    const preferredId = (toValue(params.selectedTid) ?? '').trim()
    if (preferredId && ids.has(preferredId)) {
      if (selectedTournamentId.value !== preferredId) {
        selectedTournamentId.value = preferredId
      }
      syncTidToQuery(preferredId)
      return
    }
    if (selectedTournamentId.value && !ids.has(selectedTournamentId.value)) {
      selectedTournamentId.value = ''
    }
    if (!selectedTournamentId.value) {
      selectedTournamentId.value = loaded[0]?.id ?? ''
      syncTidToQuery(selectedTournamentId.value || null)
    }
  }

  async function fetchTournaments(options?: { onError?: (e: any) => void }) {
    const tenantSlug = toValue(params.tenant)
    const warmList = tournamentsByTenant.value[tenantSlug]
    const showLoading = !warmList?.length
    if (showLoading) loading.value = true
    try {
      const loaded = await params.loadAllTournaments(tenantSlug)
      tournamentsByTenant.value = { ...tournamentsByTenant.value, [tenantSlug]: loaded }
      applyPreferredTournament(loaded)
      return loaded
    } catch (e: any) {
      tournaments.value = []
      const next = { ...tournamentsByTenant.value }
      delete next[tenantSlug]
      tournamentsByTenant.value = next
      options?.onError?.(e)
      return []
    } finally {
      loading.value = false
    }
  }

  watch(
    () => toValue(params.tenant),
    (slug, prev) => {
      if (!String(slug ?? '').trim()) return
      const cached = tournamentsByTenant.value[String(slug)]
      if (cached?.length) {
        applyPreferredTournament(cached)
      } else if (prev !== undefined && slug !== prev) {
        tournaments.value = []
      }
    },
    { immediate: true },
  )

  watch(
    () => toValue(params.selectedTid),
    (tid) => {
      const v = (tid ?? '').trim()
      if (!v) return
      if (selectedTournamentId.value !== v) {
        selectedTournamentId.value = v
      }
    },
  )

  return {
    tournaments,
    selectedTournamentId,
    selectedTournament,
    loading,
    syncTidToQuery,
    initializeSelectionFromContext,
    fetchTournaments,
  }
}

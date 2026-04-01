import { computed, ref, unref, watch, type MaybeRefOrGetter } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TournamentRow } from '~/types/admin/tournaments-index'

type Params = {
  tenant: MaybeRefOrGetter<string>
  selectedTid: MaybeRefOrGetter<string | null>
  loadAllTournaments: (tenantSlug: string) => Promise<TournamentRow[]>
}

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
    const q: Record<string, any> = { ...route.query }
    if (nextId) q.tid = nextId
    else delete q.tid
    void router.replace({ query: q })
  }

  function initializeSelectionFromContext() {
    selectedTournamentId.value = unref(params.selectedTid) ?? ''
  }

  function applyPreferredTournament(loaded: TournamentRow[]) {
    tournaments.value = loaded
    const ids = new Set(loaded.map((t) => t.id))
    const preferredId = (unref(params.selectedTid) ?? '').trim()
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
    loading.value = true
    try {
      const loaded = await params.loadAllTournaments(unref(params.tenant))
      applyPreferredTournament(loaded)
      return loaded
    } catch (e: any) {
      tournaments.value = []
      options?.onError?.(e)
      return []
    } finally {
      loading.value = false
    }
  }

  watch(
    () => unref(params.selectedTid),
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

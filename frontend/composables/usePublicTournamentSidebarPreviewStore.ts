export type PublicSidebarStandingsRow = {
  teamId: string
  teamName: string
  points: number
  played: number
  goalDiff: number
  logoUrl: string | null
}

export type PublicSidebarStandingsGroup = {
  groupId: string
  groupName: string
  rows: PublicSidebarStandingsRow[]
}

type Entry = { flat: PublicSidebarStandingsRow[]; groups: PublicSidebarStandingsGroup[] }

const STATE_KEY = 'public-tournament-sidebar-standings-v1'

function storeKey(tenant: string, tid: string) {
  return `${tenant}::${tid}`
}

/**
 * Мини-таблица в сайдбаре: страницы публикуют данные, лейаут турнира читает без remount.
 */
export function usePublicTournamentSidebarPreviewStore() {
  const map = useState<Record<string, Entry>>(STATE_KEY, () => ({}))

  function publish(tenant: string, tid: string, flat: PublicSidebarStandingsRow[], groups: PublicSidebarStandingsGroup[]) {
    if (!tenant?.trim() || !tid?.trim()) return
    const k = storeKey(tenant, tid)
    map.value = { ...map.value, [k]: { flat, groups } }
  }

  function clear(tenant: string, tid: string) {
    const k = storeKey(tenant, tid)
    if (!map.value[k]) return
    const next = { ...map.value }
    delete next[k]
    map.value = next
  }

  function read(tenant: string, tid: string): Entry {
    return map.value[storeKey(tenant, tid)] ?? { flat: [], groups: [] }
  }

  return { publish, clear, read }
}

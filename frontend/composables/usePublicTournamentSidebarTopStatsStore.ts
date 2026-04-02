export type PublicTopStatsKey = 'goals' | 'assists' | 'yellowCards' | 'redCards'

export type PublicTopStatsRow = {
  playerId: string
  fullName: string
  teamName: string | null
  value: number
  isPlaceholder?: boolean
}

export type PublicTopStatsSlide = {
  key: PublicTopStatsKey
  title: string
  icon: string
  rows: PublicTopStatsRow[]
}

type Entry = {
  slides: PublicTopStatsSlide[]
}

const STATE_KEY = 'public-sidebar-top-stats-by-tenant-tid'

function storeKey(tenant: string, tid: string) {
  return `${tenant}::${tid}`
}

export function usePublicTournamentSidebarTopStatsStore() {
  const map = useState<Record<string, Entry>>(STATE_KEY, () => ({}))

  function publish(tenant: string, tid: string, slides: PublicTopStatsSlide[]) {
    const t = String(tenant ?? '').trim()
    const id = String(tid ?? '').trim()
    if (!t || !id) return
    const k = storeKey(t, id)
    map.value = { ...map.value, [k]: { slides: slides ?? [] } }
  }

  function clear(tenant: string, tid: string) {
    const t = String(tenant ?? '').trim()
    const id = String(tid ?? '').trim()
    if (!t || !id) return
    const k = storeKey(t, id)
    if (!map.value[k]) return
    const next = { ...map.value }
    delete next[k]
    map.value = next
  }

  function read(tenant: string, tid: string): Entry {
    const t = String(tenant ?? '').trim()
    const id = String(tid ?? '').trim()
    if (!t || !id) return { slides: [] }
    const k = storeKey(t, id)
    return map.value[k] ?? { slides: [] }
  }

  return { publish, clear, read }
}


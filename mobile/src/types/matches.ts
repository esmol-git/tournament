/** Элемент `GET /tenants/:tenantId/matches` (список матчей организации). */
export type TenantMatchListItem = {
  id: string
  status: string
  startTime: string
  stage?: string
  homeScore?: number | null
  awayScore?: number | null
  /** События протокола (д.в./пен.) — приходят с API. */
  events?: { payload?: Record<string, unknown> | null }[]
  tournament: {
    id: string
    name: string
    slug?: string | null
  }
  homeTeam: { id: string; name: string }
  awayTeam: { id: string; name: string }
}

export type TenantMatchListResponse = {
  items: TenantMatchListItem[]
  total: number
  page: number
  pageSize: number
}

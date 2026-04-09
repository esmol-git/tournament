import { apiRequest } from './client'

export type TeamPlayerListItem = {
  playerId: string
  player: {
    id: string
    firstName: string
    lastName: string
  }
}

export type TeamPlayersListResponse = {
  items: TeamPlayerListItem[]
  total: number
  page: number
  pageSize: number
}

export async function listTeamPlayers(params: {
  tenantId: string
  teamId: string
  page?: number
  pageSize?: number
  activeOnly?: boolean
}): Promise<TeamPlayersListResponse> {
  const page = params.page ?? 1
  const pageSize = Math.min(Math.max(1, params.pageSize ?? 200), 200)
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    activeOnly: String(params.activeOnly !== false),
  })
  return apiRequest<TeamPlayersListResponse>(
    `/tenants/${encodeURIComponent(params.tenantId)}/teams/${encodeURIComponent(params.teamId)}/players?${qs}`,
  )
}

import type { UserRole } from '../types/user'
import type { TournamentDetailResponse, TournamentListResponse } from '../types/tournament'
import { apiRequest } from './client'

/** USER / REFEREE не проходят TenantAdminStaffGuard на `/tenants/.../tournaments`. */
export function shouldUsePublicTournamentApi(role: UserRole): boolean {
  return role === 'USER' || role === 'REFEREE'
}

export async function listOrganizationTournaments(params: {
  tenantId: string
  tenantSlug: string
  role: UserRole
  page?: number
  pageSize?: number
}): Promise<TournamentListResponse> {
  const page = params.page ?? 1
  const pageSize = Math.min(Math.max(1, params.pageSize ?? 50), 100)
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  if (shouldUsePublicTournamentApi(params.role)) {
    return apiRequest<TournamentListResponse>(
      `/public/tenants/${encodeURIComponent(params.tenantSlug)}/tournaments?${qs}`,
      { auth: false },
    )
  }
  return apiRequest<TournamentListResponse>(
    `/tenants/${encodeURIComponent(params.tenantId)}/tournaments?${qs}`,
  )
}

export async function getTournamentDetail(params: {
  tournamentId: string
  tenantSlug: string
  tenantId: string
  role: UserRole
  matchesLimit?: number
}): Promise<TournamentDetailResponse> {
  const matchesLimit = Math.min(Math.max(1, params.matchesLimit ?? 150), 200)
  const qs = new URLSearchParams({ matchesLimit: String(matchesLimit) })
  if (shouldUsePublicTournamentApi(params.role)) {
    return apiRequest<TournamentDetailResponse>(
      `/public/tenants/${encodeURIComponent(params.tenantSlug)}/tournaments/${encodeURIComponent(params.tournamentId)}?${qs}`,
      { auth: false },
    )
  }
  return apiRequest<TournamentDetailResponse>(
    `/tournaments/${encodeURIComponent(params.tournamentId)}?${qs}`,
  )
}

/** Составы команд турнира (публичный API; только для опубликованных турниров). */
export type PublicTournamentRosterTeam = {
  teamId: string
  teamName: string
  players: Array<{
    id: string
    firstName: string
    lastName: string
  }>
}

export async function getPublicTournamentRoster(params: {
  tenantSlug: string
  tournamentId: string
}): Promise<PublicTournamentRosterTeam[]> {
  return apiRequest<PublicTournamentRosterTeam[]>(
    `/public/tenants/${encodeURIComponent(params.tenantSlug)}/tournaments/${encodeURIComponent(params.tournamentId)}/roster`,
    { auth: false },
  )
}

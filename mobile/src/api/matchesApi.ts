import { apiRequest } from './client'
import type { TenantMatchListResponse } from '../types/matches'

/** Тело `PATCH /tournaments/:tournamentId/matches/:matchId/protocol` (см. backend `UpdateProtocolDto`). */
export type UpdateMatchProtocolBody = {
  homeScore: number
  awayScore: number
  /** Если не передать, на сервере подставится PLAYED — всегда передаём явно из формы. */
  status?: 'SCHEDULED' | 'LIVE' | 'PLAYED' | 'FINISHED' | 'CANCELED'
  events?: Array<{
    type: 'GOAL' | 'CARD' | 'SUBSTITUTION' | 'CUSTOM'
    minute?: number
    playerId?: string
    teamSide?: 'HOME' | 'AWAY'
    payload?: Record<string, unknown>
    protocolEventTypeId?: string
  }>
  scheduleChangeReasonId?: string
  scheduleChangeNote?: string
  /** ISO: `Match.updatedAt` при загрузке экрана — конфликт с чужим сохранением → 409. */
  ifMatchUpdatedAt?: string
}

export async function updateTournamentMatchProtocol(
  tournamentId: string,
  matchId: string,
  body: UpdateMatchProtocolBody,
): Promise<unknown> {
  return apiRequest(
    `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/protocol`,
    { method: 'PATCH', json: body },
  )
}

/** `GET /tenants/:tenantId/matches` — матчи турниров с фильтрами (роли staff / судья). */
export async function listTenantMatches(params: {
  tenantId: string
  tournamentId?: string
  teamId?: string
  status?: 'SCHEDULED' | 'LIVE' | 'PLAYED' | 'FINISHED' | 'CANCELED'
  /** false — только не завершённые по расписанию (без FINISHED/PLAYED/CANCELED), если не задан `status`. */
  includeLocked?: boolean
  page?: number
  pageSize?: number
  dateFrom?: string
  dateTo?: string
  excludeUndeterminedPlayoff?: boolean
}): Promise<TenantMatchListResponse> {
  const qs = new URLSearchParams()
  if (params.tournamentId) qs.set('tournamentId', params.tournamentId)
  if (params.teamId) qs.set('teamId', params.teamId)
  if (params.status) qs.set('status', params.status)
  if (params.includeLocked === false) qs.set('includeLocked', 'false')
  qs.set('page', String(params.page ?? 1))
  qs.set('pageSize', String(Math.min(Math.max(1, params.pageSize ?? 40), 100)))
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom)
  if (params.dateTo) qs.set('dateTo', params.dateTo)
  if (params.excludeUndeterminedPlayoff === false) qs.set('excludeUndeterminedPlayoff', 'false')
  const q = qs.toString()
  return apiRequest<TenantMatchListResponse>(
    `/tenants/${encodeURIComponent(params.tenantId)}/matches${q ? `?${q}` : ''}`,
  )
}

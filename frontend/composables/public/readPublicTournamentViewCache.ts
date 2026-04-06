import type { QueryClient } from '@tanstack/vue-query'
import type { TableRow, TournamentDetails } from '~/types/tournament-admin'
import { publicTenantQueryKeys, stableSerializePublicQuery } from '~/composables/public/publicTenantQueryKeys'
import type { PublicRosterTeam } from '~/composables/usePublicTournamentFetch'

/**
 * Допуск синхронизации разных ключей кэша (таблица vs детали, матчи с пагинацией vs без).
 * Параллельный `Promise.all` даёт разницу в миллисекундах; перезагрузка только таблицы на другой
 * вкладке — секунды и больше → тогда «тёплый» кэш нельзя смешивать.
 */
export const PUBLIC_TOURNAMENT_VIEW_CACHE_SYNC_MS = 750

/** Есть кэш и он ещё не stale — можно не вызывать fetchQuery (без сетевого запроса). */
export function arePublicTableAndDetailFresh(
  qc: QueryClient,
  tenantSlug: string,
  tournamentId: string,
  groupId?: string | null,
): boolean {
  const gid = groupId ?? ''
  const tKey = publicTenantQueryKeys.tournamentTable(tenantSlug, tournamentId, gid)
  const dKey = publicTenantQueryKeys.tournamentDetail(tenantSlug, tournamentId, '')
  const tQ = qc.getQueryCache().find({ queryKey: tKey, exact: true })
  const dQ = qc.getQueryCache().find({ queryKey: dKey, exact: true })
  if (!tQ || !dQ) return false
  if (tQ.isStale() || dQ.isStale()) return false
  const tableAt = tQ.state.dataUpdatedAt
  const detailAt = dQ.state.dataUpdatedAt
  if (Math.abs(tableAt - detailAt) > PUBLIC_TOURNAMENT_VIEW_CACHE_SYNC_MS) return false
  return true
}

export function arePublicCalendarBootstrapFresh(
  qc: QueryClient,
  tenantSlug: string,
  tournamentId: string,
  matchesLimit: number,
): boolean {
  const qk = stableSerializePublicQuery({ matchesOffset: 0, matchesLimit })
  const dKey = publicTenantQueryKeys.tournamentDetail(tenantSlug, tournamentId, qk)
  const rKey = publicTenantQueryKeys.tournamentRoster(tenantSlug, tournamentId)
  const tKey = publicTenantQueryKeys.tournamentTable(tenantSlug, tournamentId, '')
  const dq = qc.getQueryCache().find({ queryKey: dKey, exact: true })
  const rq = qc.getQueryCache().find({ queryKey: rKey, exact: true })
  const tq = qc.getQueryCache().find({ queryKey: tKey, exact: true })
  if (!dq || !rq || !tq) return false
  if (dq.isStale() || rq.isStale() || tq.isStale()) return false

  const detailMatchesAt = dq.state.dataUpdatedAt
  const rosterAt = rq.state.dataUpdatedAt
  const tableAt = tq.state.dataUpdatedAt
  const auxLatest = Math.max(rosterAt, tableAt)
  if (auxLatest > detailMatchesAt + PUBLIC_TOURNAMENT_VIEW_CACHE_SYNC_MS) return false

  const dBare = qc
    .getQueryCache()
    .find({ queryKey: publicTenantQueryKeys.tournamentDetail(tenantSlug, tournamentId, ''), exact: true })
  if (dBare && !dBare.isStale()) {
    const bareAt = dBare.state.dataUpdatedAt
    if (bareAt > detailMatchesAt + PUBLIC_TOURNAMENT_VIEW_CACHE_SYNC_MS) return false
  }

  return true
}

/** Данные для шахматки / прогресса (таблица + детали турнира без доп. query). */
export function getCachedTableAndTournamentDetail(
  qc: QueryClient,
  tenantSlug: string,
  tournamentId: string,
  groupId?: string | null,
): { table: TableRow[]; detail: TournamentDetails } | null {
  const gid = groupId ?? ''
  const table = qc.getQueryData(publicTenantQueryKeys.tournamentTable(tenantSlug, tournamentId, gid)) as
    | TableRow[]
    | undefined
  const detail = qc.getQueryData(publicTenantQueryKeys.tournamentDetail(tenantSlug, tournamentId, '')) as
    | TournamentDetails
    | undefined
  if (!table || !detail) return null
  return { table, detail }
}

/** Первая страница календаря: детали с пагинацией матчей + ростер + общая таблица. */
export function getCachedCalendarBootstrap(
  qc: QueryClient,
  tenantSlug: string,
  tournamentId: string,
  matchesLimit: number,
): { detail: TournamentDetails; roster: PublicRosterTeam[]; table: TableRow[] } | null {
  const qk = stableSerializePublicQuery({ matchesOffset: 0, matchesLimit })
  const detail = qc.getQueryData(publicTenantQueryKeys.tournamentDetail(tenantSlug, tournamentId, qk)) as
    | TournamentDetails
    | undefined
  const roster = qc.getQueryData(publicTenantQueryKeys.tournamentRoster(tenantSlug, tournamentId)) as
    | PublicRosterTeam[]
    | undefined
  const table = qc.getQueryData(publicTenantQueryKeys.tournamentTable(tenantSlug, tournamentId, '')) as
    | TableRow[]
    | undefined
  if (!detail || !roster || !table) return null
  return { detail, roster, table }
}

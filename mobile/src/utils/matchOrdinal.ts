import type { TournamentMatchRow } from '../types/tournament'

/**
 * Стабильный номер матча для подписи в списке: из API (`matchNumberById`) или порядок по дате/ id.
 */
export function getMatchOrdinalDisplay(
  matchId: string,
  matchNumberById: Record<string, number> | undefined | null,
  matches: TournamentMatchRow[],
): number | null {
  const direct = matchNumberById?.[matchId]
  if (typeof direct === 'number' && direct > 0) return direct
  const sorted = [...matches].sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id),
  )
  const idx = sorted.findIndex((m) => m.id === matchId)
  return idx >= 0 ? idx + 1 : null
}

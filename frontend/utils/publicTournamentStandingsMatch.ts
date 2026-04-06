/**
 * Совпадает с правилом турнирной таблицы на бэкенде (`computeStandings`):
 * в зачёт идут только завершённые матчи с зафиксированным счётом.
 */
export function isMatchCountedInPublicStandings(m: {
  status?: string | null
  homeScore?: number | null
  awayScore?: number | null
}): boolean {
  if (m.homeScore == null || m.awayScore == null) return false
  const s = String(m.status ?? '').toUpperCase()
  return s === 'PLAYED' || s === 'FINISHED'
}

/**
 * Палитра пресетов «цвет в календаре» в форме турнира.
 * Если цвет не задан — для UI и календаря берём стабильный оттенок по id турнира.
 */
export const TOURNAMENT_CALENDAR_COLOR_PRESETS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
] as const

export const DEFAULT_TOURNAMENT_CALENDAR_STRIPE = TOURNAMENT_CALENDAR_COLOR_PRESETS[0]

function hashStringToNonNegativeInt(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(33, h) ^ s.charCodeAt(i)) >>> 0
  }
  return h
}

export function defaultCalendarStripeColorForTournamentId(tournamentId: string): string {
  if (!tournamentId) return DEFAULT_TOURNAMENT_CALENDAR_STRIPE
  const idx = hashStringToNonNegativeInt(tournamentId) % TOURNAMENT_CALENDAR_COLOR_PRESETS.length
  return TOURNAMENT_CALENDAR_COLOR_PRESETS[idx]!
}

export function resolveTournamentCalendarStripeColor(
  calendarColor: string | null | undefined,
  tournamentId: string,
): string {
  const tc = calendarColor?.trim()
  if (tc && /^#[0-9A-Fa-f]{6}$/.test(tc)) return tc.toLowerCase()
  return defaultCalendarStripeColorForTournamentId(tournamentId)
}

export type TournamentGameFormat =
  | 'THREE_V_THREE_NO_GK'
  | 'FOUR_PLUS_ONE'
  | 'FIVE_PLUS_ONE'
  | 'SIX_PLUS_ONE'
  | 'SEVEN_PLUS_ONE'
  | 'EIGHT_V_EIGHT'
  | 'NINE_V_NINE'
  | 'ELEVEN_V_ELEVEN'
  | 'CUSTOM'

export const TOURNAMENT_GAME_FORMAT_VALUES: TournamentGameFormat[] = [
  'THREE_V_THREE_NO_GK',
  'FOUR_PLUS_ONE',
  'FIVE_PLUS_ONE',
  'SIX_PLUS_ONE',
  'SEVEN_PLUS_ONE',
  'EIGHT_V_EIGHT',
  'NINE_V_NINE',
  'ELEVEN_V_ELEVEN',
  'CUSTOM',
]

export function tournamentGameFormatLabel(
  format: TournamentGameFormat | null | undefined,
  note?: string | null,
  t?: (key: string) => string,
): string {
  if (!format) return '—'
  const key = `admin.tournament_form.game_formats.${format}`
  const label = t ? t(key) : format
  if (format === 'CUSTOM' && note?.trim()) return `${label}: ${note.trim()}`
  return label === key ? format : label
}

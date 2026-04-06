import type { TournamentFormat } from '../types/admin/tournaments-index'

export const playoffTeamCountOptions = [4, 8, 16, 32, 64, 128, 256, 512] as const

export const maxTournamentTeams = 512

export const groupedPlayoffFormats: TournamentFormat[] = [
  'GROUPS_PLUS_PLAYOFF',
  'GROUPS_2',
  'GROUPS_3',
  'GROUPS_4',
]

export function isPowerOfTwo(n: number) {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

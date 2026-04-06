import type { TournamentFormat } from '~/types/admin/tournaments-index'

/** Ответ `GET .../tournament-templates` (фрагмент). */
export type TournamentTemplateRow = {
  id: string
  name: string
  description: string | null
  kind: string
  format: TournamentFormat
  groupCount: number
  playoffQualifiersPerGroup: number
  intervalDays: number
  allowedDays: number[]
  roundRobinCycles: number
  matchDurationMinutes: number
  matchBreakMinutes: number
  simultaneousMatches: number
  dayStartTimeDefault: string
  dayStartTimeOverrides?: unknown
  minTeams: number
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  calendarColor: string | null
  category: string | null
  seasonId: string | null
  competitionId: string | null
  ageGroupId: string | null
  stadiumId: string | null
  templateReferees?: { refereeId: string; sortOrder: number }[]
}

/** Ответ списка/деталей с `include` из Prisma. */
export type TournamentTemplateListItem = TournamentTemplateRow & {
  updatedAt: string
  season?: { id: string; name: string } | null
  competition?: { id: string; name: string } | null
  ageGroup?: { id: string; name: string; shortLabel?: string | null } | null
  stadium?: { id: string; name: string } | null
}

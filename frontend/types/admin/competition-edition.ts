export type CompetitionAudience =
  | 'YOUTH'
  | 'ADULT_AMATEUR'
  | 'ADULT_COMPETITIVE'
  | 'OPEN'

export type SanctionScope = 'TOURNAMENT' | 'EDITION'

export type EditionStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

export type TournamentRegulationMode = 'INHERIT' | 'OVERRIDE'

export interface CompetitionEditionListRow {
  id: string
  name: string
  slug: string
  description: string | null
  audience: CompetitionAudience
  sanctionScope: SanctionScope
  published: boolean
  status: EditionStatus
  startsAt: string | null
  endsAt: string | null
  season: { id: string; name: string }
  competition: { id: string; name: string }
  _count: { tournaments: number }
}

export interface CompetitionEditionTournamentRow {
  id: string
  name: string
  slug: string
  status: string
  published: boolean
  startsAt: string | null
  endsAt: string | null
  regulationMode: TournamentRegulationMode
  format: string
}

export interface CompetitionEditionDetail extends Omit<CompetitionEditionListRow, '_count'> {
  cardAutoBanEnabled: boolean
  redCardBanMatches: number
  yellowAccumulationThreshold: number
  yellowAccumulationBanMatches: number
  technicalWinGoalsFor: number
  technicalWinGoalsAgainst: number
  season: { id: string; name: string; code: string | null }
  competition: { id: string; name: string; code: string | null }
  eligibilityPolicy?: {
    id: string
    name: string
    requireBirthDate: boolean
    minBirthYear: number | null
    maxBirthYear: number | null
    ageGroupId: string | null
    ageGroup?: { id: string; name: string } | null
  } | null
  tournaments: CompetitionEditionTournamentRow[]
}

export interface EditionEligibilityPayload {
  ageGroupId?: string | null
  minBirthYear?: number | null
  maxBirthYear?: number | null
  requireBirthDate?: boolean
}

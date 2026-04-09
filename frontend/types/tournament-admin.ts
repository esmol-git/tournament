/** Турнир с матчами/группами для админ-страницы деталей */
export interface TournamentDetails {
  id: string
  name: string
  slug: string
  /** Slug организации для публичного URL: `/{tenant.slug}/tournaments/table?tid=…` */
  tenant?: { slug: string } | null
  description?: string | null
  logoUrl?: string | null
  format: string
  groupCount?: number
  status: string
  /** Показ на публичном сайте (независимо от статуса жизненного цикла). */
  published?: boolean
  launchChecklistCompletedAt?: string | null
  launchChecklistCompletedBy?: {
    id: string
    name: string
    lastName?: string | null
    username?: string | null
  } | null
  startsAt?: string | null
  endsAt?: string | null
  intervalDays: number
  allowedDays: number[]
  roundRobinCycles: number
  matchDurationMinutes: number
  matchBreakMinutes: number
  simultaneousMatches: number
  dayStartTimeDefault: string
  dayStartTimeOverrides?: Record<string, string> | null
  playoffQualifiersPerGroup?: number
  minTeams: number
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  groups: { id: string; name: string; sortOrder: number }[]
  tournamentTeams: {
    teamId: string
    team: { id: string; name: string }
    group?: { id: string; name: string } | null
    rating?: number | null
    /** Порядок в колонке группы (для таблицы при равных очках). */
    groupSortOrder?: number | null
  }[]
  /** На публичном API не отдаётся. */
  members?: {
    id: string
    userId: string
    role: string
    user: {
      id: string
      email: string | null
      username?: string
      name: string
      lastName?: string
      role: string
    }
  }[]
  stadiumId?: string | null
  stadium?: {
    id: string
    name: string
    city?: string | null
    address?: string | null
  } | null
  tournamentStadiums?: Array<{
    stadiumId: string
    sortOrder: number
    stadium: {
      id: string
      name: string
      city?: string | null
      address?: string | null
    }
  }>
  seasonId?: string | null
  season?: { id: string; name: string; code?: string | null } | null
  competitionId?: string | null
  competition?: { id: string; name: string; code?: string | null } | null
  ageGroupId?: string | null
  ageGroup?: {
    id: string
    name: string
    shortLabel?: string | null
    code?: string | null
  } | null
  tournamentReferees?: Array<{
    refereeId: string
    referee: {
      id: string
      firstName: string
      lastName: string
      phone?: string | null
    }
  }>
  referenceDocuments?: Array<{
    id: string
    title: string
    code?: string | null
    url?: string | null
    note?: string | null
    sortOrder: number
    tournamentId?: string | null
  }>
  matches: {
    id: string
    startTime: string
    stage?: 'GROUP' | 'PLAYOFF'
    roundNumber?: number
    groupId?: string | null
    playoffRound?:
      | 'ROUND_OF_16'
      | 'QUARTERFINAL'
      | 'SEMIFINAL'
      | 'FINAL'
      | 'THIRD_PLACE'
      | null
    status: string
    homeTeam: { id: string; name: string }
    awayTeam: { id: string; name: string }
    homeScore?: number | null
    awayScore?: number | null
    scheduleChangeReasonId?: string | null
    scheduleChangeNote?: string | null
    scheduleChangeReason?: {
      id: string
      name: string
      code?: string | null
      scope: string
    } | null
    stadiumId?: string | null
    /** Показывать на публичном сайте и в публичном ICS (по умолчанию true). */
    publishedOnPublic?: boolean
    stadium?: {
      id: string
      name: string
      city?: string | null
      address?: string | null
    } | null
    events?: {
      id: string
      type: string
      minute?: number | null
      playerId?: string | null
      teamSide?: 'HOME' | 'AWAY' | null
      payload?: Record<string, unknown> | null
      protocolEventTypeId?: string | null
      protocolEventType?: {
        id: string
        name: string
        mapsToType: string
      } | null
    }[]
  }[]
  matchNumberById?: Record<string, number>
  matchesTotal?: number
  matchesOffset?: number
  matchesLimit?: number | null
  summary?: {
    teamsRegisteredTotal: number
    teamsExpectedTotal: number
    matchesTotal: number
    matchesPlayedTotal: number
    championTeamName: string | null
  }
}

export interface TableRow {
  teamId: string
  teamName: string
  position: number
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  points: number
}

export interface TeamLite {
  id: string
  name: string
  slug?: string | null
  category?: string | null
}

export type MatchRow = TournamentDetails['matches'][number]
export type MatchEventRow = NonNullable<MatchRow['events']>[number]

/** Матч из GET /tenants/:tenantId/matches (в турнире, с полем tournament) */
export type TenantTournamentMatchRow = MatchRow & {
  tournament: {
    id: string
    name: string
    slug: string
    format: string
    calendarColor?: string | null
  }
}

export type CalendarRound = {
  round: number
  dateKey: string
  dateLabel: string
  title: string
  matches: MatchRow[]
}

export type CalendarViewMode = 'grouped' | 'tour'

export type TourSection = {
  key: string
  title: string
  dateLabel: string
  matches: MatchRow[]
}

/** Турнир с матчами/группами для админ-страницы деталей */
export type TournamentEnrollmentMode = 'MANUAL' | 'APPLICATIONS'
export type TournamentEligibilityProfile = 'YOUTH' | 'STANDARD'

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
  maxTeams?: number | null
  enrollmentMode?: TournamentEnrollmentMode
  eligibilityProfile?: TournamentEligibilityProfile
  gameFormat?: TournamentGameFormat | null
  gameFormatNote?: string | null
  rosterMinPlayers?: number | null
  rosterMaxPlayers?: number | null
  rosterDeadlineAt?: string | null
  cardAutoBanEnabled?: boolean
  redCardBanMatches?: number
  yellowAccumulationThreshold?: number
  yellowAccumulationBanMatches?: number
  technicalWinGoalsFor?: number
  technicalWinGoalsAgainst?: number
  registrationEnabled?: boolean
  registrationOpensAt?: string | null
  registrationClosesAt?: string | null
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
    /** Для оптимистичной блокировки при сохранении протокола (`ifMatchUpdatedAt`). */
    updatedAt?: string
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
    isTechnicalResult?: boolean
    technicalResultSide?: 'HOME' | 'AWAY' | null
    stadium?: {
      id: string
      name: string
      city?: string | null
      address?: string | null
    } | null
    matchReferees?: Array<{
      id: string
      role: 'MAIN' | 'ASSISTANT_1' | 'ASSISTANT_2'
      refereeId: string
      referee: {
        id: string
        firstName: string
        lastName: string
      }
    }>
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

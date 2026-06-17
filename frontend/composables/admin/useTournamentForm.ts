import type { TournamentDetails, TournamentFormat, TournamentStatus } from '~/types/admin/tournaments-index'
import type { TournamentEnrollmentMode, TournamentEligibilityProfile } from '~/types/tournament-admin'
import type { TournamentGameFormat } from '~/utils/tournamentGameFormat'

export type { TournamentEnrollmentMode, TournamentEligibilityProfile, TournamentGameFormat }

export type TournamentFormModel = {
  name: string
  description: string
  logoUrl: string
  /** #RRGGBB или пусто — цвет по умолчанию в календаре */
  calendarColor: string
  format: TournamentFormat
  groupCount: number
  playoffQualifiersPerGroup: number
  status: TournamentStatus
  startsAt: Date | null
  endsAt: Date | null
  intervalDays: number
  allowedDays: number[]
  minTeams: number
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  teamIds: string[]
  enrollmentMode: TournamentEnrollmentMode
  eligibilityProfile: TournamentEligibilityProfile
  gameFormat: TournamentGameFormat | null
  gameFormatNote: string
  maxTeams: number | null
  registrationEnabled: boolean
  registrationOpensAt: Date | null
  registrationClosesAt: Date | null
  rosterMinPlayers: number | null
  rosterMaxPlayers: number | null
  rosterDeadlineAt: Date | null
  cardAutoBanEnabled: boolean
  redCardBanMatches: number
  yellowAccumulationThreshold: number
  yellowAccumulationBanMatches: number
  technicalWinGoalsFor: number
  technicalWinGoalsAgainst: number
  /** Площадки турнира по порядку; первый совпадает с основным стадионом в API. */
  stadiumIds: string[]
  seasonId: string
  competitionId: string
  ageGroupId: string
  editionId: string
  refereeIds: string[]
  /** Пользователи с ролью MODERATOR в тенанте, назначенные модераторами турнира. */
  moderatorIds: string[]
}

export function buildDefaultTournamentForm(): TournamentFormModel {
  return {
    name: '',
    description: '',
    logoUrl: '',
    calendarColor: '',
    format: 'SINGLE_GROUP',
    groupCount: 1,
    playoffQualifiersPerGroup: 2,
    status: 'DRAFT',
    startsAt: null,
    endsAt: null,
    intervalDays: 7,
    allowedDays: [6, 0],
    minTeams: 6,
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    teamIds: [],
    enrollmentMode: 'MANUAL',
    eligibilityProfile: 'STANDARD',
    gameFormat: null,
    gameFormatNote: '',
    maxTeams: null,
    registrationEnabled: false,
    registrationOpensAt: null,
    registrationClosesAt: null,
    rosterMinPlayers: null,
    rosterMaxPlayers: null,
    rosterDeadlineAt: null,
    cardAutoBanEnabled: false,
    redCardBanMatches: 1,
    yellowAccumulationThreshold: 2,
    yellowAccumulationBanMatches: 1,
    technicalWinGoalsFor: 3,
    technicalWinGoalsAgainst: 0,
    stadiumIds: [],
    seasonId: '',
    competitionId: '',
    ageGroupId: '',
    editionId: '',
    refereeIds: [],
    moderatorIds: [],
  }
}

export function normalizeLegacyGroupsFormat(
  format: TournamentFormat,
  groupCount: number,
): { format: TournamentFormat; groupCount: number } {
  switch (format) {
    case 'GROUPS_2':
      return { format: 'GROUPS_PLUS_PLAYOFF', groupCount: Math.max(groupCount, 2) }
    case 'GROUPS_3':
      return { format: 'GROUPS_PLUS_PLAYOFF', groupCount: Math.max(groupCount, 3) }
    case 'GROUPS_4':
      return { format: 'GROUPS_PLUS_PLAYOFF', groupCount: Math.max(groupCount, 4) }
    default:
      return { format, groupCount }
  }
}

export function patchFormFromTournament(
  form: TournamentFormModel,
  res: TournamentDetails,
): { initialTeamIds: string[]; manualPlayoffEnabled: boolean } {
  form.name = res.name
  form.description = res.description ?? ''
  form.logoUrl = res.logoUrl ?? ''
  form.calendarColor = res.calendarColor?.trim() ? res.calendarColor.trim() : ''
  const normalized = normalizeLegacyGroupsFormat(res.format, (res.groupCount ?? 1) as number)
  form.format = normalized.format
  form.groupCount = normalized.groupCount
  form.playoffQualifiersPerGroup = (res as any).playoffQualifiersPerGroup ?? 2
  form.status = res.status
  form.startsAt = res.startsAt ? new Date(res.startsAt) : null
  form.endsAt = res.endsAt ? new Date(res.endsAt) : null
  form.intervalDays = res.intervalDays ?? 7
  form.allowedDays = Array.isArray(res.allowedDays) ? res.allowedDays : []
  form.minTeams = res.minTeams ?? 2
  form.pointsWin = res.pointsWin ?? 3
  form.pointsDraw = res.pointsDraw ?? 1
  form.pointsLoss = res.pointsLoss ?? 0
  const memberRows = Array.isArray(res.members) ? res.members : []
  form.moderatorIds = memberRows
    .filter((m) => m.role === 'MODERATOR')
    .map((m) => m.userId)
  const anyRes = res as TournamentDetails & {
    tournamentStadiums?: Array<{ stadiumId: string; sortOrder: number }>
    tournamentTeams?: Array<{ teamId: string }>
    matches?: unknown[]
  }
  if (Array.isArray(anyRes.tournamentStadiums) && anyRes.tournamentStadiums.length) {
    form.stadiumIds = [...anyRes.tournamentStadiums]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((x) => x.stadiumId)
  } else if (anyRes.stadiumId) {
    form.stadiumIds = [anyRes.stadiumId]
  } else {
    form.stadiumIds = []
  }
  form.seasonId = (res as TournamentDetails).seasonId ?? ''
  form.competitionId = (res as TournamentDetails).competitionId ?? ''
  form.ageGroupId = (res as TournamentDetails).ageGroupId ?? ''
  form.editionId = (res as TournamentDetails).editionId ?? ''
  form.refereeIds = Array.isArray((res as TournamentDetails).tournamentReferees)
    ? (res as TournamentDetails).tournamentReferees!.map((x) => x.refereeId)
    : []

  const details = res as TournamentDetails
  form.enrollmentMode = details.enrollmentMode ?? 'MANUAL'
  form.eligibilityProfile = details.eligibilityProfile ?? 'STANDARD'
  form.gameFormat = details.gameFormat ?? null
  form.gameFormatNote = details.gameFormatNote?.trim() ?? ''
  form.maxTeams =
    typeof details.maxTeams === 'number' && details.maxTeams > 0
      ? details.maxTeams
      : null
  form.registrationEnabled = !!details.registrationEnabled
  form.registrationOpensAt = details.registrationOpensAt
    ? new Date(details.registrationOpensAt)
    : null
  form.registrationClosesAt = details.registrationClosesAt
    ? new Date(details.registrationClosesAt)
    : null
  form.rosterMinPlayers =
    typeof details.rosterMinPlayers === 'number' ? details.rosterMinPlayers : null
  form.rosterMaxPlayers =
    typeof details.rosterMaxPlayers === 'number' ? details.rosterMaxPlayers : null
  form.rosterDeadlineAt = details.rosterDeadlineAt
    ? new Date(details.rosterDeadlineAt)
    : null
  form.cardAutoBanEnabled = details.cardAutoBanEnabled === true
  form.redCardBanMatches =
    typeof details.redCardBanMatches === 'number' && details.redCardBanMatches > 0
      ? details.redCardBanMatches
      : 1
  form.yellowAccumulationThreshold =
    typeof details.yellowAccumulationThreshold === 'number' &&
    details.yellowAccumulationThreshold > 0
      ? details.yellowAccumulationThreshold
      : 2
  form.yellowAccumulationBanMatches =
    typeof details.yellowAccumulationBanMatches === 'number' &&
    details.yellowAccumulationBanMatches > 0
      ? details.yellowAccumulationBanMatches
      : 1
  form.technicalWinGoalsFor =
    typeof details.technicalWinGoalsFor === 'number' && details.technicalWinGoalsFor >= 0
      ? details.technicalWinGoalsFor
      : 3
  form.technicalWinGoalsAgainst =
    typeof details.technicalWinGoalsAgainst === 'number' &&
    details.technicalWinGoalsAgainst >= 0
      ? details.technicalWinGoalsAgainst
      : 0

  const ids = Array.isArray(anyRes.tournamentTeams)
    ? anyRes.tournamentTeams.map((x: any) => x.teamId).filter(Boolean)
    : []
  form.teamIds = ids

  const manualPlayoffEnabled =
    normalized.format === 'MANUAL'
      ? Array.isArray(anyRes.matches) &&
        anyRes.matches.some((m: unknown) => (m as { stage?: string })?.stage === 'PLAYOFF')
      : false

  return { initialTeamIds: [...ids], manualPlayoffEnabled }
}

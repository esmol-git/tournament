import type { TournamentDetails, TournamentFormat, TournamentStatus } from '~/types/admin/tournaments-index'

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
  /** Площадки турнира по порядку; первый совпадает с основным стадионом в API. */
  stadiumIds: string[]
  seasonId: string
  competitionId: string
  ageGroupId: string
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
    stadiumIds: [],
    seasonId: '',
    competitionId: '',
    ageGroupId: '',
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
  form.refereeIds = Array.isArray((res as TournamentDetails).tournamentReferees)
    ? (res as TournamentDetails).tournamentReferees!.map((x) => x.refereeId)
    : []

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

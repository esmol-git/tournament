/** Типы страницы списка/редактирования турниров (`/admin/tournaments`) */

export type TournamentStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'

export type TournamentFormat =
  | 'SINGLE_GROUP'
  | 'GROUPS_2'
  | 'GROUPS_3'
  | 'GROUPS_4'
  | 'PLAYOFF'
  | 'GROUPS_PLUS_PLAYOFF'
  | 'MANUAL'

export interface TournamentRow {
  id: string
  name: string
  slug: string
  category?: string | null
  format: TournamentFormat
  startsAt: string | null
  endsAt: string | null
  status: TournamentStatus
  teamsCount: number
  logoUrl?: string | null
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
}

export interface TournamentListResponse {
  items: TournamentRow[]
  total: number
  page: number
  pageSize: number
}

/** Ответ `GET /tournaments/:id` для формы редактирования со списка */
export interface TournamentDetails {
  id: string
  name: string
  slug: string
  description?: string | null
  category?: string | null
  logoUrl?: string | null
  format: TournamentFormat
  groupCount?: number
  playoffQualifiersPerGroup?: number
  status: TournamentStatus
  startsAt?: string | null
  endsAt?: string | null
  intervalDays: number
  allowedDays: number[]
  minTeams: number
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  members: { userId: string; role: string }[]
  stadiumId?: string | null
  stadium?: {
    id: string
    name: string
    city?: string | null
    address?: string | null
  } | null
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
}

export interface UserLite {
  id: string
  email: string
  name: string
  role: string
  blocked: boolean
}

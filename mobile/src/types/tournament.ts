/** Элемент списка турниров (ответ list / public list). */
export type TournamentListItem = {
  id: string
  name: string
  slug?: string
  status: string
  published?: boolean
  startsAt?: string | null
  endsAt?: string | null
  teamsCount?: number
  format?: string
  category?: string | null
  logoUrl?: string | null
}

export type TournamentListResponse = {
  items: TournamentListItem[]
  total: number
  page: number
  pageSize: number
}

export type TournamentMatchTeam = {
  id: string
  name: string
}

/** Игрок в ответе API для событий протокола (подмешивается на бэкенде). */
export type ProtocolPlayerPreview = {
  id: string
  firstName: string
  lastName: string
}

/** Событие протокола (ответ турнира / матча). */
export type TournamentMatchEventRow = {
  id: string
  type: string
  minute?: number | null
  teamSide?: string | null
  playerId?: string | null
  payload?: Record<string, unknown> | null
  protocolEventTypeId?: string | null
  player?: ProtocolPlayerPreview | null
  assistPlayer?: ProtocolPlayerPreview | null
  playerIn?: ProtocolPlayerPreview | null
}

/** Матч в составе `GET /tournaments/:id` или публичного детального ответа. */
export type TournamentMatchRow = {
  id: string
  status: string
  startTime: string
  stage?: string
  homeTeam?: TournamentMatchTeam | null
  awayTeam?: TournamentMatchTeam | null
  homeScore?: number | null
  awayScore?: number | null
  events?: TournamentMatchEventRow[]
}

/** Группа турнира (детальный ответ API; для таблиц с groupId). */
export type TournamentGroupRow = {
  id: string
  name: string
  sortOrder?: number
}

/** Строка турнирной таблицы (`GET .../tournaments/:id/table`). */
export type TournamentTableRow = {
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

/** Усечённый тип ответа деталей турнира (поле `matches` — главное для мобилки). */
export type TournamentDetailResponse = {
  id: string
  name: string
  status: string
  format?: string
  category?: string | null
  startsAt?: string | null
  endsAt?: string | null
  published?: boolean
  matches: TournamentMatchRow[]
  matchesTotal?: number
  /** Группы (если турнир с группами) — для вкладки «Таблицы». */
  groups?: TournamentGroupRow[]
  summary?: {
    teamsRegisteredTotal?: number
    matchesTotal?: number
    matchesPlayedTotal?: number
    championTeamName?: string | null
  }
}

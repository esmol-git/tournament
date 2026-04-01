/** Строка таблицы команд тенанта */
export interface TeamRow {
  id: string
  name: string
  slug: string | null
  rating?: number | null
  category: string | null
  ageGroupId?: string | null
  ageGroup?: { id: string; name: string; shortLabel?: string | null } | null
  regionId?: string | null
  region?: { id: string; name: string } | null
  logoUrl: string | null
  coachName: string | null
  playersCount: number
  tournamentsCount: number
}

/** Игрок в составе команды (роутер команды) */
export interface TeamPlayerRow {
  playerId: string
  id: string
  jerseyNumber: number | null
  position: string | null
  player: {
    id: string
    firstName: string
    lastName: string
    birthDate: string | null
    phone: string | null
    photoUrl: string | null
  }
}

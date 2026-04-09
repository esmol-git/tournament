const TOURNAMENT_STATUS: Record<string, string> = {
  DRAFT: 'Черновик',
  ACTIVE: 'Идёт',
  COMPLETED: 'Завершён',
  ARCHIVED: 'Архив',
}

const MATCH_STATUS: Record<string, string> = {
  SCHEDULED: 'Запланирован',
  LIVE: 'В игре',
  FINISHED: 'Завершён',
  CANCELED: 'Отменён',
  PLAYED: 'Сыгран',
}

export function tournamentStatusLabel(code: string): string {
  return TOURNAMENT_STATUS[code] ?? code
}

export function matchStatusLabel(code: string): string {
  return MATCH_STATUS[code] ?? code
}

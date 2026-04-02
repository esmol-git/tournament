export const statusOptions = [
  { value: 'SCHEDULED', label: 'Запланирован' },
  { value: 'LIVE', label: 'Идёт' },
  { value: 'PLAYED', label: 'Сыгран' },
  { value: 'FINISHED', label: 'Завершён' },
  { value: 'CANCELED', label: 'Отменён' },
] as const

const MATCH_EDIT_LOCKED_STATUSES = new Set<string>(['FINISHED', 'PLAYED', 'CANCELED'])

/** Завершённые матчи нельзя редактировать (расписание, протокол, удаление, открепление). */
export function isMatchEditLocked(status?: string | null) {
  return status != null && MATCH_EDIT_LOCKED_STATUSES.has(status)
}

export function statusLabel(status?: string | null) {
  const found = statusOptions.find((s) => s.value === status)
  return found?.label ?? (status ?? '—')
}

export function statusPillClass(status?: string | null) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border'
  switch (status) {
    case 'SCHEDULED':
      return `${base} bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-700 dark:text-slate-50 dark:border-slate-500`
    case 'LIVE':
      return `${base} bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-200 dark:border-yellow-800`
    case 'PLAYED':
      return `${base} bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-200 dark:border-indigo-800`
    case 'FINISHED':
      return `${base} bg-green-50 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-200 dark:border-green-800`
    case 'CANCELED':
      return `${base} bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-800`
    default:
      return `${base} bg-surface-100 text-surface-800 border-surface-200 dark:bg-surface-700 dark:text-surface-100 dark:border-surface-600`
  }
}

export function matchCountLabel(n: number) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'матч'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'матча'
  return 'матчей'
}

export const eventTypeOptions = [
  { value: 'GOAL', label: 'Гол' },
  { value: 'CARD', label: 'Карточка' },
  { value: 'SUBSTITUTION', label: 'Замена' },
  { value: 'CUSTOM', label: 'Другое' },
] as const

export const teamSideOptions = [
  { value: 'HOME', label: 'Хозяева' },
  { value: 'AWAY', label: 'Гости' },
] as const

export const formatOptions = [
  { value: 'SINGLE_GROUP', label: 'Одна группа (круговой)' },
  { value: 'PLAYOFF', label: 'Плей-офф' },
  { value: 'GROUPS_PLUS_PLAYOFF', label: 'Группы + плей-офф' },
  { value: 'MANUAL', label: 'Только ручное расписание' },
] as const

/** Подпись формата; старые enum GROUPS_2/3/4 в БД показываем как «Группы + плей-офф». */
export function tournamentFormatLabel(f?: string | null): string {
  if (f == null || f === '') return '—'
  if (f === 'GROUPS_2' || f === 'GROUPS_3' || f === 'GROUPS_4') {
    return 'Группы + плей-офф'
  }
  const found = formatOptions.find((o) => o.value === f)
  return found?.label ?? f
}

/** Форматы с групповым этапом + плей-офф (включая устаревшие). */
export function isGroupsPlusPlayoffFamily(f?: string | null): boolean {
  return (
    f === 'GROUPS_PLUS_PLAYOFF' ||
    f === 'GROUPS_2' ||
    f === 'GROUPS_3' ||
    f === 'GROUPS_4'
  )
}

export const dayLabels: Record<number, string> = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  0: 'Вс',
}

export function formatDateTimeNoSeconds(
  value: Date | string | number,
  locale = 'ru-RU',
) {
  return new Date(value).toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Сохраняются в протоколе как CUSTOM-события с payload.metaType */
const EXTRA_TIME_SCORE_META = 'EXTRA_TIME_SCORE'
const PENALTY_SCORE_META = 'PENALTY_SCORE'

function readProtocolMetaScores(
  events: { payload?: Record<string, unknown> | null }[] | null | undefined,
  metaType: string,
) {
  for (const e of events ?? []) {
    const p = e.payload
    if (!p || p.metaType !== metaType) continue
    const h = p.homeScore
    const a = p.awayScore
    if (typeof h === 'number' && typeof a === 'number') return { home: h, away: a }
  }
  return null
}

/**
 * Строка счёта для таблиц/списков: основное время + при наличии доп. время и пенальти из протокола.
 */
export function formatMatchScoreDisplay(m: {
  homeScore?: number | null
  awayScore?: number | null
  events?: { payload?: Record<string, unknown> | null }[] | null
}): string {
  if (
    m.homeScore === null ||
    m.homeScore === undefined ||
    m.awayScore === null ||
    m.awayScore === undefined
  ) {
    return '—'
  }
  const base = `${m.homeScore}:${m.awayScore}`
  const et = readProtocolMetaScores(m.events, EXTRA_TIME_SCORE_META)
  const pen = readProtocolMetaScores(m.events, PENALTY_SCORE_META)
  const parts: string[] = []
  if (et) {
    const etLooksLikeFinalScore =
      et.home === m.homeScore &&
      et.away === m.awayScore
    parts.push(etLooksLikeFinalScore ? 'д.в.' : `д.в. ${et.home}:${et.away}`)
  }
  if (pen) parts.push(`пен. ${pen.home}:${pen.away}`)
  if (!parts.length) return base
  return `${base} (${parts.join(', ')})`
}

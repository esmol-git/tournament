import { useI18n } from '#imports'
import type { TournamentStatus } from '~/types/admin/tournaments-index'

/** Встроенные типы событий протокола (до кастомных типов из справочника). */
export const BUILTIN_EVENT_TYPE_VALUES = ['GOAL', 'CARD', 'SUBSTITUTION', 'CUSTOM'] as const

const MATCH_EDIT_LOCKED_STATUSES = new Set<string>(['FINISHED', 'PLAYED', 'CANCELED'])

/** Завершённые матчи нельзя редактировать (расписание, протокол, удаление, открепление). */
export function isMatchEditLocked(status?: string | null) {
  return status != null && MATCH_EDIT_LOCKED_STATUSES.has(status)
}

function uiDash(): string {
  const { t } = useI18n()
  return t('admin.tournaments_list.card_date_placeholder')
}

export function statusLabel(status?: string | null): string {
  const { t } = useI18n()
  if (status == null || status === '') return uiDash()
  const key = `admin.tournament_page.status_${status.toLowerCase()}`
  const translated = t(key)
  return translated !== key ? translated : status
}

/** См. `assets/css/tailwind.css` → `.admin-match-status-pill*` (стили через @apply, не только JIT из этой строки). */
export function statusPillClass(status?: string | null) {
  const base = 'admin-match-status-pill'
  switch (status) {
    case 'SCHEDULED':
      return `${base} admin-match-status-pill--scheduled`
    case 'LIVE':
      return `${base} admin-match-status-pill--live`
    case 'PLAYED':
      return `${base} admin-match-status-pill--played`
    case 'FINISHED':
      return `${base} admin-match-status-pill--finished`
    case 'CANCELED':
      return `${base} admin-match-status-pill--canceled`
    default:
      return `${base} admin-match-status-pill--default`
  }
}

export function matchCountLabel(n: number): string {
  const { t, locale } = useI18n()
  const ru = locale.value.toLowerCase().startsWith('ru')
  if (ru) {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return t('admin.tournament_page.match_word_one')
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return t('admin.tournament_page.match_word_few')
    }
    return t('admin.tournament_page.match_word_many')
  }
  return n === 1
    ? t('admin.tournament_page.match_word_one')
    : t('admin.tournament_page.match_word_other')
}

const FORMAT_TO_PAGE_KEY: Record<string, string> = {
  SINGLE_GROUP: 'format_single_group',
  PLAYOFF: 'format_playoff',
  GROUPS_PLUS_PLAYOFF: 'format_groups_plus_playoff',
  MANUAL: 'format_manual',
}

/** Подпись формата; старые enum GROUPS_2/3/4 в БД показываем как «Группы + плей-офф». */
export function tournamentFormatLabel(f?: string | null): string {
  const { t } = useI18n()
  if (f == null || f === '') return uiDash()
  const normalized =
    f === 'GROUPS_2' || f === 'GROUPS_3' || f === 'GROUPS_4' ? 'GROUPS_PLUS_PLAYOFF' : f
  const pageKey = FORMAT_TO_PAGE_KEY[normalized]
  if (!pageKey) return f
  return t(`admin.tournament_page.${pageKey}`)
}

/** Бейдж статуса жизненного цикла турнира (список турниров, хаб галереи). */
export function tournamentLifecycleBadgeClass(s: TournamentStatus): string {
  switch (s) {
    case 'DRAFT':
      return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100'
    case 'ACTIVE':
      return 'border-primary/35 bg-primary/12 text-primary'
    case 'COMPLETED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
    case 'ARCHIVED':
      return 'border-surface-300 bg-surface-100 text-surface-600 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300'
    default:
      return 'border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-900'
  }
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

export function formatDateTimeNoSeconds(
  value: Date | string | number,
  localeArg?: string,
) {
  const { locale } = useI18n()
  const loc =
    localeArg ??
    (locale.value === 'en' ? 'en-US' : locale.value === 'ru' ? 'ru-RU' : locale.value)
  return new Date(value).toLocaleString(loc, {
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
  const { t } = useI18n()
  const dash = t('admin.tournaments_list.card_date_placeholder')
  if (
    m.homeScore === null ||
    m.homeScore === undefined ||
    m.awayScore === null ||
    m.awayScore === undefined
  ) {
    return dash
  }
  const base = `${m.homeScore}:${m.awayScore}`
  const et = readProtocolMetaScores(m.events, EXTRA_TIME_SCORE_META)
  const pen = readProtocolMetaScores(m.events, PENALTY_SCORE_META)
  const parts: string[] = []
  if (et) {
    const etLooksLikeFinalScore = et.home === m.homeScore && et.away === m.awayScore
    parts.push(
      etLooksLikeFinalScore
        ? t('admin.tournament_page.score_extra_time_only')
        : t('admin.tournament_page.score_extra_time', { home: et.home, away: et.away }),
    )
  }
  if (pen) {
    parts.push(t('admin.tournament_page.score_penalties', { home: pen.home, away: pen.away }))
  }
  if (!parts.length) return base
  return `${base} (${parts.join(', ')})`
}

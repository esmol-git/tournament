/**
 * Строка счёта для списков: основное время + доп. время и пенальти из протокола (CUSTOM metaType).
 * Согласовано с `formatMatchScoreDisplay` во frontend (admin) и подписями публичного плей-оффа.
 */
const EXTRA_TIME_SCORE_META = 'EXTRA_TIME_SCORE'
const PENALTY_SCORE_META = 'PENALTY_SCORE'

export type MatchScoreLineInput = {
  homeScore?: number | null
  awayScore?: number | null
  events?: { payload?: Record<string, unknown> | null }[] | null
  /** `PLAYOFF` — при ничьей в основное время без д.в./пен. в протоколе добавляется пометка. */
  stage?: string | null
}

function readProtocolMetaScores(
  events: { payload?: Record<string, unknown> | null }[] | null | undefined,
  metaType: string,
): { home: number; away: number } | null {
  for (const e of events ?? []) {
    const p = e.payload
    if (!p || p.metaType !== metaType) continue
    const h = p.homeScore
    const a = p.awayScore
    if (typeof h === 'number' && typeof a === 'number') return { home: h, away: a }
  }
  return null
}

export type FormatMatchScoreLineOptions = {
  /** Если счёта нет — эта строка (по умолчанию «—»). */
  emptyLabel?: string
}

/**
 * @example `2:1`
 * @example `1:1 (д.в. 0:0, пен. 3:2)`
 * @example `1:1 · д.в./пен.` — плей-офф, ничья в о.в., в протоколе ещё нет д.в./пен.
 */
export function formatMatchScoreLine(
  m: MatchScoreLineInput,
  opts?: FormatMatchScoreLineOptions,
): string {
  const empty = opts?.emptyLabel ?? '—'
  if (
    m.homeScore === null ||
    m.homeScore === undefined ||
    m.awayScore === null ||
    m.awayScore === undefined
  ) {
    return empty
  }
  const base = `${m.homeScore}:${m.awayScore}`
  const et = readProtocolMetaScores(m.events, EXTRA_TIME_SCORE_META)
  const pen = readProtocolMetaScores(m.events, PENALTY_SCORE_META)
  const parts: string[] = []
  if (et) {
    const etLooksLikeFinalScore = et.home === m.homeScore && et.away === m.awayScore
    parts.push(etLooksLikeFinalScore ? 'д.в.' : `д.в. ${et.home}:${et.away}`)
  }
  if (pen) {
    parts.push(`пен. ${pen.home}:${pen.away}`)
  }
  let out = parts.length ? `${base} (${parts.join(', ')})` : base
  if (
    m.stage === 'PLAYOFF' &&
    m.homeScore === m.awayScore &&
    !et &&
    !pen
  ) {
    out = `${out} · д.в./пен.`
  }
  return out
}

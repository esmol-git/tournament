import type { ProtocolRoster } from '../api/protocolRoster'
import type { ProtocolEventDraft } from './matchProtocolPayload'
import type { ProtocolPlayerPreview, TournamentMatchEventRow } from '../types/tournament'
import { parseProtocolMinute } from '../../../shared/protocol/playerTimeline'

export function formatProtocolPlayerName(p: ProtocolPlayerPreview | null | undefined): string {
  if (!p) return ''
  const a = p.lastName?.trim() || ''
  const b = p.firstName?.trim() || ''
  return [a, b].filter(Boolean).join(' ') || 'Игрок'
}

/** id игрока → данные из ответа API (после enrich на бэкенде). */
export function buildPlayerPreviewMapFromEvents(
  events: TournamentMatchEventRow[] | undefined,
): Map<string, ProtocolPlayerPreview> {
  const m = new Map<string, ProtocolPlayerPreview>()
  for (const e of events ?? []) {
    if (e.playerId && e.player) m.set(e.playerId, e.player)
    if (e.assistPlayer) m.set(e.assistPlayer.id, e.assistPlayer)
    if (e.playerIn) m.set(e.playerIn.id, e.playerIn)
  }
  return m
}

export function rosterHasPlayer(
  roster: ProtocolRoster | null,
  side: 'HOME' | 'AWAY',
  playerId: string,
): boolean {
  if (!roster || !playerId) return false
  const list = side === 'HOME' ? roster.home : roster.away
  return list.some((x) => x.playerId === playerId)
}

function labelFromRoster(roster: ProtocolRoster | null, side: 'HOME' | 'AWAY', playerId: string) {
  if (!playerId || !roster) return ''
  const list = side === 'HOME' ? roster.home : roster.away
  return list.find((p) => p.playerId === playerId)?.label ?? ''
}

/**
 * Имя для отображения: актуальный состав, иначе данные из протокола (API), иначе обрезанный id.
 */
export function resolvePlayerDisplayName(
  playerId: string,
  teamSide: 'HOME' | 'AWAY' | null,
  roster: ProtocolRoster | null,
  previewById: Map<string, ProtocolPlayerPreview>,
): string {
  if (!playerId) return ''
  if (teamSide && roster && rosterHasPlayer(roster, teamSide, playerId)) {
    const r = labelFromRoster(roster, teamSide, playerId)
    if (r) return r
  }
  const prev = previewById.get(playerId)
  if (prev) return formatProtocolPlayerName(prev)
  if (teamSide && roster) {
    const r = labelFromRoster(roster, teamSide, playerId)
    if (r) return r
  }
  return playerId.length > 8 ? `${playerId.slice(0, 6)}…` : playerId
}

function isMetaCustomEvent(ev: TournamentMatchEventRow): boolean {
  if (ev.type !== 'CUSTOM' || !ev.payload || typeof ev.payload !== 'object') return false
  const p = ev.payload as Record<string, unknown>
  const m = p.metaType
  return m === 'PENALTY_SCORE' || m === 'EXTRA_TIME_SCORE'
}

/** Строка для read-only списка событий с сервера. */
export function formatProtocolEventLineForDisplay(
  ev: TournamentMatchEventRow,
  roster: ProtocolRoster | null,
  previewById: Map<string, ProtocolPlayerPreview>,
  homeName: string,
  awayName: string,
): string {
  if (isMetaCustomEvent(ev)) return ''
  const min = ev.minute != null && ev.minute >= 0 ? `${ev.minute}' ` : ''
  const ts = ev.teamSide === 'HOME' || ev.teamSide === 'AWAY' ? ev.teamSide : null
  const sideLabel = ev.teamSide === 'HOME' ? homeName : ev.teamSide === 'AWAY' ? awayName : '—'

  if (ev.type === 'GOAL') {
    const who = ev.playerId
      ? resolvePlayerDisplayName(ev.playerId, ts, roster, previewById)
      : '—'
    let assist = ''
    if (ev.assistPlayer) assist = formatProtocolPlayerName(ev.assistPlayer)
    else {
      const p = (ev.payload ?? {}) as Record<string, unknown>
      const aid = String(p.assistId ?? p.assistPlayerId ?? '').trim()
      if (aid) assist = resolvePlayerDisplayName(aid, ts, roster, previewById)
    }
    const ap = assist ? ` · пас: ${assist}` : ''
    return `${min}Гол · ${sideLabel} · ${who}${ap}`
  }
  if (ev.type === 'CARD') {
    const who = ev.playerId
      ? resolvePlayerDisplayName(ev.playerId, ts, roster, previewById)
      : '—'
    return `${min}Карточка · ${sideLabel} · ${who}`
  }
  if (ev.type === 'SUBSTITUTION') {
    const out = ev.playerId
      ? resolvePlayerDisplayName(ev.playerId, ts, roster, previewById)
      : '—'
    let inn = '—'
    if (ev.playerIn) inn = formatProtocolPlayerName(ev.playerIn)
    else {
      const p = (ev.payload ?? {}) as Record<string, unknown>
      const iid = String(p.playerInId ?? '').trim()
      if (iid) inn = resolvePlayerDisplayName(iid, ts, roster, previewById)
    }
    return `${min}Замена · ${sideLabel}: ${out} → ${inn}`
  }
  if (ev.type === 'CUSTOM') {
    const p = (ev.payload ?? {}) as Record<string, unknown>
    const note = String(p.note ?? '').trim()
    return note ? `${min}${note}` : `${min}Служебная запись`
  }
  return `${min}${ev.type}${ev.teamSide ? ` · ${ev.teamSide}` : ''}`
}

/** Строка в списке черновиков событий в редакторе. */
export function summarizeDraftForDisplay(
  d: ProtocolEventDraft,
  roster: ProtocolRoster | null,
  homeName: string,
  awayName: string,
  previewById: Map<string, ProtocolPlayerPreview>,
): string {
  const min = d.minute.trim() ? `${d.minute.trim()}' ` : ''
  const side = d.teamSide === 'HOME' ? homeName : d.teamSide === 'AWAY' ? awayName : '—'
  const ts = d.teamSide === 'HOME' || d.teamSide === 'AWAY' ? d.teamSide : null
  if (d.type === 'GOAL') {
    const who = resolvePlayerDisplayName(d.playerId, ts, roster, previewById)
    const assist = d.assistPlayerId.trim()
      ? resolvePlayerDisplayName(d.assistPlayerId, ts, roster, previewById)
      : ''
    const ap = assist ? ` · пас: ${assist}` : ''
    return `${min}Гол · ${side} · ${who}${ap}`
  }
  if (d.type === 'CARD') {
    const card = d.cardType === 'RED' ? 'красная' : 'жёлтая'
    const who = resolvePlayerDisplayName(d.playerId, ts, roster, previewById)
    return `${min}${card} · ${side} · ${who}`
  }
  if (d.type === 'SUBSTITUTION') {
    const out = resolvePlayerDisplayName(d.playerId, ts, roster, previewById)
    const inn = resolvePlayerDisplayName(d.substitutePlayerInId, ts, roster, previewById)
    return `${min}Замена · ${side}: ${out} → ${inn}`
  }
  const note = d.note.trim() || 'заметка'
  return `${min}${note}`
}

/** Иконка в списке событий вместо подписи GOAL / CARD / SUBSTITUTION. */
export type ProtocolEventIconKind =
  | 'goal'
  | 'substitution'
  | 'card_yellow_first'
  | 'card_yellow_second'
  | 'card_red'
  | 'custom'

export function getDraftEventIconKind(
  d: ProtocolEventDraft,
  allDrafts: ProtocolEventDraft[],
): ProtocolEventIconKind {
  if (d.type === 'GOAL') return 'goal'
  if (d.type === 'SUBSTITUTION') return 'substitution'
  if (d.type === 'CUSTOM') return 'custom'
  if (d.type !== 'CARD') return 'custom'
  if (d.cardType === 'RED') return 'card_red'

  const selfIdx = allDrafts.findIndex((x) => x.key === d.key)
  const pid = d.playerId.trim()

  const cardOrder = allDrafts
    .map((x, idx) => ({ x, idx }))
    .filter(({ x }) => x.type === 'CARD')
    .sort((a, b) => {
      const ma = parseProtocolMinute(a.x.minute) ?? -1
      const mb = parseProtocolMinute(b.x.minute) ?? -1
      if (ma !== mb) return ma - mb
      return a.idx - b.idx
    })

  let yellowN = 0
  for (const { x, idx } of cardOrder) {
    if (x.cardType === 'RED') continue
    if ((x.cardType ?? 'YELLOW') !== 'YELLOW') continue
    if (x.playerId.trim() !== pid) continue
    yellowN += 1
    if (idx === selfIdx) {
      return yellowN >= 2 ? 'card_yellow_second' : 'card_yellow_first'
    }
  }
  return 'card_yellow_first'
}

function normalizeCardTypeFromPayload(payload: Record<string, unknown> | null | undefined): 'YELLOW' | 'RED' {
  const raw = String(payload?.cardType ?? payload?.color ?? payload?.cardColor ?? '')
    .trim()
    .toLowerCase()
  if (raw.includes('red') || raw.includes('крас')) return 'RED'
  return 'YELLOW'
}

export function getMatchEventIconKind(
  ev: TournamentMatchEventRow,
  allEvents: TournamentMatchEventRow[],
): ProtocolEventIconKind {
  if (ev.type === 'GOAL') return 'goal'
  if (ev.type === 'SUBSTITUTION') return 'substitution'
  if (ev.type === 'CUSTOM') return 'custom'
  if (ev.type !== 'CARD') return 'custom'

  const payload = (ev.payload ?? {}) as Record<string, unknown>
  if (normalizeCardTypeFromPayload(payload) === 'RED') return 'card_red'

  const selfId = ev.id
  const pid = String(ev.playerId ?? '').trim()

  const cardOrder = allEvents
    .map((e, idx) => ({ e, idx }))
    .filter(({ e }) => e.type === 'CARD')
    .sort((a, b) => {
      const ma = a.e.minute ?? -1
      const mb = b.e.minute ?? -1
      if (ma !== mb) return ma - mb
      return a.idx - b.idx
    })

  let yellowN = 0
  for (const { e } of cardOrder) {
    const p = (e.payload ?? {}) as Record<string, unknown>
    if (normalizeCardTypeFromPayload(p) === 'RED') continue
    if (String(e.playerId ?? '').trim() !== pid) continue
    yellowN += 1
    if (e.id === selfId) {
      return yellowN >= 2 ? 'card_yellow_second' : 'card_yellow_first'
    }
  }
  return 'card_yellow_first'
}

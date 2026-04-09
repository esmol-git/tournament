import type { UpdateMatchProtocolBody } from '../api/matchesApi'
import type { TournamentMatchEventRow } from '../types/tournament'

const EXTRA_TIME_META = 'EXTRA_TIME_SCORE'
const PENALTIES_META = 'PENALTY_SCORE'

export type ProtocolEventDraft = {
  key: string
  type: 'GOAL' | 'CARD' | 'SUBSTITUTION' | 'CUSTOM'
  minute: string
  teamSide: 'HOME' | 'AWAY' | null
  playerId: string
  assistPlayerId: string
  cardType: 'YELLOW' | 'RED' | null
  substitutePlayerInId: string
  note: string
}

function newKey() {
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function createEmptyDraft(type: ProtocolEventDraft['type']): ProtocolEventDraft {
  return {
    key: newKey(),
    type,
    minute: '',
    /** По умолчанию хозяева — иначе поле «Игрок» не открывало список без явного выбора команды. */
    teamSide: type === 'CUSTOM' ? null : 'HOME',
    playerId: '',
    assistPlayerId: '',
    cardType: type === 'CARD' ? 'YELLOW' : null,
    substitutePlayerInId: '',
    note: '',
  }
}

export type ParsedMatchEvents = {
  drafts: ProtocolEventDraft[]
  extraTime: { home: string; away: string }
  penalty: { home: string; away: string }
}

function normalizeCardFromPayload(
  payload: Record<string, unknown>,
  type: string,
): 'YELLOW' | 'RED' | null {
  if (type !== 'CARD') return null
  const raw = String(payload.cardType ?? payload.color ?? payload.cardColor ?? '').toLowerCase()
  if (raw.includes('red') || raw.includes('крас')) return 'RED'
  if (raw.includes('yellow') || raw.includes('желт')) return 'YELLOW'
  return 'YELLOW'
}

function serverEventToDraft(e: TournamentMatchEventRow): ProtocolEventDraft {
  const payload =
    e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload)
      ? (e.payload as Record<string, unknown>)
      : {}
  const t = e.type
  const type: ProtocolEventDraft['type'] =
    t === 'GOAL' || t === 'CARD' || t === 'SUBSTITUTION' || t === 'CUSTOM' ? t : 'CUSTOM'

  const draft: ProtocolEventDraft = {
    key: e.id || newKey(),
    type,
    minute: e.minute != null && e.minute >= 0 ? String(e.minute) : '',
    teamSide: e.teamSide === 'HOME' || e.teamSide === 'AWAY' ? e.teamSide : null,
    playerId: e.playerId ?? '',
    assistPlayerId: String(payload.assistId ?? payload.assistPlayerId ?? ''),
    cardType: normalizeCardFromPayload(payload, e.type),
    substitutePlayerInId: String(payload.playerInId ?? ''),
    note: String(payload.note ?? ''),
  }
  if (e.type === 'CARD' && !draft.cardType) draft.cardType = 'YELLOW'
  return draft
}

export function parseEventsFromMatch(events: TournamentMatchEventRow[] | undefined): ParsedMatchEvents {
  const drafts: ProtocolEventDraft[] = []
  let etHome = ''
  let etAway = ''
  let penHome = ''
  let penAway = ''

  for (const e of events ?? []) {
    if (e.type === 'CUSTOM' && e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload)) {
      const p = e.payload as Record<string, unknown>
      if (p.metaType === EXTRA_TIME_META) {
        etHome = String(p.homeScore ?? '')
        etAway = String(p.awayScore ?? '')
        continue
      }
      if (p.metaType === PENALTIES_META) {
        penHome = String(p.homeScore ?? '')
        penAway = String(p.awayScore ?? '')
        continue
      }
    }
    drafts.push(serverEventToDraft(e))
  }
  return {
    drafts,
    extraTime: { home: etHome, away: etAway },
    penalty: { home: penHome, away: penAway },
  }
}

function parseMinute(s: string): number | undefined {
  const n = parseInt(s.replace(/\D/g, ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function countGoalsFromDrafts(drafts: ProtocolEventDraft[]) {
  let home = 0
  let away = 0
  for (const e of drafts) {
    if (e.type !== 'GOAL') continue
    if (e.teamSide === 'HOME') home += 1
    else if (e.teamSide === 'AWAY') away += 1
  }
  return { home, away }
}

export function hasGoalEvents(drafts: ProtocolEventDraft[]) {
  return drafts.some((d) => d.type === 'GOAL')
}

export function buildProtocolEventsPayload(
  drafts: ProtocolEventDraft[],
  opts: {
    isPlayoff: boolean
    extraTime: { home: string; away: string }
    penalty: { home: string; away: string }
  },
): NonNullable<UpdateMatchProtocolBody['events']> {
  const out: NonNullable<UpdateMatchProtocolBody['events']> = []

  for (const e of drafts) {
    const minute = parseMinute(e.minute)
    if (e.type === 'GOAL') {
      const payload: Record<string, unknown> = {}
      const assist = e.assistPlayerId.trim()
      if (assist && assist !== e.playerId) payload.assistId = assist
      out.push({
        type: 'GOAL',
        minute,
        playerId: e.playerId || undefined,
        teamSide: e.teamSide ?? undefined,
        payload: Object.keys(payload).length ? payload : undefined,
      })
      continue
    }
    if (e.type === 'CARD') {
      out.push({
        type: 'CARD',
        minute,
        playerId: e.playerId || undefined,
        teamSide: e.teamSide ?? undefined,
        payload: { cardType: e.cardType ?? 'YELLOW' },
      })
      continue
    }
    if (e.type === 'SUBSTITUTION') {
      const playerIn = e.substitutePlayerInId.trim()
      out.push({
        type: 'SUBSTITUTION',
        minute,
        playerId: e.playerId || undefined,
        teamSide: e.teamSide ?? undefined,
        payload: playerIn ? { playerInId: playerIn } : undefined,
      })
      continue
    }
    if (e.type === 'CUSTOM') {
      const note = e.note.trim()
      out.push({
        type: 'CUSTOM',
        minute,
        payload: note ? { note } : undefined,
      })
    }
  }

  if (opts.isPlayoff) {
    const etH = parseInt(opts.extraTime.home.replace(/\D/g, ''), 10)
    const etA = parseInt(opts.extraTime.away.replace(/\D/g, ''), 10)
    if (Number.isFinite(etH) && Number.isFinite(etA) && etH >= 0 && etA >= 0) {
      out.push({
        type: 'CUSTOM',
        payload: { metaType: EXTRA_TIME_META, homeScore: etH, awayScore: etA },
      })
    }
    const pH = parseInt(opts.penalty.home.replace(/\D/g, ''), 10)
    const pA = parseInt(opts.penalty.away.replace(/\D/g, ''), 10)
    if (Number.isFinite(pH) && Number.isFinite(pA) && pH >= 0 && pA >= 0 && pH !== pA) {
      out.push({
        type: 'CUSTOM',
        payload: { metaType: PENALTIES_META, homeScore: pH, awayScore: pA },
      })
    }
  }

  return out
}

export function validateDraftsBeforeSave(drafts: ProtocolEventDraft[]): string | null {
  for (const e of drafts) {
    if (e.type === 'GOAL') {
      if (!e.teamSide) return 'У каждого гола укажите команду.'
      if (!e.playerId.trim()) return 'У каждого гола укажите игрока.'
    }
    if (e.type === 'CARD') {
      if (!e.teamSide) return 'Для карточки укажите команду.'
      if (!e.playerId.trim()) return 'Для карточки укажите игрока.'
    }
    if (e.type === 'SUBSTITUTION') {
      if (!e.teamSide) return 'Для замены укажите команду.'
      if (!e.playerId.trim()) return 'Для замены укажите выходящего игрока.'
      const inn = e.substitutePlayerInId.trim()
      if (!inn) return 'Для замены укажите выходящего на поле игрока.'
      if (inn === e.playerId) return 'В замене игроки на вход и выход не должны совпадать.'
    }
  }
  return null
}

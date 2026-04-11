/**
 * Общая логика «кто на поле в минуту M» для протокола матча (мобилка + админка).
 * Согласована с validateSubstitutionPlayerTimeline на бэкенде.
 */

export type ProtocolTimelineEvent = {
  key: string
  type: 'GOAL' | 'CARD' | 'SUBSTITUTION' | 'CUSTOM'
  minute: string | number | null | undefined
  playerId: string
  assistPlayerId?: string
  substitutePlayerInId?: string
  cardType?: 'YELLOW' | 'RED' | null
}

export type ProtocolPlayerTimelineMaps = {
  outAt: Map<string, number>
  inAt: Map<string, number>
  sentOffAt: Map<string, number>
}

export function parseProtocolMinute(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined
  }
  const n = parseInt(String(value).replace(/\D/g, ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function indexedEvents(
  events: readonly ProtocolTimelineEvent[],
  excludeKey?: string,
): { d: ProtocolTimelineEvent; idx: number }[] {
  return events
    .map((d, idx) => ({ d, idx }))
    .filter(({ d }) => !excludeKey || d.key !== excludeKey)
}

/**
 * Строгая проверка (сохранение протокола): дубликаты замен и карточки после удаления — ошибка.
 */
export function validateProtocolPlayerTimeline(events: readonly ProtocolTimelineEvent[]): string | null {
  const filtered = indexedEvents(events)

  const subs = filtered
    .filter(({ d }) => d.type === 'SUBSTITUTION')
    .map(({ d, idx }) => {
      const m = parseProtocolMinute(d.minute)
      const out = String(d.playerId ?? '').trim()
      const inn = String(d.substitutePlayerInId ?? '').trim()
      if (m === undefined || !out || !inn) return null
      return { idx, m, out, inn }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.m - b.m || a.idx - b.idx)

  const outAt = new Map<string, number>()
  const inAt = new Map<string, number>()

  for (const { m, out, inn } of subs) {
    if (outAt.has(out)) {
      return 'Игрок уже ушёл с поля по более ранней замене — повторно указать его в замене нельзя.'
    }
    outAt.set(out, m)
    inAt.set(inn, m)
  }

  const cardEvents = filtered
    .filter(({ d }) => d.type === 'CARD')
    .map(({ d, idx }) => {
      const m = parseProtocolMinute(d.minute)
      const pid = String(d.playerId ?? '').trim()
      if (m === undefined || !pid) return null
      const ct = (d.cardType ?? 'YELLOW') === 'RED' ? 'RED' : 'YELLOW'
      return { idx, m, pid, ct }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.m - b.m || a.idx - b.idx)

  const yellowCount = new Map<string, number>()
  const sentOffAt = new Map<string, number>()

  for (const { m, pid, ct } of cardEvents) {
    const so = sentOffAt.get(pid)
    if (so !== undefined && m > so) {
      return `Игрок уже удалён с поля (${so}′) — нельзя добавить событие с этим игроком на ${m}′.`
    }
    if (ct === 'RED') {
      sentOffAt.set(pid, m)
    } else {
      const c = (yellowCount.get(pid) ?? 0) + 1
      yellowCount.set(pid, c)
      if (c >= 2) {
        sentOffAt.set(pid, m)
      }
    }
  }

  const maps: ProtocolPlayerTimelineMaps = { outAt, inAt, sentOffAt }

  for (const { d } of filtered) {
    const E = parseProtocolMinute(d.minute)
    if (E === undefined) continue
    if (d.type === 'GOAL' || d.type === 'CARD') {
      const msg = getProtocolPlayerIneligibilityReason(String(d.playerId ?? ''), E, maps)
      if (msg) return msg
      const a = String(d.assistPlayerId ?? '').trim()
      const scorer = String(d.playerId ?? '').trim()
      if (a && a !== scorer) {
        const msgA = getProtocolPlayerIneligibilityReason(a, E, maps)
        if (msgA) return msgA
      }
    }
    if (d.type === 'SUBSTITUTION') {
      const out = String(d.playerId ?? '').trim()
      const inn = String(d.substitutePlayerInId ?? '').trim()
      if (!out || !inn) continue
      const msgO = getProtocolPlayerIneligibilityReason(out, E, maps)
      if (msgO) return msgO
      const msgI = getProtocolPlayerIneligibilityReason(inn, E, maps)
      if (msgI) return msgI
    }
  }

  return null
}

/**
 * Для селектов: строим карты без падения на черновых ошибках (дубликат замены — первая побеждает;
 * недопустимая карточка после удаления — пропускаем её при расчёте состояния).
 */
export function buildProtocolPlayerTimelineMapsForPicker(
  events: readonly ProtocolTimelineEvent[],
  options?: { excludeKey?: string },
): ProtocolPlayerTimelineMaps {
  const filtered = indexedEvents(events, options?.excludeKey)

  const subs = filtered
    .filter(({ d }) => d.type === 'SUBSTITUTION')
    .map(({ d, idx }) => {
      const m = parseProtocolMinute(d.minute)
      const out = String(d.playerId ?? '').trim()
      const inn = String(d.substitutePlayerInId ?? '').trim()
      if (m === undefined || !out || !inn) return null
      return { idx, m, out, inn }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.m - b.m || a.idx - b.idx)

  const outAt = new Map<string, number>()
  const inAt = new Map<string, number>()

  for (const { m, out, inn } of subs) {
    if (outAt.has(out)) continue
    outAt.set(out, m)
    inAt.set(inn, m)
  }

  const cardEvents = filtered
    .filter(({ d }) => d.type === 'CARD')
    .map(({ d, idx }) => {
      const m = parseProtocolMinute(d.minute)
      const pid = String(d.playerId ?? '').trim()
      if (m === undefined || !pid) return null
      const ct = (d.cardType ?? 'YELLOW') === 'RED' ? 'RED' : 'YELLOW'
      return { idx, m, pid, ct }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.m - b.m || a.idx - b.idx)

  const yellowCount = new Map<string, number>()
  const sentOffAt = new Map<string, number>()

  for (const { m, pid, ct } of cardEvents) {
    const so = sentOffAt.get(pid)
    if (so !== undefined && m > so) {
      continue
    }
    if (ct === 'RED') {
      sentOffAt.set(pid, m)
    } else {
      const c = (yellowCount.get(pid) ?? 0) + 1
      yellowCount.set(pid, c)
      if (c >= 2) {
        sentOffAt.set(pid, m)
      }
    }
  }

  return { outAt, inAt, sentOffAt }
}

export function getProtocolPlayerIneligibilityReason(
  playerId: string,
  minute: number,
  maps: ProtocolPlayerTimelineMaps,
): string | null {
  const p = String(playerId ?? '').trim()
  if (!p) return null
  const mi = maps.inAt.get(p)
  if (mi !== undefined && minute < mi) {
    return `Игрок ещё не был на поле (выход на ${mi}′).`
  }
  const mo = maps.outAt.get(p)
  if (mo !== undefined && minute > mo) {
    return `Игрок уже ушёл с поля по замене (${mo}′) — событие на ${minute}′ недопустимо.`
  }
  const so = maps.sentOffAt.get(p)
  if (so !== undefined && minute > so) {
    return `Игрок удалён с поля (${so}′) — событие на ${minute}′ недопустимо.`
  }
  return null
}

export function isProtocolPlayerSelectableAtMinute(
  playerId: string,
  minute: number | undefined,
  maps: ProtocolPlayerTimelineMaps,
  opts?: { allowPlayerId?: string },
): boolean {
  if (minute === undefined) return true
  const cur = String(opts?.allowPlayerId ?? '').trim()
  const pid = String(playerId ?? '').trim()
  if (cur && pid === cur) return true
  return getProtocolPlayerIneligibilityReason(pid, minute, maps) === null
}

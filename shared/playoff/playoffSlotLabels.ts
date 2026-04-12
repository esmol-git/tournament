/**
 * Подписи слотов плей-офф («Победитель матча N»), как в админке и на публичном сайте.
 * Используется вебом и мобилкой.
 */

export type PlayoffMatchRowForLabels = {
  id: string
  startTime: string
  stage?: string
  roundNumber?: number
  playoffRound?: string | null
  status: string
  homeTeam: { id: string; name: string }
  awayTeam: { id: string; name: string }
  homeScore?: number | null
  awayScore?: number | null
  events?: Array<{ payload?: Record<string, unknown> | null }>
}

export type PlayoffTournamentDetailForLabels = {
  format?: string
  groups?: { id: string; name?: string }[]
  playoffQualifiersPerGroup?: number
  matchNumberById?: Record<string, number>
  matches: PlayoffMatchRowForLabels[]
}

export type SlotLabels = { home: string; away: string }

export type LabelBuilders = {
  winnerOfMatch: (matchNumber: number | string) => string
  loserOfMatch: (matchNumber: number | string) => string
}

const SUPPORTED_FORMATS = new Set([
  'PLAYOFF',
  'GROUPS_PLUS_PLAYOFF',
  'GROUPS_2',
  'GROUPS_3',
  'GROUPS_4',
  'MANUAL',
])

const SEEDED_FIRST_ROUND_FORMATS = new Set([
  'GROUPS_PLUS_PLAYOFF',
  'GROUPS_2',
  'GROUPS_3',
  'GROUPS_4',
])

function matchHasResult(m: PlayoffMatchRowForLabels): boolean {
  return (
    m.homeScore !== null &&
    m.awayScore !== null &&
    (m.status === 'PLAYED' || m.status === 'FINISHED')
  )
}

function readPenaltyScore(m: PlayoffMatchRowForLabels): { home: number; away: number } | null {
  for (const e of m.events ?? []) {
    const p = e.payload
    if (!p || p.metaType !== 'PENALTY_SCORE') continue
    const h = p.homeScore
    const a = p.awayScore
    if (typeof h === 'number' && typeof a === 'number') return { home: h, away: a }
  }
  return null
}

function resolvedWinnerSide(m: PlayoffMatchRowForLabels): 'HOME' | 'AWAY' | null {
  if (!matchHasResult(m)) return null
  const hs = m.homeScore as number
  const as = m.awayScore as number
  if (hs !== as) return hs > as ? 'HOME' : 'AWAY'

  const pen = readPenaltyScore(m)
  if (!pen || pen.home === pen.away) return null
  return pen.home > pen.away ? 'HOME' : 'AWAY'
}

function winnerName(m: PlayoffMatchRowForLabels): string | null {
  const side = resolvedWinnerSide(m)
  if (side === 'HOME') return m.homeTeam.name
  if (side === 'AWAY') return m.awayTeam.name
  return null
}

function loserName(m: PlayoffMatchRowForLabels): string | null {
  const side = resolvedWinnerSide(m)
  if (side === 'HOME') return m.awayTeam.name
  if (side === 'AWAY') return m.homeTeam.name
  return null
}

function buildMatchNumberById(matches: PlayoffMatchRowForLabels[]): Record<string, number> {
  const sorted = matches
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))
  const map: Record<string, number> = {}
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]
    if (!row) continue
    map[row.id] = i + 1
  }
  return map
}

function groupStageIsFinished(matches: PlayoffMatchRowForLabels[]): boolean {
  const groupMatches = matches.filter((m) => m.stage === 'GROUP')
  if (!groupMatches.length) return false
  return groupMatches.every(
    (m) =>
      m.homeScore !== null &&
      m.awayScore !== null &&
      (m.status === 'PLAYED' || m.status === 'FINISHED'),
  )
}

export function buildPlayoffSlotLabels(
  detail: PlayoffTournamentDetailForLabels | null | undefined,
  labels: LabelBuilders,
): Record<string, SlotLabels> {
  if (!detail || !SUPPORTED_FORMATS.has(detail.format ?? '')) return {}

  const matches = detail.matches ?? []
  const playoffMatches = matches.filter(
    (m) => m.stage === 'PLAYOFF' && typeof m.roundNumber === 'number',
  )
  if (!playoffMatches.length) return {}

  const firstRoundNumber = Math.min(...playoffMatches.map((m) => m.roundNumber as number))
  const byRound = new Map<number, PlayoffMatchRowForLabels[]>()
  for (const m of playoffMatches) {
    const rn = m.roundNumber as number
    const arr = byRound.get(rn) ?? []
    arr.push(m)
    byRound.set(rn, arr)
  }
  for (const [rn, arr] of byRound.entries()) {
    byRound.set(
      rn,
      arr.slice().sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)),
    )
  }

  const matchNumberById = detail.matchNumberById ?? buildMatchNumberById(matches)
  const groupFinished = groupStageIsFinished(matches)

  const seedLabelByTeamId = new Map<string, string>()
  const firstRoundMatches = byRound.get(firstRoundNumber) ?? []
  if (firstRoundMatches.length) {
    const qualifiersCount = firstRoundMatches.length * 2
    const k = Math.max(1, detail.playoffQualifiersPerGroup ?? 2)
    const groupsCount =
      (detail.groups?.length ?? 0) > 0
        ? (detail.groups?.length as number)
        : Math.max(1, Math.floor(qualifiersCount / k))
    const seedLabelByIndex = (seedIndex: number) => {
      const groupIdx = seedIndex % groupsCount
      const rank = Math.floor(seedIndex / groupsCount) + 1
      return `${String.fromCharCode(65 + groupIdx)}${rank}`
    }
    for (let i = 0; i < firstRoundMatches.length; i++) {
      const m = firstRoundMatches[i]
      if (!m) continue
      seedLabelByTeamId.set(m.homeTeam.id, seedLabelByIndex(i))
      seedLabelByTeamId.set(m.awayTeam.id, seedLabelByIndex(qualifiersCount - 1 - i))
    }
  }

  const result: Record<string, SlotLabels> = {}

  for (const m of playoffMatches) {
    const rn = m.roundNumber as number
    if (rn === firstRoundNumber) {
      if (!SEEDED_FIRST_ROUND_FORMATS.has(detail.format ?? '')) continue
      if (groupFinished) continue
      const homeSeed = seedLabelByTeamId.get(m.homeTeam.id)
      const awaySeed = seedLabelByTeamId.get(m.awayTeam.id)
      if (homeSeed && awaySeed) result[m.id] = { home: homeSeed, away: awaySeed }
      continue
    }

    if (m.playoffRound === 'FINAL' || m.playoffRound === 'THIRD_PLACE') {
      const parent = byRound.get(rn - 1) ?? []
      if (parent.length < 2) continue
      const left = parent[0]
      const right = parent[1]
      if (!left || !right) continue
      const usesLoser = m.playoffRound === 'THIRD_PLACE'
      result[m.id] = {
        home:
          (usesLoser ? loserName(left) : winnerName(left)) ??
          (usesLoser
            ? labels.loserOfMatch(matchNumberById[left.id] ?? '—')
            : labels.winnerOfMatch(matchNumberById[left.id] ?? '—')),
        away:
          (usesLoser ? loserName(right) : winnerName(right)) ??
          (usesLoser
            ? labels.loserOfMatch(matchNumberById[right.id] ?? '—')
            : labels.winnerOfMatch(matchNumberById[right.id] ?? '—')),
      }
      continue
    }

    const current = byRound.get(rn) ?? []
    const parent = byRound.get(rn - 1) ?? []
    const idx = current.findIndex((x) => x.id === m.id)
    if (idx < 0) continue
    const left = parent[idx * 2]
    const right = parent[idx * 2 + 1]
    if (!left || !right) continue
    result[m.id] = {
      home: winnerName(left) ?? labels.winnerOfMatch(matchNumberById[left.id] ?? '—'),
      away: winnerName(right) ?? labels.winnerOfMatch(matchNumberById[right.id] ?? '—'),
    }
  }

  return result
}

import type {
  CalendarRound,
  CalendarViewMode,
  MatchRow,
  TourSection,
  TournamentDetails,
} from '~/types/tournament-admin'

type TournamentGroup = TournamentDetails['groups'][number]
type PlayoffTitleOptions = { totalPlayoffTeams?: number }

function playoffRoundDisplayRank(round?: MatchRow['playoffRound']) {
  switch (round) {
    case 'ROUND_OF_16':
      return 10
    case 'QUARTERFINAL':
      return 20
    case 'SEMIFINAL':
      return 30
    case 'THIRD_PLACE':
      return 40
    case 'FINAL':
      return 50
    default:
      return 0
  }
}

function resolvePlayoffRoundTitle(
  visibleCount: number,
  opts: {
    playoffRound?: MatchRow['playoffRound']
    roundNumber?: number
    minPlayoffRoundNumber: number | null
    totalPlayoffTeams?: number
  },
): string {
  if (opts.playoffRound === 'FINAL') return 'Плей-офф · Финал'
  if (opts.playoffRound === 'THIRD_PLACE') return 'Плей-офф · За 3 место'

  const totalTeams = Number(opts.totalPlayoffTeams ?? 0)
  if (totalTeams >= 2 && Number.isFinite(totalTeams) && typeof opts.roundNumber === 'number') {
    const baseRound = opts.minPlayoffRoundNumber ?? opts.roundNumber
    const roundOffset = Math.max(0, opts.roundNumber - baseRound)
    const expectedMatches = Math.floor(totalTeams / Math.pow(2, roundOffset + 1))
    if (expectedMatches === 1) return 'Плей-офф · Финал'
    if (expectedMatches === 2) return 'Плей-офф · Полуфинал'
    if (expectedMatches > 2) return `Плей-офф · 1/${expectedMatches} финала`
  }

  if (visibleCount === 2) return 'Плей-офф · Полуфинал'
  if (visibleCount > 2) return `Плей-офф · 1/${visibleCount} финала`
  return `Плей-офф · Раунд ${opts.roundNumber || 1}`
}

/** Группировка матчей по турам для режима «как тур» в календаре. */
export function buildTourSectionsFromMatches(
  matches: MatchRow[],
  options?: PlayoffTitleOptions,
): TourSection[] {
  const groups = new Map<string, MatchRow[]>()
  for (const m of matches) {
    const stage = m.stage ?? 'GROUP'
    const rn = m.roundNumber ?? 0
    const splitFinalRound =
      stage === 'PLAYOFF' &&
      (m.playoffRound === 'FINAL' || m.playoffRound === 'THIRD_PLACE')
    const key = splitFinalRound ? `${stage}:${rn}:${m.playoffRound}` : `${stage}:${rn}`
    const arr = groups.get(key) ?? []
    arr.push(m)
    groups.set(key, arr)
  }

  const sections: TourSection[] = []
  const minPlayoffRoundNumber = matches
    .filter((m) => m.stage === 'PLAYOFF' && typeof m.roundNumber === 'number')
    .reduce<number | null>((min, m) => {
      const rn = Number(m.roundNumber)
      if (!Number.isFinite(rn)) return min
      if (min === null) return rn
      return Math.min(min, rn)
    }, null)
  for (const [key, ms] of groups.entries()) {
    const [stage, rnStr, keyPlayoffRound] = key.split(':')
    const rn = Number(rnStr) || 0

    const dateKeys = Array.from(
      new Set(
        ms
          .map((m) => {
            const d = new Date(m.startTime)
            if (Number.isNaN(d.getTime())) return ''
            return d.toISOString().slice(0, 10)
          })
          .filter(Boolean),
      ),
    ).sort()
    let dateLabel = 'Дата не задана'
    if (dateKeys.length === 1) {
      dateLabel = new Date(`${dateKeys[0]}T00:00:00`).toLocaleDateString()
    } else if (dateKeys.length > 1) {
      const from = new Date(`${dateKeys[0]}T00:00:00`).toLocaleDateString()
      const to = new Date(`${dateKeys[dateKeys.length - 1]}T00:00:00`).toLocaleDateString()
      dateLabel = `${from} - ${to}`
    }

    let title = ''
    if (stage === 'GROUP') {
      title = `Тур ${rn || 1}`
    } else if (stage === 'PLAYOFF') {
      const hasFinal = ms.some((m) => m.playoffRound === 'FINAL')
      const hasThird = ms.some((m) => m.playoffRound === 'THIRD_PLACE')
      if (hasFinal && hasThird) title = 'Плей-офф · Финал и за 3 место'
      else if (hasFinal) title = 'Плей-офф · Финал'
      else if (hasThird) title = 'Плей-офф · За 3 место'
      else {
        title = resolvePlayoffRoundTitle(ms.length, {
          playoffRound: keyPlayoffRound as MatchRow['playoffRound'],
          roundNumber: rn || 1,
          minPlayoffRoundNumber,
          totalPlayoffTeams: options?.totalPlayoffTeams,
        })
      }
    } else {
      title = `Тур ${rn || 1}`
    }

    sections.push({
      key,
      title,
      dateLabel,
      matches: ms.slice().sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)),
    })
  }

  return sections.sort((a, b) => {
    const ta = a.matches.length ? new Date(a.matches[0].startTime).getTime() : 0
    const tb = b.matches.length ? new Date(b.matches[0].startTime).getTime() : 0
    if (ta !== tb) return ta - tb

    const aSample = a.matches[0]
    const bSample = b.matches[0]
    const aStage = aSample?.stage ?? 'GROUP'
    const bStage = bSample?.stage ?? 'GROUP'
    if (aStage === 'PLAYOFF' && bStage === 'PLAYOFF') {
      const ar = playoffRoundDisplayRank(aSample?.playoffRound)
      const br = playoffRoundDisplayRank(bSample?.playoffRound)
      if (ar !== br) return ar - br
    }
    return a.key.localeCompare(b.key)
  })
}

export function resolvePlayoffTitleByVisibleMatches(ms: MatchRow[]): string {
  const hasFinal = ms.some((m) => m.playoffRound === 'FINAL')
  if (hasFinal) return 'Плей-офф · Финал'
  const hasThird = ms.some((m) => m.playoffRound === 'THIRD_PLACE')
  if (hasThird) return 'Плей-офф · За 3 место'

  const matchesCount = ms.length
  if (matchesCount === 2) return 'Плей-офф · Полуфинал'
  if (matchesCount > 2) return `Плей-офф · 1/${matchesCount} финала`
  return 'Плей-офф · Раунд'
}

export function getDisplayedRoundTitle(
  r: CalendarRound,
  opts: {
    calendarViewMode: CalendarViewMode
    calendarFiltersActive: boolean
  },
): string {
  if (opts.calendarViewMode !== 'grouped') return r.title
  if (!opts.calendarFiltersActive) return r.title
  if (!r.matches.length) return r.title
  const stage = r.matches[0].stage ?? 'UNKNOWN'
  if (stage !== 'PLAYOFF') return r.title
  return resolvePlayoffTitleByVisibleMatches(r.matches)
}

/** Раунды календаря по матчам (группы нужны для подписей группового этапа). */
export function buildCalendarRoundsFromMatches(
  items: MatchRow[],
  groups: TournamentGroup[],
  options?: PlayoffTitleOptions,
): CalendarRound[] {
  const keyFor = (m: MatchRow) => {
    const d = new Date(m.startTime)
    const dateKey = Number.isNaN(d.getTime()) ? 'unknown' : d.toISOString().slice(0, 10)
    const stage = m.stage ?? 'UNKNOWN'
    const rn = m.roundNumber ?? 0
    const g = m.groupId ?? ''
    const pr = m.playoffRound ?? ''
    return { dateKey, bucket: `${stage}:${rn}:${g}:${pr}` }
  }

  const byBucket = new Map<string, { dateKey: string; matches: MatchRow[] }>()
  for (const m of items) {
    const { dateKey, bucket } = keyFor(m)
    const cur = byBucket.get(bucket) ?? { dateKey, matches: [] as MatchRow[] }
    cur.matches.push(m)
    if (cur.dateKey === 'unknown' && dateKey !== 'unknown') cur.dateKey = dateKey
    byBucket.set(bucket, cur)
  }

  const playoffMatchesCountByRoundNumber = new Map<number, number>()
  for (const m of items) {
    const stage = m.stage ?? ''
    const rn = m.roundNumber
    if (stage === 'PLAYOFF' && typeof rn === 'number') {
      playoffMatchesCountByRoundNumber.set(rn, (playoffMatchesCountByRoundNumber.get(rn) ?? 0) + 1)
    }
  }

  const minPlayoffRoundNumber = items
    .filter((m) => m.stage === 'PLAYOFF' && typeof m.roundNumber === 'number')
    .reduce<number | null>((min, m) => {
      const rn = Number(m.roundNumber)
      if (!Number.isFinite(rn)) return min
      if (min === null) return rn
      return Math.min(min, rn)
    }, null)

  const resolveTitle = (bucket: string) => {
    const [stage, rnStr, groupId, playoffRound] = bucket.split(':')
    const rn = Number(rnStr) || 0
    if (stage === 'GROUP') {
      const gName =
        groups.find((g) => g.id === groupId)?.name ?? (groupId ? 'Группа' : 'Группы')
      return `${gName} · Тур ${rn || 1}`
    }
    if (stage === 'PLAYOFF') {
      if (playoffRound === 'FINAL') return 'Плей-офф · Финал'
      if (playoffRound === 'THIRD_PLACE') return 'Плей-офф · За 3 место'
      const matchesCount = playoffMatchesCountByRoundNumber.get(rn) ?? 0
      return resolvePlayoffRoundTitle(matchesCount, {
        playoffRound: playoffRound as MatchRow['playoffRound'],
        roundNumber: rn || 1,
        minPlayoffRoundNumber,
        totalPlayoffTeams: options?.totalPlayoffTeams,
      })
    }
    return `Тур ${rn || 1}`
  }

  const buckets = [...byBucket.keys()].sort((a, b) => {
    const am = byBucket.get(a)!.matches
    const bm = byBucket.get(b)!.matches
    const aMin = am.reduce(
      (min, m) => Math.min(min, new Date(m.startTime).getTime()),
      Number.POSITIVE_INFINITY,
    )
    const bMin = bm.reduce(
      (min, m) => Math.min(min, new Date(m.startTime).getTime()),
      Number.POSITIVE_INFINITY,
    )
    if (aMin !== bMin) return aMin - bMin

    const [aStage, , , aPlayoffRound = ''] = a.split(':')
    const [bStage, , , bPlayoffRound = ''] = b.split(':')
    if (aStage === 'PLAYOFF' && bStage === 'PLAYOFF') {
      const ar = playoffRoundDisplayRank(aPlayoffRound as MatchRow['playoffRound'])
      const br = playoffRoundDisplayRank(bPlayoffRound as MatchRow['playoffRound'])
      if (ar !== br) return ar - br
    }
    return a.localeCompare(b)
  })

  return buckets.map((bucket, idx) => {
    const { dateKey, matches } = byBucket.get(bucket)!
    return {
      round: idx + 1,
      dateKey,
      dateLabel:
        dateKey === 'unknown'
          ? 'Дата не задана'
          : new Date(`${dateKey}T00:00:00`).toLocaleDateString(),
      title: resolveTitle(bucket),
      matches: matches.slice().sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)),
    }
  })
}

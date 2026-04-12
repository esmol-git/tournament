/**
 * Единая подпись стадии матча для списков и сетки: публичный сайт, админка, мобилка.
 * Для плей-офф опираемся на число матчей в том же roundNumber (как в PublicPlayoff), а не только на enum playoffRound.
 */

export type PlayoffStageMatchForLabel = {
  id: string
  stage?: string | null
  roundNumber?: number | null
  playoffRound?: string | null
  groupId?: string | null
}

export type GroupForLabel = { id: string; name?: string }

function groupLabelFromName(name: string): string {
  const t = name.trim()
  if (!t) return 'Группа'
  if (/^группа(\s|$)/i.test(t)) return t
  return `Группа ${t}`
}

function formatGroupStageLine(m: PlayoffStageMatchForLabel, groups: GroupForLabel[]): string {
  const g = m.groupId ? groups.find((x) => x.id === m.groupId) : null
  const name = g?.name?.trim() ?? ''

  if (groups.length === 1) {
    if (!name) return 'Группа'
    return groupLabelFromName(name)
  }

  if (!g) return 'Групповой этап'
  return groupLabelFromName(name)
}

/**
 * Подпись раунда плей-офф по числу матчей в том же roundNumber (без финала и матча за 3 место в корзине).
 * 4 матча → 1/4, 2 → 1/2, 1 → Финал.
 */
export function buildPlayoffRoundDisplayLabel(
  m: PlayoffStageMatchForLabel,
  playoffMatches: PlayoffStageMatchForLabel[],
): string {
  if (m.stage !== 'PLAYOFF') return 'Плей-офф'
  if (m.playoffRound === 'FINAL') return 'Финал'
  if (m.playoffRound === 'THIRD_PLACE') return 'Матч за 3 место'

  const rn = Number(m.roundNumber ?? 0)
  const peers = playoffMatches.filter((x) => {
    if (x.stage !== 'PLAYOFF') return false
    if (x.playoffRound === 'FINAL' || x.playoffRound === 'THIRD_PLACE') return false
    return Number(x.roundNumber ?? 0) === rn
  })
  const c = peers.length

  if (c > 2) return `1/${c}`
  if (c === 2) return '1/2'
  if (c === 1) return 'Финал'
  return `Стадия ${rn || 1}`
}

/**
 * Строка под датой в списке матчей: группа / плей-офф.
 */
export function buildMatchListStageLabel(
  m: PlayoffStageMatchForLabel,
  allMatches: PlayoffStageMatchForLabel[],
  groups: GroupForLabel[],
): string | null {
  const linkedToKnownGroup = Boolean(m.groupId && groups.some((x) => x.id === m.groupId))
  if (linkedToKnownGroup) {
    return formatGroupStageLine(m, groups)
  }
  if (m.stage === 'GROUP') {
    return formatGroupStageLine(m, groups)
  }
  if (m.stage === 'PLAYOFF') {
    const playoffOnly = allMatches.filter((x) => x.stage === 'PLAYOFF')
    return buildPlayoffRoundDisplayLabel(m, playoffOnly)
  }
  return null
}

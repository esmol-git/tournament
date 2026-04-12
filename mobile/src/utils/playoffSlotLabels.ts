import {
  buildPlayoffSlotLabels,
  type LabelBuilders,
  type PlayoffMatchRowForLabels,
  type SlotLabels,
} from '../../../shared/playoff/playoffSlotLabels'
import type { TournamentDetailResponse, TournamentMatchRow } from '../types/tournament'

export type { SlotLabels }

const RU_LABELS: LabelBuilders = {
  winnerOfMatch: (n) => `Победитель матча ${n}`,
  loserOfMatch: (n) => `Проигравший матча ${n}`,
}

function toPlayoffRows(matches: TournamentMatchRow[]): PlayoffMatchRowForLabels[] {
  const out: PlayoffMatchRowForLabels[] = []
  for (const m of matches) {
    const h = m.homeTeam
    const a = m.awayTeam
    if (!h?.id || !a?.id) continue
    out.push({
      id: m.id,
      startTime: m.startTime,
      stage: m.stage,
      roundNumber: m.roundNumber,
      playoffRound: m.playoffRound,
      status: m.status,
      homeTeam: h,
      awayTeam: a,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      events: m.events,
    })
  }
  return out
}

/** Карта matchId → подписи хозяев/гостей для плей-офф (как в веб-админке). */
export function buildTournamentPlayoffSlotLabels(
  detail: Pick<
    TournamentDetailResponse,
    'format' | 'groups' | 'matches' | 'matchNumberById' | 'playoffQualifiersPerGroup'
  > | null,
): Record<string, SlotLabels> {
  if (!detail) return {}
  return buildPlayoffSlotLabels(
    {
      format: detail.format,
      groups: detail.groups,
      playoffQualifiersPerGroup: detail.playoffQualifiersPerGroup,
      matchNumberById: detail.matchNumberById,
      matches: toPlayoffRows(detail.matches ?? []),
    },
    RU_LABELS,
  )
}

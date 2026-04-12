import type { TournamentDetails } from '~/types/tournament-admin'
import {
  buildPlayoffSlotLabels as buildPlayoffSlotLabelsCore,
  type LabelBuilders,
  type PlayoffTournamentDetailForLabels,
  type SlotLabels,
} from '../../shared/playoff/playoffSlotLabels'

export type { LabelBuilders, SlotLabels }

/** Подписи слотов плей-офф для таблицы матчей / протокола (как на странице турнира). */
export function buildPlayoffSlotLabels(
  detail: TournamentDetails | null | undefined,
  labels: LabelBuilders,
): Record<string, SlotLabels> {
  return buildPlayoffSlotLabelsCore(detail as PlayoffTournamentDetailForLabels | null | undefined, labels)
}

import type { TournamentGroupRow, TournamentMatchRow } from '../types/tournament'
import type { SlotLabels } from './playoffSlotLabels'
import { buildMatchListStageLabel } from '../../../shared/playoff/playoffStageLabel'

/** Слоты вида «Победитель матча N» — протокол недоступен, пока не определены участники. */
const PLACEHOLDER_RE = /Победитель матча|Проигравший матча/

export function isPlayoffPlaceholderSlot(slot: SlotLabels | null | undefined): boolean {
  if (!slot) return false
  return PLACEHOLDER_RE.test(slot.home) || PLACEHOLDER_RE.test(slot.away)
}

/**
 * Подзаголовок под датой в списке матчей турнира.
 * Логика общая с публичной сеткой (`shared/playoff/playoffStageLabel.ts`): 1/2, 1/4 и т.д. по числу матчей в раунде.
 */
export function matchStageLine(
  m: TournamentMatchRow,
  groups: TournamentGroupRow[],
  allMatches?: TournamentMatchRow[],
): string | null {
  return buildMatchListStageLabel(m, allMatches ?? [], groups)
}

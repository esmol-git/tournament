import type { MatchRow, TournamentDetails } from '~/types/tournament-admin'
import type { ComputedRef, Ref } from 'vue'
import { computed } from 'vue'
import { buildPlayoffSlotLabels } from '~/utils/playoffSlotResolver'

type TournamentRef = Ref<TournamentDetails | null> | ComputedRef<TournamentDetails | null>

/**
 * Подписи слотов плей-офф для таблицы матчей / протокола (как на странице турнира).
 */
export function usePlayoffSlotLabels(tournament: TournamentRef) {
  const playoffSlotLabelsByMatchId = computed(() =>
    buildPlayoffSlotLabels(tournament.value, {
      winnerOfMatch: (n) => `Победитель матча ${n}`,
      loserOfMatch: (n) => `Проигравший матча ${n}`,
    }),
  )

  const playoffSlotLabels = (m: MatchRow) => playoffSlotLabelsByMatchId.value[m.id] ?? null

  return { playoffSlotLabels }
}

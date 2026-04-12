import { describe, expect, it } from 'vitest'
import {
  buildPlayoffRoundDisplayLabel,
  type PlayoffStageMatchForLabel,
} from '../../shared/playoff/playoffStageLabel'

function m(
  id: string,
  o: Partial<PlayoffStageMatchForLabel> & Pick<PlayoffStageMatchForLabel, 'roundNumber'>,
): PlayoffStageMatchForLabel {
  return {
    id,
    stage: 'PLAYOFF',
    ...o,
  }
}

describe('buildPlayoffRoundDisplayLabel', () => {
  it('2 матча в раунде → 1/2', () => {
    const playoff = [
      m('a', { roundNumber: 2, playoffRound: 'SEMIFINAL' }),
      m('b', { roundNumber: 2, playoffRound: 'SEMIFINAL' }),
    ]
    expect(buildPlayoffRoundDisplayLabel(playoff[0]!, playoff)).toBe('1/2')
  })

  it('4 матча в раунде → 1/4', () => {
    const playoff = [1, 2, 3, 4].map((i) =>
      m(`m${i}`, { roundNumber: 1, playoffRound: 'QUARTERFINAL' }),
    )
    expect(buildPlayoffRoundDisplayLabel(playoff[0]!, playoff)).toBe('1/4')
  })

  it('финал и матч за 3 место не считаются в корзине 1/n', () => {
    const playoff = [
      m('sf1', { roundNumber: 2, playoffRound: 'SEMIFINAL' }),
      m('sf2', { roundNumber: 2, playoffRound: 'SEMIFINAL' }),
      m('f', { roundNumber: 3, playoffRound: 'FINAL' }),
      m('t', { roundNumber: 3, playoffRound: 'THIRD_PLACE' }),
    ]
    expect(buildPlayoffRoundDisplayLabel(playoff[0]!, playoff)).toBe('1/2')
    expect(buildPlayoffRoundDisplayLabel(playoff[2]!, playoff)).toBe('Финал')
    expect(buildPlayoffRoundDisplayLabel(playoff[3]!, playoff)).toBe('Матч за 3 место')
  })
})

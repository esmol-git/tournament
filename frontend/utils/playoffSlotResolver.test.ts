import { describe, expect, it } from 'vitest'
import { buildPlayoffSlotLabels } from '~/utils/playoffSlotResolver'
import type { TournamentDetails } from '~/types/tournament-admin'

const labels = {
  winnerOfMatch: (n: number | string) => `Победитель матча ${n}`,
  loserOfMatch: (n: number | string) => `Проигравший матча ${n}`,
}

describe('buildPlayoffSlotLabels', () => {
  it('returns empty for unsupported format', () => {
    const detail = {
      format: 'ROUND_ROBIN',
      matches: [],
    } as unknown as TournamentDetails
    expect(buildPlayoffSlotLabels(detail, labels)).toEqual({})
  })

  it('labels semifinal winners feeding final', () => {
    const detail: TournamentDetails = {
      id: 't1',
      name: 'T',
      slug: 't',
      format: 'PLAYOFF',
      status: 'ACTIVE',
      intervalDays: 1,
      allowedDays: [1],
      roundRobinCycles: 1,
      matchDurationMinutes: 60,
      matchBreakMinutes: 0,
      simultaneousMatches: 1,
      dayStartTimeDefault: '10:00',
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      minTeams: 2,
      groups: [],
      tournamentTeams: [],
      matches: [
        {
          id: 'm-sf-1',
          startTime: '2025-01-01T10:00:00Z',
          stage: 'PLAYOFF',
          roundNumber: 1,
          playoffRound: 'SEMIFINAL',
          status: 'PLAYED',
          homeTeam: { id: 'a', name: 'A' },
          awayTeam: { id: 'b', name: 'B' },
          homeScore: 2,
          awayScore: 1,
        },
        {
          id: 'm-sf-2',
          startTime: '2025-01-01T11:00:00Z',
          stage: 'PLAYOFF',
          roundNumber: 1,
          playoffRound: 'SEMIFINAL',
          status: 'PLAYED',
          homeTeam: { id: 'c', name: 'C' },
          awayTeam: { id: 'd', name: 'D' },
          homeScore: 0,
          awayScore: 3,
        },
        {
          id: 'm-final',
          startTime: '2025-01-02T10:00:00Z',
          stage: 'PLAYOFF',
          roundNumber: 2,
          playoffRound: 'FINAL',
          status: 'SCHEDULED',
          homeTeam: { id: 'a', name: 'A' },
          awayTeam: { id: 'd', name: 'D' },
          homeScore: null,
          awayScore: null,
        },
      ],
      matchNumberById: {
        'm-sf-1': 1,
        'm-sf-2': 2,
        'm-final': 3,
      },
    }
    const out = buildPlayoffSlotLabels(detail, labels)
    expect(out['m-final']).toEqual({
      home: 'A',
      away: 'D',
    })
  })
})

import {
  computePlayoffParticipantCount,
  computeThirdPlaceStatsVsTopTwo,
  isPowerOfTwo,
  rankBestThirdPlaceCandidates,
} from './playoff-qualifiers.util';

describe('playoff-qualifiers.util', () => {
  it('computePlayoffParticipantCount for World Cup 2026', () => {
    expect(computePlayoffParticipantCount(12, 2, 8)).toBe(32);
    expect(isPowerOfTwo(32)).toBe(true);
  });

  it('ranks third-place teams by points, goal diff, goals for', () => {
    const ranked = rankBestThirdPlaceCandidates([
      {
        teamId: 'a',
        groupId: 'g1',
        groupName: 'A',
        groupSortOrder: 1,
        points: 3,
        goalDiff: 1,
        goalsFor: 4,
      },
      {
        teamId: 'b',
        groupId: 'g2',
        groupName: 'B',
        groupSortOrder: 2,
        points: 4,
        goalDiff: 0,
        goalsFor: 3,
      },
      {
        teamId: 'c',
        groupId: 'g3',
        groupName: 'C',
        groupSortOrder: 3,
        points: 3,
        goalDiff: 2,
        goalsFor: 5,
      },
    ]);

    expect(ranked.map((r) => r.teamId)).toEqual(['b', 'c', 'a']);
  });

  it('counts third-place stats only vs top two in group', () => {
    const topTwo = new Set(['t1', 't2']);
    const eligible = new Set(['PLAYED', 'FINISHED']);
    const stats = computeThirdPlaceStatsVsTopTwo(
      't3',
      [
        {
          homeTeamId: 't3',
          awayTeamId: 't4',
          homeScore: 2,
          awayScore: 0,
          status: 'PLAYED',
        },
        {
          homeTeamId: 't1',
          awayTeamId: 't3',
          homeScore: 1,
          awayScore: 1,
          status: 'PLAYED',
        },
        {
          homeTeamId: 't3',
          awayTeamId: 't2',
          homeScore: 0,
          awayScore: 1,
          status: 'PLAYED',
        },
      ],
      topTwo,
      { win: 3, draw: 1, loss: 0 },
      eligible,
    );

    expect(stats).toEqual({
      points: 1,
      goalDiff: -1,
      goalsFor: 1,
    });
  });
});

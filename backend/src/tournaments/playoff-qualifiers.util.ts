export const MAX_TOURNAMENT_GROUP_COUNT = 12;

export function computePlayoffParticipantCount(
  groupCount: number,
  qualifiersPerGroup: number,
  bestThirdPlaceCount = 0,
): number {
  const groups = Math.max(0, groupCount);
  const perGroup = Math.max(0, qualifiersPerGroup);
  const bestThird = Math.max(0, bestThirdPlaceCount);
  return groups * perGroup + bestThird;
}

export function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

export type GroupMatchForThirdPlace = {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};

export type ThirdPlaceCandidateStats = {
  teamId: string;
  groupId: string;
  groupName: string;
  groupSortOrder: number;
  points: number;
  goalDiff: number;
  goalsFor: number;
};

export function computeThirdPlaceStatsVsTopTwo(
  teamId: string,
  matches: GroupMatchForThirdPlace[],
  topTwoTeamIds: Set<string>,
  points: { win: number; draw: number; loss: number },
  eligibleStatuses: Set<string>,
): Pick<ThirdPlaceCandidateStats, 'points' | 'goalDiff' | 'goalsFor'> {
  let pts = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const m of matches) {
    if (!eligibleStatuses.has(m.status)) continue;
    if (m.homeScore === null || m.awayScore === null) continue;

    const isHome = m.homeTeamId === teamId;
    const isAway = m.awayTeamId === teamId;
    if (!isHome && !isAway) continue;

    const opponentId = isHome ? m.awayTeamId : m.homeTeamId;
    if (!topTwoTeamIds.has(opponentId)) continue;

    const scored = isHome ? m.homeScore : m.awayScore;
    const conceded = isHome ? m.awayScore : m.homeScore;
    goalsFor += scored;
    goalsAgainst += conceded;

    if (scored > conceded) pts += points.win;
    else if (scored < conceded) pts += points.loss;
    else pts += points.draw;
  }

  return {
    points: pts,
    goalDiff: goalsFor - goalsAgainst,
    goalsFor,
  };
}

export function rankBestThirdPlaceCandidates(
  candidates: ThirdPlaceCandidateStats[],
): ThirdPlaceCandidateStats[] {
  return [...candidates].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.groupSortOrder - b.groupSortOrder;
  });
}

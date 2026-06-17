import {
  MatchEventType,
  MatchStatus,
  MatchTeamSide,
  Prisma,
  SanctionScope,
  TournamentRegulationMode,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseCardEventType } from '../matches/card-event.util';

type PlayerState = {
  yellowAccum: number;
  suspendedRemaining: number;
};

type RosterRowRef = {
  id: string;
  teamId: string;
  playerId: string;
  tournamentId: string;
};

type CardBanRules = {
  enabled: boolean;
  redBan: number;
  yellowThreshold: number;
  yellowBan: number;
};

type FinishedMatchForSuspensions = {
  id: string;
  tournamentId: string;
  homeTeamId: string;
  awayTeamId: string;
  events: Array<{
    playerId: string | null;
    teamSide: MatchTeamSide | null;
    payload: Prisma.JsonValue;
    minute: number | null;
    createdAt: Date;
  }>;
};

type TournamentCardContext = {
  id: string;
  editionId: string | null;
  regulationMode: TournamentRegulationMode;
  cardAutoBanEnabled: boolean;
  redCardBanMatches: number;
  yellowAccumulationThreshold: number;
  yellowAccumulationBanMatches: number;
  edition: {
    sanctionScope: SanctionScope;
    cardAutoBanEnabled: boolean;
    redCardBanMatches: number;
    yellowAccumulationThreshold: number;
    yellowAccumulationBanMatches: number;
  } | null;
};

function playerKey(teamId: string, playerId: string) {
  return `${teamId}:${playerId}`;
}

function normalizeCardBanRules(source: {
  cardAutoBanEnabled: boolean;
  redCardBanMatches: number;
  yellowAccumulationThreshold: number;
  yellowAccumulationBanMatches: number;
}): CardBanRules {
  return {
    enabled: source.cardAutoBanEnabled,
    redBan: Math.max(1, source.redCardBanMatches ?? 1),
    yellowThreshold: Math.max(1, source.yellowAccumulationThreshold ?? 2),
    yellowBan: Math.max(1, source.yellowAccumulationBanMatches ?? 1),
  };
}

function resolveCardBanRules(tournament: TournamentCardContext): CardBanRules {
  const useEdition =
    tournament.edition &&
    tournament.regulationMode === TournamentRegulationMode.INHERIT;
  const source = useEdition ? tournament.edition! : tournament;
  return normalizeCardBanRules(source);
}

function isEditionScope(tournament: TournamentCardContext): boolean {
  return (
    !!tournament.editionId &&
    tournament.edition?.sanctionScope === SanctionScope.EDITION &&
    tournament.regulationMode === TournamentRegulationMode.INHERIT
  );
}

function initState(rosterRows: RosterRowRef[]) {
  const state = new Map<string, PlayerState>();
  for (const row of rosterRows) {
    state.set(playerKey(row.teamId, row.playerId), {
      yellowAccum: 0,
      suspendedRemaining: 0,
    });
  }
  return state;
}

function serveSuspensionsForMatch(
  state: Map<string, PlayerState>,
  rosterRows: RosterRowRef[],
  teamIds: string[],
) {
  const teamSet = new Set(teamIds);
  for (const row of rosterRows) {
    if (!teamSet.has(row.teamId)) continue;
    const st = state.get(playerKey(row.teamId, row.playerId));
    if (!st || st.suspendedRemaining <= 0) continue;
    st.suspendedRemaining -= 1;
  }
}

function applyCardsForMatch(
  state: Map<string, PlayerState>,
  match: FinishedMatchForSuspensions,
  rules: CardBanRules,
) {
  const sortedEvents = [...match.events].sort((a, b) => {
    const ma = a.minute ?? 0;
    const mb = b.minute ?? 0;
    if (ma !== mb) return ma - mb;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  for (const event of sortedEvents) {
    const playerId = event.playerId?.trim();
    if (!playerId) continue;
    const teamId =
      event.teamSide === MatchTeamSide.HOME
        ? match.homeTeamId
        : event.teamSide === MatchTeamSide.AWAY
          ? match.awayTeamId
          : null;
    if (!teamId) continue;
    const st = state.get(playerKey(teamId, playerId));
    if (!st) continue;

    const cardType = parseCardEventType(event.payload);
    if (cardType === 'RED') {
      st.suspendedRemaining += rules.redBan;
      st.yellowAccum = 0;
    } else if (cardType === 'YELLOW') {
      st.yellowAccum += 1;
      while (st.yellowAccum >= rules.yellowThreshold) {
        st.suspendedRemaining += rules.yellowBan;
        st.yellowAccum -= rules.yellowThreshold;
      }
    }
  }
}

function simulateSuspensions(
  rosterRows: RosterRowRef[],
  matches: FinishedMatchForSuspensions[],
  rules: CardBanRules,
) {
  const state = initState(rosterRows);
  if (!rules.enabled) return state;

  for (const match of matches) {
    serveSuspensionsForMatch(state, rosterRows, [
      match.homeTeamId,
      match.awayTeamId,
    ]);
    applyCardsForMatch(state, match, rules);
  }
  return state;
}

const FINISHED_MATCH_STATUSES = [MatchStatus.PLAYED, MatchStatus.FINISHED];

type PrismaReadLike = Pick<
  PrismaService,
  'tournament' | 'tournamentTeamPlayer' | 'match'
>;

type PrismaWriteLike = PrismaReadLike &
  Pick<PrismaService, '$transaction'>;

const tournamentCardSelect = {
  id: true,
  editionId: true,
  regulationMode: true,
  cardAutoBanEnabled: true,
  redCardBanMatches: true,
  yellowAccumulationThreshold: true,
  yellowAccumulationBanMatches: true,
  edition: {
    select: {
      sanctionScope: true,
      cardAutoBanEnabled: true,
      redCardBanMatches: true,
      yellowAccumulationThreshold: true,
      yellowAccumulationBanMatches: true,
    },
  },
} as const;

const finishedMatchSelect = {
  id: true,
  tournamentId: true,
  homeTeamId: true,
  awayTeamId: true,
  events: {
    where: { type: MatchEventType.CARD },
    orderBy: [{ minute: 'asc' as const }, { createdAt: 'asc' as const }],
    select: {
      playerId: true,
      teamSide: true,
      payload: true,
      minute: true,
      createdAt: true,
    },
  },
};

async function loadTournamentCardContext(
  prisma: PrismaReadLike,
  tournamentId: string,
): Promise<TournamentCardContext | null> {
  return prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: tournamentCardSelect,
  });
}

async function loadFinishedMatchesForTournaments(
  prisma: PrismaReadLike,
  tournamentIds: string[],
  excludeMatchId?: string,
) {
  if (!tournamentIds.length) return [];
  const rows = await prisma.match.findMany({
    where: {
      tournamentId: { in: tournamentIds },
      status: { in: FINISHED_MATCH_STATUSES },
      ...(excludeMatchId ? { id: { not: excludeMatchId } } : {}),
    },
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    select: finishedMatchSelect,
  });
  return rows.filter(
    (m): m is (typeof rows)[number] & { tournamentId: string } =>
      m.tournamentId != null,
  );
}

async function loadRosterForScope(
  prisma: PrismaReadLike,
  tournament: TournamentCardContext,
) {
  if (isEditionScope(tournament) && tournament.editionId) {
    const editionTournaments = await prisma.tournament.findMany({
      where: { editionId: tournament.editionId },
      select: { id: true },
    });
    const ids = editionTournaments.map((t) => t.id);
    return prisma.tournamentTeamPlayer.findMany({
      where: { tournamentId: { in: ids } },
      select: {
        id: true,
        teamId: true,
        playerId: true,
        tournamentId: true,
      },
    });
  }
  return prisma.tournamentTeamPlayer.findMany({
    where: { tournamentId: tournament.id },
    select: {
      id: true,
      teamId: true,
      playerId: true,
      tournamentId: true,
    },
  });
}

async function tournamentIdsForScope(
  prisma: PrismaReadLike,
  tournament: TournamentCardContext,
) {
  if (isEditionScope(tournament) && tournament.editionId) {
    const rows = await prisma.tournament.findMany({
      where: { editionId: tournament.editionId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  return [tournament.id];
}

async function applyStateToRoster(
  prisma: PrismaWriteLike,
  rosterRows: RosterRowRef[],
  state: Map<string, PlayerState>,
) {
  await prisma.$transaction(
    rosterRows.map((row) => {
      const st = state.get(playerKey(row.teamId, row.playerId)) ?? {
        yellowAccum: 0,
        suspendedRemaining: 0,
      };
      return prisma.tournamentTeamPlayer.update({
        where: { id: row.id },
        data: {
          yellowCardsAccumulated: st.yellowAccum,
          suspendedMatchesRemaining: st.suspendedRemaining,
        },
      });
    }),
  );
}

export async function recomputeTournamentCardSuspensions(
  prisma: PrismaWriteLike,
  tournamentId: string,
) {
  const tournament = await loadTournamentCardContext(prisma, tournamentId);
  if (!tournament) return;

  const rules = resolveCardBanRules(tournament);
  const rosterRows = await loadRosterForScope(prisma, tournament);
  if (!rosterRows.length) return;

  const tournamentIds = await tournamentIdsForScope(prisma, tournament);
  const matches = await loadFinishedMatchesForTournaments(
    prisma,
    tournamentIds,
  );
  const state = simulateSuspensions(rosterRows, matches, rules);
  await applyStateToRoster(prisma, rosterRows, state);
}

export async function getPlayersSuspendedForMatch(
  prisma: PrismaReadLike,
  tournamentId: string,
  matchId: string,
): Promise<Set<string>> {
  const tournament = await loadTournamentCardContext(prisma, tournamentId);
  if (!tournament) return new Set();

  const rules = resolveCardBanRules(tournament);
  if (!rules.enabled) return new Set();

  const rosterRows = await loadRosterForScope(prisma, tournament);
  if (!rosterRows.length) return new Set();

  const tournamentIds = await tournamentIdsForScope(prisma, tournament);
  const priorMatches = await loadFinishedMatchesForTournaments(
    prisma,
    tournamentIds,
    matchId,
  );
  const state = simulateSuspensions(rosterRows, priorMatches, rules);
  const blocked = new Set<string>();
  for (const row of rosterRows) {
    const st = state.get(playerKey(row.teamId, row.playerId));
    if (st && st.suspendedRemaining > 0) {
      blocked.add(playerKey(row.teamId, row.playerId));
    }
  }
  return blocked;
}

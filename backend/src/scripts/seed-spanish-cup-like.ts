import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  MatchEventType,
  MatchStatus,
  MatchStage,
  MatchTeamSide,
  TournamentFormat,
  TournamentStatus,
  UserRole,
} from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { MatchesService } from '../matches/matches.service';

const EXTRA_TIME_META = 'EXTRA_TIME_SCORE';
const PENALTIES_META = 'PENALTY_SCORE';
const MIN_PLAYERS_PER_TEAM = 14;

type ProtocolEventInput = {
  type: MatchEventType | 'CUSTOM';
  minute?: number;
  playerId?: string;
  teamSide?: MatchTeamSide;
  payload?: Record<string, unknown>;
};

function toPositiveInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickOne<T>(rng: () => number, items: T[]): T {
  return items[randInt(rng, 0, items.length - 1)];
}

function generatePenaltyScore(rng: () => number): {
  home: number;
  away: number;
} {
  // 75%: winner in first 5 kicks; 25%: sudden death (difference always 1).
  if (rng() < 0.75) {
    const winner = randInt(rng, 3, 5);
    const loser = randInt(rng, 0, Math.min(4, winner - 1));
    return rng() < 0.5
      ? { home: winner, away: loser }
      : { home: loser, away: winner };
  }

  // Sudden death examples: 6:5, 7:6, ... (difference exactly one).
  const roundsAfterFive = randInt(rng, 1, 3);
  const winner = 5 + roundsAfterFive;
  const loser = 4 + roundsAfterFive;
  return rng() < 0.5
    ? { home: winner, away: loser }
    : { home: loser, away: winner };
}

function buildGoalEvents(
  rng: () => number,
  teamSide: MatchTeamSide,
  goals: number,
  playerIds: string[],
  minuteMin: number,
  minuteMax: number,
): ProtocolEventInput[] {
  const events: ProtocolEventInput[] = [];
  for (let i = 0; i < goals; i++) {
    const scorer = pickOne(rng, playerIds);
    const withAssist = rng() < 0.68 && playerIds.length > 1;
    let payload: Record<string, unknown> | undefined;
    if (withAssist) {
      const assistants = playerIds.filter((id) => id !== scorer);
      if (assistants.length) payload = { assistId: pickOne(rng, assistants) };
    }
    events.push({
      type: MatchEventType.GOAL,
      minute: randInt(rng, minuteMin, minuteMax),
      teamSide,
      playerId: scorer,
      payload,
    });
  }
  return events;
}

function buildCardEvents(
  rng: () => number,
  teamSide: MatchTeamSide,
  playerIds: string[],
): ProtocolEventInput[] {
  const out: ProtocolEventInput[] = [];
  const cards = rng() < 0.7 ? randInt(rng, 0, 3) : 0;
  for (let i = 0; i < cards; i++) {
    out.push({
      type: MatchEventType.CARD,
      minute: randInt(rng, 10, 120),
      teamSide,
      playerId: pickOne(rng, playerIds),
      payload: { cardType: rng() < 0.84 ? 'YELLOW' : 'RED' },
    });
  }
  return out;
}

async function ensureTeams(
  prisma: PrismaService,
  tenantId: string,
  requiredCount: number,
): Promise<Array<{ id: string; name: string }>> {
  const existing = await prisma.team.findMany({
    where: { tenantId },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  if (existing.length >= requiredCount) {
    return existing.slice(0, requiredCount);
  }

  const missing = requiredCount - existing.length;
  const stamp = Date.now();
  const created = await Promise.all(
    Array.from({ length: missing }).map((_, i) =>
      prisma.team.create({
        data: {
          tenantId,
          name: `Spanish Cup Team ${String(existing.length + i + 1).padStart(3, '0')}`,
          slug: `spanish-cup-team-${existing.length + i + 1}-${stamp}`,
          rating: ((i + existing.length) % 5) + 1,
        },
        select: { id: true, name: true },
      }),
    ),
  );
  return [...existing, ...created].slice(0, requiredCount);
}

async function ensureTeamRosters(
  prisma: PrismaService,
  tenantId: string,
  teams: Array<{ id: string; name: string }>,
  minPlayersPerTeam: number,
) {
  const teamIds = teams.map((t) => t.id);
  const activeByTeam = await prisma.teamPlayer.groupBy({
    by: ['teamId'],
    where: { teamId: { in: teamIds }, isActive: true },
    _count: { _all: true },
  });
  const countByTeamId = new Map<string, number>();
  for (const r of activeByTeam) countByTeamId.set(r.teamId, r._count._all);

  let createdPlayers = 0;
  for (const team of teams) {
    const existing = countByTeamId.get(team.id) ?? 0;
    const need = Math.max(0, minPlayersPerTeam - existing);
    if (!need) continue;
    const createdAtStamp = Date.now();
    await prisma.team.update({
      where: { id: team.id },
      data: {
        players: {
          create: Array.from({ length: need }).map((_, idx) => ({
            isActive: true,
            position: ['GK', 'DF', 'MF', 'FW'][idx % 4],
            jerseyNumber: existing + idx + 1,
            player: {
              create: {
                tenantId,
                firstName: `CupP${String(idx + 1).padStart(2, '0')}`,
                lastName:
                  team.name.replace(/\s+/g, '').slice(0, 20) +
                  String(createdAtStamp + idx),
              },
            },
          })),
        },
      },
    });
    createdPlayers += need;
  }
  return { createdPlayers };
}

async function simulateTournament(
  prisma: PrismaService,
  matchesService: MatchesService,
  tournamentId: string,
  seed: number,
) {
  const rng = makeRng(seed);
  const rounds = await prisma.match.findMany({
    where: { tournamentId, stage: MatchStage.PLAYOFF },
    select: { roundNumber: true },
    distinct: ['roundNumber'],
    orderBy: { roundNumber: 'asc' },
  });
  const roundNumbers = rounds.map((r) => r.roundNumber).sort((a, b) => a - b);

  let played = 0;
  let penaltiesExamples = 0;
  let extraTimeExamples = 0;
  let goals = 0;
  let assists = 0;
  let cards = 0;

  const teamIds = Array.from(
    new Set(
      (
        await prisma.match.findMany({
          where: { tournamentId },
          select: { homeTeamId: true, awayTeamId: true },
        })
      ).flatMap((m) => [m.homeTeamId, m.awayTeamId]),
    ),
  );
  const rosterRows = await prisma.teamPlayer.findMany({
    where: { teamId: { in: teamIds }, isActive: true },
    select: { teamId: true, playerId: true },
  });
  const playersByTeamId = new Map<string, string[]>();
  for (const r of rosterRows) {
    const arr = playersByTeamId.get(r.teamId) ?? [];
    arr.push(r.playerId);
    playersByTeamId.set(r.teamId, arr);
  }

  for (const rn of roundNumbers) {
    const matches = await prisma.match.findMany({
      where: { tournamentId, stage: MatchStage.PLAYOFF, roundNumber: rn },
      select: { id: true, homeTeamId: true, awayTeamId: true },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    });

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const homePlayers = playersByTeamId.get(match.homeTeamId) ?? [];
      const awayPlayers = playersByTeamId.get(match.awayTeamId) ?? [];
      if (!homePlayers.length || !awayPlayers.length) continue;

      const events: ProtocolEventInput[] = [];
      let homeScore = randInt(rng, 0, 3);
      let awayScore = randInt(rng, 0, 3);

      // Every ~9th match -> draw with penalties.
      if ((i + rn) % 9 === 0) {
        homeScore = randInt(rng, 0, 2);
        awayScore = homeScore;
        const pens = generatePenaltyScore(rng);
        events.push({
          type: 'CUSTOM',
          payload: {
            metaType: PENALTIES_META,
            homeScore: pens.home,
            awayScore: pens.away,
          },
        });
        events.push(
          ...buildGoalEvents(
            rng,
            MatchTeamSide.HOME,
            homeScore,
            homePlayers,
            5,
            90,
          ),
        );
        events.push(
          ...buildGoalEvents(
            rng,
            MatchTeamSide.AWAY,
            awayScore,
            awayPlayers,
            5,
            90,
          ),
        );
        penaltiesExamples += 1;
      } else if ((i + rn) % 7 === 0) {
        // Every ~7th match -> win in extra time.
        // Main score (homeScore/awayScore) is final match score.
        // EXTRA_TIME_SCORE stores only extra-time segment score.
        const regularDraw = randInt(rng, 0, 2);
        const etHome = randInt(rng, 0, 1);
        let etAway = randInt(rng, 0, 1);
        if (etHome === etAway) etAway = etAway === 0 ? 1 : 0;
        homeScore = regularDraw + etHome;
        awayScore = regularDraw + etAway;
        events.push(
          ...buildGoalEvents(
            rng,
            MatchTeamSide.HOME,
            regularDraw,
            homePlayers,
            5,
            90,
          ),
        );
        events.push(
          ...buildGoalEvents(
            rng,
            MatchTeamSide.AWAY,
            regularDraw,
            awayPlayers,
            5,
            90,
          ),
        );
        events.push(
          ...buildGoalEvents(
            rng,
            MatchTeamSide.HOME,
            etHome,
            homePlayers,
            91,
            120,
          ),
        );
        events.push(
          ...buildGoalEvents(
            rng,
            MatchTeamSide.AWAY,
            etAway,
            awayPlayers,
            91,
            120,
          ),
        );
        events.push({
          type: 'CUSTOM',
          payload: {
            metaType: EXTRA_TIME_META,
            homeScore: etHome,
            awayScore: etAway,
          },
        });
        extraTimeExamples += 1;
      } else if (homeScore === awayScore) {
        awayScore = awayScore > 0 ? awayScore - 1 : 1;
        events.push(
          ...buildGoalEvents(
            rng,
            MatchTeamSide.HOME,
            homeScore,
            homePlayers,
            5,
            90,
          ),
        );
        events.push(
          ...buildGoalEvents(
            rng,
            MatchTeamSide.AWAY,
            awayScore,
            awayPlayers,
            5,
            90,
          ),
        );
      } else {
        events.push(
          ...buildGoalEvents(
            rng,
            MatchTeamSide.HOME,
            homeScore,
            homePlayers,
            5,
            90,
          ),
        );
        events.push(
          ...buildGoalEvents(
            rng,
            MatchTeamSide.AWAY,
            awayScore,
            awayPlayers,
            5,
            90,
          ),
        );
      }
      events.push(...buildCardEvents(rng, MatchTeamSide.HOME, homePlayers));
      events.push(...buildCardEvents(rng, MatchTeamSide.AWAY, awayPlayers));
      events.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));

      await matchesService.updateProtocol(
        tournamentId,
        match.id,
        UserRole.TENANT_ADMIN,
        {
          homeScore,
          awayScore,
          status: MatchStatus.PLAYED,
          events,
        },
      );
      played += 1;
      goals += events.filter((e) => e.type === MatchEventType.GOAL).length;
      cards += events.filter((e) => e.type === MatchEventType.CARD).length;
      assists += events.filter(
        (e) => e.type === MatchEventType.GOAL && !!e.payload?.assistId,
      ).length;
    }
  }

  return {
    played,
    penaltiesExamples,
    extraTimeExamples,
    goals,
    assists,
    cards,
  };
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const prisma = app.get(PrismaService);
    const tournamentsService = app.get(TournamentsService);
    const matchesService = app.get(MatchesService);

    const tenantSlug =
      process.env.SPANISH_CUP_TENANT_SLUG?.trim() || 'load-test-1775032507811';
    const teamsCount = toPositiveInt(process.env.SPANISH_CUP_TEAMS, 512);
    const simulate = process.env.SPANISH_CUP_SIMULATE !== '0';
    const seed = toPositiveInt(process.env.SPANISH_CUP_SEED, 20260401);
    const stamp = Date.now();

    const tenant = await prisma.tenant.findFirst({
      where: { slug: tenantSlug },
      select: { id: true, slug: true },
    });
    if (!tenant) throw new Error(`Tenant not found: ${tenantSlug}`);
    if (
      (teamsCount & (teamsCount - 1)) !== 0 ||
      teamsCount < 4 ||
      teamsCount > 512
    ) {
      throw new Error(
        'SPANISH_CUP_TEAMS must be a power of two in range 4..512',
      );
    }

    const teams = await ensureTeams(prisma, tenant.id, teamsCount);
    const rosterStats = await ensureTeamRosters(
      prisma,
      tenant.id,
      teams,
      MIN_PLAYERS_PER_TEAM,
    );
    const tournament = await prisma.tournament.create({
      data: {
        tenantId: tenant.id,
        name: `Spanish Cup ${teamsCount} (${stamp})`,
        slug: `spanish-cup-${teamsCount}-${stamp}`,
        format: TournamentFormat.PLAYOFF,
        status: TournamentStatus.DRAFT,
        groupCount: 0,
        minTeams: teamsCount,
        pointsWin: 3,
        pointsDraw: 1,
        pointsLoss: 0,
        intervalDays: 1,
        allowedDays: [1, 2, 3, 4, 5, 6, 0],
        matchDurationMinutes: 5,
        matchBreakMinutes: 0,
        simultaneousMatches: 512,
        dayStartTimeDefault: '00:00',
      },
      select: { id: true, slug: true, name: true },
    });

    for (const team of teams) {
      await tournamentsService.addTeam(tournament.id, team.id);
    }

    await tournamentsService.generateCalendar(tournament.id, {
      startDate: '2026-07-01',
      roundsPerDay: 1,
      replaceExisting: true,
      intervalDays: 1,
      allowedDays: [1, 2, 3, 4, 5, 6, 0],
      matchDurationMinutes: 5,
      matchBreakMinutes: 0,
      simultaneousMatches: 512,
      dayStartTimeDefault: '00:00',
      dayStartTimeOverrides: {},
    });

    const totalMatches = await prisma.match.count({
      where: { tournamentId: tournament.id },
    });

    let simStats = {
      played: 0,
      penaltiesExamples: 0,
      extraTimeExamples: 0,
      goals: 0,
      assists: 0,
      cards: 0,
    };
    if (simulate) {
      simStats = await simulateTournament(
        prisma,
        matchesService,
        tournament.id,
        seed,
      );
    }

    console.log(`SPANISH_CUP_OK tenant=${tenant.slug}`);
    console.log(`TOURNAMENT id=${tournament.id}`);
    console.log(`TOURNAMENT slug=${tournament.slug}`);
    console.log(`TOURNAMENT name=${tournament.name}`);
    console.log(`MATCHES total=${totalMatches}`);
    console.log(`ROSTER playersCreated=${rosterStats.createdPlayers}`);
    console.log(
      `SIMULATION played=${simStats.played} penalties=${simStats.penaltiesExamples} extraTime=${simStats.extraTimeExamples}`,
    );
    console.log(
      `SIMULATION_EVENTS goals=${simStats.goals} assists=${simStats.assists} cards=${simStats.cards}`,
    );
  } finally {
    await app.close();
  }
}

void main();

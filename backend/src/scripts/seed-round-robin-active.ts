import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  MatchEventType,
  MatchStage,
  MatchStatus,
  MatchTeamSide,
  TournamentFormat,
  TournamentStatus,
  UserRole,
} from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { MatchesService } from '../matches/matches.service';

type ProtocolEventInput = {
  type: MatchEventType;
  minute?: number;
  playerId?: string;
  teamSide?: MatchTeamSide;
  payload?: Record<string, unknown>;
};

const MIN_PLAYERS_PER_TEAM = 14;

function toPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function toRatio(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
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

function buildGroupScore(rng: () => number): { home: number; away: number } {
  return {
    home: randInt(rng, 0, 4),
    away: randInt(rng, 0, 4),
  };
}

function buildGoalEvents(
  rng: () => number,
  teamSide: MatchTeamSide,
  goals: number,
  playerIds: string[],
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
      minute: randInt(rng, 1, 90),
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
  const cards = rng() < 0.72 ? randInt(rng, 0, 2) : 0;
  for (let i = 0; i < cards; i++) {
    out.push({
      type: MatchEventType.CARD,
      minute: randInt(rng, 5, 90),
      teamSide,
      playerId: pickOne(rng, playerIds),
      payload: { cardType: rng() < 0.86 ? 'YELLOW' : 'RED' },
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
          name: `RR20 Team ${String(existing.length + i + 1).padStart(2, '0')}`,
          slug: `rr20-team-${existing.length + i + 1}-${stamp}`,
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
                firstName: `RRP${String(idx + 1).padStart(2, '0')}`,
                lastName: team.name.replace(/\s+/g, '').slice(0, 20) + String(createdAtStamp + idx),
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

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    const tournamentsService = app.get(TournamentsService);
    const matchesService = app.get(MatchesService);

    const tenantSlug =
      process.env.ROUND_ROBIN_ACTIVE_TENANT_SLUG?.trim() || 'load-test-1775032507811';
    const teamsCount = toPositiveInt(process.env.ROUND_ROBIN_ACTIVE_TEAMS, 20);
    const cycles = toPositiveInt(process.env.ROUND_ROBIN_ACTIVE_CYCLES, 2);
    const playedRatio = toRatio(process.env.ROUND_ROBIN_ACTIVE_PLAYED_RATIO, 0.5);
    const seed = toPositiveInt(process.env.ROUND_ROBIN_ACTIVE_SEED, 20260401);
    const rng = makeRng(seed);
    const stamp = Date.now();

    const tenant = await prisma.tenant.findFirst({
      where: { slug: tenantSlug },
      select: { id: true, slug: true },
    });
    if (!tenant) throw new Error(`Tenant not found: ${tenantSlug}`);

    const teams = await ensureTeams(prisma, tenant.id, teamsCount);
    const rosterStats = await ensureTeamRosters(prisma, tenant.id, teams, MIN_PLAYERS_PER_TEAM);

    const tournament = await prisma.tournament.create({
      data: {
        tenantId: tenant.id,
        name: `Round Robin ${teamsCount}x${cycles} Active (${stamp})`,
        slug: `round-robin-${teamsCount}x${cycles}-${stamp}`,
        format: TournamentFormat.SINGLE_GROUP,
        status: TournamentStatus.DRAFT,
        groupCount: 1,
        minTeams: teamsCount,
        roundRobinCycles: cycles,
        pointsWin: 3,
        pointsDraw: 1,
        pointsLoss: 0,
        intervalDays: 1,
        allowedDays: [1, 2, 3, 4, 5, 6, 0],
        matchDurationMinutes: 50,
        matchBreakMinutes: 10,
        simultaneousMatches: 6,
        dayStartTimeDefault: '09:00',
      },
      select: { id: true, slug: true, name: true },
    });

    for (const team of teams) {
      await tournamentsService.addTeam(tournament.id, team.id);
    }

    await tournamentsService.generateCalendar(tournament.id, {
      startDate: '2026-04-01',
      roundsPerDay: 1,
      replaceExisting: true,
      intervalDays: 1,
      allowedDays: [1, 2, 3, 4, 5, 6, 0],
      roundRobinCycles: cycles,
      matchDurationMinutes: 50,
      matchBreakMinutes: 10,
      simultaneousMatches: 6,
      dayStartTimeDefault: '09:00',
      dayStartTimeOverrides: {},
    });

    const matches = await prisma.match.findMany({
      where: { tournamentId: tournament.id, stage: MatchStage.GROUP },
      select: { id: true, homeTeamId: true, awayTeamId: true },
      orderBy: [{ roundNumber: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    });
    const totalMatches = matches.length;
    const playedTarget = Math.floor(totalMatches * playedRatio);

    const teamIds = Array.from(new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId])));
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

    let played = 0;
    let goals = 0;
    let assists = 0;
    let cards = 0;

    for (const match of matches.slice(0, playedTarget)) {
      const homePlayers = playersByTeamId.get(match.homeTeamId) ?? [];
      const awayPlayers = playersByTeamId.get(match.awayTeamId) ?? [];
      if (!homePlayers.length || !awayPlayers.length) continue;

      const score = buildGroupScore(rng);
      const events: ProtocolEventInput[] = [];
      events.push(...buildGoalEvents(rng, MatchTeamSide.HOME, score.home, homePlayers));
      events.push(...buildGoalEvents(rng, MatchTeamSide.AWAY, score.away, awayPlayers));
      events.push(...buildCardEvents(rng, MatchTeamSide.HOME, homePlayers));
      events.push(...buildCardEvents(rng, MatchTeamSide.AWAY, awayPlayers));
      events.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));

      await matchesService.updateProtocol(tournament.id, match.id, UserRole.TENANT_ADMIN, {
        homeScore: score.home,
        awayScore: score.away,
        status: MatchStatus.PLAYED,
        events,
      });

      played += 1;
      goals += events.filter((e) => e.type === MatchEventType.GOAL).length;
      cards += events.filter((e) => e.type === MatchEventType.CARD).length;
      assists += events.filter((e) => e.type === MatchEventType.GOAL && !!e.payload?.assistId).length;
    }

    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: TournamentStatus.ACTIVE },
    });

    console.log(`ROUND_ROBIN_ACTIVE_OK tenant=${tenant.slug}`);
    console.log(`TOURNAMENT id=${tournament.id}`);
    console.log(`TOURNAMENT slug=${tournament.slug}`);
    console.log(`TOURNAMENT name=${tournament.name}`);
    console.log(`FORMAT single_group cycles=${cycles} teams=${teamsCount}`);
    console.log(`MATCHES total=${totalMatches} played=${played}`);
    console.log(`SIMULATION_EVENTS goals=${goals} assists=${assists} cards=${cards}`);
    console.log(`ROSTER playersCreated=${rosterStats.createdPlayers}`);
  } finally {
    await app.close();
  }
}

void main();

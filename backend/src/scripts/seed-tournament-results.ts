import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  MatchEventType,
  MatchStage,
  MatchStatus,
  MatchTeamSide,
  UserRole,
} from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { MatchesService } from '../matches/matches.service';

type ProtocolEventInput = {
  type: MatchEventType;
  minute?: number;
  playerId?: string;
  teamSide?: MatchTeamSide;
  payload?: Record<string, unknown>;
};

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

function shuffleInPlace<T>(rng: () => number, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function buildScore(
  rng: () => number,
  stage: MatchStage,
): { home: number; away: number } {
  const home = randInt(rng, 0, 4);
  let away = randInt(rng, 0, 4);
  if (stage === MatchStage.PLAYOFF && home === away) {
    away = (away + 1) % 5;
  }
  return { home, away };
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
    const minute = randInt(rng, 1, 90);
    const withAssist = rng() < 0.72 && playerIds.length > 1;
    let payload: Record<string, unknown> | undefined;
    if (withAssist) {
      const assistants = playerIds.filter((id) => id !== scorer);
      if (assistants.length) payload = { assistId: pickOne(rng, assistants) };
    }
    events.push({
      type: MatchEventType.GOAL,
      minute,
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
  const events: ProtocolEventInput[] = [];
  const count = rng() < 0.55 ? randInt(rng, 0, 2) : 0;
  for (let i = 0; i < count; i++) {
    events.push({
      type: MatchEventType.CARD,
      minute: randInt(rng, 1, 90),
      teamSide,
      playerId: pickOne(rng, playerIds),
      payload: { cardType: rng() < 0.82 ? 'YELLOW' : 'RED' },
    });
  }
  return events;
}

async function main() {
  const tournamentId =
    process.env.SEED_TOURNAMENT_ID?.trim() || process.argv[2]?.trim();
  if (!tournamentId) {
    throw new Error(
      'Pass tournament id via SEED_TOURNAMENT_ID or first argument',
    );
  }

  const seed = Number(process.env.SEED_RANDOM) || 20260401;
  const rng = makeRng(seed);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const matchesService = app.get(MatchesService);

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, name: true, tenantId: true, slug: true },
    });
    if (!tournament) {
      throw new Error(`Tournament not found: ${tournamentId}`);
    }

    const matchIds = await prisma.match.findMany({
      where: { tournamentId: tournament.id },
      select: { id: true, stage: true, roundNumber: true, startTime: true },
      orderBy: [
        { stage: 'asc' },
        { roundNumber: 'asc' },
        { startTime: 'asc' },
        { id: 'asc' },
      ],
    });

    if (!matchIds.length) {
      throw new Error(`Tournament has no matches: ${tournamentId}`);
    }

    let played = 0;
    let goals = 0;
    let cards = 0;
    let assists = 0;

    for (const m of matchIds) {
      const match = await prisma.match.findUnique({
        where: { id: m.id },
        select: { id: true, stage: true, homeTeamId: true, awayTeamId: true },
      });
      if (!match) continue;

      const [homeRoster, awayRoster] = await Promise.all([
        prisma.teamPlayer.findMany({
          where: { teamId: match.homeTeamId, isActive: true },
          select: { playerId: true },
          take: 30,
        }),
        prisma.teamPlayer.findMany({
          where: { teamId: match.awayTeamId, isActive: true },
          select: { playerId: true },
          take: 30,
        }),
      ]);

      const homePlayers = homeRoster.map((x) => x.playerId);
      const awayPlayers = awayRoster.map((x) => x.playerId);
      if (!homePlayers.length || !awayPlayers.length) {
        continue;
      }

      const score = buildScore(rng, match.stage);
      const events: ProtocolEventInput[] = [];
      events.push(
        ...buildGoalEvents(rng, MatchTeamSide.HOME, score.home, homePlayers),
      );
      events.push(
        ...buildGoalEvents(rng, MatchTeamSide.AWAY, score.away, awayPlayers),
      );
      events.push(...buildCardEvents(rng, MatchTeamSide.HOME, homePlayers));
      events.push(...buildCardEvents(rng, MatchTeamSide.AWAY, awayPlayers));
      shuffleInPlace(rng, events).sort(
        (a, b) => (a.minute ?? 0) - (b.minute ?? 0),
      );

      await matchesService.updateProtocol(
        tournament.id,
        match.id,
        UserRole.TENANT_ADMIN,
        {
          homeScore: score.home,
          awayScore: score.away,
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

    console.log(
      `SEED_RESULTS_OK tournament=${tournament.id} slug=${tournament.slug}`,
    );
    console.log(`SEED_RESULTS_NAME ${tournament.name}`);
    console.log(`SEED_RESULTS_MATCHES played=${played}/${matchIds.length}`);
    console.log(
      `SEED_RESULTS_EVENTS goals=${goals} assists=${assists} cards=${cards}`,
    );
  } finally {
    await app.close();
  }
}

void main();

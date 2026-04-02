import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  MatchEventType,
  MatchStatus,
  MatchTeamSide,
  TournamentStatus,
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

function toRatio(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
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

function buildScore(rng: () => number): { home: number; away: number } {
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

async function main() {
  const tournamentId =
    process.env.PROGRESS_TOURNAMENT_ID?.trim() || process.argv[2]?.trim();
  if (!tournamentId) {
    throw new Error(
      'Pass tournament id via PROGRESS_TOURNAMENT_ID or first argument',
    );
  }

  const targetRatio = toRatio(process.env.PROGRESS_PLAYED_RATIO, 2 / 3);
  const seed = toPositiveInt(process.env.PROGRESS_SEED, 20260401);
  const rng = makeRng(seed);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const matchesService = app.get(MatchesService);

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, slug: true, name: true, status: true },
    });
    if (!tournament) throw new Error(`Tournament not found: ${tournamentId}`);

    const matches = await prisma.match.findMany({
      where: { tournamentId: tournament.id },
      select: {
        id: true,
        homeTeamId: true,
        awayTeamId: true,
        status: true,
        roundNumber: true,
        startTime: true,
      },
      orderBy: [
        { roundNumber: 'asc' },
        { startTime: 'asc' },
        { id: 'asc' },
      ],
    });
    if (!matches.length) {
      throw new Error(`Tournament has no matches: ${tournament.id}`);
    }

    const playedStatuses = new Set<MatchStatus>([MatchStatus.PLAYED]);
    const total = matches.length;
    const initialPlayed = matches.filter((m) => playedStatuses.has(m.status))
      .length;
    const targetPlayed = Math.floor(total * targetRatio);

    if (initialPlayed >= targetPlayed) {
      console.log(
        `PROGRESS_OK already reached target played=${initialPlayed}/${total}`,
      );
      return;
    }

    const teamIds = Array.from(
      new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId])),
    );
    const rosterRows = await prisma.teamPlayer.findMany({
      where: { teamId: { in: teamIds }, isActive: true },
      select: { teamId: true, playerId: true },
      take: 20000,
    });
    const playersByTeamId = new Map<string, string[]>();
    for (const r of rosterRows) {
      const arr = playersByTeamId.get(r.teamId) ?? [];
      arr.push(r.playerId);
      playersByTeamId.set(r.teamId, arr);
    }

    const needToPlay = targetPlayed - initialPlayed;
    const candidates = matches.filter((m) => !playedStatuses.has(m.status));

    let updated = 0;
    let goals = 0;
    let assists = 0;
    let cards = 0;

    for (const match of candidates) {
      if (updated >= needToPlay) break;
      const homePlayers = playersByTeamId.get(match.homeTeamId) ?? [];
      const awayPlayers = playersByTeamId.get(match.awayTeamId) ?? [];
      if (!homePlayers.length || !awayPlayers.length) continue;

      const score = buildScore(rng);
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

      updated += 1;
      goals += events.filter((e) => e.type === MatchEventType.GOAL).length;
      cards += events.filter((e) => e.type === MatchEventType.CARD).length;
      assists += events.filter((e) => e.type === MatchEventType.GOAL && !!e.payload?.assistId).length;
    }

    if (tournament.status !== TournamentStatus.ACTIVE) {
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: TournamentStatus.ACTIVE },
      });
    }

    const finalPlayed = initialPlayed + updated;
    console.log(`PROGRESS_OK tournament=${tournament.id} slug=${tournament.slug}`);
    console.log(`PROGRESS_NAME ${tournament.name}`);
    console.log(
      `PROGRESS_TARGET ratio=${targetRatio.toFixed(4)} targetPlayed=${targetPlayed}/${total}`,
    );
    console.log(`PROGRESS_RESULT played=${finalPlayed}/${total} updated=${updated}`);
    console.log(`PROGRESS_EVENTS goals=${goals} assists=${assists} cards=${cards}`);
  } finally {
    await app.close();
  }
}

void main();

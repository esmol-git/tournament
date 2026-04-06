import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  MatchEventType,
  MatchStatus,
  MatchTeamSide,
  MatchStage,
  TournamentFormat,
  TournamentStatus,
  UserRole,
} from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { MatchesService } from '../matches/matches.service';

type PlayedResult = { winnerTeamId: string; loserTeamId: string };
type SmokeTiming = { size: number; ms: number };

function isValidPlayoffSize(n: number): boolean {
  return Number.isInteger(n) && n >= 4 && n <= 256 && (n & (n - 1)) === 0;
}

function parseSmokeSizes(): number[] {
  const raw = process.env.SMOKE_PLAYOFF_SIZES?.trim();
  if (!raw) return [8, 16, 64];

  const parsed = raw.split(',').map((x) => Number(x.trim()));
  if (!parsed.length) return [8, 16, 64];

  const invalid = parsed.filter((n) => !isValidPlayoffSize(n));
  if (invalid.length) {
    throw new Error(
      `Invalid SMOKE_PLAYOFF_SIZES: ${raw}. Each value must be power of two in range 4..256.`,
    );
  }

  const uniq = [...new Set(parsed)];
  return uniq;
}

function winnerFromScoresOrPenalty(m: {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  events?: { teamSide?: MatchTeamSide | null; payload?: unknown }[];
}): PlayedResult | null {
  if (m.homeScore > m.awayScore) {
    return { winnerTeamId: m.homeTeamId, loserTeamId: m.awayTeamId };
  }
  if (m.awayScore > m.homeScore) {
    return { winnerTeamId: m.awayTeamId, loserTeamId: m.homeTeamId };
  }
  for (const e of m.events ?? []) {
    const p = e.payload as Record<string, unknown> | null | undefined;
    if (!p || p.metaType !== 'PENALTY_SCORE') continue;
    const h = p.homeScore;
    const a = p.awayScore;
    if (typeof h !== 'number' || typeof a !== 'number' || h === a) continue;
    if (h > a) return { winnerTeamId: m.homeTeamId, loserTeamId: m.awayTeamId };
    return { winnerTeamId: m.awayTeamId, loserTeamId: m.homeTeamId };
  }
  return null;
}

async function runForSize(
  size: number,
  prisma: PrismaService,
  tournamentsService: TournamentsService,
  matchesService: MatchesService,
) {
  const stamp = `${Date.now()}-${size}`;
  const tenant = await prisma.tenant.create({
    data: { name: `Smoke Tenant ${stamp}`, slug: `smoke-tenant-${stamp}` },
    select: { id: true },
  });

  try {
    const teams = await Promise.all(
      Array.from({ length: size }).map((_, i) =>
        prisma.team.create({
          data: {
            tenantId: tenant.id,
            name: `Smoke Team ${size}-${i + 1}`,
            slug: `smoke-team-${size}-${i + 1}-${stamp}`,
            rating: (i % 5) + 1,
          },
          select: { id: true },
        }),
      ),
    );

    const tournament = await prisma.tournament.create({
      data: {
        tenantId: tenant.id,
        name: `Smoke PLAYOFF ${size}`,
        slug: `smoke-playoff-${size}-${stamp}`,
        format: TournamentFormat.PLAYOFF,
        status: TournamentStatus.DRAFT,
        groupCount: 0,
        minTeams: size,
        pointsWin: 3,
        pointsDraw: 1,
        pointsLoss: 0,
        intervalDays: 7,
        allowedDays: [6, 0],
      },
      select: { id: true },
    });

    for (const t of teams) {
      await tournamentsService.addTeam(tournament.id, t.id);
    }

    await tournamentsService.generateCalendar(tournament.id, {
      startDate: '2026-04-01',
      roundsPerDay: 1,
      replaceExisting: true,
      intervalDays: 7,
      allowedDays: [6, 0],
      matchDurationMinutes: 50,
      matchBreakMinutes: 10,
      simultaneousMatches: 4,
      dayStartTimeDefault: '12:00',
      dayStartTimeOverrides: {},
    });

    const rounds = await prisma.match.findMany({
      where: { tournamentId: tournament.id, stage: MatchStage.PLAYOFF },
      select: { roundNumber: true },
      distinct: ['roundNumber'],
      orderBy: { roundNumber: 'asc' },
    });
    const roundNumbers = rounds.map((r) => r.roundNumber).sort((a, b) => a - b);

    for (const rn of roundNumbers) {
      const matches = await prisma.match.findMany({
        where: {
          tournamentId: tournament.id,
          stage: MatchStage.PLAYOFF,
          roundNumber: rn,
          playoffRound: { notIn: ['FINAL', 'THIRD_PLACE'] as any },
        },
        select: { id: true, homeTeamId: true, awayTeamId: true },
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      });
      if (!matches.length) continue;

      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        // First match in each size uses penalty tie-break smoke case.
        if (rn === roundNumbers[0] && i === 0) {
          await matchesService.updateProtocol(
            tournament.id,
            m.id,
            UserRole.TENANT_ADMIN,
            {
              homeScore: 1,
              awayScore: 1,
              status: MatchStatus.PLAYED,
              events: [
                {
                  type: MatchEventType.CUSTOM,
                  payload: {
                    metaType: 'PENALTY_SCORE',
                    homeScore: 4,
                    awayScore: 2,
                  },
                },
              ],
            },
          );
        } else {
          await matchesService.updateProtocol(
            tournament.id,
            m.id,
            UserRole.TENANT_ADMIN,
            {
              homeScore: 2,
              awayScore: 0,
              status: MatchStatus.PLAYED,
              events: [],
            },
          );
        }
      }
    }

    const [semis, final, third] = await Promise.all([
      prisma.match.findMany({
        where: {
          tournamentId: tournament.id,
          stage: MatchStage.PLAYOFF,
          playoffRound: 'SEMIFINAL',
        },
        select: {
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
          status: true,
          events: { select: { teamSide: true, payload: true } },
        },
      }),
      prisma.match.findFirst({
        where: {
          tournamentId: tournament.id,
          stage: MatchStage.PLAYOFF,
          playoffRound: 'FINAL',
        },
        select: { id: true, homeTeamId: true, awayTeamId: true },
      }),
      prisma.match.findFirst({
        where: {
          tournamentId: tournament.id,
          stage: MatchStage.PLAYOFF,
          playoffRound: 'THIRD_PLACE',
        },
        select: { id: true, homeTeamId: true, awayTeamId: true },
      }),
    ]);

    const playedSemis = semis.filter(
      (m) =>
        (m.status === MatchStatus.PLAYED ||
          m.status === MatchStatus.FINISHED) &&
        m.homeScore !== null &&
        m.awayScore !== null,
    );
    if (playedSemis.length >= 2 && final && third) {
      const r1 = winnerFromScoresOrPenalty({
        ...playedSemis[0],
        homeScore: playedSemis[0].homeScore as number,
        awayScore: playedSemis[0].awayScore as number,
      });
      const r2 = winnerFromScoresOrPenalty({
        ...playedSemis[1],
        homeScore: playedSemis[1].homeScore as number,
        awayScore: playedSemis[1].awayScore as number,
      });
      if (!r1 || !r2)
        throw new Error(`Could not resolve semifinal winners for size=${size}`);
      const finalSet = new Set([final.homeTeamId, final.awayTeamId]);
      const thirdSet = new Set([third.homeTeamId, third.awayTeamId]);
      if (
        !finalSet.has(r1.winnerTeamId) ||
        !finalSet.has(r2.winnerTeamId) ||
        !thirdSet.has(r1.loserTeamId) ||
        !thirdSet.has(r2.loserTeamId)
      ) {
        throw new Error(`Propagation mismatch for size=${size}`);
      }
    }

    console.log(`SMOKE_OK size=${size}`);
  } finally {
    await prisma
      .$transaction(async (tx) => {
        await tx.matchEvent.deleteMany({
          where: { match: { tournament: { tenantId: tenant.id } } },
        });
        await tx.match.deleteMany({
          where: { tournament: { tenantId: tenant.id } },
        });
        await tx.tournamentTableRow.deleteMany({
          where: { tournament: { tenantId: tenant.id } },
        });
        await tx.tournamentTeam.deleteMany({
          where: { tournament: { tenantId: tenant.id } },
        });
        await tx.tournamentMember.deleteMany({
          where: { tournament: { tenantId: tenant.id } },
        });
        await tx.tournamentGroup.deleteMany({
          where: { tournament: { tenantId: tenant.id } },
        });
        await tx.tournament.deleteMany({ where: { tenantId: tenant.id } });
        await tx.teamPlayer.deleteMany({
          where: { team: { tenantId: tenant.id } },
        });
        await tx.teamAdmin.deleteMany({
          where: { team: { tenantId: tenant.id } },
        });
        await tx.player.deleteMany({ where: { tenantId: tenant.id } });
        await tx.team.deleteMany({ where: { tenantId: tenant.id } });
        await tx.teamCategory.deleteMany({ where: { tenantId: tenant.id } });
        await tx.refreshToken.deleteMany({ where: { tenantId: tenant.id } });
        await tx.tenant.delete({ where: { id: tenant.id } });
      })
      .catch(() => null);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function main() {
  const startedAt = Date.now();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const prisma = app.get(PrismaService);
    const tournamentsService = app.get(TournamentsService);
    const matchesService = app.get(MatchesService);

    const sizes = parseSmokeSizes();
    const timings: SmokeTiming[] = [];
    console.log(`SMOKE_SIZES ${sizes.join(',')}`);
    for (const size of sizes) {
      const t0 = Date.now();
      await runForSize(size, prisma, tournamentsService, matchesService);
      const ms = Date.now() - t0;
      timings.push({ size, ms });
      console.log(`SMOKE_TIME size=${size} duration=${formatDuration(ms)}`);
    }
    const totalMs = Date.now() - startedAt;
    console.log(`SMOKE_TOTAL duration=${formatDuration(totalMs)}`);
    console.log('SMOKE_ALL_OK');
  } finally {
    await app.close();
  }
}

void main();

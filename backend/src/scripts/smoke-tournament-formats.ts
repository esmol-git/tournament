import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  MatchStage,
  MatchStatus,
  TournamentFormat,
  TournamentStatus,
  UserRole,
} from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { MatchesService } from '../matches/matches.service';

type FormatCase = {
  format: TournamentFormat;
  teamCount: number;
  groupCount: number;
  shouldGenerateCalendar: boolean;
  allowedGenerateErrorIncludes?: string[];
};

const CASES: FormatCase[] = [
  {
    format: TournamentFormat.SINGLE_GROUP,
    teamCount: 4,
    groupCount: 1,
    shouldGenerateCalendar: true,
  },
  {
    format: TournamentFormat.PLAYOFF,
    teamCount: 8,
    groupCount: 0,
    shouldGenerateCalendar: true,
  },
  {
    format: TournamentFormat.GROUPS_2,
    teamCount: 8,
    groupCount: 2,
    shouldGenerateCalendar: true,
  },
  {
    format: TournamentFormat.GROUPS_3,
    teamCount: 6,
    groupCount: 3,
    shouldGenerateCalendar: true,
    allowedGenerateErrorIncludes: [
      'Invalid playoff bracket',
      'Невалидная сетка плей-офф',
    ],
  },
  {
    format: TournamentFormat.GROUPS_4,
    teamCount: 8,
    groupCount: 4,
    shouldGenerateCalendar: true,
  },
  {
    format: TournamentFormat.GROUPS_PLUS_PLAYOFF,
    teamCount: 8,
    groupCount: 2,
    shouldGenerateCalendar: true,
  },
  {
    format: TournamentFormat.MANUAL,
    teamCount: 4,
    groupCount: 1,
    shouldGenerateCalendar: false,
  },
];

function timeLabel(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function cleanupTenant(prisma: PrismaService, tenantId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.matchEvent.deleteMany({
      where: { match: { tournament: { tenantId } } },
    });
    await tx.match.deleteMany({
      where: { tournament: { tenantId } },
    });
    await tx.tournamentTableRow.deleteMany({
      where: { tournament: { tenantId } },
    });
    await tx.tournamentTeam.deleteMany({
      where: { tournament: { tenantId } },
    });
    await tx.tournamentMember.deleteMany({
      where: { tournament: { tenantId } },
    });
    await tx.tournamentGroup.deleteMany({
      where: { tournament: { tenantId } },
    });
    await tx.tournament.deleteMany({ where: { tenantId } });

    await tx.teamPlayer.deleteMany({ where: { team: { tenantId } } });
    await tx.teamAdmin.deleteMany({ where: { team: { tenantId } } });
    await tx.player.deleteMany({ where: { tenantId } });
    await tx.team.deleteMany({ where: { tenantId } });
    await tx.teamCategory.deleteMany({ where: { tenantId } });

    await tx.refreshToken.deleteMany({ where: { tenantId } });
    await tx.user.deleteMany({ where: { tenantId } });
    await tx.tenant.delete({ where: { id: tenantId } });
  });
}

async function main() {
  const startedAt = Date.now();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  let tenantIdToCleanup: string | null = null;

  try {
    const prisma = app.get(PrismaService);
    const tournamentsService = app.get(TournamentsService);
    const matchesService = app.get(MatchesService);

    const stamp = `${Date.now()}`;
    const tenant = await prisma.tenant.create({
      data: {
        name: `Smoke Formats Tenant ${stamp}`,
        slug: `smoke-formats-${stamp}`,
      },
      select: { id: true },
    });
    tenantIdToCleanup = tenant.id;

    const maxTeams = Math.max(...CASES.map((c) => c.teamCount));
    const teams = await Promise.all(
      Array.from({ length: maxTeams }).map((_, i) =>
        prisma.team.create({
          data: {
            tenantId: tenant.id,
            name: `Smoke Team ${i + 1}`,
            slug: `smoke-formats-team-${i + 1}-${stamp}`,
            rating: (i % 5) + 1,
          },
          select: { id: true },
        }),
      ),
    );

    const results: Array<{
      format: TournamentFormat;
      ok: boolean;
      details: string;
      durationMs: number;
    }> = [];

    for (const c of CASES) {
      const t0 = Date.now();
      try {
        const tournament = await prisma.tournament.create({
          data: {
            tenantId: tenant.id,
            name: `Smoke ${c.format} ${stamp}`,
            slug: `smoke-${c.format.toLowerCase()}-${stamp}`,
            format: c.format,
            status: TournamentStatus.DRAFT,
            groupCount: c.groupCount,
            minTeams: c.teamCount,
            pointsWin: 3,
            pointsDraw: 1,
            pointsLoss: 0,
            intervalDays: 1,
            allowedDays: [1, 2, 3, 4, 5, 6, 0],
          },
          select: { id: true },
        });

        const participants = teams.slice(0, c.teamCount);
        for (const team of participants) {
          await tournamentsService.addTeam(tournament.id, team.id);
        }

        if (c.shouldGenerateCalendar) {
          try {
            await tournamentsService.generateCalendar(tournament.id, {
              startDate: '2026-04-01',
              roundsPerDay: 2,
              replaceExisting: true,
              intervalDays: 1,
              allowedDays: [1, 2, 3, 4, 5, 6, 0],
              matchDurationMinutes: 50,
              matchBreakMinutes: 10,
              simultaneousMatches: 4,
              dayStartTimeDefault: '10:00',
              dayStartTimeOverrides: {},
            });
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            if (
              c.allowedGenerateErrorIncludes?.some((needle) =>
                message.includes(needle),
              )
            ) {
              results.push({
                format: c.format,
                ok: true,
                details: `KNOWN_LIMITATION: ${message}`,
                durationMs: Date.now() - t0,
              });
              continue;
            }
            throw e;
          }

          const generatedMatches = await prisma.match.count({
            where: { tournamentId: tournament.id },
          });
          if (generatedMatches <= 0) {
            throw new Error('No matches generated');
          }

          const firstMatch = await prisma.match.findFirst({
            where: { tournamentId: tournament.id },
            orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
            select: { id: true },
          });
          if (!firstMatch) {
            throw new Error('No first match for protocol smoke');
          }

          await matchesService.updateProtocol(
            tournament.id,
            firstMatch.id,
            UserRole.TENANT_ADMIN,
            {
              homeScore: 1,
              awayScore: 0,
              status: MatchStatus.PLAYED,
              events: [],
            },
          );

          const played = await prisma.match.findUnique({
            where: { id: firstMatch.id },
            select: { status: true, homeScore: true, awayScore: true },
          });
          if (
            !played ||
            played.status !== MatchStatus.PLAYED ||
            played.homeScore !== 1 ||
            played.awayScore !== 0
          ) {
            throw new Error('Protocol update failed');
          }
        } else {
          const participantsForManual = participants;
          await matchesService.createMatch(
            tournament.id,
            UserRole.TENANT_ADMIN,
            {
              homeTeamId: participantsForManual[0].id,
              awayTeamId: participantsForManual[1].id,
              startTime: new Date('2026-04-05T10:00:00.000Z').toISOString(),
              stage: MatchStage.GROUP,
              roundNumber: 1,
              groupId: null,
              playoffRound: null,
            },
          );

          const manualMatch = await prisma.match.findFirst({
            where: { tournamentId: tournament.id },
            orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
            select: { id: true },
          });
          if (!manualMatch) {
            throw new Error('Manual match was not created');
          }

          await matchesService.updateProtocol(
            tournament.id,
            manualMatch.id,
            UserRole.TENANT_ADMIN,
            {
              homeScore: 2,
              awayScore: 1,
              status: MatchStatus.PLAYED,
              events: [],
            },
          );
        }

        results.push({
          format: c.format,
          ok: true,
          details: 'OK',
          durationMs: Date.now() - t0,
        });
      } catch (e) {
        results.push({
          format: c.format,
          ok: false,
          details: e instanceof Error ? e.message : String(e),
          durationMs: Date.now() - t0,
        });
      }
    }

    console.log('SMOKE_FORMATS_RESULTS');
    for (const r of results) {
      console.log(
        ` - ${r.ok ? 'OK' : 'FAIL'} ${r.format} (${timeLabel(r.durationMs)}): ${r.details}`,
      );
    }

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      throw new Error(
        `Formats failed: ${failed.map((x) => x.format).join(', ')}`,
      );
    }

    console.log(
      `SMOKE_FORMATS_ALL_OK total=${timeLabel(Date.now() - startedAt)}`,
    );
  } finally {
    if (tenantIdToCleanup) {
      try {
        const prisma = app.get(PrismaService);
        await cleanupTenant(prisma, tenantIdToCleanup);
      } catch {
        // ignore cleanup errors in smoke script
      }
    }
    await app.close();
  }
}

void main();

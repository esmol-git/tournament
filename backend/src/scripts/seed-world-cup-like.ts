import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { TournamentFormat, TournamentStatus } from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const tournamentsService = app.get(TournamentsService);

    const tenantSlug = process.env.WORLD_CUP_TENANT_SLUG?.trim() || 'load-test-1775032507811';
    const tournamentName =
      process.env.WORLD_CUP_NAME?.trim() || `World Cup Style 32 (${Date.now()})`;

    const tenant = await prisma.tenant.findFirst({
      where: { slug: tenantSlug },
      select: { id: true, slug: true },
    });
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantSlug}`);
    }

    const teams = await prisma.team.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
      orderBy: [{ rating: 'desc' }, { createdAt: 'asc' }],
      take: 32,
    });
    if (teams.length < 32) {
      throw new Error(`Need at least 32 teams in tenant ${tenantSlug}. Found ${teams.length}.`);
    }

    const stamp = Date.now();
    const tournament = await prisma.tournament.create({
      data: {
        tenantId: tenant.id,
        name: tournamentName,
        slug: `world-cup-style-${stamp}`,
        format: TournamentFormat.GROUPS_PLUS_PLAYOFF,
        status: TournamentStatus.DRAFT,
        groupCount: 8,
        playoffQualifiersPerGroup: 2,
        minTeams: 32,
        pointsWin: 3,
        pointsDraw: 1,
        pointsLoss: 0,
        intervalDays: 1,
        allowedDays: [1, 2, 3, 4, 5, 6, 0],
        matchDurationMinutes: 40,
        matchBreakMinutes: 5,
        simultaneousMatches: 16,
        dayStartTimeDefault: '08:00',
      },
      select: { id: true, slug: true, name: true },
    });

    for (const team of teams) {
      await tournamentsService.addTeam(tournament.id, team.id);
    }

    await tournamentsService.generateCalendar(tournament.id, {
      startDate: '2026-06-01',
      roundsPerDay: 1,
      replaceExisting: true,
      intervalDays: 1,
      allowedDays: [1, 2, 3, 4, 5, 6, 0],
      matchDurationMinutes: 40,
      matchBreakMinutes: 5,
      simultaneousMatches: 16,
      dayStartTimeDefault: '08:00',
      dayStartTimeOverrides: {},
    });

    const [groupMatches, playoffMatches] = await Promise.all([
      prisma.match.count({
        where: { tournamentId: tournament.id, stage: 'GROUP' as any },
      }),
      prisma.match.count({
        where: { tournamentId: tournament.id, stage: 'PLAYOFF' as any },
      }),
    ]);

    console.log(`WORLD_CUP_OK tenant=${tenant.slug}`);
    console.log(`TOURNAMENT id=${tournament.id}`);
    console.log(`TOURNAMENT slug=${tournament.slug}`);
    console.log(`TOURNAMENT name=${tournament.name}`);
    console.log(`MATCHES group=${groupMatches} playoff=${playoffMatches}`);
  } finally {
    await app.close();
  }
}

void main();

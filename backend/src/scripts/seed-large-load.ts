import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { TournamentFormat, TournamentStatus } from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';

function toInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function formatMs(ms: number): string {
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

    const teamsCount = toInt(process.env.LOAD_TEAMS, 70);
    const playersCount = toInt(process.env.LOAD_PLAYERS, 500);
    const groupsTournamentTeams = toInt(process.env.LOAD_GROUPS_TEAMS, 32); // 8 groups x 4
    const playoffTournamentTeams = toInt(process.env.LOAD_PLAYOFF_TEAMS, 64);
    const groupsCount = 8;
    const qualifiersPerGroup = 2;

    if (groupsTournamentTeams % groupsCount !== 0) {
      throw new Error(
        `LOAD_GROUPS_TEAMS must be divisible by ${groupsCount}. Got ${groupsTournamentTeams}.`,
      );
    }
    if (groupsTournamentTeams < groupsCount * 2) {
      throw new Error(
        `LOAD_GROUPS_TEAMS must be at least ${groupsCount * 2}. Got ${groupsTournamentTeams}.`,
      );
    }
    if (playoffTournamentTeams < 4 || (playoffTournamentTeams & (playoffTournamentTeams - 1)) !== 0) {
      throw new Error(
        `LOAD_PLAYOFF_TEAMS must be power of two and >= 4. Got ${playoffTournamentTeams}.`,
      );
    }
    if (teamsCount < Math.max(groupsTournamentTeams, playoffTournamentTeams)) {
      throw new Error(
        `LOAD_TEAMS must be >= ${Math.max(groupsTournamentTeams, playoffTournamentTeams)}.`,
      );
    }

    const stamp = Date.now();
    const tenant = await prisma.tenant.create({
      data: {
        name: `Load Test Tenant ${stamp}`,
        slug: `load-test-${stamp}`,
      },
      select: { id: true, slug: true, name: true },
    });

    console.log(`LOAD_TENANT slug=${tenant.slug} id=${tenant.id}`);

    const tTeams0 = Date.now();
    const teams = await Promise.all(
      Array.from({ length: teamsCount }).map((_, i) =>
        prisma.team.create({
          data: {
            tenantId: tenant.id,
            name: `Load Team ${String(i + 1).padStart(3, '0')}`,
            slug: `load-team-${String(i + 1).padStart(3, '0')}-${stamp}`,
            rating: (i % 5) + 1,
          },
          select: { id: true, name: true },
        }),
      ),
    );
    console.log(`LOAD_TEAMS_CREATED count=${teams.length} duration=${formatMs(Date.now() - tTeams0)}`);

    const tPlayers0 = Date.now();
    const players = await Promise.all(
      Array.from({ length: playersCount }).map((_, i) =>
        prisma.player.create({
          data: {
            tenantId: tenant.id,
            firstName: `Player${i + 1}`,
            lastName: `Load${i + 1}`,
          },
          select: { id: true },
        }),
      ),
    );
    console.log(
      `LOAD_PLAYERS_CREATED count=${players.length} duration=${formatMs(Date.now() - tPlayers0)}`,
    );

    const tLinks0 = Date.now();
    for (let i = 0; i < players.length; i++) {
      const team = teams[i % teams.length];
      await prisma.teamPlayer.create({
        data: {
          teamId: team.id,
          playerId: players[i].id,
          jerseyNumber: (i % 99) + 1,
          isActive: true,
        },
      });
    }
    console.log(`LOAD_TEAM_PLAYERS_CREATED count=${players.length} duration=${formatMs(Date.now() - tLinks0)}`);

    const groupsTournament = await prisma.tournament.create({
      data: {
        tenantId: tenant.id,
        name: `Load 8x4 + Playoff (${stamp})`,
        slug: `load-groups-playoff-${stamp}`,
        format: TournamentFormat.GROUPS_PLUS_PLAYOFF,
        status: TournamentStatus.DRAFT,
        groupCount: groupsCount,
        playoffQualifiersPerGroup: qualifiersPerGroup,
        minTeams: groupsTournamentTeams,
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
      select: { id: true, name: true },
    });
    for (const team of teams.slice(0, groupsTournamentTeams)) {
      await tournamentsService.addTeam(groupsTournament.id, team.id);
    }
    await tournamentsService.generateCalendar(groupsTournament.id, {
      startDate: '2026-04-01',
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

    const [groupsGroupMatches, groupsPlayoffMatches] = await Promise.all([
      prisma.match.count({
        where: { tournamentId: groupsTournament.id, stage: 'GROUP' as any },
      }),
      prisma.match.count({
        where: { tournamentId: groupsTournament.id, stage: 'PLAYOFF' as any },
      }),
    ]);

    const playoffTournament = await prisma.tournament.create({
      data: {
        tenantId: tenant.id,
        name: `Load Playoff ${playoffTournamentTeams} (${stamp})`,
        slug: `load-playoff-${playoffTournamentTeams}-${stamp}`,
        format: TournamentFormat.PLAYOFF,
        status: TournamentStatus.DRAFT,
        groupCount: 0,
        minTeams: playoffTournamentTeams,
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
      select: { id: true, name: true },
    });
    for (const team of teams.slice(0, playoffTournamentTeams)) {
      await tournamentsService.addTeam(playoffTournament.id, team.id);
    }
    await tournamentsService.generateCalendar(playoffTournament.id, {
      startDate: '2026-04-01',
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

    const playoffMatches = await prisma.match.count({
      where: { tournamentId: playoffTournament.id },
    });

    console.log('LOAD_SUMMARY');
    console.log(` - tenant: ${tenant.name} (${tenant.slug})`);
    console.log(` - teams: ${teams.length}`);
    console.log(` - players: ${players.length}`);
    console.log(
      ` - tournament(groups+playoff): id=${groupsTournament.id}, groupMatches=${groupsGroupMatches}, playoffMatches=${groupsPlayoffMatches}`,
    );
    console.log(
      ` - tournament(playoff): id=${playoffTournament.id}, matches=${playoffMatches}`,
    );
    console.log(`LOAD_OK duration=${formatMs(Date.now() - startedAt)}`);
  } finally {
    await app.close();
  }
}

void main();

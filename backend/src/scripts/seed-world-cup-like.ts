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

const PENALTIES_META = 'PENALTY_SCORE';
const MIN_PLAYERS_PER_TEAM = 14;
const TEAM_COUNT = 48;
const GROUP_COUNT = 12;

/** Жеребьёвка в духе ЧМ-2026: 12 групп × 4 команды, рейтинг 1..5 для сида и симуляции. */
const WORLD_CUP_DRAW: Array<Array<{ name: string; rating: number }>> = [
  [
    { name: 'Мексика', rating: 4 },
    { name: 'ЮАР', rating: 3 },
    { name: 'Южная Корея', rating: 4 },
    { name: 'Дания', rating: 4 },
  ],
  [
    { name: 'Канада', rating: 3 },
    { name: 'Катар', rating: 3 },
    { name: 'Швейцария', rating: 4 },
    { name: 'Алжир', rating: 3 },
  ],
  [
    { name: 'Бразилия', rating: 5 },
    { name: 'Марокко', rating: 4 },
    { name: 'Гаити', rating: 2 },
    { name: 'Шотландия', rating: 3 },
  ],
  [
    { name: 'США', rating: 4 },
    { name: 'Парагвай', rating: 3 },
    { name: 'Австралия', rating: 3 },
    { name: 'Турция', rating: 4 },
  ],
  [
    { name: 'Германия', rating: 5 },
    { name: 'Кюрасао', rating: 2 },
    { name: 'Кот-д’Ивуар', rating: 4 },
    { name: 'Эквадор', rating: 3 },
  ],
  [
    { name: 'Нидерланды', rating: 5 },
    { name: 'Япония', rating: 4 },
    { name: 'Тунис', rating: 3 },
    { name: 'Украина', rating: 4 },
  ],
  [
    { name: 'Бельгия', rating: 4 },
    { name: 'Египет', rating: 3 },
    { name: 'Иран', rating: 3 },
    { name: 'Новая Зеландия', rating: 2 },
  ],
  [
    { name: 'Испания', rating: 5 },
    { name: 'Кабо-Верде', rating: 2 },
    { name: 'Саудовская Аравия', rating: 3 },
    { name: 'Уругвай', rating: 4 },
  ],
  [
    { name: 'Франция', rating: 5 },
    { name: 'Сенегал', rating: 4 },
    { name: 'Норвегия', rating: 4 },
    { name: 'Иордания', rating: 2 },
  ],
  [
    { name: 'Аргентина', rating: 5 },
    { name: 'Австрия', rating: 4 },
    { name: 'Чили', rating: 3 },
    { name: 'Колумбия', rating: 4 },
  ],
  [
    { name: 'Португалия', rating: 5 },
    { name: 'Узбекистан', rating: 3 },
    { name: 'Гана', rating: 3 },
    { name: 'Панама', rating: 2 },
  ],
  [
    { name: 'Англия', rating: 5 },
    { name: 'Хорватия', rating: 4 },
    { name: 'Индонезия', rating: 2 },
    { name: 'Венесуэла', rating: 3 },
  ],
];

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

function nationSlug(groupIndex: number, sortOrder: number, stamp: number): string {
  return `wc2026-g${groupIndex + 1}-p${sortOrder + 1}-${stamp}`;
}

async function ensureNationalTeams(
  prisma: PrismaService,
  tenantId: string,
  stamp: number,
): Promise<Array<{ id: string; name: string; rating: number; groupIndex: number }>> {
  const flat = WORLD_CUP_DRAW.flatMap((group, groupIndex) =>
    group.map((n, sortOrder) => ({ ...n, groupIndex, sortOrder })),
  );
  if (flat.length !== TEAM_COUNT) {
    throw new Error(`WORLD_CUP_DRAW must contain ${TEAM_COUNT} teams`);
  }

  const names = flat.map((n) => n.name);
  const existing = await prisma.team.findMany({
    where: { tenantId, name: { in: names } },
    select: { id: true, name: true, rating: true },
  });
  const byName = new Map(existing.map((t) => [t.name, t]));

  const out: Array<{ id: string; name: string; rating: number; groupIndex: number }> =
    [];

  for (const nation of flat) {
    const found = byName.get(nation.name);
    if (found) {
      if (found.rating !== nation.rating) {
        await prisma.team.update({
          where: { id: found.id },
          data: { rating: nation.rating },
        });
      }
      out.push({
        id: found.id,
        name: found.name,
        rating: nation.rating,
        groupIndex: nation.groupIndex,
      });
      continue;
    }

    const created = await prisma.team.create({
      data: {
        tenantId,
        name: nation.name,
        slug: nationSlug(nation.groupIndex, nation.sortOrder, stamp),
        rating: nation.rating,
      },
      select: { id: true, name: true },
    });
    out.push({
      id: created.id,
      name: created.name,
      rating: nation.rating,
      groupIndex: nation.groupIndex,
    });
  }

  return out;
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
  if (rng() < 0.75) {
    const winner = randInt(rng, 3, 5);
    const loser = randInt(rng, 0, Math.min(4, winner - 1));
    return rng() < 0.5
      ? { home: winner, away: loser }
      : { home: loser, away: winner };
  }
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


function buildBiasedGroupScore(
  rng: () => number,
  homeRating: number,
  awayRating: number,
): { home: number; away: number } {
  const homeBias = homeRating / (homeRating + awayRating);
  const drawChance = 0.22;
  const roll = rng();
  if (roll < drawChance) {
    const g = randInt(rng, 0, 2);
    return { home: g, away: g };
  }
  const homeWins = roll < drawChance + (1 - drawChance) * homeBias;
  if (homeWins) {
    const home = randInt(rng, 1, 3);
    const away = randInt(rng, 0, Math.max(0, home - 1));
    return { home, away };
  }
  const away = randInt(rng, 1, 3);
  const home = randInt(rng, 0, Math.max(0, away - 1));
  return { home, away };
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
                firstName: `WC${String(idx + 1).padStart(2, '0')}`,
                lastName:
                  team.name.replace(/\s+/g, '').slice(0, 16) +
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

async function ensureTournamentGroups(
  prisma: PrismaService,
  tenantId: string,
  tournamentId: string,
) {
  const groups: Array<{ id: string; name: string; sortOrder: number }> = [];
  for (let i = 0; i < GROUP_COUNT; i++) {
    const name = `Группа ${String.fromCharCode(65 + i)}`;
    const g = await prisma.tournamentGroup.upsert({
      where: {
        tournamentId_name: { tournamentId, name },
      },
      create: {
        tenantId,
        tournamentId,
        name,
        sortOrder: i + 1,
      },
      update: { sortOrder: i + 1 },
      select: { id: true, name: true, sortOrder: true },
    });
    groups.push(g);
  }
  return groups;
}

async function simulateTournament(
  prisma: PrismaService,
  matchesService: MatchesService,
  tournamentId: string,
  ratingByTeamId: Map<string, number>,
  seed: number,
) {
  const rng = makeRng(seed);
  const matches = await prisma.match.findMany({
    where: { tournamentId },
    select: {
      id: true,
      stage: true,
      roundNumber: true,
      homeTeamId: true,
      awayTeamId: true,
      status: true,
    },
    orderBy: [
      { stage: 'asc' },
      { roundNumber: 'asc' },
      { startTime: 'asc' },
      { id: 'asc' },
    ],
  });

  const teamIds = Array.from(
    new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId])),
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

  let played = 0;
  let groupPlayed = 0;
  let playoffPlayed = 0;
  let penaltiesExamples = 0;

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (match.status === MatchStatus.PLAYED) continue;

    const homePlayers = playersByTeamId.get(match.homeTeamId) ?? [];
    const awayPlayers = playersByTeamId.get(match.awayTeamId) ?? [];
    if (!homePlayers.length || !awayPlayers.length) continue;

    const events: ProtocolEventInput[] = [];
    let homeScore: number;
    let awayScore: number;

    if (match.stage === MatchStage.GROUP) {
      const score = buildBiasedGroupScore(
        rng,
        ratingByTeamId.get(match.homeTeamId) ?? 3,
        ratingByTeamId.get(match.awayTeamId) ?? 3,
      );
      homeScore = score.home;
      awayScore = score.away;
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
      groupPlayed += 1;
    } else {
      homeScore = randInt(rng, 0, 3);
      awayScore = randInt(rng, 0, 3);

      if (homeScore === awayScore) {
        const pens = generatePenaltyScore(rng);
        events.push({
          type: 'CUSTOM',
          payload: {
            metaType: PENALTIES_META,
            homeScore: pens.home,
            awayScore: pens.away,
          },
        });
        penaltiesExamples += 1;
      }

      events.push(
        ...buildGoalEvents(
          rng,
          MatchTeamSide.HOME,
          homeScore,
          homePlayers,
          5,
          120,
        ),
      );
    events.push(
      ...buildGoalEvents(
        rng,
        MatchTeamSide.AWAY,
        awayScore,
        awayPlayers,
        5,
        120,
      ),
    );
      playoffPlayed += 1;
    }

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
  }

  return { played, groupPlayed, playoffPlayed, penaltiesExamples };
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
      process.env.WORLD_CUP_TENANT_SLUG?.trim() || 'default';
    const tournamentName =
      process.env.WORLD_CUP_NAME?.trim() || `ЧМ-2026 (демо ${Date.now()})`;
    const simulate = process.env.WORLD_CUP_SIMULATE !== '0';
    const seed = toPositiveInt(process.env.WORLD_CUP_SEED, 20260611);
    const stamp = Date.now();

    const tenant = await prisma.tenant.findFirst({
      where: { slug: tenantSlug },
      select: { id: true, slug: true },
    });
    if (!tenant) {
      throw new Error(
        `Tenant not found: ${tenantSlug}. Set WORLD_CUP_TENANT_SLUG or create tenant first.`,
      );
    }

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { subscriptionPlan: 'WORLD_CUP' },
    });

    const nations = await ensureNationalTeams(prisma, tenant.id, stamp);
    const rosterStats = await ensureTeamRosters(
      prisma,
      tenant.id,
      nations,
      MIN_PLAYERS_PER_TEAM,
    );

    const tournament = await prisma.tournament.create({
      data: {
        tenantId: tenant.id,
        name: tournamentName,
        slug: `chm-2026-${stamp}`,
        format: TournamentFormat.GROUPS_PLUS_PLAYOFF,
        status: TournamentStatus.DRAFT,
        groupCount: GROUP_COUNT,
        playoffQualifiersPerGroup: 2,
        playoffBestThirdPlaceCount: 8,
        minTeams: TEAM_COUNT,
        maxTeams: TEAM_COUNT,
        pointsWin: 3,
        pointsDraw: 1,
        pointsLoss: 0,
        intervalDays: 1,
        allowedDays: [1, 2, 3, 4, 5, 6, 0],
        matchDurationMinutes: 90,
        matchBreakMinutes: 15,
        simultaneousMatches: 8,
        dayStartTimeDefault: '12:00',
      },
      select: { id: true, slug: true, name: true },
    });

    for (const nation of nations) {
      await tournamentsService.addTeam(tournament.id, nation.id);
    }

    const groups = await ensureTournamentGroups(
      prisma,
      tenant.id,
      tournament.id,
    );

    const layout = nations.map((n) => {
      const groupTeams = WORLD_CUP_DRAW[n.groupIndex];
      const sortOrder = groupTeams.findIndex((g) => g.name === n.name);
      return {
        teamId: n.id,
        groupId: groups[n.groupIndex].id,
        groupSortOrder: sortOrder >= 0 ? sortOrder : 0,
      };
    });
    await tournamentsService.syncTeamsGroupLayout(tournament.id, layout);

    await tournamentsService.generateCalendar(tournament.id, {
      startDate: '2026-06-11',
      roundsPerDay: 1,
      replaceExisting: true,
      intervalDays: 2,
      allowedDays: [1, 2, 3, 4, 5, 6, 0],
      matchDurationMinutes: 50,
      matchBreakMinutes: 10,
      simultaneousMatches: 16,
      dayStartTimeDefault: '10:00',
      dayStartTimeOverrides: {},
    });

    const [groupMatches, playoffMatches] = await Promise.all([
      prisma.match.count({
        where: { tournamentId: tournament.id, stage: MatchStage.GROUP },
      }),
      prisma.match.count({
        where: { tournamentId: tournament.id, stage: MatchStage.PLAYOFF },
      }),
    ]);

    const ratingByTeamId = new Map(nations.map((n) => [n.id, n.rating]));

    let simStats = {
      played: 0,
      groupPlayed: 0,
      playoffPlayed: 0,
      penaltiesExamples: 0,
    };
    if (simulate) {
      simStats = await simulateTournament(
        prisma,
        matchesService,
        tournament.id,
        ratingByTeamId,
        seed,
      );
    }

    console.log(`WORLD_CUP_OK tenant=${tenant.slug}`);
    console.log(`TOURNAMENT id=${tournament.id}`);
    console.log(`TOURNAMENT slug=${tournament.slug}`);
    console.log(`TOURNAMENT name=${tournament.name}`);
    console.log(
      `FORMAT groups=${GROUP_COUNT} qualifiers=2 bestThird=8 playoffSize=32`,
    );
    console.log(`MATCHES group=${groupMatches} playoff=${playoffMatches}`);
    console.log(`ROSTER playersCreated=${rosterStats.createdPlayers}`);
    console.log(
      `SIMULATION played=${simStats.played} group=${simStats.groupPlayed} playoff=${simStats.playoffPlayed} penalties=${simStats.penaltiesExamples}`,
    );
  } finally {
    await app.close();
  }
}

void main();

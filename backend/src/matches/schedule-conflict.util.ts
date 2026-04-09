import { MatchStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

const SCHEDULE_ACTIVE: MatchStatus[] = [
  MatchStatus.SCHEDULED,
  MatchStatus.LIVE,
];

/** Полуинтервалы [a0,a1) и [b0,b1) пересекаются по положительной длине. */
export function intervalsOverlapMs(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): boolean {
  return a0 < b1 && b0 < a1;
}

type MatchSlice = {
  id: string;
  startTime: Date;
  homeTeamId: string;
  awayTeamId: string;
  stadiumId: string | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
  tournament: { name: string } | null;
};

function teamLabel(m: MatchSlice, tid: string): string {
  return m.homeTeamId === tid ? m.homeTeam.name : m.awayTeam.name;
}

/**
 * Предупреждения о пересечении слотов (команда / площадка) с другими матчами тенанта.
 * Длительность матча задаётся в минутах (как в турнире); для пересечений используется одинаковый слот.
 */
export async function collectScheduleWarningsForMatch(
  prisma: PrismaService,
  opts: {
    tenantId: string;
    startTime: Date;
    homeTeamId: string;
    awayTeamId: string;
    excludeMatchId?: string;
    stadiumId: string | null | undefined;
    durationMinutes: number;
  },
): Promise<string[]> {
  const D = Math.max(1, opts.durationMinutes) * 60 * 1000;
  const ourStart = opts.startTime.getTime();
  const ourEnd = ourStart + D;
  const windowMin = new Date(ourStart - 2 * D);
  const windowMax = new Date(ourEnd + 2 * D);

  const teams = await prisma.team.findMany({
    where: { id: { in: [opts.homeTeamId, opts.awayTeamId] } },
    select: { id: true, name: true },
  });
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

  const overlapping = await prisma.match.findMany({
    where: {
      tenantId: opts.tenantId,
      startTime: { gte: windowMin, lte: windowMax },
      ...(opts.excludeMatchId ? { id: { not: opts.excludeMatchId } } : {}),
      status: { in: SCHEDULE_ACTIVE },
      OR: [
        { homeTeamId: { in: [opts.homeTeamId, opts.awayTeamId] } },
        { awayTeamId: { in: [opts.homeTeamId, opts.awayTeamId] } },
      ],
    },
    select: {
      id: true,
      startTime: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      tournament: { select: { name: true } },
    },
  });

  const warnings: string[] = [];
  const seenTeam = new Set<string>();

  for (const m of overlapping) {
    const os = m.startTime.getTime();
    const oe = os + D;
    if (!intervalsOverlapMs(ourStart, ourEnd, os, oe)) continue;

    for (const tid of [opts.homeTeamId, opts.awayTeamId]) {
      if (m.homeTeamId !== tid && m.awayTeamId !== tid) continue;
      const key = `${m.id}:${tid}`;
      if (seenTeam.has(key)) continue;
      seenTeam.add(key);
      const label = teamNameById.get(tid) ?? tid;
      const trName = m.tournament?.name ?? 'Свободный матч';
      warnings.push(
        `Команда «${label}» пересекается по времени с матчем: ${m.homeTeam.name} — ${m.awayTeam.name} (турнир «${trName}»).`,
      );
    }
  }

  const sid =
    opts.stadiumId !== undefined &&
    opts.stadiumId !== null &&
    String(opts.stadiumId).trim()
      ? String(opts.stadiumId).trim()
      : null;
  if (sid) {
    const pitchCandidates = await prisma.match.findMany({
      where: {
        tenantId: opts.tenantId,
        stadiumId: sid,
        startTime: { gte: windowMin, lte: windowMax },
        ...(opts.excludeMatchId ? { id: { not: opts.excludeMatchId } } : {}),
        status: { in: SCHEDULE_ACTIVE },
      },
      select: {
        id: true,
        startTime: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        tournament: { select: { name: true } },
      },
    });
    const seenPitch = new Set<string>();
    for (const p of pitchCandidates) {
      const ps = p.startTime.getTime();
      const pe = ps + D;
      if (!intervalsOverlapMs(ourStart, ourEnd, ps, pe)) continue;
      if (seenPitch.has(p.id)) continue;
      seenPitch.add(p.id);
      const trName = p.tournament?.name ?? 'Свободный матч';
      warnings.push(
        `Площадка пересекается по времени с матчем: ${p.homeTeam.name} — ${p.awayTeam.name} (турнир «${trName}»).`,
      );
    }
  }

  return warnings;
}

/**
 * После массового создания матчей турнира — предупреждения для каждого нового матча
 * (пересечения между собой и с другими турнирами / свободными матчами).
 */
export async function collectScheduleWarningsAfterCalendarGeneration(
  prisma: PrismaService,
  tournamentId: string,
  tenantId: string,
  durationMinutes: number,
): Promise<string[]> {
  const D = Math.max(1, durationMinutes) * 60 * 1000;

  const newMatches = await prisma.match.findMany({
    where: { tournamentId, status: { in: SCHEDULE_ACTIVE } },
    select: {
      id: true,
      startTime: true,
      homeTeamId: true,
      awayTeamId: true,
      stadiumId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      tournament: { select: { name: true } },
    },
  });
  if (!newMatches.length) return [];

  const newIds = new Set(newMatches.map((m) => m.id));
  let minT = Infinity;
  let maxT = -Infinity;
  const teamIds = new Set<string>();
  const stadiumIds = new Set<string>();
  for (const m of newMatches) {
    teamIds.add(m.homeTeamId);
    teamIds.add(m.awayTeamId);
    const t = m.startTime.getTime();
    minT = Math.min(minT, t);
    maxT = Math.max(maxT, t);
    if (m.stadiumId) stadiumIds.add(m.stadiumId);
  }

  const teamIdArr = [...teamIds];
  const windowMin = new Date(minT - 2 * D);
  const windowMax = new Date(maxT + 2 * D);

  const orFilters: Array<Record<string, unknown>> = [
    { homeTeamId: { in: teamIdArr } },
    { awayTeamId: { in: teamIdArr } },
  ];
  if (stadiumIds.size) {
    orFilters.push({ stadiumId: { in: [...stadiumIds] } });
  }

  const others = await prisma.match.findMany({
    where: {
      tenantId,
      status: { in: SCHEDULE_ACTIVE },
      startTime: { gte: windowMin, lte: windowMax },
      id: { notIn: [...newIds] },
      OR: orFilters,
    },
    select: {
      id: true,
      startTime: true,
      homeTeamId: true,
      awayTeamId: true,
      stadiumId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      tournament: { select: { name: true } },
    },
  });

  const pool: MatchSlice[] = [...newMatches, ...others];
  const seenMsg = new Set<string>();
  const out: string[] = [];

  for (const m of newMatches) {
    const ms = m.startTime.getTime();
    const me = ms + D;
    for (const o of pool) {
      if (o.id === m.id) continue;
      const os = o.startTime.getTime();
      const oe = os + D;
      if (!intervalsOverlapMs(ms, me, os, oe)) continue;

      const pair = [m.id, o.id].sort().join(':');

      for (const tid of [m.homeTeamId, m.awayTeamId]) {
        if (o.homeTeamId !== tid && o.awayTeamId !== tid) continue;
        const key = `team:${pair}:${tid}`;
        if (seenMsg.has(key)) continue;
        seenMsg.add(key);
        const label = teamLabel(m, tid);
        const trName = o.tournament?.name ?? 'Свободный матч';
        out.push(
          `Команда «${label}» пересекается по времени с матчем: ${o.homeTeam.name} — ${o.awayTeam.name} (турнир «${trName}»).`,
        );
      }

      if (m.stadiumId && o.stadiumId && m.stadiumId === o.stadiumId) {
        const key = `stadium:${pair}`;
        if (seenMsg.has(key)) continue;
        seenMsg.add(key);
        const trName = o.tournament?.name ?? 'Свободный матч';
        out.push(
          `Площадка пересекается по времени с матчем: ${o.homeTeam.name} — ${o.awayTeam.name} (турнир «${trName}»).`,
        );
      }
    }
  }

  return out;
}

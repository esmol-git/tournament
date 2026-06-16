import { BadRequestException } from '@nestjs/common';
import {
  Prisma,
  TournamentRosterPlayerStatus,
} from '@prisma/client';

const PROTOCOL_PLAYER_INCLUDE = {
  player: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      position: true,
      photoUrl: true,
    },
  },
} as const;

export type ProtocolRosterPlayerRow = {
  playerId: string
  jerseyNumber: number | null
  player: {
    id: string
    firstName: string
    lastName: string
    birthDate: Date | null
    position: string | null
    photoUrl: string | null
  }
};

export async function listProtocolPlayersForTeam(
  prisma: Prisma.TransactionClient | PrismaServiceLike,
  tournamentId: string,
  teamId: string,
): Promise<{ items: ProtocolRosterPlayerRow[]; source: 'tournament_roster' | 'team_catalog' }> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      rosterMinPlayers: true,
      rosterMaxPlayers: true,
    },
  });

  const tournamentRows = await prisma.tournamentTeamPlayer.findMany({
    where: {
      tournamentId,
      teamId,
      status: {
        in: [
          TournamentRosterPlayerStatus.SUBMITTED,
          TournamentRosterPlayerStatus.APPROVED,
        ],
      },
    },
    orderBy: [{ jerseyNumber: 'asc' }, { createdAt: 'asc' }],
    include: PROTOCOL_PLAYER_INCLUDE,
  });

  const usesTournamentRoster =
    tournament?.rosterMinPlayers != null ||
    tournament?.rosterMaxPlayers != null ||
    tournamentRows.length > 0;

  if (usesTournamentRoster) {
    return {
      source: 'tournament_roster',
      items: tournamentRows.map((row) => ({
        playerId: row.playerId,
        jerseyNumber: row.jerseyNumber,
        player: row.player,
      })),
    };
  }

  const teamPlayers = await prisma.teamPlayer.findMany({
    where: { teamId, isActive: true, player: { isActive: true } },
    orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
    include: {
      player: PROTOCOL_PLAYER_INCLUDE.player,
    },
  });

  return {
    source: 'team_catalog',
    items: teamPlayers.map((tp) => ({
      playerId: tp.playerId,
      jerseyNumber: tp.jerseyNumber,
      player: tp.player,
    })),
  };
}

type PrismaServiceLike = {
  tournament: Prisma.TournamentDelegate
  tournamentTeamPlayer: Prisma.TournamentTeamPlayerDelegate
  teamPlayer: Prisma.TeamPlayerDelegate
};

export async function assertProtocolPlayersAllowed(
  prisma: PrismaServiceLike,
  params: {
    tournamentId: string
    homeTeamId: string
    awayTeamId: string
    events: Array<{
      type?: string
      teamSide?: string | null
      playerId?: string | null
      payload?: Record<string, unknown> | null
    }>
  },
) {
  const [home, away] = await Promise.all([
    listProtocolPlayersForTeam(prisma, params.tournamentId, params.homeTeamId),
    listProtocolPlayersForTeam(prisma, params.tournamentId, params.awayTeamId),
  ]);

  const homeAllowed = new Set(home.items.map((p) => p.playerId));
  const awayAllowed = new Set(away.items.map((p) => p.playerId));

  const disqualified = await prisma.tournamentTeamPlayer.findMany({
    where: {
      tournamentId: params.tournamentId,
      teamId: { in: [params.homeTeamId, params.awayTeamId] },
      status: TournamentRosterPlayerStatus.DISQUALIFIED,
    },
    select: { playerId: true },
  });
  const disqualifiedIds = new Set(disqualified.map((r) => r.playerId));

  const check = (playerId: string, side: 'HOME' | 'AWAY') => {
    const id = playerId.trim();
    if (!id) return;
    if (disqualifiedIds.has(id)) {
      throw new BadRequestException(
        'Игрок дисквалифицирован на этом турнире и не может участвовать в протоколе',
      );
    }
    const roster = side === 'HOME' ? home : away;
    if (roster.source === 'tournament_roster') {
      const allowed = side === 'HOME' ? homeAllowed : awayAllowed;
      if (!allowed.has(id)) {
        throw new BadRequestException(
          'Игрок не в подтверждённом составе команды на этот турнир',
        );
      }
    }
  };

  for (const e of params.events) {
    const side = e.teamSide === 'HOME' || e.teamSide === 'AWAY' ? e.teamSide : null;
    if (!side) continue;
    if (e.playerId) check(String(e.playerId), side);
    const payload =
      e.payload && typeof e.payload === 'object'
        ? (e.payload as Record<string, unknown>)
        : null;
    const assistId = String(payload?.assistId ?? payload?.assistPlayerId ?? '').trim();
    const playerInId = String(payload?.playerInId ?? '').trim();
    if (assistId) check(assistId, side);
    if (playerInId) check(playerInId, side);
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TournamentRosterPlayerStatus,
  TournamentStatus,
  UserRole,
} from '@prisma/client';
import { JwtPayload } from '../auth/jwt.strategy';
import { assertTournamentStaffCanManage } from '../auth/tournament-staff-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { assertPlayerFitsTeamCategory } from '../teams/team-category-player.assert';
import { assertPlayerFitsTournamentEligibility } from '../teams/eligibility-policy.util';
import { getEligibilityWarningsForTeamTournament } from '../teams/eligibility-warnings.util';
import { SetTournamentRosterDto } from './dto/set-tournament-roster.dto';
import { ImportTournamentRosterCsvDto } from './dto/import-tournament-roster-csv.dto';
import { ImportTournamentRosterXlsxDto } from './dto/import-tournament-roster-xlsx.dto';
import { SetTournamentRosterSanctionDto } from './dto/set-tournament-roster-sanction.dto';
import { listProtocolPlayersForTeam } from './tournament-protocol-roster.util';
import {
  buildRosterTemplateCsv,
  normalizePersonKey,
  parseRosterCsv,
  parseRosterXlsx,
  sameUtcDate,
} from './tournament-roster-csv.util';

const ROSTER_PLAYER_INCLUDE = {
  player: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      gender: true,
      position: true,
    },
  },
} as const;

@Injectable()
export class TournamentRostersService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadTournamentContext(tournamentId: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        ageGroupId: true,
        eligibilityPolicyId: true,
        regulationMode: true,
        editionId: true,
        rosterMinPlayers: true,
        rosterMaxPlayers: true,
        rosterDeadlineAt: true,
        eligibilityProfile: true,
      },
    });
    if (!t) throw new NotFoundException('Турнир не найден');
    return t;
  }

  private async assertTeamInTournament(
    tournamentId: string,
    teamId: string,
    tenantId: string,
  ) {
    const link = await this.prisma.tournamentTeam.findUnique({
      where: { tournamentId_teamId: { tournamentId, teamId } },
      select: { teamId: true },
    });
    if (!link) {
      throw new BadRequestException('Команда не участвует в этом турнире');
    }
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, tenantId },
      select: { id: true, teamCategoryId: true, ageGroupId: true },
    });
    if (!team) throw new BadRequestException('Команда не найдена');
    return team;
  }

  private async assertPlayersFitTournamentEligibility(
    tournament: {
      id: string;
      tenantId: string;
      ageGroupId: string | null;
      eligibilityPolicyId: string | null;
      regulationMode: import('@prisma/client').TournamentRegulationMode;
      editionId: string | null;
    },
    playerIds: string[],
  ) {
    if (!playerIds.length) return;
    for (const playerId of playerIds) {
      await assertPlayerFitsTournamentEligibility(
        this.prisma,
        tournament.tenantId,
        tournament,
        playerId,
      );
    }
  }

  async listProtocolPlayers(
    tournamentId: string,
    teamId: string,
    user: JwtPayload,
  ) {
    const tournament = await this.loadTournamentContext(tournamentId);
    if (
      user.tenantId !== tournament.tenantId &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Нет доступа к ресурсу другой организации');
    }
    const allowedRoles: UserRole[] = [
      UserRole.SUPER_ADMIN,
      UserRole.TENANT_ADMIN,
      UserRole.TOURNAMENT_ADMIN,
      UserRole.MODERATOR,
    ];
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException('Недостаточно прав');
    }
    await this.assertTeamInTournament(tournamentId, teamId, tournament.tenantId);
    return listProtocolPlayersForTeam(this.prisma, tournamentId, teamId);
  }

  private assertRosterCount(
    count: number,
    min: number | null,
    max: number | null,
  ) {
    if (min != null && count < min) {
      throw new BadRequestException(
        `В составе должно быть не менее ${min} игроков`,
      );
    }
    if (max != null && count > max) {
      throw new BadRequestException(
        `В составе должно быть не более ${max} игроков`,
      );
    }
  }

  private assertRosterDeadline(deadline: Date | null) {
    if (deadline && deadline.getTime() < Date.now()) {
      throw new BadRequestException('Срок подачи состава истёк');
    }
  }

  private mapRow(row: {
    id: string
    playerId: string
    jerseyNumber: number | null
    status: TournamentRosterPlayerStatus
    sanctionNote: string | null
    sanctionedAt: Date | null
    suspendedMatchesRemaining: number
    yellowCardsAccumulated: number
    player: {
      id: string
      firstName: string
      lastName: string
      birthDate: Date | null
      gender: string | null
      position: string | null
    }
  }) {
    return {
      id: row.id,
      playerId: row.playerId,
      jerseyNumber: row.jerseyNumber,
      status: row.status,
      sanctionNote: row.sanctionNote,
      sanctionedAt: row.sanctionedAt,
      suspendedMatchesRemaining: row.suspendedMatchesRemaining,
      yellowCardsAccumulated: row.yellowCardsAccumulated,
      player: row.player,
    };
  }

  private isRosterStatusFinalized(status: TournamentRosterPlayerStatus): boolean {
    return (
      status === TournamentRosterPlayerStatus.SUBMITTED ||
      status === TournamentRosterPlayerStatus.DISQUALIFIED ||
      status === TournamentRosterPlayerStatus.APPROVED
    );
  }

  async listForTeam(
    tournamentId: string,
    teamId: string,
    user: JwtPayload,
  ) {
    const tournament = await this.loadTournamentContext(tournamentId);
    if (
      user.tenantId !== tournament.tenantId &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Нет доступа к ресурсу другой организации');
    }

    const isStaff =
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.TENANT_ADMIN ||
      user.role === UserRole.TOURNAMENT_ADMIN;

    if (!isStaff && user.role !== UserRole.MODERATOR) {
      throw new ForbiddenException('Недостаточно прав');
    }

    await this.assertTeamInTournament(tournamentId, teamId, tournament.tenantId);

    const rows = await this.prisma.tournamentTeamPlayer.findMany({
      where: { tournamentId, teamId },
      orderBy: [{ jerseyNumber: 'asc' }, { createdAt: 'asc' }],
      include: ROSTER_PLAYER_INCLUDE,
    });

    const eligibilityWarnings = await getEligibilityWarningsForTeamTournament(
      this.prisma,
      tournament.tenantId,
      tournamentId,
      teamId,
    );

    return {
      items: rows.map((r) => this.mapRow(r)),
      limits: {
        minPlayers: tournament.rosterMinPlayers,
        maxPlayers: tournament.rosterMaxPlayers,
        deadlineAt: tournament.rosterDeadlineAt,
        eligibilityProfile: tournament.eligibilityProfile,
      },
      eligibilityWarnings,
    };
  }

  async getEligibilityWarnings(
    tournamentId: string,
    teamId: string,
    user: JwtPayload,
  ) {
    const tournament = await this.loadTournamentContext(tournamentId);
    if (
      user.tenantId !== tournament.tenantId &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Нет доступа к ресурсу другой организации');
    }
    await assertTournamentStaffCanManage(this.prisma, tournamentId, user);
    await this.assertTeamInTournament(tournamentId, teamId, tournament.tenantId);

    const warnings = await getEligibilityWarningsForTeamTournament(
      this.prisma,
      tournament.tenantId,
      tournamentId,
      teamId,
    );
    return { warnings };
  }

  async setForTeam(
    tournamentId: string,
    teamId: string,
    dto: SetTournamentRosterDto,
    user: JwtPayload,
  ) {
    const tournament = await this.loadTournamentContext(tournamentId);
    if (
      user.tenantId !== tournament.tenantId &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Нет доступа к ресурсу другой организации');
    }

    const isStaff =
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.TENANT_ADMIN ||
      user.role === UserRole.TOURNAMENT_ADMIN;

    if (!isStaff) {
      throw new ForbiddenException('Недостаточно прав');
    }

    if (tournament.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException(
        'Состав можно менять только пока турнир в черновике',
      );
    }

    this.assertRosterDeadline(tournament.rosterDeadlineAt);

    const team = await this.assertTeamInTournament(
      tournamentId,
      teamId,
      tournament.tenantId,
    );

    if (
      tournament.ageGroupId &&
      team.ageGroupId &&
      team.ageGroupId !== tournament.ageGroupId
    ) {
      throw new BadRequestException(
        'Возрастная группа команды не совпадает с турниром',
      );
    }

    const playerIds = dto.players.map((p) => p.playerId);
    const uniqueIds = new Set(playerIds);
    if (uniqueIds.size !== playerIds.length) {
      throw new BadRequestException('Игрок не может быть указан дважды');
    }

    const jerseyNumbers = dto.players
      .map((p) => p.jerseyNumber)
      .filter((n): n is number => n != null);
    const uniqueNumbers = new Set(jerseyNumbers);
    if (uniqueNumbers.size !== jerseyNumbers.length) {
      throw new BadRequestException('Номера в составе должны быть уникальными');
    }

    this.assertRosterCount(
      playerIds.length,
      tournament.rosterMinPlayers,
      tournament.rosterMaxPlayers,
    );

    if (playerIds.length) {
      const teamPlayers = await this.prisma.teamPlayer.findMany({
        where: {
          teamId,
          playerId: { in: playerIds },
          isActive: true,
          player: { isActive: true },
        },
        select: { playerId: true },
      });
      const allowed = new Set(teamPlayers.map((tp) => tp.playerId));
      const missing = playerIds.filter((id) => !allowed.has(id));
      if (missing.length) {
        throw new BadRequestException(
          'Все игроки должны быть в активном составе команды',
        );
      }

      if (team.teamCategoryId) {
        for (const pid of playerIds) {
          await assertPlayerFitsTeamCategory(
            this.prisma,
            tournament.tenantId,
            team.teamCategoryId,
            pid,
          );
        }
      }
      await this.assertPlayersFitTournamentEligibility(tournament, playerIds);
    }

    const previousRows = await this.prisma.tournamentTeamPlayer.findMany({
      where: { tournamentId, teamId },
      select: {
        playerId: true,
        status: true,
        sanctionNote: true,
        sanctionedAt: true,
        sanctionedByUserId: true,
      },
    });
    const previousByPlayer = new Map(
      previousRows.map((r) => [r.playerId, r] as const),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.tournamentTeamPlayer.deleteMany({
        where: { tournamentId, teamId },
      });
      if (dto.players.length) {
        await tx.tournamentTeamPlayer.createMany({
          data: dto.players.map((p) => {
            const prev = previousByPlayer.get(p.playerId);
            const disqualified =
              prev?.status === TournamentRosterPlayerStatus.DISQUALIFIED;
            return {
              tenantId: tournament.tenantId,
              tournamentId,
              teamId,
              playerId: p.playerId,
              jerseyNumber: p.jerseyNumber ?? null,
              status: disqualified
                ? TournamentRosterPlayerStatus.DISQUALIFIED
                : TournamentRosterPlayerStatus.DRAFT,
              sanctionNote: disqualified ? prev?.sanctionNote ?? null : null,
              sanctionedAt: disqualified ? prev?.sanctionedAt ?? null : null,
              sanctionedByUserId: disqualified
                ? prev?.sanctionedByUserId ?? null
                : null,
            };
          }),
        });
      }
    });

    return this.listForTeam(tournamentId, teamId, user);
  }

  async submitForTeam(
    tournamentId: string,
    teamId: string,
    user: JwtPayload,
  ) {
    const tournament = await this.loadTournamentContext(tournamentId);
    await assertTournamentStaffCanManage(
      this.prisma,
      tournamentId,
      user,
    );

    this.assertRosterDeadline(tournament.rosterDeadlineAt);
    await this.assertTeamInTournament(tournamentId, teamId, tournament.tenantId);

    const count = await this.prisma.tournamentTeamPlayer.count({
      where: { tournamentId, teamId },
    });
    this.assertRosterCount(
      count,
      tournament.rosterMinPlayers,
      tournament.rosterMaxPlayers,
    );

    await this.prisma.tournamentTeamPlayer.updateMany({
      where: {
        tournamentId,
        teamId,
        status: { not: TournamentRosterPlayerStatus.DISQUALIFIED },
      },
      data: { status: TournamentRosterPlayerStatus.SUBMITTED },
    });

    return this.listForTeam(tournamentId, teamId, user);
  }

  async listEligibleCandidates(
    tournamentId: string,
    teamId: string,
    user: JwtPayload,
  ) {
    const tournament = await this.loadTournamentContext(tournamentId);
    if (
      user.tenantId !== tournament.tenantId &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Нет доступа к ресурсу другой организации');
    }

    const isStaff =
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.TENANT_ADMIN ||
      user.role === UserRole.TOURNAMENT_ADMIN;
    if (!isStaff && user.role !== UserRole.MODERATOR) {
      throw new ForbiddenException('Недостаточно прав');
    }

    const team = await this.assertTeamInTournament(
      tournamentId,
      teamId,
      tournament.tenantId,
    );

    const teamPlayers = await this.prisma.teamPlayer.findMany({
      where: { teamId, isActive: true, player: { isActive: true } },
      include: {
        player: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            gender: true,
            position: true,
          },
        },
      },
      orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
    });

    const items: Array<{
      playerId: string
      eligible: boolean
      reason?: string
      player: (typeof teamPlayers)[number]['player']
      jerseyNumber: number | null
    }> = [];

    for (const tp of teamPlayers) {
      let eligible = true;
      let reason: string | undefined;
      if (team.teamCategoryId) {
        try {
          await assertPlayerFitsTeamCategory(
            this.prisma,
            tournament.tenantId,
            team.teamCategoryId,
            tp.playerId,
          );
        } catch (e: unknown) {
          eligible = false;
          reason =
            e instanceof BadRequestException
              ? String(e.message)
              : 'Не подходит по правилам категории';
        }
      }
      if (eligible) {
        try {
          await assertPlayerFitsTournamentEligibility(
            this.prisma,
            tournament.tenantId,
            tournament,
            tp.playerId,
          );
        } catch (e: unknown) {
          eligible = false;
          reason =
            e instanceof BadRequestException
              ? String(e.message)
              : 'Не подходит по регламенту турнира';
        }
      }
      items.push({
        playerId: tp.playerId,
        eligible,
        reason,
        player: tp.player,
        jerseyNumber: tp.jerseyNumber,
      });
    }

    return { items };
  }

  getRosterTemplateCsv(): string {
    return buildRosterTemplateCsv();
  }

  async importFromCsv(
    tournamentId: string,
    teamId: string,
    dto: ImportTournamentRosterCsvDto,
    user: JwtPayload,
  ) {
    const createMissing = dto.createMissingPlayers !== false;
    let parsed;
    try {
      parsed = parseRosterCsv(dto.csvText);
    } catch (e: unknown) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Неверный CSV',
      );
    }

    const tournament = await this.loadTournamentContext(tournamentId);
    const team = await this.assertTeamInTournament(
      tournamentId,
      teamId,
      tournament.tenantId,
    );

    const teamPlayers = await this.prisma.teamPlayer.findMany({
      where: { teamId, isActive: true, player: { isActive: true } },
      include: {
        player: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
          },
        },
      },
    });

    const byKey = new Map<string, string>();
    const byNameOnly = new Map<string, string[]>();
    for (const tp of teamPlayers) {
      const key = normalizePersonKey(
        tp.player.lastName,
        tp.player.firstName,
        tp.player.birthDate,
      );
      byKey.set(key, tp.player.id);
      const nameKey = `${tp.player.lastName.trim().toLowerCase()}|${tp.player.firstName.trim().toLowerCase()}`;
      const arr = byNameOnly.get(nameKey) ?? [];
      arr.push(tp.player.id);
      byNameOnly.set(nameKey, arr);
    }

    const errors: Array<{ row: number; message: string }> = [];
    const rosterPlayers: { playerId: string; jerseyNumber?: number }[] = [];
    const usedPlayerIds = new Set<string>();

    for (const row of parsed) {
      const key = normalizePersonKey(
        row.lastName,
        row.firstName,
        row.birthDate,
      );
      let playerId = byKey.get(key);

      if (!playerId && !row.birthDate) {
        const nameKey = `${row.lastName.trim().toLowerCase()}|${row.firstName.trim().toLowerCase()}`;
        const candidates = byNameOnly.get(nameKey) ?? [];
        if (candidates.length === 1) {
          playerId = candidates[0];
        } else if (candidates.length > 1) {
          errors.push({
            row: row.rowNumber,
            message:
              'Несколько игроков с таким ФИО — укажите дату рождения в CSV',
          });
          continue;
        }
      }

      if (!playerId && createMissing) {
        try {
          playerId = await this.prisma.$transaction(async (tx) => {
            const player = await tx.player.create({
              data: {
                tenantId: tournament.tenantId,
                lastName: row.lastName,
                firstName: row.firstName,
                birthDate: row.birthDate ?? undefined,
                position: row.position ?? undefined,
              },
            });
            await tx.teamPlayer.deleteMany({ where: { playerId: player.id } });
            await tx.teamPlayer.create({
              data: {
                teamId,
                playerId: player.id,
                jerseyNumber: row.jerseyNumber ?? undefined,
                position: row.position ?? undefined,
                isActive: true,
              },
            });
            if (team.teamCategoryId) {
              await assertPlayerFitsTeamCategory(
                tx,
                tournament.tenantId,
                team.teamCategoryId,
                player.id,
              );
            }
            return player.id;
          });
          byKey.set(key, playerId);
          const nameKey = `${row.lastName.trim().toLowerCase()}|${row.firstName.trim().toLowerCase()}`;
          const arr = byNameOnly.get(nameKey) ?? [];
          arr.push(playerId);
          byNameOnly.set(nameKey, arr);
        } catch (e: unknown) {
          errors.push({
            row: row.rowNumber,
            message:
              e instanceof BadRequestException
                ? String(e.message)
                : 'Не удалось создать игрока',
          });
          continue;
        }
      }

      if (!playerId) {
        errors.push({
          row: row.rowNumber,
          message: 'Игрок не найден в команде — включите создание или добавьте в справочник',
        });
        continue;
      }

      if (usedPlayerIds.has(playerId)) {
        errors.push({
          row: row.rowNumber,
          message: 'Дубликат игрока в файле',
        });
        continue;
      }

      const tp = teamPlayers.find((x) => x.player.id === playerId);
      if (
        row.birthDate &&
        tp?.player.birthDate &&
        !sameUtcDate(row.birthDate, tp.player.birthDate)
      ) {
        errors.push({
          row: row.rowNumber,
          message: 'Дата рождения не совпадает с каталогом',
        });
        continue;
      }

      if (team.teamCategoryId) {
        try {
          await assertPlayerFitsTeamCategory(
            this.prisma,
            tournament.tenantId,
            team.teamCategoryId,
            playerId,
          );
        } catch (e: unknown) {
          errors.push({
            row: row.rowNumber,
            message:
              e instanceof BadRequestException
                ? String(e.message)
                : 'Не подходит по правилам категории',
          });
          continue;
        }
      }

      try {
        await assertPlayerFitsTournamentEligibility(
          this.prisma,
          tournament.tenantId,
          tournament,
          playerId,
        );
      } catch (e: unknown) {
        errors.push({
          row: row.rowNumber,
          message:
            e instanceof BadRequestException
              ? String(e.message)
              : 'Не подходит по регламенту турнира',
        });
        continue;
      }

      usedPlayerIds.add(playerId);
      rosterPlayers.push({
        playerId,
        ...(row.jerseyNumber != null ? { jerseyNumber: row.jerseyNumber } : {}),
      });
    }

    if (!rosterPlayers.length) {
      throw new BadRequestException({
        message: 'Не удалось импортировать ни одного игрока',
        errors,
      });
    }

    const roster = await this.setForTeam(
      tournamentId,
      teamId,
      { players: rosterPlayers },
      user,
    );

    return {
      imported: rosterPlayers.length,
      skipped: errors.length,
      errors,
      roster,
    };
  }

  async importFromXlsx(
    tournamentId: string,
    teamId: string,
    dto: ImportTournamentRosterXlsxDto,
    user: JwtPayload,
  ) {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(dto.fileBase64, 'base64');
    } catch {
      throw new BadRequestException('Неверный формат файла');
    }
    if (!buffer.length) {
      throw new BadRequestException('Пустой файл');
    }
    let parsed;
    try {
      parsed = parseRosterXlsx(buffer);
    } catch (e: unknown) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Неверный XLSX',
      );
    }
    const csvText = [
      'lastName,firstName,birthDate,jerseyNumber,position',
      ...parsed.map((r) =>
        [
          r.lastName,
          r.firstName,
          r.birthDate ? r.birthDate.toISOString().slice(0, 10) : '',
          r.jerseyNumber ?? '',
          r.position ?? '',
        ].join(','),
      ),
    ].join('\n');
    return this.importFromCsv(
      tournamentId,
      teamId,
      { csvText, createMissingPlayers: dto.createMissingPlayers },
      user,
    );
  }

  async setPlayerSanction(
    tournamentId: string,
    teamId: string,
    playerId: string,
    dto: SetTournamentRosterSanctionDto,
    user: JwtPayload,
  ) {
    await assertTournamentStaffCanManage(this.prisma, tournamentId, user);
    const tournament = await this.loadTournamentContext(tournamentId);
    if (tournament.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException(
        'Санкции можно менять только пока турнир в черновике',
      );
    }
    await this.assertTeamInTournament(tournamentId, teamId, tournament.tenantId);

    const row = await this.prisma.tournamentTeamPlayer.findUnique({
      where: {
        tournamentId_teamId_playerId: { tournamentId, teamId, playerId },
      },
      include: ROSTER_PLAYER_INCLUDE,
    });
    if (!row) throw new NotFoundException('Игрок не в составе турнира');

    if (dto.disqualified) {
      if (row.status === TournamentRosterPlayerStatus.DRAFT) {
        throw new BadRequestException('Сначала подтвердите состав игрока');
      }
      if (row.status === TournamentRosterPlayerStatus.DISQUALIFIED) {
        return this.mapRow(row);
      }
      const updated = await this.prisma.tournamentTeamPlayer.update({
        where: { id: row.id },
        data: {
          status: TournamentRosterPlayerStatus.DISQUALIFIED,
          sanctionNote: dto.note?.trim() || null,
          sanctionedAt: new Date(),
          sanctionedByUserId: user.sub,
        },
        include: ROSTER_PLAYER_INCLUDE,
      });
      return this.mapRow(updated);
    }

    if (row.status !== TournamentRosterPlayerStatus.DISQUALIFIED) {
      return this.mapRow(row);
    }
    const updated = await this.prisma.tournamentTeamPlayer.update({
      where: { id: row.id },
      data: {
        status: TournamentRosterPlayerStatus.SUBMITTED,
        sanctionNote: null,
        sanctionedAt: null,
        sanctionedByUserId: null,
      },
      include: ROSTER_PLAYER_INCLUDE,
    });
    return this.mapRow(updated);
  }

  async getSummaryForTournament(tournamentId: string, user: JwtPayload) {
    const tournament = await this.loadTournamentContext(tournamentId);
    if (
      user.tenantId !== tournament.tenantId &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Нет доступа к ресурсу другой организации');
    }

    const teams = await this.prisma.tournamentTeam.findMany({
      where: { tournamentId },
      orderBy: { createdAt: 'asc' },
      include: { team: { select: { id: true, name: true } } },
    });

    const rosterRows = await this.prisma.tournamentTeamPlayer.findMany({
      where: { tournamentId },
      select: { teamId: true, status: true },
    });

    const statsByTeam = new Map<string, { count: number; submitted: boolean }>();
    for (const tt of teams) {
      statsByTeam.set(tt.teamId, { count: 0, submitted: true });
    }
    for (const row of rosterRows) {
      const stat = statsByTeam.get(row.teamId);
      if (!stat) continue;
      stat.count += 1;
      if (!this.isRosterStatusFinalized(row.status)) {
        stat.submitted = false;
      }
    }

    const min = tournament.rosterMinPlayers;
    const max = tournament.rosterMaxPlayers;
    const requiresRoster = min != null || max != null;

    const items = teams.map((tt) => {
      const stat = statsByTeam.get(tt.teamId) ?? { count: 0, submitted: false };
      let ok = true;
      let reason: string | undefined;
      if (!requiresRoster) {
        ok = stat.count === 0 || stat.submitted;
        if (!ok) reason = 'Состав не подтверждён';
      } else if (stat.count === 0) {
        ok = false;
        reason = 'Состав не заполнен';
      } else if (!stat.submitted) {
        ok = false;
        reason = 'Состав не подтверждён';
      } else if (min != null && stat.count < min) {
        ok = false;
        reason = `Меньше минимума (${min})`;
      } else if (max != null && stat.count > max) {
        ok = false;
        reason = `Больше максимума (${max})`;
      }
      return {
        teamId: tt.teamId,
        teamName: tt.team.name,
        playerCount: stat.count,
        status: stat.count === 0 ? 'EMPTY' : stat.submitted ? 'SUBMITTED' : 'DRAFT',
        ok,
        reason,
      };
    });

    return {
      items,
      allConfirmed: items.length > 0 && items.every((i) => i.ok),
      requiresRoster,
      limits: {
        minPlayers: min,
        maxPlayers: max,
      },
    };
  }

  async confirmAllForTournament(tournamentId: string, user: JwtPayload) {
    await assertTournamentStaffCanManage(this.prisma, tournamentId, user);
    const tournament = await this.loadTournamentContext(tournamentId);
    if (tournament.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException(
        'Составы можно менять только пока турнир в черновике',
      );
    }

    const teams = await this.prisma.tournamentTeam.findMany({
      where: { tournamentId },
      select: { teamId: true, team: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const results: Array<{
      teamId: string
      teamName: string
      ok: boolean
      playerCount?: number
      message?: string
    }> = [];

    for (const tt of teams) {
      try {
        const { items } = await this.listEligibleCandidates(
          tournamentId,
          tt.teamId,
          user,
        );
        const eligible = items.filter((c) => c.eligible);
        const min = tournament.rosterMinPlayers ?? 1;
        const max = tournament.rosterMaxPlayers ?? eligible.length;

        if (eligible.length < min) {
          results.push({
            teamId: tt.teamId,
            teamName: tt.team.name,
            ok: false,
            message: `Подходящих игроков: ${eligible.length}, нужно минимум ${min}`,
          });
          continue;
        }

        const picked = eligible.slice(0, max);
        await this.setForTeam(
          tournamentId,
          tt.teamId,
          {
            players: picked.map((p) => ({
              playerId: p.playerId,
              ...(p.jerseyNumber != null ? { jerseyNumber: p.jerseyNumber } : {}),
            })),
          },
          user,
        );
        await this.submitForTeam(tournamentId, tt.teamId, user);
        results.push({
          teamId: tt.teamId,
          teamName: tt.team.name,
          ok: true,
          playerCount: picked.length,
        });
      } catch (e: unknown) {
        results.push({
          teamId: tt.teamId,
          teamName: tt.team.name,
          ok: false,
          message:
            e instanceof BadRequestException
              ? String(e.message)
              : 'Не удалось подтвердить состав',
        });
      }
    }

    const confirmed = results.filter((r) => r.ok).length;
    return {
      confirmed,
      failed: results.length - confirmed,
      results,
      summary: await this.getSummaryForTournament(tournamentId, user),
    };
  }
}

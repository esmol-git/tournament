import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { CreateTeamPlayerDto } from './dto/create-team-player.dto';
import { CreateTeamPlayersBulkDto } from './dto/create-team-players-bulk.dto';
import { TeamQueryDto } from './dto/team-query.dto';
import { TeamPlayersQueryDto } from './dto/team-players-query.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { UpdateTeamPlayerDto } from './dto/update-team-player.dto';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private readonly parseYmdToLocalBoundary = (
    ymd: string,
    endOfDay: boolean,
  ) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      return new Date(
        y,
        mo - 1,
        d,
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0,
      );
    }
    const dt = new Date(ymd);
    return new Date(
      dt.getFullYear(),
      dt.getMonth(),
      dt.getDate(),
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    );
  };

  private buildTeamAccessWhere(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    teamId: string,
  ) {
    const where: Prisma.TeamWhereInput = {
      id: teamId,
      tenantId,
    };
    if (actorRole === 'TEAM_ADMIN') {
      where.admins = { some: { userId: actorUserId } };
    }
    return where;
  }

  private async assertPlayerMatchesTeamCategory(
    tenantId: string,
    teamId: string,
    playerId: string,
  ) {
    const [team, player] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: teamId, tenantId },
        select: {
          id: true,
          name: true,
          category: true,
        },
      }),
      this.prisma.player.findFirst({
        where: { id: playerId, tenantId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          birthDate: true,
          gender: true,
        },
      }),
    ]);
    if (!team) throw new NotFoundException('Team not found');
    if (!player) throw new NotFoundException('Player not found');
    if (!team.category) return;
    const category = await this.prisma.teamCategory.findFirst({
      where: { tenantId, name: { equals: team.category, mode: 'insensitive' } },
      select: {
        name: true,
        rules: {
          select: {
            type: true,
            minBirthYear: true,
            maxBirthYear: true,
            requireBirthDate: true,
            allowedGenders: true,
          },
        },
      },
    });
    if (!category) return;
    const rules = category.rules;

    for (const rule of rules) {
      if (rule.type === 'AGE') {
        if (rule.requireBirthDate && !player.birthDate) {
          throw new BadRequestException(
              `Player "${player.lastName} ${player.firstName}" has no birth date, but category "${category.name}" requires it`,
          );
        }
        if (rule.minBirthYear != null) {
          if (!player.birthDate) {
            throw new BadRequestException(
              `Player "${player.lastName} ${player.firstName}" has no birth date, but category "${category.name}" requires birth year ${rule.minBirthYear} or younger`,
            );
          }
          const birthYear = player.birthDate.getFullYear();
          if (birthYear < rule.minBirthYear) {
            throw new BadRequestException(
              `Player "${player.lastName} ${player.firstName}" is too old for category "${category.name}". Required birth year: ${rule.minBirthYear}+`,
            );
          }
        }
        if (rule.maxBirthYear != null) {
          if (!player.birthDate) {
            throw new BadRequestException(
              `Player "${player.lastName} ${player.firstName}" has no birth date, but category "${category.name}" requires birth year ${rule.maxBirthYear} or older`,
            );
          }
          const birthYear = player.birthDate.getFullYear();
          if (birthYear > rule.maxBirthYear) {
            throw new BadRequestException(
              `Player "${player.lastName} ${player.firstName}" is too young for category "${category.name}". Max allowed birth year: ${rule.maxBirthYear}`,
            );
          }
        }
      }

      if (rule.type === 'GENDER' && (rule.allowedGenders?.length ?? 0) > 0) {
        if (!player.gender) {
          throw new BadRequestException(
            `Player "${player.lastName} ${player.firstName}" has no gender, but category "${category.name}" has gender restriction`,
          );
        }
        if (!rule.allowedGenders.includes(player.gender)) {
          throw new BadRequestException(
            `Player "${player.lastName} ${player.firstName}" gender "${player.gender}" is not allowed for category "${category.name}"`,
          );
        }
      }
    }
  }

  async list(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    query: TeamQueryDto,
  ) {
    const where: any = { tenantId };

    if (query.tournamentId) {
      where.tournamentTeams = { some: { tournamentId: query.tournamentId } };
    }

    if (query.name) {
      where.name = {
        contains: query.name,
        mode: 'insensitive',
      };
    }

    if (query.category) {
      where.category = {
        equals: query.category,
        mode: 'insensitive',
      };
    }

    // MVP ограничения: TEAM_ADMIN видит только свои команды (назначенные через TeamAdmin)
    if (actorRole === 'TEAM_ADMIN') {
      where.admins = { some: { userId: actorUserId } };
    }

    const page = query.page ?? null;
    const pageSize = query.pageSize ?? null;

    const total = await this.prisma.team.count({ where });

    const sortField = query.sortField;
    const sortDir: 'asc' | 'desc' = query.sortOrder === 1 ? 'asc' : 'desc';

    const pageResolved = page ?? 1;
    const pageSizeResolved = pageSize ?? total;
    const skip = (pageResolved - 1) * pageSizeResolved;
    const take = pageSizeResolved;

    // Prisma v6.4.x не поддерживает `orderBy: { _count: ... }` (получали 500).
    // Поэтому сортировку по числу игроков делаем через raw SQL с пагинацией.
    if (sortField === 'playersCount') {
      const dirSql = sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      const tournamentIdParam = query.tournamentId ?? null;
      const nameParam = query.name ?? null;
      const teamAdminUserIdParam =
        actorRole === 'TEAM_ADMIN' ? actorUserId : null;
      const categoryParam = query.category ?? null;

      const rows = (await this.prisma.$queryRaw<
        Array<{
          id: string;
          name: string;
          slug: string | null;
          logoUrl: string | null;
          category: string | null;
          coachName: string | null;
          playersCount: bigint | number;
          tournamentsCount: bigint | number;
        }>
      >(Prisma.sql`
        SELECT
          t."id",
          t."name",
          t."slug",
          t."logoUrl",
          t."category",
          t."coachName",
          (SELECT COUNT(*) FROM "TeamPlayer" tp WHERE tp."teamId" = t."id") AS "playersCount",
          (SELECT COUNT(*) FROM "TournamentTeam" tt WHERE tt."teamId" = t."id") AS "tournamentsCount"
        FROM "Team" t
        WHERE t."tenantId" = ${tenantId}
          AND (${nameParam}::text IS NULL OR t."name" ILIKE ('%' || ${nameParam} || '%'))
          AND (${categoryParam}::text IS NULL OR LOWER(COALESCE(t."category", '')) = LOWER(${categoryParam}))
          AND (${tournamentIdParam}::text IS NULL OR EXISTS (
            SELECT 1 FROM "TournamentTeam" tt
            WHERE tt."teamId" = t."id" AND tt."tournamentId" = ${tournamentIdParam}
          ))
          AND (${teamAdminUserIdParam}::text IS NULL OR EXISTS (
            SELECT 1 FROM "TeamAdmin" ta
            WHERE ta."teamId" = t."id" AND ta."userId" = ${teamAdminUserIdParam}
          ))
        ORDER BY
          "playersCount" ${dirSql},
          t."id" DESC
        OFFSET ${skip}
        LIMIT ${take};
      `)) as any;

      return {
        items: rows.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          logoUrl: t.logoUrl,
          category: t.category,
          coachName: t.coachName,
          playersCount: Number(t.playersCount ?? 0),
          tournamentsCount: Number(t.tournamentsCount ?? 0),
        })),
        total,
        page: pageResolved,
        pageSize: pageSizeResolved,
      };
    }

    // Default / sort by name: обычный Prisma orderBy.
    const orderBy: any[] =
      sortField === 'name'
        ? [{ name: sortDir }, { id: 'desc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }];

    const teams = await this.prisma.team.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        _count: { select: { players: true, tournamentTeams: true } },
      },
    });

    return {
      items: teams.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        logoUrl: t.logoUrl,
        category: t.category,
        coachName: t.coachName,
        playersCount: t._count.players,
        tournamentsCount: t._count.tournamentTeams,
      })),
      total,
      page: pageResolved,
      pageSize: pageSizeResolved,
    };
  }

  async create(tenantId: string, dto: CreateTeamDto) {
    const conflict = await this.prisma.team.findFirst({
      where: { tenantId, slug: dto.slug },
      select: { id: true },
    });
    if (conflict) throw new BadRequestException('Team slug already exists');

    const logoUrlCreate =
      dto.logoUrl === undefined || dto.logoUrl === '' ? undefined : dto.logoUrl;

    const team = await this.prisma.team.create({
      data: {
        tenantId,
        name: dto.name,
        slug: dto.slug,
        category: dto.category,
        logoUrl: logoUrlCreate,
        coachName: dto.coachName,
        coachPhone: dto.coachPhone,
        coachEmail: dto.coachEmail,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        description: dto.description,
      },
    });

    return team;
  }

  async update(tenantId: string, id: string, dto: UpdateTeamDto) {
    const team = await this.prisma.team.findFirst({
      where: { id, tenantId },
      select: { id: true, slug: true, logoUrl: true },
    });
    if (!team) throw new NotFoundException('Team not found');

    if (dto.slug && dto.slug !== team.slug) {
      const conflict = await this.prisma.team.findFirst({
        where: { tenantId, slug: dto.slug },
        select: { id: true },
      });
      if (conflict) throw new BadRequestException('Team slug already exists');
    }

    const logoUrlResolved =
      dto.logoUrl === undefined
        ? undefined
        : dto.logoUrl === null || dto.logoUrl === ''
          ? null
          : dto.logoUrl;

    const previousLogoUrl = team.logoUrl;
    const removeOldLogoFromS3 =
      !!previousLogoUrl &&
      logoUrlResolved !== undefined &&
      (logoUrlResolved === null || logoUrlResolved !== previousLogoUrl);

    const updated = await this.prisma.team.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug,
        category: dto.category,
        logoUrl: logoUrlResolved,
        coachName: dto.coachName,
        coachPhone: dto.coachPhone,
        coachEmail: dto.coachEmail,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        description: dto.description,
      },
    });

    if (removeOldLogoFromS3 && previousLogoUrl) {
      await this.storage.tryDeletePublicUrl(previousLogoUrl);
    }

    return updated;
  }

  async delete(tenantId: string, id: string) {
    const team = await this.prisma.team.findFirst({
      where: { id, tenantId },
      select: { id: true, logoUrl: true },
    });
    if (!team) throw new NotFoundException('Team not found');

    const logoToRemove = team.logoUrl;

    await this.prisma.$transaction(async (tx) => {
      await tx.teamAdmin.deleteMany({ where: { teamId: id } });
      await tx.teamPlayer.deleteMany({ where: { teamId: id } });
      await tx.tournamentTeam.deleteMany({ where: { teamId: id } });
      await tx.tournamentTableRow.deleteMany({ where: { teamId: id } });
      await tx.match.deleteMany({
        where: { OR: [{ homeTeamId: id }, { awayTeamId: id }] },
      });
      await tx.team.delete({ where: { id } });
    });

    if (logoToRemove) {
      await this.storage.tryDeletePublicUrl(logoToRemove);
    }

    return { success: true };
  }

  async listTeamPlayers(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    teamId: string,
    query: TeamPlayersQueryDto,
  ) {
    const where: Prisma.TeamPlayerWhereInput = {
      teamId,
      team: this.buildTeamAccessWhere(tenantId, actorUserId, actorRole, teamId),
    };

    const playerWhere: Prisma.PlayerWhereInput = {};

    const nameTrimmed = query.name?.trim();
    if (nameTrimmed) {
      const tokens = nameTrimmed.split(/\s+/).filter(Boolean);
      const nameAnd: Prisma.PlayerWhereInput[] = tokens.map((token) => ({
        OR: [
          { firstName: { contains: token, mode: 'insensitive' } },
          { lastName: { contains: token, mode: 'insensitive' } },
        ],
      }));
      playerWhere.AND = [
        ...(Array.isArray(playerWhere.AND) ? playerWhere.AND : []),
        ...nameAnd,
      ];
    } else {
      if (query.lastName) {
        playerWhere.lastName = {
          contains: query.lastName,
          mode: 'insensitive',
        };
      }
      if (query.firstName) {
        playerWhere.firstName = {
          contains: query.firstName,
          mode: 'insensitive',
        };
      }
    }
    if (query.phone) {
      playerWhere.phone = { contains: query.phone, mode: 'insensitive' };
    }

    if (query.jerseyNumber !== undefined) {
      where.jerseyNumber = query.jerseyNumber;
    }

    if (query.birthDateFrom || query.birthDateTo) {
      const dateFrom = query.birthDateFrom
        ? this.parseYmdToLocalBoundary(query.birthDateFrom, false)
        : null;
      const dateTo = query.birthDateTo
        ? this.parseYmdToLocalBoundary(query.birthDateTo, true)
        : null;
      playerWhere.birthDate = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }

    if (query.position) {
      // позиция может быть задана либо на уровне TeamPlayer, либо на уровне Player (fallback)
      where.OR = [
        { position: { contains: query.position, mode: 'insensitive' } },
        {
          player: {
            is: { position: { contains: query.position, mode: 'insensitive' } },
          },
        },
      ];
    }

    if (Object.keys(playerWhere).length) {
      where.player = { is: playerWhere };
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const sortDir: 'asc' | 'desc' = query.sortOrder === 1 ? 'asc' : 'desc';

    const orderBy: Prisma.TeamPlayerOrderByWithRelationInput =
      query.sortField === 'jerseyNumber'
        ? { jerseyNumber: sortDir }
        : query.sortField === 'firstName'
          ? { player: { firstName: sortDir } }
          : query.sortField === 'birthDate'
            ? { player: { birthDate: sortDir } }
            : query.sortField === 'phone'
              ? { player: { phone: sortDir } }
              : query.sortField === 'position'
                ? { position: sortDir }
                : { player: { lastName: sortDir } };

    const total = await this.prisma.teamPlayer.count({ where });
    const items = await this.prisma.teamPlayer.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        player: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            position: true,
            phone: true,
            photoUrl: true,
          },
        },
      },
    });

    return {
      items: items.map((tp) => ({
        playerId: tp.playerId,
        id: tp.id,
        jerseyNumber: tp.jerseyNumber,
        position: tp.position ?? tp.player.position,
        player: {
          id: tp.player.id,
          firstName: tp.player.firstName,
          lastName: tp.player.lastName,
          birthDate: tp.player.birthDate,
          phone: tp.player.phone,
          photoUrl: tp.player.photoUrl,
        },
      })),
      total,
      page,
      pageSize,
    };
  }

  async addTeamPlayer(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    teamId: string,
    dto: CreateTeamPlayerDto,
  ) {
    const teamWhere = this.buildTeamAccessWhere(
      tenantId,
      actorUserId,
      actorRole,
      teamId,
    );
    const team = await this.prisma.team.findFirst({
      where: teamWhere,
      select: { id: true },
    });
    if (!team) throw new NotFoundException('Team not found');

    const player = await this.prisma.player.findFirst({
      where: { id: dto.playerId, tenantId },
      select: { id: true },
    });
    if (!player) throw new NotFoundException('Player not found');

    await this.assertPlayerMatchesTeamCategory(tenantId, teamId, dto.playerId);

    const existing = await this.prisma.teamPlayer.findFirst({
      where: { teamId, playerId: dto.playerId },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('Player already added to team');

    // У игрока только одна команда: перенос из другой команды в эту.
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.teamPlayer.deleteMany({ where: { playerId: dto.playerId } });
      return tx.teamPlayer.create({
        data: {
          teamId,
          playerId: dto.playerId,
          jerseyNumber: dto.jerseyNumber ?? undefined,
          position: dto.position ?? undefined,
        },
        include: {
          player: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              birthDate: true,
              phone: true,
              photoUrl: true,
              position: true,
            },
          },
        },
      });
    });

    return {
      playerId: created.playerId,
      id: created.id,
      jerseyNumber: created.jerseyNumber,
      position: created.position ?? created.player.position,
      player: {
        id: created.player.id,
        firstName: created.player.firstName,
        lastName: created.player.lastName,
        birthDate: created.player.birthDate,
        phone: created.player.phone,
        photoUrl: created.player.photoUrl,
      },
    };
  }

  async addTeamPlayersBulk(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    teamId: string,
    dto: CreateTeamPlayersBulkDto,
  ) {
    const ids = Array.from(
      new Set((dto.playerIds ?? []).map((x) => String(x).trim()).filter(Boolean)),
    );
    if (!ids.length) {
      throw new BadRequestException('playerIds must not be empty');
    }

    const results: Array<{ playerId: string; ok: boolean; error?: string }> = [];
    let added = 0;

    for (const playerId of ids) {
      try {
        await this.addTeamPlayer(tenantId, actorUserId, actorRole, teamId, {
          playerId,
        });
        added += 1;
        results.push({ playerId, ok: true });
      } catch (e: unknown) {
        const error =
          e instanceof Error
            ? e.message
            : typeof e === 'string'
              ? e
              : 'Unknown error';
        results.push({ playerId, ok: false, error });
      }
    }

    return {
      total: ids.length,
      added,
      failed: ids.length - added,
      results,
    };
  }

  async updateTeamPlayer(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    teamId: string,
    playerId: string,
    dto: UpdateTeamPlayerDto,
  ) {
    const teamWhere = this.buildTeamAccessWhere(
      tenantId,
      actorUserId,
      actorRole,
      teamId,
    );
    const existing = await this.prisma.teamPlayer.findFirst({
      where: { teamId, playerId, team: teamWhere },
      include: {
        player: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            phone: true,
            photoUrl: true,
            position: true,
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('Team player not found');

    const updated = await this.prisma.teamPlayer.update({
      where: { id: existing.id },
      data: {
        jerseyNumber:
          dto.jerseyNumber !== undefined
            ? dto.jerseyNumber
            : existing.jerseyNumber,
        position: dto.position !== undefined ? dto.position : existing.position,
      },
      include: {
        player: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            phone: true,
            photoUrl: true,
            position: true,
          },
        },
      },
    });

    return {
      playerId: updated.playerId,
      id: updated.id,
      jerseyNumber: updated.jerseyNumber,
      position: updated.position ?? updated.player.position,
      player: {
        id: updated.player.id,
        firstName: updated.player.firstName,
        lastName: updated.player.lastName,
        birthDate: updated.player.birthDate,
        phone: updated.player.phone,
        photoUrl: updated.player.photoUrl,
      },
    };
  }

  async deleteTeamPlayer(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    teamId: string,
    playerId: string,
  ) {
    const teamWhere = this.buildTeamAccessWhere(
      tenantId,
      actorUserId,
      actorRole,
      teamId,
    );
    const res = await this.prisma.teamPlayer.deleteMany({
      where: { teamId, playerId, team: teamWhere },
    });
    if (!res.count) throw new NotFoundException('Team player not found');
    return { success: true };
  }
}

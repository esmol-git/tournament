import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TournamentStatus } from '@prisma/client';
import { maxTeamsPerTenant } from '../auth/subscription-plan-features.util';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { CreateTeamPlayerDto } from './dto/create-team-player.dto';
import { CreateTeamPlayersBulkDto } from './dto/create-team-players-bulk.dto';
import { TeamQueryDto } from './dto/team-query.dto';
import { TeamPlayersQueryDto } from './dto/team-players-query.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { UpdateTeamPlayerDto } from './dto/update-team-player.dto';
import { assertPlayerFitsTeamCategory } from './team-category-player.assert';
import { parseCsv } from '../players/players-csv.util';
import { slugifyFromTitle } from '../utils/slugify';

@Injectable()
export class TeamsService {
  /** Нельзя убирать из заявки / удалять связь, если есть протокольные события в активном турнире. */
  private async assertMayDeactivateOrRemoveTeamPlayer(
    playerId: string,
  ): Promise<void> {
    const n = await this.prisma.matchEvent.count({
      where: {
        playerId,
        match: {
          tournamentId: { not: null },
          tournament: { status: TournamentStatus.ACTIVE },
        },
      },
    });
    if (n > 0) {
      throw new BadRequestException(
        'Нельзя отключить или убрать игрока из состава: есть записи в протоколах матчей активного турнира. Завершите турнир или снимите события с игрока.',
      );
    }
  }

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

  /** Подпись для фильтра `category`: приоритет у категории состава, иначе возрастная группа. */
  private async resolveTeamCategoryLabel(
    tenantId: string,
    teamCategoryId: string | null,
    ageGroupId: string | null,
  ): Promise<string | null> {
    if (teamCategoryId) {
      const tc = await this.prisma.teamCategory.findFirst({
        where: { id: teamCategoryId, tenantId },
        select: { name: true },
      });
      return tc?.name ?? null;
    }
    if (ageGroupId) {
      const ag = await this.prisma.ageGroup.findFirst({
        where: { id: ageGroupId, tenantId },
        select: { name: true },
      });
      return ag?.name ?? null;
    }
    return null;
  }

  /**
   * @param categoryIdOverride — если задан, проверка идёт по этой категории (нужно при смене
   *   категории команды до записи в БД; иначе из команды читается текущий teamCategoryId).
   */
  private async assertPlayerMatchesTeamCategory(
    tenantId: string,
    teamId: string,
    playerId: string,
    categoryIdOverride?: string | null,
  ) {
    let categoryFk: string | null = null;
    if (categoryIdOverride !== undefined) {
      categoryFk = categoryIdOverride;
    } else {
      const team = await this.prisma.team.findFirst({
        where: { id: teamId, tenantId },
        select: { teamCategoryId: true },
      });
      categoryFk = team?.teamCategoryId ?? null;
    }
    if (!categoryFk) return;

    await assertPlayerFitsTeamCategory(
      this.prisma,
      tenantId,
      categoryFk,
      playerId,
    );
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

    const ageGroupIdQ = query.ageGroupId?.trim();
    if (ageGroupIdQ) {
      where.ageGroupId = ageGroupIdQ;
    }
    const regionIdQ = query.regionId?.trim();
    if (regionIdQ) {
      where.regionId = regionIdQ;
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
      const ageGroupIdParam = query.ageGroupId?.trim() || null;
      const regionIdParam = query.regionId?.trim() || null;

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
          ageGroup_id: string | null;
          ageGroup_name: string | null;
          ageGroup_shortLabel: string | null;
          teamCategory_id: string | null;
          teamCategory_name: string | null;
          region_id: string | null;
          region_name: string | null;
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
          (SELECT COUNT(*) FROM "TournamentTeam" tt WHERE tt."teamId" = t."id") AS "tournamentsCount",
          ag."id" AS "ageGroup_id",
          ag."name" AS "ageGroup_name",
          ag."shortLabel" AS "ageGroup_shortLabel",
          tc."id" AS "teamCategory_id",
          tc."name" AS "teamCategory_name",
          r."id" AS "region_id",
          r."name" AS "region_name"
        FROM "Team" t
        LEFT JOIN "AgeGroup" ag ON ag."id" = t."ageGroupId"
        LEFT JOIN "TeamCategory" tc ON tc."id" = t."teamCategoryId"
        LEFT JOIN "Region" r ON r."id" = t."regionId"
        WHERE t."tenantId" = ${tenantId}
          AND (${nameParam}::text IS NULL OR t."name" ILIKE ('%' || ${nameParam} || '%'))
          AND (${categoryParam}::text IS NULL OR LOWER(COALESCE(t."category", '')) = LOWER(${categoryParam}))
          AND (${ageGroupIdParam}::text IS NULL OR t."ageGroupId" = ${ageGroupIdParam})
          AND (${regionIdParam}::text IS NULL OR t."regionId" = ${regionIdParam})
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
          ageGroupId: t.ageGroup_id,
          ageGroup:
            t.ageGroup_id && t.ageGroup_name
              ? {
                  id: t.ageGroup_id,
                  name: t.ageGroup_name,
                  shortLabel: t.ageGroup_shortLabel,
                }
              : null,
          regionId: t.region_id,
          region:
            t.region_id && t.region_name
              ? { id: t.region_id, name: t.region_name }
              : null,
          teamCategoryId: t.teamCategory_id,
          teamCategory:
            t.teamCategory_id && t.teamCategory_name
              ? { id: t.teamCategory_id, name: t.teamCategory_name }
              : null,
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
        ageGroup: {
          select: { id: true, name: true, shortLabel: true },
        },
        teamCategory: { select: { id: true, name: true } },
        region: { select: { id: true, name: true } },
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
        ageGroupId: t.ageGroupId,
        ageGroup: t.ageGroup
          ? {
              id: t.ageGroup.id,
              name: t.ageGroup.name,
              shortLabel: t.ageGroup.shortLabel,
            }
          : null,
        teamCategoryId: t.teamCategoryId,
        teamCategory: t.teamCategory
          ? { id: t.teamCategory.id, name: t.teamCategory.name }
          : null,
        regionId: t.regionId,
        region: t.region ? { id: t.region.id, name: t.region.name } : null,
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

    const tenantRow = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionPlan: true },
    });
    if (!tenantRow) {
      throw new NotFoundException('Tenant not found');
    }
    const maxTeams = maxTeamsPerTenant(tenantRow.subscriptionPlan);
    if (maxTeams !== null) {
      const teamsCount = await this.prisma.team.count({ where: { tenantId } });
      if (teamsCount >= maxTeams) {
        throw new ForbiddenException({
          message: `Превышен лимит команд в организации (${maxTeams})`,
          code: 'TENANT_TEAMS_LIMIT_EXCEEDED',
        });
      }
    }

    const logoUrlCreate =
      dto.logoUrl === undefined || dto.logoUrl === '' ? undefined : dto.logoUrl;

    let ageGroupIdToSet: string | undefined = undefined;
    const rawAg = dto.ageGroupId?.trim();
    if (rawAg) {
      const ag = await this.prisma.ageGroup.findFirst({
        where: { id: rawAg, tenantId },
        select: { id: true, name: true },
      });
      if (!ag) {
        throw new BadRequestException('Возрастная группа не найдена');
      }
      ageGroupIdToSet = ag.id;
    }

    let teamCategoryIdToSet: string | undefined = undefined;
    const rawTc = dto.teamCategoryId?.trim();
    if (rawTc) {
      const tc = await this.prisma.teamCategory.findFirst({
        where: { id: rawTc, tenantId },
        select: { id: true },
      });
      if (!tc) {
        throw new BadRequestException('Категория команды не найдена');
      }
      teamCategoryIdToSet = tc.id;
    }

    const categoryLabel = await this.resolveTeamCategoryLabel(
      tenantId,
      teamCategoryIdToSet ?? null,
      ageGroupIdToSet ?? null,
    );
    const categoryResolved =
      categoryLabel ?? (dto.category?.trim() ? dto.category.trim() : null);

    let regionIdToSet: string | undefined = undefined;
    const rawReg = dto.regionId?.trim();
    if (rawReg) {
      const rg = await this.prisma.region.findFirst({
        where: { id: rawReg, tenantId },
        select: { id: true },
      });
      if (!rg) {
        throw new BadRequestException('Регион не найден');
      }
      regionIdToSet = rg.id;
    }

    const team = await this.prisma.team.create({
      data: {
        tenantId,
        name: dto.name,
        slug: dto.slug,
        category: categoryResolved,
        teamCategoryId: teamCategoryIdToSet,
        logoUrl: logoUrlCreate,
        coachName: dto.coachName,
        coachPhone: dto.coachPhone,
        coachEmail: dto.coachEmail,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        description: dto.description,
        ageGroupId: ageGroupIdToSet,
        regionId: regionIdToSet,
      },
    });

    return team;
  }

  async update(tenantId: string, id: string, dto: UpdateTeamDto) {
    const team = await this.prisma.team.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        slug: true,
        logoUrl: true,
        ageGroupId: true,
        teamCategoryId: true,
      },
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

    let nextAgeGroupId = team.ageGroupId;
    if (dto.ageGroupId !== undefined) {
      if (dto.ageGroupId === null || dto.ageGroupId === '') {
        nextAgeGroupId = null;
      } else {
        const aid = String(dto.ageGroupId).trim();
        const ag = await this.prisma.ageGroup.findFirst({
          where: { id: aid, tenantId },
          select: { id: true },
        });
        if (!ag) {
          throw new BadRequestException('Возрастная группа не найдена');
        }
        nextAgeGroupId = aid;
      }
    }

    let nextTeamCategoryId = team.teamCategoryId;
    if (dto.teamCategoryId !== undefined) {
      if (dto.teamCategoryId === null || dto.teamCategoryId === '') {
        nextTeamCategoryId = null;
      } else {
        const cid = String(dto.teamCategoryId).trim();
        const tc = await this.prisma.teamCategory.findFirst({
          where: { id: cid, tenantId },
          select: { id: true },
        });
        if (!tc) {
          throw new BadRequestException('Категория команды не найдена');
        }
        nextTeamCategoryId = cid;
      }
    }

    const touchCategoryLabel =
      dto.ageGroupId !== undefined || dto.teamCategoryId !== undefined;
    const categoryLabel = touchCategoryLabel
      ? await this.resolveTeamCategoryLabel(
          tenantId,
          nextTeamCategoryId,
          nextAgeGroupId,
        )
      : undefined;

    let regionForUpdate: string | null | undefined = undefined;
    if (dto.regionId !== undefined) {
      if (dto.regionId === null || dto.regionId === '') {
        regionForUpdate = null;
      } else {
        const rid = String(dto.regionId).trim();
        const rg = await this.prisma.region.findFirst({
          where: { id: rid, tenantId },
          select: { id: true },
        });
        if (!rg) {
          throw new BadRequestException('Регион не найден');
        }
        regionForUpdate = rid;
      }
    }

    const previousLogoUrl = team.logoUrl;
    const removeOldLogoFromS3 =
      !!previousLogoUrl &&
      logoUrlResolved !== undefined &&
      (logoUrlResolved === null || logoUrlResolved !== previousLogoUrl);

    // Любое обновление команды: если после слия DTO с текущей строкой у команды
    // задана категория состава — состав должен ей соответствовать (в т.ч. первое
    // назначение категории и PATCH только с logoUrl/name без поля teamCategoryId).
    if (nextTeamCategoryId) {
      const roster = await this.prisma.teamPlayer.findMany({
        where: { teamId: id },
        select: { playerId: true },
      });
      for (const row of roster) {
        await this.assertPlayerMatchesTeamCategory(
          tenantId,
          id,
          row.playerId,
          nextTeamCategoryId,
        );
      }
    }

    const updated = await this.prisma.team.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug,
        ...(categoryLabel !== undefined ? { category: categoryLabel } : {}),
        logoUrl: logoUrlResolved,
        coachName: dto.coachName,
        coachPhone: dto.coachPhone,
        coachEmail: dto.coachEmail,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        description: dto.description,
        ...(dto.ageGroupId !== undefined ? { ageGroupId: nextAgeGroupId } : {}),
        ...(dto.teamCategoryId !== undefined
          ? { teamCategoryId: nextTeamCategoryId }
          : {}),
        ...(regionForUpdate !== undefined ? { regionId: regionForUpdate } : {}),
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

    if (query.activeOnly === true) {
      where.isActive = true;
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
        isActive: tp.isActive,
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
      new Set(
        (dto.playerIds ?? []).map((x) => String(x).trim()).filter(Boolean),
      ),
    );
    if (!ids.length) {
      throw new BadRequestException('playerIds must not be empty');
    }

    const results: Array<{ playerId: string; ok: boolean; error?: string }> =
      [];
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

    const willBeActive =
      dto.isActive !== undefined ? dto.isActive : existing.isActive;
    if (existing.isActive && !willBeActive) {
      await this.assertMayDeactivateOrRemoveTeamPlayer(playerId);
    }

    const updated = await this.prisma.teamPlayer.update({
      where: { id: existing.id },
      data: {
        jerseyNumber:
          dto.jerseyNumber !== undefined
            ? dto.jerseyNumber
            : existing.jerseyNumber,
        position: dto.position !== undefined ? dto.position : existing.position,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
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
      isActive: updated.isActive,
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
    const existing = await this.prisma.teamPlayer.findFirst({
      where: { teamId, playerId, team: teamWhere },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Team player not found');

    await this.assertMayDeactivateOrRemoveTeamPlayer(playerId);

    await this.prisma.teamPlayer.deleteMany({
      where: { teamId, playerId, team: teamWhere },
    });
    return { success: true };
  }

  /**
   * Импорт команд из CSV (UTF-8). Первая строка — заголовки.
   * Колонки (любой регистр): name | название | команда (обязательно);
   * slug; category; ageGroup (имя из справочника); teamCategory; region;
   * coachName, coachPhone, coachEmail, contactName, contactPhone, description.
   */
  async importTeamsCsv(
    tenantId: string,
    csvText: string,
  ): Promise<{
    created: number;
    skipped: number;
    errors: Array<{ row: number; message: string }>;
  }> {
    const rows = parseCsv(csvText.trim());
    if (rows.length < 2) {
      throw new BadRequestException(
        'CSV: нужна строка заголовков и хотя бы одна строка данных',
      );
    }
    const rawHeaders = rows[0].map((h) =>
      String(h ?? '')
        .trim()
        .toLowerCase(),
    );
    const findCol = (aliases: string[]): number => {
      for (const a of aliases) {
        const i = rawHeaders.indexOf(a.toLowerCase());
        if (i >= 0) return i;
      }
      return -1;
    };
    const nameIdx = findCol(['name', 'название', 'команда', 'team']);
    if (nameIdx < 0) {
      throw new BadRequestException(
        'CSV: не найдена колонка name (или название, команда)',
      );
    }
    const slugIdx = findCol(['slug', 'код']);
    const categoryIdx = findCol(['category', 'категория']);
    const ageGroupIdx = findCol([
      'agegroup',
      'age_group',
      'возрастная_группа',
      'возраст',
    ]);
    const teamCatIdx = findCol([
      'teamcategory',
      'team_category',
      'категория_состава',
    ]);
    const regionIdx = findCol(['region', 'регион']);
    const coachNameIdx = findCol(['coachname', 'coach_name', 'тренер']);
    const coachPhoneIdx = findCol(['coachphone', 'coach_phone']);
    const coachEmailIdx = findCol(['coachemail', 'coach_email']);
    const contactNameIdx = findCol(['contactname', 'contact_name']);
    const contactPhoneIdx = findCol(['contactphone', 'contact_phone']);
    const descIdx = findCol(['description', 'описание']);

    const [ageGroups, teamCats, regions] = await Promise.all([
      this.prisma.ageGroup.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
      this.prisma.teamCategory.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
      this.prisma.region.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
    ]);

    const byNameInsensitive = (
      items: Array<{ id: string; name: string }>,
      q: string,
    ): string | undefined => {
      const t = q.trim().toLowerCase();
      if (!t) return undefined;
      const hit = items.find((x) => x.name.toLowerCase() === t);
      return hit?.id;
    };

    const errors: Array<{ row: number; message: string }> = [];
    let created = 0;
    let skipped = 0;

    const ensureUniqueSlug = async (base: string): Promise<string> => {
      const b = base.slice(0, 96) || 'team';
      let n = 0;
      for (;;) {
        const slug = n === 0 ? b : `${b}-${n}`;
        const exists = await this.prisma.team.findFirst({
          where: { tenantId, slug },
          select: { id: true },
        });
        if (!exists) return slug;
        n++;
        if (n > 500)
          throw new BadRequestException('Не удалось подобрать уникальный slug');
      }
    };

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const name = String(row[nameIdx] ?? '').trim();
      if (!name) {
        skipped++;
        continue;
      }
      try {
        const slugRaw = slugIdx >= 0 ? String(row[slugIdx] ?? '').trim() : '';
        const baseSlug = slugRaw
          ? slugifyFromTitle(slugRaw, 'team')
          : slugifyFromTitle(name, 'team');
        const slug = await ensureUniqueSlug(baseSlug);

        const category =
          categoryIdx >= 0
            ? String(row[categoryIdx] ?? '').trim() || undefined
            : undefined;

        let ageGroupId: string | null | undefined = undefined;
        if (ageGroupIdx >= 0) {
          const q = String(row[ageGroupIdx] ?? '').trim();
          if (q) {
            const id = byNameInsensitive(ageGroups, q);
            if (!id) {
              throw new BadRequestException(
                `Возрастная группа не найдена: "${q}"`,
              );
            }
            ageGroupId = id;
          }
        }

        let teamCategoryId: string | null | undefined = undefined;
        if (teamCatIdx >= 0) {
          const q = String(row[teamCatIdx] ?? '').trim();
          if (q) {
            const id = byNameInsensitive(teamCats, q);
            if (!id) {
              throw new BadRequestException(
                `Категория состава не найдена: "${q}"`,
              );
            }
            teamCategoryId = id;
          }
        }

        let regionId: string | null | undefined = undefined;
        if (regionIdx >= 0) {
          const q = String(row[regionIdx] ?? '').trim();
          if (q) {
            const id = byNameInsensitive(regions, q);
            if (!id) {
              throw new BadRequestException(`Регион не найден: "${q}"`);
            }
            regionId = id;
          }
        }

        const dto: CreateTeamDto = {
          name,
          slug,
          ...(category !== undefined ? { category } : {}),
          ...(ageGroupId !== undefined ? { ageGroupId } : {}),
          ...(teamCategoryId !== undefined ? { teamCategoryId } : {}),
          ...(regionId !== undefined ? { regionId } : {}),
          ...(coachNameIdx >= 0
            ? { coachName: String(row[coachNameIdx] ?? '').trim() || undefined }
            : {}),
          ...(coachPhoneIdx >= 0
            ? {
                coachPhone:
                  String(row[coachPhoneIdx] ?? '').trim() || undefined,
              }
            : {}),
          ...(coachEmailIdx >= 0
            ? {
                coachEmail:
                  String(row[coachEmailIdx] ?? '').trim() || undefined,
              }
            : {}),
          ...(contactNameIdx >= 0
            ? {
                contactName:
                  String(row[contactNameIdx] ?? '').trim() || undefined,
              }
            : {}),
          ...(contactPhoneIdx >= 0
            ? {
                contactPhone:
                  String(row[contactPhoneIdx] ?? '').trim() || undefined,
              }
            : {}),
          ...(descIdx >= 0
            ? { description: String(row[descIdx] ?? '').trim() || undefined }
            : {}),
        };

        await this.create(tenantId, dto);
        created++;
      } catch (e: unknown) {
        const msg =
          e instanceof BadRequestException || e instanceof ForbiddenException
            ? (e as { message: string }).message
            : e instanceof Error
              ? e.message
              : String(e);
        errors.push({ row: r + 1, message: msg });
      }
    }

    return { created, skipped, errors };
  }
}

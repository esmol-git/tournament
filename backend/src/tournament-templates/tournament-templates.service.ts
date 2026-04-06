import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TournamentFormat,
  TournamentTemplateKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentDto } from '../tournaments/dto/create-tournament.dto';
import { CreateTournamentTemplateDto } from './dto/create-tournament-template.dto';
import { UpdateTournamentTemplateDto } from './dto/update-tournament-template.dto';

const templateInclude = {
  season: { select: { id: true, name: true } },
  competition: { select: { id: true, name: true } },
  ageGroup: { select: { id: true, name: true, shortLabel: true } },
  stadium: { select: { id: true, name: true } },
  templateReferees: { orderBy: { sortOrder: 'asc' as const } },
} as const;

function mergeDefinedCreateTournament(
  base: Partial<CreateTournamentDto>,
  overlay: CreateTournamentDto,
): CreateTournamentDto {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (key === 'templateId') continue;
    if (value !== undefined) out[key] = value;
  }
  return out as unknown as CreateTournamentDto;
}

@Injectable()
export class TournamentTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanDeleteAgeGroup(tenantId: string, ageGroupId: string) {
    const n = await this.prisma.tournamentTemplate.count({
      where: { tenantId, ageGroupId },
    });
    if (n > 0) {
      throw new ConflictException({
        message:
          'Нельзя удалить возрастную группу: она указана в шаблоне турнира. Измените шаблон или удалите его.',
        code: 'AGE_GROUP_USED_BY_TOURNAMENT_TEMPLATE',
      });
    }
  }

  async assertCanDeleteSeason(tenantId: string, seasonId: string) {
    const n = await this.prisma.tournamentTemplate.count({
      where: { tenantId, seasonId },
    });
    if (n > 0) {
      throw new ConflictException({
        message:
          'Нельзя удалить сезон: он указан в шаблоне турнира. Измените шаблон или удалите его.',
        code: 'SEASON_USED_BY_TOURNAMENT_TEMPLATE',
      });
    }
  }

  async assertCanDeleteCompetition(tenantId: string, competitionId: string) {
    const n = await this.prisma.tournamentTemplate.count({
      where: { tenantId, competitionId },
    });
    if (n > 0) {
      throw new ConflictException({
        message:
          'Нельзя удалить тип соревнования: он указан в шаблоне турнира. Измените шаблон или удалите его.',
        code: 'COMPETITION_USED_BY_TOURNAMENT_TEMPLATE',
      });
    }
  }

  async assertCanDeleteStadium(tenantId: string, stadiumId: string) {
    const n = await this.prisma.tournamentTemplate.count({
      where: { tenantId, stadiumId },
    });
    if (n > 0) {
      throw new ConflictException({
        message:
          'Нельзя удалить стадион: он указан в шаблоне турнира. Измените шаблон или удалите его.',
        code: 'STADIUM_USED_BY_TOURNAMENT_TEMPLATE',
      });
    }
  }

  async assertCanDeleteReferee(tenantId: string, refereeId: string) {
    const n = await this.prisma.tournamentTemplateReferee.count({
      where: { tenantId, refereeId },
    });
    if (n > 0) {
      throw new ConflictException({
        message:
          'Нельзя удалить судью: он указан в шаблоне турнира. Измените шаблон или удалите его.',
        code: 'REFEREE_USED_BY_TOURNAMENT_TEMPLATE',
      });
    }
  }

  async mergeCreatePayload(
    tenantId: string,
    templateId: string,
    body: CreateTournamentDto,
  ): Promise<CreateTournamentDto> {
    const template = await this.prisma.tournamentTemplate.findFirst({
      where: { id: templateId, tenantId },
      include: {
        templateReferees: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!template) {
      throw new NotFoundException({
        message: 'Шаблон турнира не найден',
        code: 'TOURNAMENT_TEMPLATE_NOT_FOUND',
      });
    }

    const base: Partial<CreateTournamentDto> = {
      format: template.format,
      groupCount: template.groupCount,
      playoffQualifiersPerGroup: template.playoffQualifiersPerGroup,
      intervalDays: template.intervalDays,
      allowedDays: template.allowedDays ?? [],
      roundRobinCycles: template.roundRobinCycles,
      matchDurationMinutes: template.matchDurationMinutes,
      matchBreakMinutes: template.matchBreakMinutes,
      simultaneousMatches: template.simultaneousMatches,
      dayStartTimeDefault: template.dayStartTimeDefault,
      dayStartTimeOverrides:
        (template.dayStartTimeOverrides as Record<string, string> | null) ??
        undefined,
      minTeams: template.minTeams,
      pointsWin: template.pointsWin,
      pointsDraw: template.pointsDraw,
      pointsLoss: template.pointsLoss,
      seasonId: template.seasonId ?? undefined,
      competitionId: template.competitionId ?? undefined,
      ageGroupId: template.ageGroupId ?? undefined,
      stadiumId: template.stadiumId ?? undefined,
      description: template.description ?? undefined,
      category: template.category ?? undefined,
      calendarColor: template.calendarColor ?? undefined,
      refereeIds: template.templateReferees.map((r) => r.refereeId),
    };

    const merged = mergeDefinedCreateTournament(base, body);
    if (!merged.format) {
      throw new BadRequestException({
        message: 'В шаблоне не задан формат турнира',
        code: 'TOURNAMENT_TEMPLATE_INVALID',
      });
    }
    if (!merged.name?.trim() || !merged.slug?.trim()) {
      throw new BadRequestException(
        'Укажите название и идентификатор (slug) турнира',
      );
    }
    return merged;
  }

  list(tenantId: string) {
    return this.prisma.tournamentTemplate.findMany({
      where: { tenantId },
      orderBy: [{ updatedAt: 'desc' }],
      include: templateInclude,
    });
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.tournamentTemplate.findFirst({
      where: { id, tenantId },
      include: templateInclude,
    });
    if (!row) {
      throw new NotFoundException({
        message: 'Шаблон турнира не найден',
        code: 'TOURNAMENT_TEMPLATE_NOT_FOUND',
      });
    }
    return row;
  }

  /** Разрешает FK справочников; только для полей, явно переданных в dto. */
  private async resolveDirectoryPatches(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateTournamentTemplateDto | UpdateTournamentTemplateDto,
  ): Promise<
    Partial<{
      seasonId: string | null;
      competitionId: string | null;
      ageGroupId: string | null;
      stadiumId: string | null;
    }>
  > {
    const out: Partial<{
      seasonId: string | null;
      competitionId: string | null;
      ageGroupId: string | null;
      stadiumId: string | null;
    }> = {};

    if (dto.seasonId !== undefined) {
      if (dto.seasonId === null || dto.seasonId === '') {
        out.seasonId = null;
      } else {
        const sn = await tx.season.findFirst({
          where: { id: dto.seasonId.trim(), tenantId },
          select: { id: true },
        });
        if (!sn) throw new BadRequestException('Сезон не найден');
        out.seasonId = sn.id;
      }
    }

    if (dto.competitionId !== undefined) {
      if (dto.competitionId === null || dto.competitionId === '') {
        out.competitionId = null;
      } else {
        const cp = await tx.competition.findFirst({
          where: { id: dto.competitionId.trim(), tenantId },
          select: { id: true },
        });
        if (!cp) throw new BadRequestException('Тип соревнования не найден');
        out.competitionId = cp.id;
      }
    }

    if (dto.ageGroupId !== undefined) {
      if (dto.ageGroupId === null || dto.ageGroupId === '') {
        out.ageGroupId = null;
      } else {
        const ag = await tx.ageGroup.findFirst({
          where: { id: dto.ageGroupId.trim(), tenantId },
          select: { id: true },
        });
        if (!ag) throw new BadRequestException('Возрастная группа не найдена');
        out.ageGroupId = ag.id;
      }
    }

    if (dto.stadiumId !== undefined) {
      if (dto.stadiumId === null || dto.stadiumId === '') {
        out.stadiumId = null;
      } else {
        const st = await tx.stadium.findFirst({
          where: { id: dto.stadiumId.trim(), tenantId },
          select: { id: true },
        });
        if (!st) throw new BadRequestException('Стадион не найден');
        out.stadiumId = st.id;
      }
    }

    return out;
  }

  async create(tenantId: string, dto: CreateTournamentTemplateDto) {
    return this.prisma.$transaction(async (tx) => {
      const fk = await this.resolveDirectoryPatches(tx, tenantId, dto);

      const created = await tx.tournamentTemplate.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          kind: dto.kind ?? TournamentTemplateKind.FORMAT,
          format: dto.format ?? TournamentFormat.SINGLE_GROUP,
          groupCount: dto.groupCount ?? 1,
          playoffQualifiersPerGroup: dto.playoffQualifiersPerGroup ?? 2,
          intervalDays: dto.intervalDays ?? 7,
          allowedDays: dto.allowedDays ?? [],
          roundRobinCycles: dto.roundRobinCycles ?? 1,
          matchDurationMinutes: dto.matchDurationMinutes ?? 50,
          matchBreakMinutes: dto.matchBreakMinutes ?? 10,
          simultaneousMatches: dto.simultaneousMatches ?? 1,
          dayStartTimeDefault: dto.dayStartTimeDefault ?? '12:00',
          dayStartTimeOverrides:
            dto.dayStartTimeOverrides !== undefined
              ? (dto.dayStartTimeOverrides as object)
              : undefined,
          minTeams: dto.minTeams ?? 2,
          pointsWin: dto.pointsWin ?? 3,
          pointsDraw: dto.pointsDraw ?? 1,
          pointsLoss: dto.pointsLoss ?? 0,
          calendarColor: dto.calendarColor ?? null,
          category: dto.category?.trim() || null,
          seasonId: fk.seasonId !== undefined ? fk.seasonId : null,
          competitionId:
            fk.competitionId !== undefined ? fk.competitionId : null,
          ageGroupId: fk.ageGroupId !== undefined ? fk.ageGroupId : null,
          stadiumId: fk.stadiumId !== undefined ? fk.stadiumId : null,
        },
        include: templateInclude,
      });

      if (dto.refereeIds?.length) {
        const refs = await tx.referee.findMany({
          where: { tenantId, id: { in: dto.refereeIds } },
          select: { id: true },
        });
        if (refs.length !== dto.refereeIds.length) {
          throw new BadRequestException('Один или несколько судей не найдены');
        }
        await tx.tournamentTemplateReferee.createMany({
          data: dto.refereeIds.map((refereeId, i) => ({
            tenantId,
            templateId: created.id,
            refereeId,
            sortOrder: i,
          })),
        });
      }

      return tx.tournamentTemplate.findFirstOrThrow({
        where: { id: created.id },
        include: templateInclude,
      });
    });
  }

  async update(tenantId: string, id: string, dto: UpdateTournamentTemplateDto) {
    await this.getById(tenantId, id);

    return this.prisma.$transaction(async (tx) => {
      const fk = await this.resolveDirectoryPatches(tx, tenantId, dto);

      const data: Prisma.TournamentTemplateUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.description !== undefined) {
        data.description = dto.description?.trim() || null;
      }
      if (dto.kind !== undefined) data.kind = dto.kind;
      if (dto.format !== undefined) data.format = dto.format;
      if (dto.groupCount !== undefined) data.groupCount = dto.groupCount;
      if (dto.playoffQualifiersPerGroup !== undefined) {
        data.playoffQualifiersPerGroup = dto.playoffQualifiersPerGroup;
      }
      if (dto.intervalDays !== undefined) data.intervalDays = dto.intervalDays;
      if (dto.allowedDays !== undefined) data.allowedDays = dto.allowedDays;
      if (dto.roundRobinCycles !== undefined) {
        data.roundRobinCycles = dto.roundRobinCycles;
      }
      if (dto.matchDurationMinutes !== undefined) {
        data.matchDurationMinutes = dto.matchDurationMinutes;
      }
      if (dto.matchBreakMinutes !== undefined) {
        data.matchBreakMinutes = dto.matchBreakMinutes;
      }
      if (dto.simultaneousMatches !== undefined) {
        data.simultaneousMatches = dto.simultaneousMatches;
      }
      if (dto.dayStartTimeDefault !== undefined) {
        data.dayStartTimeDefault = dto.dayStartTimeDefault;
      }
      if (dto.dayStartTimeOverrides !== undefined) {
        data.dayStartTimeOverrides = dto.dayStartTimeOverrides as object;
      }
      if (dto.minTeams !== undefined) data.minTeams = dto.minTeams;
      if (dto.pointsWin !== undefined) data.pointsWin = dto.pointsWin;
      if (dto.pointsDraw !== undefined) data.pointsDraw = dto.pointsDraw;
      if (dto.pointsLoss !== undefined) data.pointsLoss = dto.pointsLoss;
      if (dto.calendarColor !== undefined) {
        data.calendarColor = dto.calendarColor ?? null;
      }
      if (dto.category !== undefined) {
        data.category = dto.category?.trim() || null;
      }
      if (fk.seasonId !== undefined) data.seasonId = fk.seasonId;
      if (fk.competitionId !== undefined) {
        data.competitionId = fk.competitionId;
      }
      if (fk.ageGroupId !== undefined) data.ageGroupId = fk.ageGroupId;
      if (fk.stadiumId !== undefined) data.stadiumId = fk.stadiumId;

      if (Object.keys(data).length > 0) {
        await tx.tournamentTemplate.update({ where: { id }, data });
      }

      if (dto.refereeIds !== undefined) {
        await tx.tournamentTemplateReferee.deleteMany({
          where: { templateId: id },
        });
        if (dto.refereeIds.length) {
          const refs = await tx.referee.findMany({
            where: { tenantId, id: { in: dto.refereeIds } },
            select: { id: true },
          });
          if (refs.length !== dto.refereeIds.length) {
            throw new BadRequestException(
              'Один или несколько судей не найдены',
            );
          }
          await tx.tournamentTemplateReferee.createMany({
            data: dto.refereeIds.map((refereeId, i) => ({
              tenantId,
              templateId: id,
              refereeId,
              sortOrder: i,
            })),
          });
        }
      }

      return tx.tournamentTemplate.findFirstOrThrow({
        where: { id },
        include: templateInclude,
      });
    });
  }

  async delete(tenantId: string, id: string) {
    await this.getById(tenantId, id);
    await this.prisma.tournamentTemplate.delete({ where: { id } });
    return { success: true };
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EditionStatus,
  Prisma,
  TournamentRegulationMode,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompetitionEditionDto } from './dto/create-competition-edition.dto';
import { UpdateCompetitionEditionDto } from './dto/update-competition-edition.dto';
import { EditionEligibilityDto } from './dto/edition-eligibility.dto';

const editionListInclude = {
  season: { select: { id: true, name: true } },
  competition: { select: { id: true, name: true } },
  _count: { select: { tournaments: true } },
} satisfies Prisma.CompetitionEditionInclude;

const editionDetailInclude = {
  season: { select: { id: true, name: true, code: true } },
  competition: { select: { id: true, name: true, code: true } },
  eligibilityPolicy: {
    select: {
      id: true,
      name: true,
      requireBirthDate: true,
      minBirthYear: true,
      maxBirthYear: true,
      ageGroupId: true,
      ageGroup: { select: { id: true, name: true } },
    },
  },
  tournaments: {
    orderBy: [{ startsAt: 'asc' as const }, { name: 'asc' as const }],
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      published: true,
      startsAt: true,
      endsAt: true,
      regulationMode: true,
      format: true,
    },
  },
} satisfies Prisma.CompetitionEditionInclude;

@Injectable()
export class CompetitionEditionsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeSlug(slug: string) {
    return slug.trim().toLowerCase();
  }

  private async assertSeasonAndCompetition(
    tenantId: string,
    seasonId: string,
    competitionId: string,
  ) {
    const [season, competition] = await Promise.all([
      this.prisma.season.findFirst({
        where: { id: seasonId, tenantId },
        select: { id: true },
      }),
      this.prisma.competition.findFirst({
        where: { id: competitionId, tenantId },
        select: { id: true },
      }),
    ]);
    if (!season) throw new BadRequestException('Сезон не найден');
    if (!competition) {
      throw new BadRequestException('Тип соревнования не найден');
    }
  }

  private async assertSlugFree(
    tenantId: string,
    slug: string,
    excludeId?: string,
  ) {
    const existing = await this.prisma.competitionEdition.findFirst({
      where: {
        tenantId,
        slug,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Зачёт с таким slug уже существует');
    }
  }

  private parseOptionalDate(value?: string | null) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Некорректная дата');
    }
    return d;
  }

  private async upsertEditionEligibility(
    tenantId: string,
    editionId: string,
    editionName: string,
    existingPolicyId: string | null,
    dto?: EditionEligibilityDto,
  ) {
    if (!dto) return existingPolicyId;

    const hasAny =
      dto.ageGroupId !== undefined ||
      dto.minBirthYear !== undefined ||
      dto.maxBirthYear !== undefined ||
      dto.requireBirthDate !== undefined;

    if (!hasAny) return existingPolicyId;

    if (dto.ageGroupId) {
      const ag = await this.prisma.ageGroup.findFirst({
        where: { id: dto.ageGroupId, tenantId },
      });
      if (!ag) throw new BadRequestException('Возрастная группа не найдена');
    }

    const data = {
      name: `Регламент: ${editionName.trim()}`,
      ageGroupId: dto.ageGroupId ?? null,
      minBirthYear: dto.minBirthYear ?? null,
      maxBirthYear: dto.maxBirthYear ?? null,
      requireBirthDate: dto.requireBirthDate ?? false,
    };

    if (existingPolicyId) {
      await this.prisma.eligibilityPolicy.update({
        where: { id: existingPolicyId },
        data,
      });
      return existingPolicyId;
    }

    const created = await this.prisma.eligibilityPolicy.create({
      data: { tenantId, ...data },
    });
    await this.prisma.competitionEdition.update({
      where: { id: editionId },
      data: { eligibilityPolicyId: created.id },
    });
    return created.id;
  }

  list(tenantId: string) {
    return this.prisma.competitionEdition.findMany({
      where: { tenantId },
      include: editionListInclude,
      orderBy: [{ status: 'asc' }, { startsAt: 'desc' }, { name: 'asc' }],
    });
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.competitionEdition.findFirst({
      where: { id, tenantId },
      include: editionDetailInclude,
    });
    if (!row) throw new NotFoundException('Зачёт не найден');
    return row;
  }

  async create(tenantId: string, dto: CreateCompetitionEditionDto) {
    const slug = this.normalizeSlug(dto.slug);
    if (!slug) throw new BadRequestException('Slug обязателен');
    await this.assertSlugFree(tenantId, slug);
    await this.assertSeasonAndCompetition(
      tenantId,
      dto.seasonId,
      dto.competitionId,
    );

    const startsAt = this.parseOptionalDate(dto.startsAt);
    const endsAt = this.parseOptionalDate(dto.endsAt);
    if (
      startsAt &&
      endsAt &&
      startsAt.getTime() > endsAt.getTime()
    ) {
      throw new BadRequestException('Дата начала не может быть позже окончания');
    }

    const created = await this.prisma.competitionEdition.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        seasonId: dto.seasonId,
        competitionId: dto.competitionId,
        audience: dto.audience,
        startsAt: startsAt ?? null,
        endsAt: endsAt ?? null,
        sanctionScope: dto.sanctionScope,
        cardAutoBanEnabled: dto.cardAutoBanEnabled ?? false,
        redCardBanMatches: dto.redCardBanMatches ?? 1,
        yellowAccumulationThreshold: dto.yellowAccumulationThreshold ?? 2,
        yellowAccumulationBanMatches: dto.yellowAccumulationBanMatches ?? 1,
        technicalWinGoalsFor: dto.technicalWinGoalsFor ?? 3,
        technicalWinGoalsAgainst: dto.technicalWinGoalsAgainst ?? 0,
        published: dto.published ?? false,
        status: dto.status ?? EditionStatus.DRAFT,
      },
    });

    if (dto.eligibility) {
      await this.upsertEditionEligibility(
        tenantId,
        created.id,
        created.name,
        null,
        dto.eligibility,
      );
    }

    return this.getById(tenantId, created.id);
  }

  async update(tenantId: string, id: string, dto: UpdateCompetitionEditionDto) {
    const row = await this.prisma.competitionEdition.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Зачёт не найден');

    if (dto.slug !== undefined) {
      const slug = this.normalizeSlug(dto.slug);
      if (!slug) throw new BadRequestException('Slug обязателен');
      await this.assertSlugFree(tenantId, slug, id);
    }

    const seasonId = dto.seasonId ?? row.seasonId;
    const competitionId = dto.competitionId ?? row.competitionId;
    if (dto.seasonId !== undefined || dto.competitionId !== undefined) {
      await this.assertSeasonAndCompetition(
        tenantId,
        seasonId,
        competitionId,
      );
    }

    const startsAt =
      dto.startsAt !== undefined
        ? this.parseOptionalDate(dto.startsAt)
        : undefined;
    const endsAt =
      dto.endsAt !== undefined ? this.parseOptionalDate(dto.endsAt) : undefined;
    const nextStarts = startsAt !== undefined ? startsAt : row.startsAt;
    const nextEnds = endsAt !== undefined ? endsAt : row.endsAt;
    if (
      nextStarts &&
      nextEnds &&
      nextStarts.getTime() > nextEnds.getTime()
    ) {
      throw new BadRequestException('Дата начала не может быть позже окончания');
    }

    const updated = await this.prisma.competitionEdition.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.slug !== undefined
          ? { slug: this.normalizeSlug(dto.slug) }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.seasonId !== undefined ? { seasonId: dto.seasonId } : {}),
        ...(dto.competitionId !== undefined
          ? { competitionId: dto.competitionId }
          : {}),
        ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
        ...(startsAt !== undefined ? { startsAt } : {}),
        ...(endsAt !== undefined ? { endsAt } : {}),
        ...(dto.sanctionScope !== undefined
          ? { sanctionScope: dto.sanctionScope }
          : {}),
        ...(dto.cardAutoBanEnabled !== undefined
          ? { cardAutoBanEnabled: dto.cardAutoBanEnabled }
          : {}),
        ...(dto.redCardBanMatches !== undefined
          ? { redCardBanMatches: dto.redCardBanMatches }
          : {}),
        ...(dto.yellowAccumulationThreshold !== undefined
          ? { yellowAccumulationThreshold: dto.yellowAccumulationThreshold }
          : {}),
        ...(dto.yellowAccumulationBanMatches !== undefined
          ? { yellowAccumulationBanMatches: dto.yellowAccumulationBanMatches }
          : {}),
        ...(dto.technicalWinGoalsFor !== undefined
          ? { technicalWinGoalsFor: dto.technicalWinGoalsFor }
          : {}),
        ...(dto.technicalWinGoalsAgainst !== undefined
          ? { technicalWinGoalsAgainst: dto.technicalWinGoalsAgainst }
          : {}),
        ...(dto.published !== undefined ? { published: dto.published } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });

    if (dto.eligibility) {
      await this.upsertEditionEligibility(
        tenantId,
        id,
        updated.name,
        row.eligibilityPolicyId,
        dto.eligibility,
      );
    }

    if (dto.seasonId !== undefined || dto.competitionId !== undefined) {
      await this.syncInheritedTournamentsMetadata(tenantId, id);
    }

    return this.getById(tenantId, id);
  }

  async delete(tenantId: string, id: string) {
    const row = await this.prisma.competitionEdition.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { tournaments: true } } },
    });
    if (!row) throw new NotFoundException('Зачёт не найден');
    if (row._count.tournaments > 0) {
      throw new BadRequestException(
        'Нельзя удалить зачёт с привязанными турнирами. Сначала отвяжите турниры.',
      );
    }
    await this.prisma.competitionEdition.delete({ where: { id } });
    return { success: true };
  }

  private async syncInheritedTournamentsMetadata(
    tenantId: string,
    editionId: string,
  ) {
    const edition = await this.prisma.competitionEdition.findFirst({
      where: { id: editionId, tenantId },
      select: { seasonId: true, competitionId: true },
    });
    if (!edition) return;

    await this.prisma.tournament.updateMany({
      where: {
        tenantId,
        editionId,
        regulationMode: TournamentRegulationMode.INHERIT,
      },
      data: {
        seasonId: edition.seasonId,
        competitionId: edition.competitionId,
      },
    });
  }

  async linkTournament(
    tenantId: string,
    editionId: string,
    tournamentId: string,
    regulationMode: TournamentRegulationMode = TournamentRegulationMode.INHERIT,
  ) {
    const edition = await this.prisma.competitionEdition.findFirst({
      where: { id: editionId, tenantId },
    });
    if (!edition) throw new NotFoundException('Зачёт не найден');

    const tournament = await this.prisma.tournament.findFirst({
      where: { id: tournamentId, tenantId },
      select: { id: true, editionId: true },
    });
    if (!tournament) throw new NotFoundException('Турнир не найден');
    if (tournament.editionId && tournament.editionId !== editionId) {
      throw new BadRequestException(
        'Турнир уже привязан к другому зачёту. Сначала отвяжите его.',
      );
    }

    if (regulationMode === TournamentRegulationMode.INHERIT) {
      await this.prisma.tournament.update({
        where: { id: tournamentId },
        data: {
          editionId,
          regulationMode,
          seasonId: edition.seasonId,
          competitionId: edition.competitionId,
        },
      });
    } else {
      await this.prisma.tournament.update({
        where: { id: tournamentId },
        data: { editionId, regulationMode },
      });
    }

    return this.getById(tenantId, editionId);
  }

  async unlinkTournament(
    tenantId: string,
    editionId: string,
    tournamentId: string,
  ) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { id: tournamentId, tenantId, editionId },
      select: { id: true },
    });
    if (!tournament) {
      throw new NotFoundException('Турнир не найден в этом зачёте');
    }

    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        editionId: null,
        regulationMode: TournamentRegulationMode.INHERIT,
      },
    });

    return this.getById(tenantId, editionId);
  }

  async listPublicByTenantSlug(tenantSlug: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug: tenantSlug, blocked: false },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Organization not found');

    return this.prisma.competitionEdition.findMany({
      where: {
        tenantId: tenant.id,
        published: true,
        status: EditionStatus.ACTIVE,
      },
      include: {
        season: { select: { id: true, name: true } },
        competition: { select: { id: true, name: true } },
        _count: { select: { tournaments: true } },
      },
      orderBy: [{ startsAt: 'desc' }, { name: 'asc' }],
    });
  }

  async getPublicBySlug(tenantSlug: string, editionSlug: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug: tenantSlug, blocked: false },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Organization not found');

    const row = await this.prisma.competitionEdition.findFirst({
      where: {
        tenantId: tenant.id,
        slug: this.normalizeSlug(editionSlug),
        published: true,
      },
      include: {
        season: { select: { id: true, name: true } },
        competition: { select: { id: true, name: true } },
        tournaments: {
          where: { published: true },
          orderBy: [{ startsAt: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            startsAt: true,
            endsAt: true,
            format: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Edition not found');
    return row;
  }
}

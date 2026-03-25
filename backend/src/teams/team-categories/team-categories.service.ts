import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlayerGender, Prisma, TeamCategoryType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeamCategoryDto } from './dto/create-team-category.dto';
import { UpdateTeamCategoryDto } from './dto/update-team-category.dto';

@Injectable()
export class TeamCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeRule(raw: {
    type?: TeamCategoryType;
    minBirthYear?: number | null;
    maxBirthYear?: number | null;
    requireBirthDate?: boolean;
    allowedGenders?: PlayerGender[];
  }) {
    const type = raw.type ?? TeamCategoryType.AGE;
    const minBirthYear = raw.minBirthYear ?? null;
    const maxBirthYear = raw.maxBirthYear ?? null;
    if (
      minBirthYear != null &&
      maxBirthYear != null &&
      minBirthYear > maxBirthYear
    ) {
      throw new BadRequestException('minBirthYear must be <= maxBirthYear');
    }
    if (type === TeamCategoryType.AGE) {
      return {
        type,
        minBirthYear,
        maxBirthYear,
        requireBirthDate: raw.requireBirthDate ?? false,
        allowedGenders: [] as PlayerGender[],
      };
    }
    return {
      type: TeamCategoryType.GENDER,
      minBirthYear: null,
      maxBirthYear: null,
      requireBirthDate: false,
      allowedGenders: raw.allowedGenders ?? [],
    };
  }

  private violationWhereForRule(rule: {
    type: TeamCategoryType;
    minBirthYear: number | null;
    maxBirthYear: number | null;
    requireBirthDate: boolean;
    allowedGenders: PlayerGender[];
  }): Prisma.TeamPlayerWhereInput | null {
    if (rule.type === TeamCategoryType.AGE) {
      const or: Prisma.TeamPlayerWhereInput[] = [];
      if (rule.requireBirthDate) {
        or.push({ player: { is: { birthDate: null } } });
      }
      if (rule.minBirthYear != null) {
        or.push({
          OR: [
            { player: { is: { birthDate: null } } },
            {
              player: {
                is: { birthDate: { lt: new Date(rule.minBirthYear, 0, 1) } },
              },
            },
          ],
        });
      }
      if (rule.maxBirthYear != null) {
        or.push({
          OR: [
            { player: { is: { birthDate: null } } },
            {
              player: {
                is: {
                  birthDate: {
                    gt: new Date(rule.maxBirthYear, 11, 31, 23, 59, 59, 999),
                  },
                },
              },
            },
          ],
        });
      }
      return or.length ? { OR: or } : null;
    }

    if ((rule.allowedGenders?.length ?? 0) > 0) {
      return {
        OR: [
          { player: { is: { gender: null } } },
          { player: { is: { gender: { notIn: rule.allowedGenders } } } },
        ],
      };
    }
    return null;
  }

  private async assertNoPlayersViolationForCategoryRules(
    tenantId: string,
    categoryName: string,
    rules: Array<{
      type: TeamCategoryType;
      minBirthYear: number | null;
      maxBirthYear: number | null;
      requireBirthDate: boolean;
      allowedGenders: PlayerGender[];
    }>,
  ) {
    const ruleViolations = rules
      .map((r) => this.violationWhereForRule(r))
      .filter((x): x is Prisma.TeamPlayerWhereInput => !!x);
    if (!ruleViolations.length) return;

    const bad = await this.prisma.teamPlayer.findFirst({
      where: {
        team: {
          tenantId,
          category: { equals: categoryName, mode: 'insensitive' },
        },
        OR: ruleViolations,
      },
      select: { id: true },
    });
    if (!bad) return;

    throw new BadRequestException(
      'Нельзя сохранить ограничения: есть игроки, которые не соответствуют правилам категории',
    );
  }

  async list(tenantId: string) {
    return this.prisma.teamCategory.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        rules: {
          select: {
            id: true,
            type: true,
            minBirthYear: true,
            maxBirthYear: true,
            requireBirthDate: true,
            allowedGenders: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async create(tenantId: string, dto: CreateTeamCategoryDto) {
    const existing = await this.prisma.teamCategory.findFirst({
      where: { tenantId, name: dto.name },
      select: { id: true },
    });
    if (existing)
      throw new BadRequestException('Team category name already exists');

    const rules = (dto.rules ?? [{ type: TeamCategoryType.AGE }]).map((r) =>
      this.normalizeRule(r),
    );

    await this.assertNoPlayersViolationForCategoryRules(
      tenantId,
      dto.name,
      rules,
    );

    return this.prisma.teamCategory.create({
      data: {
        tenantId,
        name: dto.name,
        slug: dto.slug,
        rules: {
          createMany: {
            data: rules.map((r) => ({
              tenantId,
              type: r.type,
              minBirthYear: r.minBirthYear,
              maxBirthYear: r.maxBirthYear,
              requireBirthDate: r.requireBirthDate,
              allowedGenders: r.allowedGenders,
            })),
          },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        rules: {
          select: {
            id: true,
            type: true,
            minBirthYear: true,
            maxBirthYear: true,
            requireBirthDate: true,
            allowedGenders: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateTeamCategoryDto) {
    const category = await this.prisma.teamCategory.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true },
    });
    if (!category) throw new NotFoundException('Team category not found');

    if (dto.name && dto.name !== category.name) {
      const conflict = await this.prisma.teamCategory.findFirst({
        where: { tenantId, name: dto.name },
        select: { id: true },
      });
      if (conflict)
        throw new BadRequestException('Team category name already exists');
    }

    const current = await this.prisma.teamCategory.findUnique({
      where: { id },
      select: {
        rules: {
          select: {
            type: true,
            minBirthYear: true,
            maxBirthYear: true,
            requireBirthDate: true,
            allowedGenders: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const rulesSource =
      dto.rules ??
      current?.rules ??
      ([{ type: TeamCategoryType.AGE }] as Array<{
        type: TeamCategoryType;
        minBirthYear: number | null;
        maxBirthYear: number | null;
        requireBirthDate: boolean;
        allowedGenders: PlayerGender[];
      }>);
    const rules = rulesSource.map((r) => this.normalizeRule(r));

    await this.assertNoPlayersViolationForCategoryRules(
      tenantId,
      dto.name ?? category.name,
      rules,
    );

    return this.prisma.teamCategory.update({
      where: { id },
      data: {
        name: dto.name ?? category.name,
        slug: dto.slug,
        ...(dto.rules !== undefined
          ? {
              rules: {
                deleteMany: {},
                createMany: {
                  data: rules.map((r) => ({
                    tenantId,
                    type: r.type,
                    minBirthYear: r.minBirthYear,
                    maxBirthYear: r.maxBirthYear,
                    requireBirthDate: r.requireBirthDate,
                    allowedGenders: r.allowedGenders,
                  })),
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        rules: {
          select: {
            id: true,
            type: true,
            minBirthYear: true,
            maxBirthYear: true,
            requireBirthDate: true,
            allowedGenders: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const category = await this.prisma.teamCategory.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true },
    });
    if (!category) throw new NotFoundException('Team category not found');

    const used = await this.prisma.team.count({
      where: { tenantId, category: category.name },
    });
    if (used > 0)
      throw new BadRequestException('Категория используется командами');

    await this.prisma.teamCategory.delete({ where: { id } });
    return { success: true };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeamCategoryDto } from './dto/create-team-category.dto';
import { UpdateTeamCategoryDto } from './dto/update-team-category.dto';

@Injectable()
export class TeamCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.teamCategory.findMany({
      where: { tenantId },
      include: {
        ageGroup: { select: { id: true, name: true } },
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  private async assertAgeGroup(tenantId: string, ageGroupId: string) {
    const ag = await this.prisma.ageGroup.findFirst({
      where: { id: ageGroupId, tenantId },
      select: { id: true },
    });
    if (!ag) throw new NotFoundException('Age group not found');
    return ag.id;
  }

  async create(tenantId: string, dto: CreateTeamCategoryDto) {
    let ageGroupId: string | null = null;
    if (dto.ageGroupId) {
      ageGroupId = await this.assertAgeGroup(tenantId, dto.ageGroupId);
    }

    return this.prisma.teamCategory.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        slug: dto.slug?.trim() || null,
        ageGroupId,
        minBirthYear: dto.minBirthYear ?? null,
        maxBirthYear: dto.maxBirthYear ?? null,
        requireBirthDate: dto.requireBirthDate ?? false,
        allowedGenders: dto.allowedGenders ?? [],
      },
      include: {
        ageGroup: { select: { id: true, name: true } },
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateTeamCategoryDto) {
    const row = await this.prisma.teamCategory.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Team category not found');

    let ageGroupId: string | null | undefined = undefined;
    if (dto.ageGroupId !== undefined) {
      if (dto.ageGroupId === null || dto.ageGroupId === '') {
        ageGroupId = null;
      } else {
        ageGroupId = await this.assertAgeGroup(tenantId, dto.ageGroupId);
      }
    }

    return this.prisma.teamCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug?.trim() || null } : {}),
        ...(ageGroupId !== undefined ? { ageGroupId } : {}),
        ...(dto.minBirthYear !== undefined
          ? { minBirthYear: dto.minBirthYear ?? null }
          : {}),
        ...(dto.maxBirthYear !== undefined
          ? { maxBirthYear: dto.maxBirthYear ?? null }
          : {}),
        ...(dto.requireBirthDate !== undefined
          ? { requireBirthDate: dto.requireBirthDate }
          : {}),
        ...(dto.allowedGenders !== undefined
          ? { allowedGenders: dto.allowedGenders }
          : {}),
      },
      include: {
        ageGroup: { select: { id: true, name: true } },
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const row = await this.prisma.teamCategory.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Team category not found');
    await this.prisma.teamCategory.delete({ where: { id } });
    return { success: true };
  }
}

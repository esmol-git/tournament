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
      orderBy: [{ name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateTeamCategoryDto) {
    return this.prisma.teamCategory.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        slug: dto.slug?.trim() || null,
        minBirthYear: dto.minBirthYear ?? null,
        maxBirthYear: dto.maxBirthYear ?? null,
        requireBirthDate: dto.requireBirthDate ?? false,
        allowedGenders: dto.allowedGenders ?? [],
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateTeamCategoryDto) {
    const row = await this.prisma.teamCategory.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Team category not found');

    return this.prisma.teamCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug?.trim() || null } : {}),
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

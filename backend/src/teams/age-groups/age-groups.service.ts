import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAgeGroupDto } from './dto/create-age-group.dto';
import { UpdateAgeGroupDto } from './dto/update-age-group.dto';

@Injectable()
export class AgeGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.ageGroup.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateAgeGroupDto) {
    return this.prisma.ageGroup.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        shortLabel: dto.shortLabel?.trim() || null,
        code: dto.code?.trim() || null,
        note: dto.note?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        active: dto.active ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateAgeGroupDto) {
    const row = await this.prisma.ageGroup.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Age group not found');
    return this.prisma.ageGroup.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.shortLabel !== undefined
          ? { shortLabel: dto.shortLabel?.trim() || null }
          : {}),
        ...(dto.code !== undefined ? { code: dto.code?.trim() || null } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const row = await this.prisma.ageGroup.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Age group not found');
    await this.prisma.ageGroup.delete({ where: { id } });
    return { success: true };
  }
}

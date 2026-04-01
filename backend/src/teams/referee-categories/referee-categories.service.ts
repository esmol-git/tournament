import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRefereeCategoryDto } from './dto/create-referee-category.dto';
import { UpdateRefereeCategoryDto } from './dto/update-referee-category.dto';

@Injectable()
export class RefereeCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.refereeCategory.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateRefereeCategoryDto) {
    return this.prisma.refereeCategory.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        code: dto.code?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        active: dto.active ?? true,
        note: dto.note?.trim() || null,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateRefereeCategoryDto) {
    const row = await this.prisma.refereeCategory.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Referee category not found');
    return this.prisma.refereeCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined ? { code: dto.code?.trim() || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const row = await this.prisma.refereeCategory.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Referee category not found');
    await this.prisma.refereeCategory.delete({ where: { id } });
    return { success: true };
  }
}

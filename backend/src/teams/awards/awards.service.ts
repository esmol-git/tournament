import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAwardDto } from './dto/create-award.dto';
import { UpdateAwardDto } from './dto/update-award.dto';

@Injectable()
export class AwardsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.award.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateAwardDto) {
    return this.prisma.award.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        code: dto.code?.trim() || null,
        note: dto.note?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        active: dto.active ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateAwardDto) {
    const row = await this.prisma.award.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Award not found');
    return this.prisma.award.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined ? { code: dto.code?.trim() || null } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const row = await this.prisma.award.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Award not found');
    await this.prisma.award.delete({ where: { id } });
    return { success: true };
  }
}

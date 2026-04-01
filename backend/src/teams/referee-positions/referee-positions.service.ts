import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRefereePositionDto } from './dto/create-referee-position.dto';
import { UpdateRefereePositionDto } from './dto/update-referee-position.dto';

@Injectable()
export class RefereePositionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.refereePosition.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateRefereePositionDto) {
    return this.prisma.refereePosition.create({
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

  async update(tenantId: string, id: string, dto: UpdateRefereePositionDto) {
    const row = await this.prisma.refereePosition.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Referee position not found');
    return this.prisma.refereePosition.update({
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
    const row = await this.prisma.refereePosition.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Referee position not found');
    await this.prisma.refereePosition.delete({ where: { id } });
    return { success: true };
  }
}

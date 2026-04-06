import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMatchScheduleReasonDto } from './dto/create-match-schedule-reason.dto';
import { UpdateMatchScheduleReasonDto } from './dto/update-match-schedule-reason.dto';

@Injectable()
export class MatchScheduleReasonsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.matchScheduleReason.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateMatchScheduleReasonDto) {
    return this.prisma.matchScheduleReason.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        code: dto.code?.trim() || null,
        note: dto.note?.trim() || null,
        ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
        sortOrder: dto.sortOrder ?? 0,
        active: dto.active ?? true,
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateMatchScheduleReasonDto,
  ) {
    const row = await this.prisma.matchScheduleReason.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Match schedule reason not found');
    return this.prisma.matchScheduleReason.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined ? { code: dto.code?.trim() || null } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const row = await this.prisma.matchScheduleReason.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Match schedule reason not found');
    await this.prisma.matchScheduleReason.delete({ where: { id } });
    return { success: true };
  }
}

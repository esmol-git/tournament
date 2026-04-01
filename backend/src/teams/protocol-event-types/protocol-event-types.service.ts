import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProtocolEventTypeDto } from './dto/create-protocol-event-type.dto';
import { UpdateProtocolEventTypeDto } from './dto/update-protocol-event-type.dto';

@Injectable()
export class ProtocolEventTypesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.protocolEventType.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateProtocolEventTypeDto) {
    return this.prisma.protocolEventType.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        mapsToType: dto.mapsToType,
        note: dto.note?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        active: dto.active ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateProtocolEventTypeDto) {
    const row = await this.prisma.protocolEventType.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Protocol event type not found');
    return this.prisma.protocolEventType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.mapsToType !== undefined ? { mapsToType: dto.mapsToType } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const row = await this.prisma.protocolEventType.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Protocol event type not found');
    await this.prisma.protocolEventType.delete({ where: { id } });
    return { success: true };
  }
}

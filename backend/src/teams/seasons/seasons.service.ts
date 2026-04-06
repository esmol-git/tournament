import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TournamentTemplatesService } from '../../tournament-templates/tournament-templates.service';
import { CreateSeasonDto } from './dto/create-season.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';

@Injectable()
export class SeasonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentTemplates: TournamentTemplatesService,
  ) {}

  list(tenantId: string) {
    return this.prisma.season.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateSeasonDto) {
    return this.prisma.season.create({
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

  async update(tenantId: string, id: string, dto: UpdateSeasonDto) {
    const row = await this.prisma.season.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Season not found');
    return this.prisma.season.update({
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
    const row = await this.prisma.season.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Season not found');
    await this.tournamentTemplates.assertCanDeleteSeason(tenantId, id);
    await this.prisma.season.delete({ where: { id } });
    return { success: true };
  }
}

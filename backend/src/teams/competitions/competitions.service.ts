import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TournamentTemplatesService } from '../../tournament-templates/tournament-templates.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { UpdateCompetitionDto } from './dto/update-competition.dto';

@Injectable()
export class CompetitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentTemplates: TournamentTemplatesService,
  ) {}

  list(tenantId: string) {
    return this.prisma.competition.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateCompetitionDto) {
    return this.prisma.competition.create({
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

  async update(tenantId: string, id: string, dto: UpdateCompetitionDto) {
    const row = await this.prisma.competition.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Competition not found');
    return this.prisma.competition.update({
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
    const row = await this.prisma.competition.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Competition not found');
    await this.tournamentTemplates.assertCanDeleteCompetition(tenantId, id);
    await this.prisma.competition.delete({ where: { id } });
    return { success: true };
  }
}

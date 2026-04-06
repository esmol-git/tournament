import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReferenceDocumentDto } from './dto/create-reference-document.dto';
import { UpdateReferenceDocumentDto } from './dto/update-reference-document.dto';

@Injectable()
export class ReferenceDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeTournamentId(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  }

  private async assertTournamentBelongsToTenant(
    tenantId: string,
    tournamentId: string,
  ) {
    const row = await this.prisma.tournament.findFirst({
      where: { id: tournamentId, tenantId },
      select: { id: true },
    });
    if (!row) {
      throw new BadRequestException('Tournament not found');
    }
  }

  list(tenantId: string) {
    return this.prisma.referenceDocument.findMany({
      where: { tenantId },
      include: {
        tournament: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateReferenceDocumentDto) {
    const tournamentId = this.normalizeTournamentId(dto.tournamentId) ?? null;
    if (tournamentId) {
      await this.assertTournamentBelongsToTenant(tenantId, tournamentId);
    }
    return this.prisma.referenceDocument.create({
      data: {
        tenantId,
        tournamentId,
        title: dto.title.trim(),
        code: dto.code?.trim() || null,
        url: dto.url?.trim() || null,
        note: dto.note?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        active: dto.active ?? true,
      },
      include: {
        tournament: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateReferenceDocumentDto) {
    const row = await this.prisma.referenceDocument.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Document not found');
    const tournamentId = this.normalizeTournamentId(dto.tournamentId);
    if (tournamentId) {
      await this.assertTournamentBelongsToTenant(tenantId, tournamentId);
    }
    return this.prisma.referenceDocument.update({
      where: { id },
      data: {
        ...(dto.tournamentId !== undefined ? { tournamentId } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.code !== undefined ? { code: dto.code?.trim() || null } : {}),
        ...(dto.url !== undefined ? { url: dto.url?.trim() || null } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      include: {
        tournament: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const row = await this.prisma.referenceDocument.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Document not found');
    await this.prisma.referenceDocument.delete({ where: { id } });
    return { success: true };
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TournamentTemplatesService } from '../../tournament-templates/tournament-templates.service';
import { CreateStadiumDto } from './dto/create-stadium.dto';
import { UpdateStadiumDto } from './dto/update-stadium.dto';

@Injectable()
export class StadiumsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentTemplates: TournamentTemplatesService,
  ) {}

  list(tenantId: string) {
    return this.prisma.stadium.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        region: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async create(tenantId: string, dto: CreateStadiumDto) {
    let regionIdToSet: string | undefined = undefined;
    const rawReg = dto.regionId?.trim();
    if (rawReg) {
      const rg = await this.prisma.region.findFirst({
        where: { id: rawReg, tenantId },
        select: { id: true },
      });
      if (!rg) {
        throw new BadRequestException('Регион не найден');
      }
      regionIdToSet = rg.id;
    }

    return this.prisma.stadium.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        regionId: regionIdToSet,
        surface: dto.surface?.trim() || null,
        pitchCount:
          dto.pitchCount !== undefined && dto.pitchCount !== null
            ? dto.pitchCount
            : null,
        capacity:
          dto.capacity !== undefined && dto.capacity !== null
            ? dto.capacity
            : null,
        note: dto.note?.trim() || null,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateStadiumDto) {
    const row = await this.prisma.stadium.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Stadium not found');

    let regionForUpdate: string | null | undefined = undefined;
    if (dto.regionId !== undefined) {
      if (dto.regionId === null || dto.regionId === '') {
        regionForUpdate = null;
      } else {
        const rid = String(dto.regionId).trim();
        const rg = await this.prisma.region.findFirst({
          where: { id: rid, tenantId },
          select: { id: true },
        });
        if (!rg) {
          throw new BadRequestException('Регион не найден');
        }
        regionForUpdate = rid;
      }
    }

    return this.prisma.stadium.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.address !== undefined
          ? { address: dto.address?.trim() || null }
          : {}),
        ...(dto.city !== undefined ? { city: dto.city?.trim() || null } : {}),
        ...(dto.surface !== undefined
          ? { surface: dto.surface?.trim() || null }
          : {}),
        ...(dto.pitchCount !== undefined ? { pitchCount: dto.pitchCount } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(regionForUpdate !== undefined ? { regionId: regionForUpdate } : {}),
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const row = await this.prisma.stadium.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Stadium not found');
    await this.tournamentTemplates.assertCanDeleteStadium(tenantId, id);
    const [venueLinks, matchUses] = await Promise.all([
      this.prisma.tournamentStadium.count({ where: { stadiumId: id } }),
      this.prisma.match.count({ where: { stadiumId: id } }),
    ]);
    if (venueLinks > 0) {
      throw new ConflictException({
        message:
          'Нельзя удалить стадион: он указан в площадках турнира. Уберите его из турниров.',
        code: 'STADIUM_USED_BY_TOURNAMENT_VENUES',
      });
    }
    if (matchUses > 0) {
      throw new ConflictException({
        message:
          'Нельзя удалить стадион: он указан в матчах. Снимите привязку в расписании.',
        code: 'STADIUM_USED_BY_MATCHES',
      });
    }
    await this.prisma.stadium.delete({ where: { id } });
    return { success: true };
  }
}

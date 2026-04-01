import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRefereeDto } from './dto/create-referee.dto';
import { UpdateRefereeDto } from './dto/update-referee.dto';

const refereeInclude = {
  refereeCategory: {
    select: { id: true, name: true, code: true, active: true },
  },
  refereePosition: {
    select: { id: true, name: true, code: true, active: true },
  },
} as const;

@Injectable()
export class RefereesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.referee.findMany({
      where: { tenantId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: refereeInclude,
    });
  }

  private async resolveCategoryId(
    tenantId: string,
    raw: string | null | undefined,
  ): Promise<string | null> {
    if (raw === undefined || raw === null || raw === '') return null;
    const cat = await this.prisma.refereeCategory.findFirst({
      where: { id: raw, tenantId },
    });
    if (!cat) throw new BadRequestException('Referee category not found');
    return raw;
  }

  private async resolvePositionId(
    tenantId: string,
    raw: string | null | undefined,
  ): Promise<string | null> {
    if (raw === undefined || raw === null || raw === '') return null;
    const pos = await this.prisma.refereePosition.findFirst({
      where: { id: raw, tenantId },
    });
    if (!pos) throw new BadRequestException('Referee position not found');
    return raw;
  }

  async create(tenantId: string, dto: CreateRefereeDto) {
    const [refereeCategoryId, refereePositionId] = await Promise.all([
      this.resolveCategoryId(tenantId, dto.refereeCategoryId),
      this.resolvePositionId(tenantId, dto.refereePositionId),
    ]);
    return this.prisma.referee.create({
      data: {
        tenantId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim() || null,
        note: dto.note?.trim() || null,
        refereeCategoryId,
        refereePositionId,
      },
      include: refereeInclude,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateRefereeDto) {
    const row = await this.prisma.referee.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Referee not found');

    let refereeCategoryId: string | null | undefined = undefined;
    if (dto.refereeCategoryId !== undefined) {
      refereeCategoryId = await this.resolveCategoryId(
        tenantId,
        dto.refereeCategoryId,
      );
    }

    let refereePositionId: string | null | undefined = undefined;
    if (dto.refereePositionId !== undefined) {
      refereePositionId = await this.resolvePositionId(
        tenantId,
        dto.refereePositionId,
      );
    }

    return this.prisma.referee.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() }
          : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(refereeCategoryId !== undefined ? { refereeCategoryId } : {}),
        ...(refereePositionId !== undefined ? { refereePositionId } : {}),
      },
      include: refereeInclude,
    });
  }

  async delete(tenantId: string, id: string) {
    const row = await this.prisma.referee.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Referee not found');
    await this.prisma.referee.delete({ where: { id } });
    return { success: true };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateManagementMemberDto } from './dto/create-management-member.dto';
import { UpdateManagementMemberDto } from './dto/update-management-member.dto';

@Injectable()
export class ManagementMembersService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.managementMember.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateManagementMemberDto) {
    return this.prisma.managementMember.create({
      data: {
        tenantId,
        lastName: dto.lastName.trim(),
        firstName: dto.firstName.trim(),
        title: dto.title.trim(),
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        note: dto.note?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        active: dto.active ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateManagementMemberDto) {
    const row = await this.prisma.managementMember.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Management member not found');
    return this.prisma.managementMember.update({
      where: { id },
      data: {
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.email !== undefined
          ? { email: dto.email?.trim().toLowerCase() || null }
          : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const row = await this.prisma.managementMember.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Management member not found');
    await this.prisma.managementMember.delete({ where: { id } });
    return { success: true };
  }
}

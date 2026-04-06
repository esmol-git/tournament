import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';
import { PatchTenantDto } from './dto/patch-tenant.dto';
import { PatchTenantSubscriptionDto } from './dto/patch-tenant-subscription.dto';
import { Prisma, UserRole } from '@prisma/client';

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listTenants(query: ListTenantsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const q = query.q?.trim();
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { slug: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total, superAdminUsers] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { users: true, tournaments: true, teams: true } },
        },
      }),
      this.prisma.tenant.count({ where }),
      this.prisma.user.findMany({
        where: { role: UserRole.SUPER_ADMIN },
        select: { tenantId: true },
      }),
    ]);
    const superAdminCountMap = new Map<string, number>();
    for (const u of superAdminUsers) {
      superAdminCountMap.set(
        u.tenantId,
        (superAdminCountMap.get(u.tenantId) ?? 0) + 1,
      );
    }

    return {
      items: items.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        blocked: t.blocked,
        createdAt: t.createdAt,
        subscriptionPlan: t.subscriptionPlan,
        subscriptionStatus: t.subscriptionStatus,
        subscriptionEndsAt: t.subscriptionEndsAt,
        usersCount: t._count.users,
        tournamentsCount: t._count.tournaments,
        teamsCount: t._count.teams,
        superAdminsCount: superAdminCountMap.get(t.id) ?? 0,
        protectedFromRemoval: (superAdminCountMap.get(t.id) ?? 0) > 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  async updateTenantSubscription(id: string, dto: PatchTenantSubscriptionDto) {
    const exists = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Tenant not found');
    }

    const data: Prisma.TenantUpdateInput = {};

    if (dto.subscriptionPlan !== undefined) {
      data.subscriptionPlan = dto.subscriptionPlan;
    }
    if (dto.subscriptionStatus !== undefined) {
      data.subscriptionStatus = dto.subscriptionStatus;
    }
    if (dto.subscriptionEndsAt !== undefined) {
      data.subscriptionEndsAt =
        dto.subscriptionEndsAt === null
          ? null
          : new Date(dto.subscriptionEndsAt);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No subscription fields to update');
    }

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data,
    });

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      blocked: tenant.blocked,
      createdAt: tenant.createdAt,
      subscriptionPlan: tenant.subscriptionPlan,
      subscriptionStatus: tenant.subscriptionStatus,
      subscriptionEndsAt: tenant.subscriptionEndsAt,
    };
  }

  async updateTenant(id: string, dto: PatchTenantDto) {
    const exists = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Tenant not found');
    }

    const data: Prisma.TenantUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No tenant fields to update');
    }

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data,
    });

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      blocked: tenant.blocked,
      createdAt: tenant.createdAt,
      subscriptionPlan: tenant.subscriptionPlan,
      subscriptionStatus: tenant.subscriptionStatus,
      subscriptionEndsAt: tenant.subscriptionEndsAt,
    };
  }

  async setTenantBlocked(id: string, blocked: boolean) {
    const superAdminsCount = await this.prisma.user.count({
      where: { tenantId: id, role: UserRole.SUPER_ADMIN },
    });
    if (superAdminsCount > 0) {
      throw new BadRequestException(
        'Cannot block tenant that contains SUPER_ADMIN users',
      );
    }
    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: { blocked },
    });
    if (blocked) {
      await this.prisma.user.updateMany({
        where: { tenantId: id },
        data: { blocked: true },
      });
    }
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      blocked: tenant.blocked,
      createdAt: tenant.createdAt,
    };
  }

  async listTenantUsers(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const users = await this.prisma.user.findMany({
      where: { tenantId },
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        lastName: true,
        role: true,
        blocked: true,
        createdAt: true,
      },
    });

    return {
      tenant,
      items: users,
    };
  }

  async deleteTenant(id: string) {
    const exists = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Tenant not found');
    }
    const superAdminsCount = await this.prisma.user.count({
      where: { tenantId: id, role: UserRole.SUPER_ADMIN },
    });
    if (superAdminsCount > 0) {
      throw new BadRequestException(
        'Cannot delete tenant that contains SUPER_ADMIN users',
      );
    }

    // Hard delete with explicit ordering to satisfy FK constraints.
    // We delete tenant-scoped data first (and dependent tables via IDs), then tenant itself.
    const teamIds = await this.prisma.team.findMany({
      where: { tenantId: id },
      select: { id: true },
    });
    const matchIds = await this.prisma.match.findMany({
      where: { tenantId: id },
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (matchIds.length > 0) {
        await tx.matchEvent.deleteMany({
          where: { matchId: { in: matchIds.map((m) => m.id) } },
        });
      }

      await tx.match.deleteMany({ where: { tenantId: id } });
      await tx.tournamentTableRow.deleteMany({ where: { tenantId: id } });
      await tx.tournamentMember.deleteMany({ where: { tenantId: id } });
      await tx.tournamentGroup.deleteMany({ where: { tenantId: id } });
      await tx.tournamentTeam.deleteMany({ where: { tenantId: id } });
      await tx.tournament.deleteMany({ where: { tenantId: id } });

      if (teamIds.length > 0) {
        const ids = teamIds.map((t) => t.id);
        await tx.teamPlayer.deleteMany({ where: { teamId: { in: ids } } });
        await tx.teamAdmin.deleteMany({ where: { teamId: { in: ids } } });
      }

      await tx.player.deleteMany({ where: { tenantId: id } });
      await tx.teamCategory.deleteMany({ where: { tenantId: id } });
      await tx.team.deleteMany({ where: { tenantId: id } });
      await tx.refreshToken.deleteMany({ where: { tenantId: id } });

      await tx.tenant.delete({ where: { id } });
    });

    await this.storage.deleteAllForTenant(id);

    return { success: true };
  }
}

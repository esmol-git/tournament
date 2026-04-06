import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt.strategy';
import { isTenantSubscriptionActive } from './subscription-access.util';

/**
 * После `JwtAuthGuard`. Блокирует tenant-пользователей при blocked tenant или истёкшей подписке.
 * `SUPER_ADMIN` не проверяется (доступ к платформе и обход истекшего tenant).
 */
@Injectable()
export class TenantSubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = req.user;
    if (!user) return true;
    if (user.role === UserRole.SUPER_ADMIN) return true;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        blocked: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
      },
    });
    if (!tenant) {
      throw new ForbiddenException({
        message: 'Tenant not found',
        code: 'TENANT_NOT_FOUND',
      });
    }
    if (!isTenantSubscriptionActive(tenant)) {
      throw new ForbiddenException({
        message: tenant.blocked ? 'Tenant is blocked' : 'Subscription expired',
        code: tenant.blocked ? 'TENANT_BLOCKED' : 'SUBSCRIPTION_EXPIRED',
      });
    }
    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt.strategy';
import {
  SubscriptionPlanFeatureKey,
  tenantHasSubscriptionPlanFeature,
} from './subscription-plan-features.util';

export const SUBSCRIPTION_PLAN_FEATURE_KEY = 'subscriptionPlanFeature';

export const RequireSubscriptionPlanFeature = (
  feature: SubscriptionPlanFeatureKey,
) => SetMetadata(SUBSCRIPTION_PLAN_FEATURE_KEY, feature);

/**
 * После JwtAuthGuard. Проверяет `Tenant.subscriptionPlan` по метаданным контроллера.
 */
@Injectable()
export class SubscriptionPlanFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<
      SubscriptionPlanFeatureKey | undefined
    >(SUBSCRIPTION_PLAN_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = req.user;
    if (!user) return true;
    if (user.role === UserRole.SUPER_ADMIN) return true;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { subscriptionPlan: true },
    });
    if (!tenant) {
      throw new ForbiddenException({
        message: 'Tenant not found',
        code: 'TENANT_NOT_FOUND',
      });
    }
    if (tenantHasSubscriptionPlanFeature(tenant.subscriptionPlan, feature)) {
      return true;
    }
    throw new ForbiddenException({
      message: 'Недоступно на вашем тарифе',
      code: 'SUBSCRIPTION_PLAN_INSUFFICIENT',
    });
  }
}

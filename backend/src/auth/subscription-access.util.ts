import { ForbiddenException } from '@nestjs/common';

/** Доступ в админку tenant-API: не заблокирован и (если задан срок) подписка ещё не истекла. */
export function isTenantSubscriptionActive(tenant: {
  blocked: boolean;
  subscriptionEndsAt: Date | null;
}): boolean {
  if (tenant.blocked) return false;
  if (!tenant.subscriptionEndsAt) return true;
  return tenant.subscriptionEndsAt > new Date();
}

export function assertSubscriptionNotExpired(tenant: {
  subscriptionEndsAt: Date | null;
}): void {
  if (tenant.subscriptionEndsAt && tenant.subscriptionEndsAt <= new Date()) {
    throw new ForbiddenException({
      message:
        'Срок действия подписки организации истёк. Обратитесь к администратору или в поддержку.',
      code: 'SUBSCRIPTION_EXPIRED',
    });
  }
}

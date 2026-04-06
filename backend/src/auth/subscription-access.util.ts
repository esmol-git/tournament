import { ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';

const DEFAULT_PAST_DUE_GRACE_DAYS = 14;
const MAX_PAST_DUE_GRACE_DAYS = 60;

function pastDueGraceMs(): number {
  const raw = process.env.SUBSCRIPTION_PAST_DUE_GRACE_DAYS;
  if (raw === undefined || raw === '') {
    return DEFAULT_PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return DEFAULT_PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
  }
  const capped = Math.min(Math.floor(n), MAX_PAST_DUE_GRACE_DAYS);
  return capped * 24 * 60 * 60 * 1000;
}

/** Поля tenant, достаточные для проверки доступа по подписке. */
export type TenantSubscriptionAccessInput = {
  blocked: boolean;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: Date | null;
};

/**
 * Доступ в админку tenant-API: не заблокирован; учёт статуса подписки и
 * grace period для {@link SubscriptionStatus.PAST_DUE} после `subscriptionEndsAt`.
 */
export function isTenantSubscriptionActive(
  tenant: TenantSubscriptionAccessInput,
): boolean {
  if (tenant.blocked) return false;

  const now = Date.now();

  switch (tenant.subscriptionStatus) {
    case SubscriptionStatus.NONE:
      // Бесплатный тариф / без платёжного цикла.
      return true;

    case SubscriptionStatus.TRIAL:
    case SubscriptionStatus.ACTIVE:
      if (!tenant.subscriptionEndsAt) return true;
      return tenant.subscriptionEndsAt.getTime() > now;

    case SubscriptionStatus.PAST_DUE: {
      if (!tenant.subscriptionEndsAt) return false;
      const end = tenant.subscriptionEndsAt.getTime();
      // Период ещё не закончился — доступ есть.
      if (now <= end) return true;
      // После окончания оплаченного периода — grace.
      const graceEnd = end + pastDueGraceMs();
      return now <= graceEnd;
    }

    case SubscriptionStatus.CANCELED:
      // Отмена «в конце периода»: доступ до `subscriptionEndsAt`, как раньше по дате без учёта статуса.
      if (!tenant.subscriptionEndsAt) return false;
      return tenant.subscriptionEndsAt.getTime() > now;

    default:
      if (!tenant.subscriptionEndsAt) return true;
      return tenant.subscriptionEndsAt.getTime() > now;
  }
}

export function assertSubscriptionNotExpired(tenant: {
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: Date | null;
}): void {
  if (
    isTenantSubscriptionActive({
      blocked: false,
      subscriptionStatus: tenant.subscriptionStatus,
      subscriptionEndsAt: tenant.subscriptionEndsAt,
    })
  ) {
    return;
  }
  throw new ForbiddenException({
    message:
      'Срок действия подписки организации истёк. Обратитесь к администратору или в поддержку.',
    code: 'SUBSCRIPTION_EXPIRED',
  });
}

import { Injectable } from '@nestjs/common';
import { SubscriptionPlan } from '@prisma/client';
import {
  maxTeamsPerTenant,
  maxTournamentsForPlan,
  maxUsersPerTenant,
  subscriptionPlanIncludedFeatures,
} from '../auth/subscription-plan-features.util';

export type PublicPlanItemDto = {
  /** Код плана (как в БД / Prisma). */
  name: SubscriptionPlan;
  /** Цена в месяц, руб.; 0 — бесплатно. Заглушки для лендинга, уточняются маркетингом. */
  price: number;
  /** Лимит турниров; `null` — без лимита (WORLD_CUP). */
  tournaments: number | null;
  /** Ключи фич, совпадающие с проверками на бэкенде. */
  features: string[];
};

/**
 * Базовые цены (₽/мес). При необходимости вынести в env или БД.
 * Сейчас не используются в биллинге — только для отображения.
 */
const DEFAULT_MONTHLY_PRICE_RUB: Record<SubscriptionPlan, number> = {
  FREE: 0,
  AMATEUR: 999,
  PREMIER: 2999,
  CHAMPIONS: 7999,
  WORLD_CUP: 19999,
};

const PLAN_ORDER_PUBLIC: SubscriptionPlan[] = [
  'FREE',
  'AMATEUR',
  'PREMIER',
  'CHAMPIONS',
  'WORLD_CUP',
];

@Injectable()
export class PublicPlansService {
  getPublicPlans(): PublicPlanItemDto[] {
    return PLAN_ORDER_PUBLIC.map((name) => ({
      name,
      price: DEFAULT_MONTHLY_PRICE_RUB[name],
      tournaments: maxTournamentsForPlan(name),
      teamsPerTenant: maxTeamsPerTenant(name),
      usersPerTenant: maxUsersPerTenant(name),
      features: subscriptionPlanIncludedFeatures(name),
    }));
  }
}

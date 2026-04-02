import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPlan } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMyTenantSubscriptionPlanDto {
  @ApiProperty({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  subscriptionPlan!: SubscriptionPlan;
}

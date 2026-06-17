import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionPlanFeatureGuard } from '../auth/subscription-plan-feature.guard';
import { CompetitionEditionsController } from './competition-editions.controller';
import { CompetitionEditionsService } from './competition-editions.service';

@Module({
  imports: [PrismaModule],
  controllers: [CompetitionEditionsController],
  providers: [SubscriptionPlanFeatureGuard, CompetitionEditionsService],
  exports: [CompetitionEditionsService],
})
export class CompetitionEditionsModule {}

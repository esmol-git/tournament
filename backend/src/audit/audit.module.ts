import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesGuard } from '../auth/roles.guard';
import { SubscriptionPlanFeatureGuard } from '../auth/subscription-plan-feature.guard';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminAuditLogController } from './admin-audit-log.controller';
import { AdminAuditLogService } from './admin-audit-log.service';
import { AuditService } from './audit.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminAuditLogController],
  providers: [
    AuditService,
    AdminAuditLogService,
    AdminAuditInterceptor,
    SubscriptionPlanFeatureGuard,
    RolesGuard,
    { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },
  ],
  exports: [AuditService, AdminAuditLogService],
})
export class AuditModule {}

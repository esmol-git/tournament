import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  RequireSubscriptionPlanFeature,
  SubscriptionPlanFeatureGuard,
} from '../auth/subscription-plan-feature.guard';
import { TenantAdminStaffGuard } from '../auth/tenant-admin-staff.guard';
import { TenantParamConsistencyGuard } from '../auth/tenant-param-consistency.guard';
import { TenantSubscriptionGuard } from '../auth/tenant-subscription.guard';
import { TenantZoneGuard } from '../auth/tenant-zone.guard';
import { AdminAuditLogService } from './admin-audit-log.service';
import { ListAdminAuditLogQueryDto } from './dto/list-admin-audit-log.query.dto';

/**
 * Журнал аудита админ-API по организации: только {@link UserRole.TENANT_ADMIN}
 * и только на максимальном тарифе ({@link RequireSubscriptionPlanFeature} `audit_log`).
 */
@ApiTags('admin-audit')
@Controller()
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
  RolesGuard,
  SubscriptionPlanFeatureGuard,
)
export class AdminAuditLogController {
  constructor(private readonly adminAuditLogService: AdminAuditLogService) {}

  /** Сводка для «быстрых отчётов»; `forUser` — статистика по одному пользователю. */
  @Get('tenants/:tenantId/admin-audit-log/summary')
  @Roles(UserRole.TENANT_ADMIN)
  @RequireSubscriptionPlanFeature('audit_log')
  async summary(
    @Param('tenantId') tenantId: string,
    @Query('forUser') forUser?: string,
  ) {
    return this.adminAuditLogService.summary(tenantId, forUser);
  }

  @Get('tenants/:tenantId/admin-audit-log/:logId')
  @Roles(UserRole.TENANT_ADMIN)
  @RequireSubscriptionPlanFeature('audit_log')
  async getOne(
    @Param('tenantId') tenantId: string,
    @Param('logId') logId: string,
    @Query('locale') locale?: string,
  ) {
    return this.adminAuditLogService.getById(tenantId, logId, locale);
  }

  @Get('tenants/:tenantId/admin-audit-log')
  @Roles(UserRole.TENANT_ADMIN)
  @RequireSubscriptionPlanFeature('audit_log')
  async list(
    @Param('tenantId') tenantId: string,
    @Query() query: ListAdminAuditLogQueryDto,
  ) {
    return this.adminAuditLogService.list(tenantId, query);
  }
}

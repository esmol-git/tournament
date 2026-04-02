import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantParamConsistencyGuard } from '../auth/tenant-param-consistency.guard';
import { TenantSubscriptionGuard } from '../auth/tenant-subscription.guard';
import { TenantZoneGuard } from '../auth/tenant-zone.guard';
import { TenantAdminStaffGuard } from '../auth/tenant-admin-staff.guard';
import { UserRole } from '@prisma/client';

@ApiTags('meta')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
)
@Controller('meta')
export class MetaController {
  @Get('roles')
  getRoles() {
    const labels: Record<string, string> = {
      TENANT_ADMIN: 'Админ тенанта',
      TOURNAMENT_ADMIN: 'Админ турнира',
      TEAM_ADMIN: 'Админ команды',
      MODERATOR: 'Модератор',
      USER: 'Пользователь',
      REFEREE: 'Судья',
    };

    return Object.values(UserRole).map((value) => ({
      value,
      label: labels[value] ?? value,
    }));
  }
}

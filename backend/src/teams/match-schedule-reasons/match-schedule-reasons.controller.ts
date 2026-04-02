import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { JwtPayload } from '../../auth/jwt.strategy';
import { TenantParamConsistencyGuard } from '../../auth/tenant-param-consistency.guard';
import { TenantSubscriptionGuard } from '../../auth/tenant-subscription.guard';
import { TenantZoneGuard } from '../../auth/tenant-zone.guard';
import { TenantAdminStaffGuard } from '../../auth/tenant-admin-staff.guard';
import {
  RequireSubscriptionPlanFeature,
  SubscriptionPlanFeatureGuard,
} from '../../auth/subscription-plan-feature.guard';
import { CreateMatchScheduleReasonDto } from './dto/create-match-schedule-reason.dto';
import { UpdateMatchScheduleReasonDto } from './dto/update-match-schedule-reason.dto';
import { MatchScheduleReasonsService } from './match-schedule-reasons.service';

@RequireSubscriptionPlanFeature('reference_directory_advanced')
@ApiTags('match-schedule-reasons')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
  SubscriptionPlanFeatureGuard,
)
@Controller()
export class MatchScheduleReasonsController {
  constructor(private readonly service: MatchScheduleReasonsService) {}

  @Get('tenants/:tenantId/match-schedule-reasons')
  async list(@Param('tenantId') tenantId: string) {
    return this.service.list(tenantId);
  }

  @Post('tenants/:tenantId/match-schedule-reasons')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateMatchScheduleReasonDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.service.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/match-schedule-reasons/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMatchScheduleReasonDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/match-schedule-reasons/:id')
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.service.delete(tenantId, id);
  }
}

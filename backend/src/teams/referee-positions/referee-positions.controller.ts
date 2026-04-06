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
import { ModeratorForbiddenStaffGuard } from '../../auth/moderator-staff-scope.guard';
import {
  RequireSubscriptionPlanFeature,
  SubscriptionPlanFeatureGuard,
} from '../../auth/subscription-plan-feature.guard';
import { CreateRefereePositionDto } from './dto/create-referee-position.dto';
import { UpdateRefereePositionDto } from './dto/update-referee-position.dto';
import { RefereePositionsService } from './referee-positions.service';

@RequireSubscriptionPlanFeature('reference_directory_standard')
@ApiTags('referee-positions')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
  ModeratorForbiddenStaffGuard,
  SubscriptionPlanFeatureGuard,
)
@Controller()
export class RefereePositionsController {
  constructor(
    private readonly refereePositionsService: RefereePositionsService,
  ) {}

  @Get('tenants/:tenantId/referee-positions')
  async list(@Param('tenantId') tenantId: string) {
    return this.refereePositionsService.list(tenantId);
  }

  @Post('tenants/:tenantId/referee-positions')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateRefereePositionDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.refereePositionsService.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/referee-positions/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRefereePositionDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.refereePositionsService.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/referee-positions/:id')
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.refereePositionsService.delete(tenantId, id);
  }
}

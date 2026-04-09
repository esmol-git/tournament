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
import { CreateAwardDto } from './dto/create-award.dto';
import { UpdateAwardDto } from './dto/update-award.dto';
import { AwardsService } from './awards.service';

@RequireSubscriptionPlanFeature('reference_directory_standard')
@ApiTags('awards')
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
export class AwardsController {
  constructor(private readonly awardsService: AwardsService) {}

  @Get('tenants/:tenantId/awards')
  async list(@Param('tenantId') tenantId: string) {
    return this.awardsService.list(tenantId);
  }

  @Post('tenants/:tenantId/awards')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateAwardDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.awardsService.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/awards/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAwardDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.awardsService.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/awards/:id')
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.awardsService.delete(tenantId, id);
  }
}

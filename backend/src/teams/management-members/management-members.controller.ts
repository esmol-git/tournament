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
import { CreateManagementMemberDto } from './dto/create-management-member.dto';
import { UpdateManagementMemberDto } from './dto/update-management-member.dto';
import { ManagementMembersService } from './management-members.service';

@RequireSubscriptionPlanFeature('reference_directory_standard')
@ApiTags('management-members')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
  SubscriptionPlanFeatureGuard,
)
@Controller()
export class ManagementMembersController {
  constructor(
    private readonly managementMembersService: ManagementMembersService,
  ) {}

  @Get('tenants/:tenantId/management-members')
  async list(@Param('tenantId') tenantId: string) {
    return this.managementMembersService.list(tenantId);
  }

  @Post('tenants/:tenantId/management-members')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateManagementMemberDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.managementMembersService.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/management-members/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateManagementMemberDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.managementMembersService.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/management-members/:id')
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.managementMembersService.delete(tenantId, id);
  }
}

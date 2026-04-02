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
import { CreateRefereeDto } from './dto/create-referee.dto';
import { UpdateRefereeDto } from './dto/update-referee.dto';
import { RefereesService } from './referees.service';

@RequireSubscriptionPlanFeature('reference_directory_standard')
@ApiTags('referees')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
  SubscriptionPlanFeatureGuard,
)
@Controller()
export class RefereesController {
  constructor(private readonly refereesService: RefereesService) {}

  @Get('tenants/:tenantId/referees')
  async list(@Param('tenantId') tenantId: string) {
    return this.refereesService.list(tenantId);
  }

  @Post('tenants/:tenantId/referees')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateRefereeDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.refereesService.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/referees/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRefereeDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.refereesService.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/referees/:id')
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.refereesService.delete(tenantId, id);
  }
}

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
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { UpdateCompetitionDto } from './dto/update-competition.dto';
import { CompetitionsService } from './competitions.service';

@RequireSubscriptionPlanFeature('reference_directory_standard')
@ApiTags('competitions')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
  SubscriptionPlanFeatureGuard,
)
@Controller()
export class CompetitionsController {
  constructor(private readonly competitionsService: CompetitionsService) {}

  @Get('tenants/:tenantId/competitions')
  async list(@Param('tenantId') tenantId: string) {
    return this.competitionsService.list(tenantId);
  }

  @Post('tenants/:tenantId/competitions')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateCompetitionDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.competitionsService.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/competitions/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCompetitionDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.competitionsService.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/competitions/:id')
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.competitionsService.delete(tenantId, id);
  }
}

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
import { CreateRefereeCategoryDto } from './dto/create-referee-category.dto';
import { UpdateRefereeCategoryDto } from './dto/update-referee-category.dto';
import { RefereeCategoriesService } from './referee-categories.service';

@RequireSubscriptionPlanFeature('reference_directory_standard')
@ApiTags('referee-categories')
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
export class RefereeCategoriesController {
  constructor(
    private readonly refereeCategoriesService: RefereeCategoriesService,
  ) {}

  @Get('tenants/:tenantId/referee-categories')
  async list(@Param('tenantId') tenantId: string) {
    return this.refereeCategoriesService.list(tenantId);
  }

  @Post('tenants/:tenantId/referee-categories')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateRefereeCategoryDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.refereeCategoriesService.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/referee-categories/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRefereeCategoryDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.refereeCategoriesService.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/referee-categories/:id')
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.refereeCategoriesService.delete(tenantId, id);
  }
}

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
import { CreateProtocolEventTypeDto } from './dto/create-protocol-event-type.dto';
import { UpdateProtocolEventTypeDto } from './dto/update-protocol-event-type.dto';
import { ProtocolEventTypesService } from './protocol-event-types.service';

@RequireSubscriptionPlanFeature('reference_directory_advanced')
@ApiTags('protocol-event-types')
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
export class ProtocolEventTypesController {
  constructor(private readonly service: ProtocolEventTypesService) {}

  @Get('tenants/:tenantId/protocol-event-types')
  async list(@Param('tenantId') tenantId: string) {
    return this.service.list(tenantId);
  }

  @Post('tenants/:tenantId/protocol-event-types')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateProtocolEventTypeDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.service.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/protocol-event-types/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProtocolEventTypeDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/protocol-event-types/:id')
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.service.delete(tenantId, id);
  }
}

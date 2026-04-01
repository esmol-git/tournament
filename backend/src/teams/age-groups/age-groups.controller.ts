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
import { AgeGroupsService } from './age-groups.service';
import { CreateAgeGroupDto } from './dto/create-age-group.dto';
import { UpdateAgeGroupDto } from './dto/update-age-group.dto';

@ApiTags('age-groups')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
)
@Controller()
export class AgeGroupsController {
  constructor(private readonly ageGroupsService: AgeGroupsService) {}

  @Get('tenants/:tenantId/age-groups')
  async list(@Param('tenantId') tenantId: string) {
    return this.ageGroupsService.list(tenantId);
  }

  @Post('tenants/:tenantId/age-groups')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateAgeGroupDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.ageGroupsService.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/age-groups/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAgeGroupDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.ageGroupsService.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/age-groups/:id')
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.ageGroupsService.delete(tenantId, id);
  }
}

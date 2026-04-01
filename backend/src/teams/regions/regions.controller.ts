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
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { RegionsService } from './regions.service';

@ApiTags('regions')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
)
@Controller()
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get('tenants/:tenantId/regions')
  async list(@Param('tenantId') tenantId: string) {
    return this.regionsService.list(tenantId);
  }

  @Post('tenants/:tenantId/regions')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateRegionDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.regionsService.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/regions/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRegionDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.regionsService.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/regions/:id')
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.regionsService.delete(tenantId, id);
  }
}

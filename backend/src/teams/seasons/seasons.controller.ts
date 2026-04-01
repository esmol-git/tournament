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
import { CreateSeasonDto } from './dto/create-season.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';
import { SeasonsService } from './seasons.service';

@ApiTags('seasons')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
)
@Controller()
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Get('tenants/:tenantId/seasons')
  async list(@Param('tenantId') tenantId: string) {
    return this.seasonsService.list(tenantId);
  }

  @Post('tenants/:tenantId/seasons')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateSeasonDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.seasonsService.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/seasons/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSeasonDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.seasonsService.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/seasons/:id')
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.seasonsService.delete(tenantId, id);
  }
}

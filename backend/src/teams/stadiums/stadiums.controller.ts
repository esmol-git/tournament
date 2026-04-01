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
import { CreateStadiumDto } from './dto/create-stadium.dto';
import { UpdateStadiumDto } from './dto/update-stadium.dto';
import { StadiumsService } from './stadiums.service';

@ApiTags('stadiums')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
)
@Controller()
export class StadiumsController {
  constructor(private readonly stadiumsService: StadiumsService) {}

  @Get('tenants/:tenantId/stadiums')
  async list(@Param('tenantId') tenantId: string) {
    return this.stadiumsService.list(tenantId);
  }

  @Post('tenants/:tenantId/stadiums')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateStadiumDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.stadiumsService.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/stadiums/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStadiumDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.stadiumsService.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/stadiums/:id')
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.stadiumsService.delete(tenantId, id);
  }
}

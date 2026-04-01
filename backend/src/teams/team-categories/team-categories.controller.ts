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
import { CreateTeamCategoryDto } from './dto/create-team-category.dto';
import { UpdateTeamCategoryDto } from './dto/update-team-category.dto';
import { TeamCategoriesService } from './team-categories.service';

@ApiTags('team-categories')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
)
@Controller()
export class TeamCategoriesController {
  constructor(private readonly teamCategoriesService: TeamCategoriesService) {}

  @Get('tenants/:tenantId/team-categories')
  async list(@Param('tenantId') tenantId: string) {
    return this.teamCategoriesService.list(tenantId);
  }

  @Post('tenants/:tenantId/team-categories')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateTeamCategoryDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.teamCategoriesService.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/team-categories/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTeamCategoryDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.teamCategoriesService.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/team-categories/:id')
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.teamCategoriesService.delete(tenantId, id);
  }
}

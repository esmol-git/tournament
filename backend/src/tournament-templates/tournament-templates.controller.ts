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
import { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantParamConsistencyGuard } from '../auth/tenant-param-consistency.guard';
import { TenantSubscriptionGuard } from '../auth/tenant-subscription.guard';
import { TenantZoneGuard } from '../auth/tenant-zone.guard';
import { TenantAdminStaffGuard } from '../auth/tenant-admin-staff.guard';
import { ModeratorForbiddenStaffGuard } from '../auth/moderator-staff-scope.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { CreateTournamentTemplateDto } from './dto/create-tournament-template.dto';
import { UpdateTournamentTemplateDto } from './dto/update-tournament-template.dto';
import { TournamentTemplatesService } from './tournament-templates.service';

@ApiTags('tournament-templates')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
  ModeratorForbiddenStaffGuard,
)
@Controller()
export class TournamentTemplatesController {
  constructor(
    private readonly tournamentTemplates: TournamentTemplatesService,
  ) {}

  @Get('tenants/:tenantId/tournament-templates')
  list(@Param('tenantId') tenantId: string) {
    return this.tournamentTemplates.list(tenantId);
  }

  @Get('tenants/:tenantId/tournament-templates/:id')
  getOne(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.tournamentTemplates.getById(tenantId, id);
  }

  @Post('tenants/:tenantId/tournament-templates')
  create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateTournamentTemplateDto,
    @Req() _req: Request & { user: JwtPayload },
  ) {
    return this.tournamentTemplates.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/tournament-templates/:id')
  update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTournamentTemplateDto,
    @Req() _req: Request & { user: JwtPayload },
  ) {
    return this.tournamentTemplates.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/tournament-templates/:id')
  delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: Request & { user: JwtPayload },
  ) {
    return this.tournamentTemplates.delete(tenantId, id);
  }
}

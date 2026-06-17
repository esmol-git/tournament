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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { TenantParamConsistencyGuard } from '../auth/tenant-param-consistency.guard';
import { TenantSubscriptionGuard } from '../auth/tenant-subscription.guard';
import { TenantZoneGuard } from '../auth/tenant-zone.guard';
import { TenantAdminStaffGuard } from '../auth/tenant-admin-staff.guard';
import { ModeratorForbiddenStaffGuard } from '../auth/moderator-staff-scope.guard';
import {
  RequireSubscriptionPlanFeature,
  SubscriptionPlanFeatureGuard,
} from '../auth/subscription-plan-feature.guard';
import { CompetitionEditionsService } from './competition-editions.service';
import { CreateCompetitionEditionDto } from './dto/create-competition-edition.dto';
import { UpdateCompetitionEditionDto } from './dto/update-competition-edition.dto';
import { LinkTournamentToEditionDto } from './dto/link-tournament-to-edition.dto';

@RequireSubscriptionPlanFeature('reference_directory_standard')
@ApiTags('competition-editions')
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
export class CompetitionEditionsController {
  constructor(private readonly editions: CompetitionEditionsService) {}

  @Get('tenants/:tenantId/editions')
  list(@Param('tenantId') tenantId: string) {
    return this.editions.list(tenantId);
  }

  @Get('tenants/:tenantId/editions/:id')
  getById(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.editions.getById(tenantId, id);
  }

  @Post('tenants/:tenantId/editions')
  create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateCompetitionEditionDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.editions.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/editions/:id')
  update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCompetitionEditionDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.editions.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/editions/:id')
  delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.editions.delete(tenantId, id);
  }

  @Post('tenants/:tenantId/editions/:id/tournaments/:tournamentId')
  linkTournament(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: LinkTournamentToEditionDto,
  ) {
    return this.editions.linkTournament(
      tenantId,
      id,
      tournamentId,
      dto.regulationMode,
    );
  }

  @Delete('tenants/:tenantId/editions/:id/tournaments/:tournamentId')
  unlinkTournament(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.editions.unlinkTournament(tenantId, id, tournamentId);
  }
}

import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantParamConsistencyGuard } from '../auth/tenant-param-consistency.guard';
import { TenantSubscriptionGuard } from '../auth/tenant-subscription.guard';
import { TenantZoneGuard } from '../auth/tenant-zone.guard';
import { TenantAdminStaffGuard } from '../auth/tenant-admin-staff.guard';
import { TournamentManageGuard } from '../auth/tournament-manage.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { SetTournamentRosterDto } from './dto/set-tournament-roster.dto';
import { ImportTournamentRosterCsvDto } from './dto/import-tournament-roster-csv.dto';
import { ImportTournamentRosterXlsxDto } from './dto/import-tournament-roster-xlsx.dto';
import { SetTournamentRosterSanctionDto } from './dto/set-tournament-roster-sanction.dto';
import { TournamentRostersService } from './tournament-rosters.service';

@ApiTags('tournament-rosters')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
)
@Controller()
export class TournamentRostersController {
  constructor(private readonly service: TournamentRostersService) {}

  @Get('tournaments/:id/teams/:teamId/roster')
  list(
    @Param('id') tournamentId: string,
    @Param('teamId') teamId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.listForTeam(tournamentId, teamId, req.user);
  }

  @Get('tournaments/:id/teams/:teamId/protocol-players')
  protocolPlayers(
    @Param('id') tournamentId: string,
    @Param('teamId') teamId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.listProtocolPlayers(tournamentId, teamId, req.user);
  }

  @Get('tournaments/:id/teams/:teamId/roster/candidates')
  candidates(
    @Param('id') tournamentId: string,
    @Param('teamId') teamId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.listEligibleCandidates(tournamentId, teamId, req.user);
  }

  @Put('tournaments/:id/teams/:teamId/roster')
  set(
    @Param('id') tournamentId: string,
    @Param('teamId') teamId: string,
    @Body() dto: SetTournamentRosterDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.setForTeam(tournamentId, teamId, dto, req.user);
  }

  @Post('tournaments/:id/teams/:teamId/roster/submit')
  submit(
    @Param('id') tournamentId: string,
    @Param('teamId') teamId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.submitForTeam(tournamentId, teamId, req.user);
  }

  @Get('tournaments/:id/roster/summary')
  summary(
    @Param('id') tournamentId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.getSummaryForTournament(tournamentId, req.user);
  }

  @Post('tournaments/:id/roster/confirm-all')
  @UseGuards(TournamentManageGuard)
  confirmAll(
    @Param('id') tournamentId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.confirmAllForTournament(tournamentId, req.user);
  }

  @Post('tournaments/:id/teams/:teamId/roster/import-xlsx')
  @UseGuards(TournamentManageGuard)
  importXlsx(
    @Param('id') tournamentId: string,
    @Param('teamId') teamId: string,
    @Body() dto: ImportTournamentRosterXlsxDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.importFromXlsx(tournamentId, teamId, dto, req.user);
  }

  @Patch('tournaments/:id/teams/:teamId/roster/players/:playerId/sanction')
  @UseGuards(TournamentManageGuard)
  setSanction(
    @Param('id') tournamentId: string,
    @Param('teamId') teamId: string,
    @Param('playerId') playerId: string,
    @Body() dto: SetTournamentRosterSanctionDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.setPlayerSanction(
      tournamentId,
      teamId,
      playerId,
      dto,
      req.user,
    );
  }

  @Get('tournaments/:id/teams/:teamId/roster/template.csv')
  @UseGuards(TournamentManageGuard)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="tournament-roster-template.csv"')
  templateCsv() {
    return this.service.getRosterTemplateCsv();
  }

  @Post('tournaments/:id/teams/:teamId/roster/import-csv')
  @UseGuards(TournamentManageGuard)
  importCsv(
    @Param('id') tournamentId: string,
    @Param('teamId') teamId: string,
    @Body() dto: ImportTournamentRosterCsvDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.importFromCsv(tournamentId, teamId, dto, req.user);
  }
}

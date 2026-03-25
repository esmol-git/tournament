import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { GenerateCalendarDto } from './dto/generate-calendar.dto';
import { GenerateFromTemplateDto } from './dto/generate-from-template.dto';
import { ReorderRoundDto } from './dto/reorder-round.dto';
import { SetTeamGroupDto } from './dto/set-team-group.dto';
import { SyncTeamsGroupLayoutDto } from './dto/sync-teams-group-layout.dto';
import { SetTeamRatingDto } from './dto/set-team-rating.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { MatchesFilterQueryDto } from './dto/matches-filter-query.dto';
import { ListTenantTournamentsQueryDto } from './dto/list-tenant-tournaments-query.dto';

@ApiTags('tournaments')
@UseGuards(JwtAuthGuard)
@Controller()
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Get('tenants/:tenantId/tournaments')
  async listByTenant(
    @Param('tenantId') tenantId: string,
    @Query() query: ListTenantTournamentsQueryDto,
  ) {
    return this.tournamentsService.listByTenant(tenantId, query);
  }

  @Post('tenants/:tenantId/tournaments')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateTournamentDto,
  ) {
    return this.tournamentsService.create(tenantId, dto);
  }

  @Get('tournaments/:id')
  async getById(
    @Param('id') id: string,
    @Query() filters?: MatchesFilterQueryDto,
  ) {
    return this.tournamentsService.getById(id, filters);
  }

  @Patch('tournaments/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateTournamentDto) {
    return this.tournamentsService.update(id, dto);
  }

  @Delete('tournaments/:id')
  async delete(@Param('id') id: string) {
    return this.tournamentsService.delete(id);
  }

  @Get('tournaments/:id/table')
  async getTable(@Param('id') id: string, @Query('groupId') groupId?: string) {
    return this.tournamentsService.getTable(id, groupId);
  }

  @Post('tournaments/:id/teams/:teamId')
  async addTeam(@Param('id') id: string, @Param('teamId') teamId: string) {
    return this.tournamentsService.addTeam(id, teamId);
  }

  @Delete('tournaments/:id/teams/:teamId')
  async removeTeam(@Param('id') id: string, @Param('teamId') teamId: string) {
    return this.tournamentsService.removeTeam(id, teamId);
  }

  @Patch('tournaments/:id/teams/:teamId/group')
  async setTeamGroup(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Body() dto: SetTeamGroupDto,
  ) {
    return this.tournamentsService.setTeamGroup(
      id,
      teamId,
      dto.groupId ?? null,
    );
  }

  @Put('tournaments/:id/teams/group-layout')
  async syncTeamsGroupLayout(
    @Param('id') id: string,
    @Body() dto: SyncTeamsGroupLayoutDto,
  ) {
    return this.tournamentsService.syncTeamsGroupLayout(id, dto.items);
  }

  @Patch('tournaments/:id/teams/:teamId/rating')
  async setTeamRating(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Body() dto: SetTeamRatingDto,
  ) {
    return this.tournamentsService.setTeamRating(id, teamId, dto.rating);
  }

  @Post('tournaments/:id/calendar')
  async generateCalendar(
    @Param('id') id: string,
    @Body() dto: GenerateCalendarDto,
  ) {
    return this.tournamentsService.generateCalendar(id, dto);
  }

  @Post('tournaments/:id/calendar/from-template')
  async generateCalendarFromTemplate(
    @Param('id') id: string,
    @Body() dto: GenerateFromTemplateDto,
  ) {
    return this.tournamentsService.generateCalendarFromTemplate(id, dto);
  }

  @Delete('tournaments/:id/calendar')
  async clearCalendar(@Param('id') id: string) {
    return this.tournamentsService.clearCalendar(id);
  }

  @Post('tournaments/:id/playoff')
  async generatePlayoff(@Param('id') id: string) {
    return this.tournamentsService.generatePlayoff(id, {
      replaceExisting: true,
    });
  }

  @Post('tournaments/:tournamentId/rounds/:roundDate/reorder')
  async reorderRound(
    @Param('tournamentId') tournamentId: string,
    @Param('roundDate') roundDate: string,
    @Body() dto: ReorderRoundDto,
  ) {
    return this.tournamentsService.reorderRound(tournamentId, roundDate, dto);
  }
}

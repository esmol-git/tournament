import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { CreateTeamDto } from './dto/create-team.dto';
import { TeamQueryDto } from './dto/team-query.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { CreateTeamPlayerDto } from './dto/create-team-player.dto';
import { CreateTeamPlayersBulkDto } from './dto/create-team-players-bulk.dto';
import { TeamPlayersQueryDto } from './dto/team-players-query.dto';
import { UpdateTeamPlayerDto } from './dto/update-team-player.dto';
import { TeamsService } from './teams.service';

@ApiTags('teams')
@UseGuards(JwtAuthGuard)
@Controller()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get('tenants/:tenantId/teams')
  async list(
    @Param('tenantId') tenantId: string,
    @Req() req: { user: JwtPayload },
    @Query() query: TeamQueryDto,
  ) {
    return this.teamsService.list(
      tenantId,
      req.user.sub,
      req.user.role as any,
      query,
    );
  }

  @Post('tenants/:tenantId/teams')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teamsService.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/teams/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/teams/:id')
  async delete(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.teamsService.delete(tenantId, id);
  }

  @Get('tenants/:tenantId/teams/:teamId/players')
  async listTeamPlayers(
    @Param('tenantId') tenantId: string,
    @Param('teamId') teamId: string,
    @Req() req: { user: JwtPayload },
    @Query() query: TeamPlayersQueryDto,
  ) {
    return this.teamsService.listTeamPlayers(
      tenantId,
      req.user.sub,
      req.user.role as any,
      teamId,
      query,
    );
  }

  @Post('tenants/:tenantId/teams/:teamId/players')
  async addTeamPlayer(
    @Param('tenantId') tenantId: string,
    @Param('teamId') teamId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: CreateTeamPlayerDto,
  ) {
    return this.teamsService.addTeamPlayer(
      tenantId,
      req.user.sub,
      req.user.role as any,
      teamId,
      dto,
    );
  }

  @Post('tenants/:tenantId/teams/:teamId/players/bulk')
  async addTeamPlayersBulk(
    @Param('tenantId') tenantId: string,
    @Param('teamId') teamId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: CreateTeamPlayersBulkDto,
  ) {
    return this.teamsService.addTeamPlayersBulk(
      tenantId,
      req.user.sub,
      req.user.role as any,
      teamId,
      dto,
    );
  }

  @Patch('tenants/:tenantId/teams/:teamId/players/:playerId')
  async updateTeamPlayer(
    @Param('tenantId') tenantId: string,
    @Param('teamId') teamId: string,
    @Param('playerId') playerId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: UpdateTeamPlayerDto,
  ) {
    return this.teamsService.updateTeamPlayer(
      tenantId,
      req.user.sub,
      req.user.role as any,
      teamId,
      playerId,
      dto,
    );
  }

  @Delete('tenants/:tenantId/teams/:teamId/players/:playerId')
  async deleteTeamPlayer(
    @Param('tenantId') tenantId: string,
    @Param('teamId') teamId: string,
    @Param('playerId') playerId: string,
    @Req() req: { user: JwtPayload },
  ) {
    return this.teamsService.deleteTeamPlayer(
      tenantId,
      req.user.sub,
      req.user.role as any,
      teamId,
      playerId,
    );
  }
}

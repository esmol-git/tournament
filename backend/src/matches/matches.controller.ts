import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Patch,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MatchesService } from './matches.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateProtocolDto } from './dto/update-protocol.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { CreateStandaloneMatchDto } from './dto/create-standalone-match.dto';
import { AttachMatchToTournamentDto } from './dto/attach-match-to-tournament.dto';
import { ListTenantMatchesQueryDto } from './dto/list-tenant-matches-query.dto';
import { ListStandaloneMatchesQueryDto } from './dto/list-standalone-matches-query.dto';
import { Request } from 'express';
import { JwtPayload } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

function assertTenant(req: Request & { user: JwtPayload }, tenantId: string) {
  if (req.user.tenantId !== tenantId) {
    throw new ForbiddenException('Нет доступа к этому арендатору');
  }
}

@ApiTags('matches')
@UseGuards(JwtAuthGuard)
@Controller()
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get('tenants/:tenantId/standalone-matches')
  async listStandaloneMatches(
    @Param('tenantId') tenantId: string,
    @Req() req: Request & { user: JwtPayload },
    @Query() query: ListStandaloneMatchesQueryDto,
  ) {
    assertTenant(req, tenantId);
    return this.matchesService.listStandaloneMatches(
      tenantId,
      req.user.role as UserRole,
      query,
    );
  }

  @Get('tenants/:tenantId/matches')
  async listTenantMatches(
    @Param('tenantId') tenantId: string,
    @Req() req: Request & { user: JwtPayload },
    @Query() query: ListTenantMatchesQueryDto,
  ) {
    assertTenant(req, tenantId);
    return this.matchesService.listTenantMatches(
      tenantId,
      req.user.role as UserRole,
      query,
    );
  }

  @Post('tenants/:tenantId/standalone-matches')
  async createStandaloneMatch(
    @Param('tenantId') tenantId: string,
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: CreateStandaloneMatchDto,
  ) {
    assertTenant(req, tenantId);
    return this.matchesService.createStandaloneMatch(tenantId, req.user.role as UserRole, dto);
  }

  @Patch('tenants/:tenantId/standalone-matches/:matchId')
  async updateStandaloneMatch(
    @Param('tenantId') tenantId: string,
    @Param('matchId') matchId: string,
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UpdateMatchDto,
  ) {
    assertTenant(req, tenantId);
    return this.matchesService.updateStandaloneMatch(tenantId, matchId, req.user.role as UserRole, {
      startTime: dto.startTime ? new Date(dto.startTime) : undefined,
      homeTeamId: dto.homeTeamId,
      awayTeamId: dto.awayTeamId,
    });
  }

  @Delete('tenants/:tenantId/standalone-matches/:matchId')
  async deleteStandaloneMatch(
    @Param('tenantId') tenantId: string,
    @Param('matchId') matchId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    assertTenant(req, tenantId);
    return this.matchesService.deleteStandaloneMatch(
      tenantId,
      matchId,
      req.user.role as UserRole,
    );
  }

  @Patch('tenants/:tenantId/standalone-matches/:matchId/protocol')
  async updateStandaloneProtocol(
    @Param('tenantId') tenantId: string,
    @Param('matchId') matchId: string,
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UpdateProtocolDto,
  ) {
    assertTenant(req, tenantId);
    return this.matchesService.updateStandaloneProtocol(
      tenantId,
      matchId,
      req.user.role as UserRole,
      dto,
    );
  }

  @Post('tenants/:tenantId/standalone-matches/:matchId/attach')
  async attachMatchToTournament(
    @Param('tenantId') tenantId: string,
    @Param('matchId') matchId: string,
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: AttachMatchToTournamentDto,
  ) {
    assertTenant(req, tenantId);
    return this.matchesService.attachMatchToTournament(
      tenantId,
      matchId,
      req.user.role as UserRole,
      dto.tournamentId,
    );
  }

  @Post('tenants/:tenantId/matches/:matchId/detach')
  async detachMatchFromTournament(
    @Param('tenantId') tenantId: string,
    @Param('matchId') matchId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    assertTenant(req, tenantId);
    return this.matchesService.detachMatchFromTournament(
      tenantId,
      matchId,
      req.user.role as UserRole,
    );
  }

  @Post('tournaments/:tournamentId/matches')
  async createMatch(
    @Param('tournamentId') tournamentId: string,
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: CreateMatchDto,
  ) {
    return this.matchesService.createMatch(
      tournamentId,
      req.user.role as UserRole,
      dto,
    );
  }

  @Delete('tournaments/:tournamentId/matches/:matchId')
  async deleteMatch(
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.matchesService.deleteMatch(
      tournamentId,
      matchId,
      req.user.role as UserRole,
    );
  }

  @Patch('tournaments/:tournamentId/matches/:matchId')
  async updateMatch(
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UpdateMatchDto,
  ) {
    return this.matchesService.updateMatch(
      tournamentId,
      matchId,
      req.user.role as any,
      {
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        homeTeamId: dto.homeTeamId,
        awayTeamId: dto.awayTeamId,
        roundNumber: dto.roundNumber,
        groupId: dto.groupId,
      },
    );
  }

  @Patch('tournaments/:tournamentId/matches/:matchId/protocol')
  async updateProtocol(
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UpdateProtocolDto,
  ) {
    return this.matchesService.updateProtocol(
      tournamentId,
      matchId,
      req.user.role as any,
      dto,
    );
  }
}

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
import { TenantParamConsistencyGuard } from '../auth/tenant-param-consistency.guard';
import { TenantSubscriptionGuard } from '../auth/tenant-subscription.guard';
import { TenantZoneGuard } from '../auth/tenant-zone.guard';
import { TenantAdminStaffGuard } from '../auth/tenant-admin-staff.guard';
import { TournamentMatchStaffGuard } from '../auth/tournament-match-staff.guard';
import { MatchesService } from './matches.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateProtocolDto } from './dto/update-protocol.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { CreateStandaloneMatchDto } from './dto/create-standalone-match.dto';
import { AttachMatchToTournamentDto } from './dto/attach-match-to-tournament.dto';
import { ListTenantMatchesQueryDto } from './dto/list-tenant-matches-query.dto';
import { ListStandaloneMatchesQueryDto } from './dto/list-standalone-matches-query.dto';
import { BulkUpdateMatchesDto } from './dto/bulk-update-matches.dto';
import { QuickUpdateMatchStatusDto } from './dto/quick-update-match-status.dto';
import { ListMatchSuggestionsQueryDto } from './dto/list-match-suggestions-query.dto';
import { Request } from 'express';
import { JwtPayload } from '../auth/jwt.strategy';
import { ApiErrorCode } from '../common/api-error-codes';
import { UserRole } from '@prisma/client';

/** Модератору недоступны отдельные операции «по всему тенанту» (не календарь турнирных матчей). */
function assertModeratorNoOrgWideMatchAccess(user: JwtPayload) {
  if (user.role === UserRole.MODERATOR) {
    throw new ForbiddenException({
      message: 'Действие недоступно для модератора',
      code: ApiErrorCode.INSUFFICIENT_ROLE,
    });
  }
}

function assertTenant(req: Request & { user: JwtPayload }, tenantId: string) {
  if (req.user.tenantId !== tenantId) {
    throw new ForbiddenException({
      message: 'Нет доступа к ресурсу другой организации',
      code: ApiErrorCode.CROSS_TENANT_ACCESS_DENIED,
    });
  }
}

@ApiTags('matches')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
)
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
      req.user.role,
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
      req.user.role,
      req.user.sub,
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
    assertModeratorNoOrgWideMatchAccess(req.user);
    return this.matchesService.createStandaloneMatch(
      tenantId,
      req.user.role,
      dto,
    );
  }

  @Patch('tenants/:tenantId/standalone-matches/:matchId')
  async updateStandaloneMatch(
    @Param('tenantId') tenantId: string,
    @Param('matchId') matchId: string,
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UpdateMatchDto,
  ) {
    assertTenant(req, tenantId);
    return this.matchesService.updateStandaloneMatch(
      tenantId,
      matchId,
      req.user.role,
      {
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        homeTeamId: dto.homeTeamId,
        awayTeamId: dto.awayTeamId,
        scheduleChangeReasonId: dto.scheduleChangeReasonId,
        scheduleChangeNote: dto.scheduleChangeNote,
        stadiumId: dto.stadiumId,
      },
    );
  }

  @Delete('tenants/:tenantId/standalone-matches/:matchId')
  async deleteStandaloneMatch(
    @Param('tenantId') tenantId: string,
    @Param('matchId') matchId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    assertTenant(req, tenantId);
    assertModeratorNoOrgWideMatchAccess(req.user);
    return this.matchesService.deleteStandaloneMatch(
      tenantId,
      matchId,
      req.user.role,
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
      req.user.role,
      dto,
      req.user.sub,
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
    assertModeratorNoOrgWideMatchAccess(req.user);
    return this.matchesService.attachMatchToTournament(
      tenantId,
      matchId,
      req.user,
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
    assertModeratorNoOrgWideMatchAccess(req.user);
    return this.matchesService.detachMatchFromTournament(
      tenantId,
      matchId,
      req.user,
    );
  }

  @Post('tournaments/:tournamentId/matches')
  @UseGuards(TournamentMatchStaffGuard)
  async createMatch(
    @Param('tournamentId') tournamentId: string,
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: CreateMatchDto,
  ) {
    return this.matchesService.createMatch(tournamentId, req.user.role, dto);
  }

  @Delete('tournaments/:tournamentId/matches/:matchId')
  @UseGuards(TournamentMatchStaffGuard)
  async deleteMatch(
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.matchesService.deleteMatch(
      tournamentId,
      matchId,
      req.user.role,
    );
  }

  @Patch('tournaments/:tournamentId/matches/bulk')
  @UseGuards(TournamentMatchStaffGuard)
  async bulkUpdateMatches(
    @Param('tournamentId') tournamentId: string,
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: BulkUpdateMatchesDto,
  ) {
    return this.matchesService.bulkUpdateTournamentMatches(
      tournamentId,
      req.user.role as any,
      dto,
    );
  }

  @Patch('tournaments/:tournamentId/matches/:matchId')
  @UseGuards(TournamentMatchStaffGuard)
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
        scheduleChangeReasonId: dto.scheduleChangeReasonId,
        scheduleChangeNote: dto.scheduleChangeNote,
        stadiumId: dto.stadiumId,
        publishedOnPublic: dto.publishedOnPublic,
      },
    );
  }

  @Patch('tournaments/:tournamentId/matches/:matchId/status')
  @UseGuards(TournamentMatchStaffGuard)
  async quickUpdateMatchStatus(
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: QuickUpdateMatchStatusDto,
  ) {
    return this.matchesService.quickUpdateTournamentMatchStatus(
      tournamentId,
      matchId,
      req.user.role as any,
      dto.status,
    );
  }

  @Get('tournaments/:tournamentId/matches/:matchId/suggestions')
  @UseGuards(TournamentMatchStaffGuard)
  async listMatchSuggestions(
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
    @Req() req: Request & { user: JwtPayload },
    @Query() query: ListMatchSuggestionsQueryDto,
  ) {
    return this.matchesService.listMatchConflictSuggestions(
      tournamentId,
      matchId,
      req.user.role as any,
      query,
    );
  }

  @Patch('tournaments/:tournamentId/matches/:matchId/protocol')
  @UseGuards(TournamentMatchStaffGuard)
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
      req.user.sub,
    );
  }
}

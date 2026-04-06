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
import { TenantContentGuard } from '../auth/tenant-content.guard';
import { TournamentContentGuard } from '../auth/tournament-content.guard';
import { TournamentManageGuard } from '../auth/tournament-manage.guard';
import { TournamentMatchStaffGuard } from '../auth/tournament-match-staff.guard';
import { ModeratorForbiddenStaffGuard } from '../auth/moderator-staff-scope.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { GenerateCalendarDto } from './dto/generate-calendar.dto';
import { ReorderRoundDto } from './dto/reorder-round.dto';
import { SetTeamGroupDto } from './dto/set-team-group.dto';
import { SyncTeamsGroupLayoutDto } from './dto/sync-teams-group-layout.dto';
import { SetTeamRatingDto } from './dto/set-team-rating.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { MatchesFilterQueryDto } from './dto/matches-filter-query.dto';
import { ListTenantTournamentsQueryDto } from './dto/list-tenant-tournaments-query.dto';
import { CreateTournamentNewsDto } from './dto/create-tournament-news.dto';
import { UpdateTournamentNewsDto } from './dto/update-tournament-news.dto';
import { ListTournamentNewsQueryDto } from './dto/list-tournament-news-query.dto';
import { ListTenantNewsQueryDto } from './dto/list-tenant-news-query.dto';
import { CreateGalleryImageDto } from './dto/create-gallery-image.dto';
import { UpdateGalleryImageDto } from './dto/update-gallery-image.dto';
import { ReorderGalleryDto } from './dto/reorder-gallery.dto';
import { CreateNewsTagDto } from './dto/create-news-tag.dto';
import { UpdateNewsTagDto } from './dto/update-news-tag.dto';

/**
 * Доступ поверх JwtAuth + tenant guards:
 *
 * - **Только чтение (без object-guard):** список турниров тенанта. Новости/теги тенанта и создание турнира — не для MODERATOR.
 * - **Контент тенанта (мутации):** {@link TenantContentGuard} — POST/PATCH/DELETE `tenants/:tenantId/news*`, `news-tags*`.
 * - **Управление турниром:** {@link TournamentManageGuard} — PATCH/DELETE карточки, составы, календарь, плей-офф.
 * - **Просмотр турнира и таблицы в админке:** {@link TournamentMatchStaffGuard} — GET карточки и `GET .../table` (в т.ч. модераторы турнира).
 * - **Контент турнира:** {@link TournamentContentGuard} — новости и галерея по `tournaments/:id/...`.
 *
 * Публичный просмотр таблицы/сайта — эндпоинты {@link PublicModule}, не `GET .../tournaments/:id/table` здесь.
 */
@ApiTags('tournaments')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
)
@Controller()
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Get('tenants/:tenantId/tournaments')
  async listByTenant(
    @Param('tenantId') tenantId: string,
    @Query() query: ListTenantTournamentsQueryDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.tournamentsService.listByTenant(tenantId, query, {
      userId: req.user.sub,
      role: req.user.role,
    });
  }

  @Post('tenants/:tenantId/tournaments')
  @UseGuards(ModeratorForbiddenStaffGuard)
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateTournamentDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.tournamentsService.create(tenantId, dto, req.user.sub);
  }

  @Get('tenants/:tenantId/news')
  async listNewsByTenant(
    @Param('tenantId') tenantId: string,
    @Query() query: ListTenantNewsQueryDto,
  ) {
    return this.tournamentsService.listNewsByTenant(tenantId, query);
  }

  @Post('tenants/:tenantId/news')
  @UseGuards(TenantContentGuard)
  async createNewsByTenant(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateTournamentNewsDto,
  ) {
    return this.tournamentsService.createNewsByTenant(tenantId, dto);
  }

  @Patch('tenants/:tenantId/news/:newsId')
  @UseGuards(TenantContentGuard)
  async updateNewsByTenant(
    @Param('tenantId') tenantId: string,
    @Param('newsId') newsId: string,
    @Body() dto: UpdateTournamentNewsDto,
  ) {
    return this.tournamentsService.updateNewsByTenant(tenantId, newsId, dto);
  }

  @Delete('tenants/:tenantId/news/:newsId')
  @UseGuards(TenantContentGuard)
  async deleteNewsByTenant(
    @Param('tenantId') tenantId: string,
    @Param('newsId') newsId: string,
  ) {
    return this.tournamentsService.deleteNewsByTenant(tenantId, newsId);
  }

  @Get('tenants/:tenantId/news-tags')
  @UseGuards(ModeratorForbiddenStaffGuard)
  async listNewsTagsByTenant(@Param('tenantId') tenantId: string) {
    return this.tournamentsService.listNewsTagsByTenant(tenantId);
  }

  @Post('tenants/:tenantId/news-tags')
  @UseGuards(TenantContentGuard)
  async createNewsTagByTenant(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateNewsTagDto,
  ) {
    return this.tournamentsService.createNewsTagByTenant(tenantId, dto);
  }

  @Patch('tenants/:tenantId/news-tags/:tagId')
  @UseGuards(TenantContentGuard)
  async updateNewsTagByTenant(
    @Param('tenantId') tenantId: string,
    @Param('tagId') tagId: string,
    @Body() dto: UpdateNewsTagDto,
  ) {
    return this.tournamentsService.updateNewsTagByTenant(tenantId, tagId, dto);
  }

  @Delete('tenants/:tenantId/news-tags/:tagId')
  @UseGuards(TenantContentGuard)
  async deleteNewsTagByTenant(
    @Param('tenantId') tenantId: string,
    @Param('tagId') tagId: string,
  ) {
    return this.tournamentsService.deleteNewsTagByTenant(tenantId, tagId);
  }

  @Get('tournaments/:id')
  @UseGuards(TournamentMatchStaffGuard)
  async getById(
    @Param('id') id: string,
    @Query() filters?: MatchesFilterQueryDto,
  ) {
    return this.tournamentsService.getById(id, filters);
  }

  @Patch('tournaments/:id')
  @UseGuards(TournamentManageGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateTournamentDto) {
    return this.tournamentsService.update(id, dto);
  }

  @Delete('tournaments/:id')
  @UseGuards(TournamentManageGuard)
  async delete(@Param('id') id: string) {
    return this.tournamentsService.delete(id);
  }

  @Get('tournaments/:id/table')
  @UseGuards(TournamentMatchStaffGuard)
  async getTable(
    @Param('id') id: string,
    @Query('groupId') groupId?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedOffset = Number.isFinite(Number(offset))
      ? Math.max(0, Number(offset))
      : undefined;
    const parsedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : undefined;
    return this.tournamentsService.getTable(
      id,
      groupId,
      parsedOffset,
      parsedLimit,
    );
  }

  @Post('tournaments/:id/teams/:teamId')
  @UseGuards(TournamentManageGuard)
  async addTeam(@Param('id') id: string, @Param('teamId') teamId: string) {
    return this.tournamentsService.addTeam(id, teamId);
  }

  @Delete('tournaments/:id/teams/:teamId')
  @UseGuards(TournamentManageGuard)
  async removeTeam(@Param('id') id: string, @Param('teamId') teamId: string) {
    return this.tournamentsService.removeTeam(id, teamId);
  }

  @Patch('tournaments/:id/teams/:teamId/group')
  @UseGuards(TournamentManageGuard)
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
  @UseGuards(TournamentManageGuard)
  async syncTeamsGroupLayout(
    @Param('id') id: string,
    @Body() dto: SyncTeamsGroupLayoutDto,
  ) {
    return this.tournamentsService.syncTeamsGroupLayout(id, dto.items);
  }

  @Patch('tournaments/:id/teams/:teamId/rating')
  @UseGuards(TournamentManageGuard)
  async setTeamRating(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Body() dto: SetTeamRatingDto,
  ) {
    return this.tournamentsService.setTeamRating(id, teamId, dto.rating);
  }

  @Post('tournaments/:id/calendar')
  @UseGuards(TournamentManageGuard)
  async generateCalendar(
    @Param('id') id: string,
    @Body() dto: GenerateCalendarDto,
  ) {
    return this.tournamentsService.generateCalendar(id, dto);
  }

  @Delete('tournaments/:id/calendar')
  @UseGuards(TournamentManageGuard)
  async clearCalendar(@Param('id') id: string) {
    return this.tournamentsService.clearCalendar(id);
  }

  @Post('tournaments/:id/playoff')
  @UseGuards(TournamentManageGuard)
  async generatePlayoff(@Param('id') id: string) {
    return this.tournamentsService.generatePlayoff(id, {
      replaceExisting: true,
    });
  }

  @Post('tournaments/:tournamentId/rounds/:roundDate/reorder')
  @UseGuards(TournamentManageGuard)
  async reorderRound(
    @Param('tournamentId') tournamentId: string,
    @Param('roundDate') roundDate: string,
    @Body() dto: ReorderRoundDto,
  ) {
    return this.tournamentsService.reorderRound(tournamentId, roundDate, dto);
  }

  @Get('tournaments/:id/news')
  @UseGuards(TournamentContentGuard)
  async listNews(
    @Param('id') id: string,
    @Query() query: ListTournamentNewsQueryDto,
  ) {
    return this.tournamentsService.listNews(id, query);
  }

  @Post('tournaments/:id/news')
  @UseGuards(TournamentContentGuard)
  async createNews(
    @Param('id') id: string,
    @Body() dto: CreateTournamentNewsDto,
  ) {
    return this.tournamentsService.createNews(id, dto);
  }

  @Patch('tournaments/:id/news/:newsId')
  @UseGuards(TournamentContentGuard)
  async updateNews(
    @Param('id') id: string,
    @Param('newsId') newsId: string,
    @Body() dto: UpdateTournamentNewsDto,
  ) {
    return this.tournamentsService.updateNews(id, newsId, dto);
  }

  @Delete('tournaments/:id/news/:newsId')
  @UseGuards(TournamentContentGuard)
  async deleteNews(@Param('id') id: string, @Param('newsId') newsId: string) {
    return this.tournamentsService.deleteNews(id, newsId);
  }

  @Get('tournaments/:id/gallery')
  @UseGuards(TournamentContentGuard)
  async listGallery(@Param('id') id: string) {
    return this.tournamentsService.listGallery(id);
  }

  @Post('tournaments/:id/gallery')
  @UseGuards(TournamentContentGuard)
  async createGalleryImage(
    @Param('id') id: string,
    @Body() dto: CreateGalleryImageDto,
  ) {
    return this.tournamentsService.createGalleryImage(id, dto);
  }

  /** Должен быть выше `gallery/:imageId`, иначе `reorder` попадёт в imageId. */
  @Patch('tournaments/:id/gallery/reorder')
  @UseGuards(TournamentContentGuard)
  async reorderGallery(
    @Param('id') id: string,
    @Body() dto: ReorderGalleryDto,
  ) {
    return this.tournamentsService.reorderGallery(id, dto);
  }

  @Patch('tournaments/:id/gallery/:imageId')
  @UseGuards(TournamentContentGuard)
  async updateGalleryImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Body() dto: UpdateGalleryImageDto,
  ) {
    return this.tournamentsService.updateGalleryImage(id, imageId, dto);
  }

  @Delete('tournaments/:id/gallery/:imageId')
  @UseGuards(TournamentContentGuard)
  async deleteGalleryImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.tournamentsService.deleteGalleryImage(id, imageId);
  }
}

import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TournamentsService } from '../tournaments/tournaments.service';
import { ListTenantTournamentsQueryDto } from '../tournaments/dto/list-tenant-tournaments-query.dto';
import { MatchesFilterQueryDto } from '../tournaments/dto/matches-filter-query.dto';
import { ListTournamentNewsQueryDto } from '../tournaments/dto/list-tournament-news-query.dto';
import { PublicHttpCacheInterceptor } from './public-http-cache.interceptor';

/**
 * Публичный read-only API по slug тенанта из URL (`/[tenant]/…`).
 * Без JWT: только турниры со статусом ACTIVE | COMPLETED | ARCHIVED.
 */
@ApiTags('public')
@UseInterceptors(PublicHttpCacheInterceptor)
@Controller('public/tenants/:tenantSlug')
export class PublicController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Get()
  @ApiOperation({ summary: 'Краткая информация о тенанте (для шапки сайта)' })
  async tenantMeta(@Param('tenantSlug') tenantSlug: string) {
    return this.tournaments.getPublicTenantMetaCached(tenantSlug);
  }

  @Get('management')
  @ApiOperation({ summary: 'Публичный список руководства организации' })
  async management(@Param('tenantSlug') tenantSlug: string) {
    return this.tournaments.listPublicManagementCached(tenantSlug);
  }

  @Get('tournaments')
  @ApiOperation({ summary: 'Список публичных турниров тенанта' })
  async listTournaments(
    @Param('tenantSlug') tenantSlug: string,
    @Query() query: ListTenantTournamentsQueryDto,
  ) {
    return this.tournaments.listPublicByTenantSlugCached(tenantSlug, query);
  }

  @Get('tournaments/:tournamentId/table')
  @ApiOperation({ summary: 'Турнирная таблица (публично)' })
  async tournamentTable(
    @Param('tenantSlug') tenantSlug: string,
    @Param('tournamentId') tournamentId: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.tournaments.getPublicTableCached(tenantSlug, tournamentId, groupId);
  }

  @Get('tournaments/:tournamentId/roster')
  @ApiOperation({ summary: 'Составы команд турнира (без контактов)' })
  async tournamentRoster(
    @Param('tenantSlug') tenantSlug: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournaments.getPublicRosterCached(tenantSlug, tournamentId);
  }

  @Get('tournaments/:tournamentId')
  @ApiOperation({ summary: 'Детали турнира, матчи, группы (без данных оргкомитета)' })
  async tournamentDetail(
    @Param('tenantSlug') tenantSlug: string,
    @Param('tournamentId') tournamentId: string,
    @Query() filters: MatchesFilterQueryDto,
  ) {
    return this.tournaments.getPublicByIdCached(tenantSlug, tournamentId, filters);
  }

  @Get('tournaments/:tournamentId/news')
  @ApiOperation({ summary: 'Публичные новости турнира' })
  async tournamentNews(
    @Param('tenantSlug') tenantSlug: string,
    @Param('tournamentId') tournamentId: string,
    @Query() query: ListTournamentNewsQueryDto,
  ) {
    return this.tournaments.listPublicNewsCached(tenantSlug, tournamentId, query);
  }

  @Get('tournaments/:tournamentId/gallery')
  @ApiOperation({ summary: 'Публичная фотогалерея турнира' })
  async tournamentGallery(
    @Param('tenantSlug') tenantSlug: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournaments.listPublicGalleryCached(tenantSlug, tournamentId);
  }

  @Get('tournaments/:tournamentId/documents')
  @ApiOperation({ summary: 'Публичные документы турнира (общие + привязанные)' })
  async tournamentDocuments(
    @Param('tenantSlug') tenantSlug: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournaments.listPublicDocumentsCached(tenantSlug, tournamentId);
  }

  @Get('media')
  @ApiOperation({
    summary: 'Заглушка совместимости',
    description: 'Используйте отдельные эндпоинты новостей и галереи по турнирам.',
  })
  async mediaPlaceholder() {
    return { items: [] as unknown[] };
  }

  @Get('media/gallery')
  @ApiOperation({ summary: 'Публичная галерея организации (все публичные турниры)' })
  async tenantGallery(
    @Param('tenantSlug') tenantSlug: string,
    @Query('limit') limit?: string,
  ) {
    return this.tournaments.listPublicTenantGalleryCached(tenantSlug, limit);
  }

  @Get('media/video')
  @ApiOperation({ summary: 'Публичный видео-фид организации (все публичные турниры)' })
  async tenantVideo(
    @Param('tenantSlug') tenantSlug: string,
    @Query('limit') limit?: string,
  ) {
    return this.tournaments.listPublicTenantVideoCached(tenantSlug, limit);
  }
}

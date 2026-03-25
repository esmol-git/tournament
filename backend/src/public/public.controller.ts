import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TournamentsService } from '../tournaments/tournaments.service';
import { ListTenantTournamentsQueryDto } from '../tournaments/dto/list-tenant-tournaments-query.dto';
import { MatchesFilterQueryDto } from '../tournaments/dto/matches-filter-query.dto';

/**
 * Публичный read-only API по slug тенанта из URL (`/[tenant]/…`).
 * Без JWT: только турниры со статусом ACTIVE | COMPLETED | ARCHIVED.
 */
@ApiTags('public')
@Controller('public/tenants/:tenantSlug')
export class PublicController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Get()
  @ApiOperation({ summary: 'Краткая информация о тенанте (для шапки сайта)' })
  async tenantMeta(@Param('tenantSlug') tenantSlug: string) {
    return this.tournaments.getPublicTenantMeta(tenantSlug);
  }

  @Get('tournaments')
  @ApiOperation({ summary: 'Список публичных турниров тенанта' })
  async listTournaments(
    @Param('tenantSlug') tenantSlug: string,
    @Query() query: ListTenantTournamentsQueryDto,
  ) {
    return this.tournaments.listPublicByTenantSlug(tenantSlug, query);
  }

  @Get('tournaments/:tournamentId/table')
  @ApiOperation({ summary: 'Турнирная таблица (публично)' })
  async tournamentTable(
    @Param('tenantSlug') tenantSlug: string,
    @Param('tournamentId') tournamentId: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.tournaments.getPublicTable(tenantSlug, tournamentId, groupId);
  }

  @Get('tournaments/:tournamentId/roster')
  @ApiOperation({ summary: 'Составы команд турнира (без контактов)' })
  async tournamentRoster(
    @Param('tenantSlug') tenantSlug: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournaments.getPublicRoster(tenantSlug, tournamentId);
  }

  @Get('tournaments/:tournamentId')
  @ApiOperation({ summary: 'Детали турнира, матчи, группы (без данных оргкомитета)' })
  async tournamentDetail(
    @Param('tenantSlug') tenantSlug: string,
    @Param('tournamentId') tournamentId: string,
    @Query() filters: MatchesFilterQueryDto,
  ) {
    return this.tournaments.getPublicById(tenantSlug, tournamentId, filters);
  }

  @Get('media')
  @ApiOperation({
    summary: 'Медиа и новости (заглушка)',
    description:
      'В схеме БД пока нет сущностей «новость / альбом». Эндпоинт зарезервирован: позже вернёт ленту материалов по турнирам.',
  })
  async mediaPlaceholder() {
    return { items: [] as unknown[] };
  }
}

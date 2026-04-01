import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MatchStage,
  PlayoffRound,
  MatchStatus,
  NewsSection,
  Prisma,
  TournamentFormat,
  TournamentMemberRole,
  TournamentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { GenerateCalendarDto } from './dto/generate-calendar.dto';
import { GenerateFromTemplateDto } from './dto/generate-from-template.dto';
import { ReorderRoundDto } from './dto/reorder-round.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { MatchesFilterQueryDto } from './dto/matches-filter-query.dto';
import { CreateTournamentNewsDto } from './dto/create-tournament-news.dto';
import { UpdateTournamentNewsDto } from './dto/update-tournament-news.dto';
import { ListTournamentNewsQueryDto } from './dto/list-tournament-news-query.dto';
import { ListTenantNewsQueryDto } from './dto/list-tenant-news-query.dto';
import { CreateGalleryImageDto } from './dto/create-gallery-image.dto';
import { UpdateGalleryImageDto } from './dto/update-gallery-image.dto';
import { ReorderGalleryDto } from './dto/reorder-gallery.dto';
import { CreateNewsTagDto } from './dto/create-news-tag.dto';
import { UpdateNewsTagDto } from './dto/update-news-tag.dto';

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private readonly publicCache = new Map<string, { expiresAt: number; value: unknown }>();
  private readonly publicInFlight = new Map<string, Promise<unknown>>();

  private stableCacheKeyPart(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'object') return String(value);
    if (Array.isArray(value)) {
      return `[${value.map((v) => this.stableCacheKeyPart(v)).join(',')}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map((k) => `${k}:${this.stableCacheKeyPart(obj[k])}`)
      .join(',')}}`;
  }

  private publicCacheKey(...parts: unknown[]): string {
    return parts.map((p) => this.stableCacheKeyPart(p)).join('|');
  }

  private async rememberPublic<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = this.publicCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
    if (cached) this.publicCache.delete(key);

    const inFlight = this.publicInFlight.get(key);
    if (inFlight) return inFlight as Promise<T>;

    const promise = loader()
      .then((value) => {
        this.publicCache.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      })
      .finally(() => {
        this.publicInFlight.delete(key);
      });

    this.publicInFlight.set(key, promise);
    return promise;
  }

  /**
   * Турниры `MANUAL` — без автогенерации календаря по шаблону.
   * Плей-офф из итогов групп (`generatePlayoff` / `generatePlayoffGeneric`) для MANUAL разрешён отдельно.
   */
  private assertNotManualCalendarFormat(format: TournamentFormat) {
    if (format === TournamentFormat.MANUAL) {
      throw new BadRequestException(
        'Для турнира с ручным расписанием автогенерация календаря недоступна.',
      );
    }
  }

  private isPowerOfTwo(n: number) {
    return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
  }

  /**
   * Пока есть матчи (сгенерировано расписание), список команд и группы менять нельзя — иначе расходится с сеткой.
   * Рейтинги в TournamentTeam править можно (с перегенерацией календаря), см. setTeamRating.
   */
  private async assertNoMatchesForTeamCompositionEdit(tournamentId: string) {
    const any = await this.prisma.match.findFirst({
      where: { tournamentId },
      select: { id: true },
    });
    if (any) {
      throw new BadRequestException(
        'Нельзя менять состав команд и группы, пока есть матчи в расписании. Сначала очистите календарь.',
      );
    }
  }

  /**
   * Для формата PLAYOFF минимальное число команд должно быть степенью двойки (4, 8, 16, ...),
   * иначе корректную олимпийскую сетку без "пустых" слотов построить нельзя.
   */
  private assertMinTeamsByFormat(format: TournamentFormat, minTeams: number) {
    if (format !== TournamentFormat.PLAYOFF) return;
    if (!this.isPowerOfTwo(minTeams) || minTeams < 4) {
      throw new BadRequestException(
        'For PLAYOFF format minTeams must be 4, 8, 16, 32, 64, ...',
      );
    }
  }

  private expectedGroupCountByFormat(
    format: TournamentFormat,
    rawGroupCount: number,
  ): number | null {
    if (format === TournamentFormat.GROUPS_2) return 2;
    if (format === TournamentFormat.GROUPS_3) return 3;
    if (format === TournamentFormat.GROUPS_4) return 4;
    if (format === TournamentFormat.GROUPS_PLUS_PLAYOFF) return rawGroupCount;
    return null;
  }

  private assertGroupedPlayoffBracketBySettings(
    format: TournamentFormat,
    groupCount: number,
    playoffQualifiersPerGroup: number,
  ) {
    const expectedGroups = this.expectedGroupCountByFormat(format, groupCount);
    if (expectedGroups === null) return;

    const k = playoffQualifiersPerGroup;
    if (!Number.isInteger(k) || k < 1 || k > 8) {
      throw new BadRequestException(
        'playoffQualifiersPerGroup must be an integer 1..8',
      );
    }

    if (!Number.isInteger(expectedGroups) || expectedGroups < 1) {
      throw new BadRequestException(
        'For grouped playoff format groupCount must be >= 1',
      );
    }

    const qualifiersCount = expectedGroups * k;
    if (!this.isPowerOfTwo(qualifiersCount)) {
      throw new BadRequestException(
        `Невалидная сетка плей-офф: groups(${expectedGroups}) * qualifiersPerGroup(${k}) = ${qualifiersCount}. Количество участников плей-офф должно быть степенью двойки (4, 8, 16, ...).`,
      );
    }
  }

  /**
   * Для MANUAL создаёт недостающие `Группа A`… по `groupCount` (2–8).
   * Не зависит от наличия матчей — иначе при первом же матче группы переставали досоздаваться.
   */
  private async ensureManualGroupsIfNeeded(
    tournamentId: string,
    tenantId: string,
    groupCount: number,
    existingGroups: { name: string }[],
  ) {
    const gc = Math.min(8, Math.max(1, groupCount));
    if (gc < 2) return;

    const names = Array.from(
      { length: gc },
      (_, i) => `Группа ${String.fromCharCode(65 + i)}`,
    );
    const existing = new Set(existingGroups.map((g) => g.name));
    const missing = names.filter((n) => !existing.has(n));
    if (!missing.length) return;

    await this.prisma.tournamentGroup.createMany({
      data: missing.map((name) => ({
        tenantId,
        tournamentId,
        name,
        sortOrder: names.indexOf(name) + 1,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * UI кладёт команды без groupId в колонки по round-robin, а /table?groupId= читает только БД —
   * без записи groupId таблицы по группам пустые. Записываем то же распределение, что и initGroupColumns.
   */
  private async ensureManualLooseTeamsAssignedToGroups(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { format: true, groupCount: true },
    });
    if (!tournament || tournament.format !== TournamentFormat.MANUAL) return;
    const gc = Math.min(8, Math.max(1, tournament.groupCount ?? 1));
    if (gc < 2) return;

    const groups = await this.prisma.tournamentGroup.findMany({
      where: { tournamentId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });
    if (groups.length < 2) return;

    const loose = await this.prisma.tournamentTeam.findMany({
      where: { tournamentId, groupId: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!loose.length) return;

    const gCount = groups.length;
    await this.prisma.$transaction(
      loose.map((tt, i) => {
        const gi = i % gCount;
        return this.prisma.tournamentTeam.update({
          where: { id: tt.id },
          data: {
            groupId: groups[gi].id,
            groupSortOrder: Math.floor(i / gCount),
          },
        });
      }),
    );
  }

  private readonly templates = {
    kids_mini_8: {
      id: 'kids_mini_8',
      name: 'Детский мини (8 команд): 2 группы по 4 + плей-офф',
      groups: 2,
      teamsPerGroup: 4,
      days: [
        { dateOffsetDays: 0, stage: 'GROUP' as const, rounds: 3 },
        {
          dateOffsetDays: 7,
          stage: 'PLAYOFF' as const,
          includeThirdPlace: true,
        },
      ],
    },
  } as const;

  async listByTenant(
    tenantId: string,
    query?: {
      status?: TournamentStatus;
      q?: string;
      seasonId?: string;
      competitionId?: string;
      ageGroupId?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(1, query?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, query?.pageSize ?? 20));
    const skip = (page - 1) * pageSize;
    const q = (query?.q ?? '').trim();

    const seasonId = query?.seasonId?.trim();
    const competitionId = query?.competitionId?.trim();
    const ageGroupId = query?.ageGroupId?.trim();
    const where: Prisma.TournamentWhereInput = {
      tenantId,
      ...(query?.status ? { status: query.status } : {}),
      ...(seasonId ? { seasonId } : {}),
      ...(competitionId ? { competitionId } : {}),
      ...(ageGroupId ? { ageGroupId } : {}),
      ...(q
        ? {
            name: {
              contains: q,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [total, tournaments] = await Promise.all([
      this.prisma.tournament.count({ where }),
      this.prisma.tournament.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { tournamentTeams: true } },
          season: { select: { id: true, name: true, code: true } },
          competition: { select: { id: true, name: true, code: true } },
          ageGroup: {
            select: { id: true, name: true, shortLabel: true, code: true },
          },
        },
      }),
    ]);

    const items = tournaments.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      category: t.category,
      logoUrl: t.logoUrl,
      format: t.format,
      startsAt: t.startsAt,
      endsAt: t.endsAt,
      teamsCount: t._count.tournamentTeams,
      status: t.status,
      seasonId: t.seasonId,
      season: t.season
        ? { id: t.season.id, name: t.season.name, code: t.season.code }
        : null,
      competitionId: t.competitionId,
      competition: t.competition
        ? {
            id: t.competition.id,
            name: t.competition.name,
            code: t.competition.code,
          }
        : null,
      ageGroupId: t.ageGroupId,
      ageGroup: t.ageGroup
        ? {
            id: t.ageGroup.id,
            name: t.ageGroup.name,
            shortLabel: t.ageGroup.shortLabel,
            code: t.ageGroup.code,
          }
        : null,
    }));

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /** Турниры, доступные на публичном сайте по ссылке (без JWT). */
  private readonly publicTournamentStatuses: TournamentStatus[] = [
    TournamentStatus.ACTIVE,
    TournamentStatus.COMPLETED,
    TournamentStatus.ARCHIVED,
  ];

  async resolveTenantForPublicOrThrow(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        blocked: true,
        websiteUrl: true,
        socialYoutubeUrl: true,
        socialInstagramUrl: true,
        socialTelegramUrl: true,
        showWebsiteLink: true,
        socialMaxUrl: true,
        showSocialYoutubeLink: true,
        showSocialInstagramLink: true,
        showSocialTelegramLink: true,
        showSocialMaxLink: true,
      },
    });
    if (!tenant || tenant.blocked) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async getPublicTenantMeta(tenantSlug: string) {
    const t = await this.resolveTenantForPublicOrThrow(tenantSlug);
    return {
      name: t.name,
      slug: t.slug,
      socialLinks: {
        websiteUrl: t.websiteUrl,
        socialYoutubeUrl: t.socialYoutubeUrl,
        socialInstagramUrl: t.socialInstagramUrl,
        socialTelegramUrl: t.socialTelegramUrl,
        showWebsiteLink: t.showWebsiteLink,
        socialMaxUrl: t.socialMaxUrl,
        showSocialYoutubeLink: t.showSocialYoutubeLink,
        showSocialInstagramLink: t.showSocialInstagramLink,
        showSocialTelegramLink: t.showSocialTelegramLink,
        showSocialMaxLink: t.showSocialMaxLink,
      },
    };
  }

  async getPublicTenantMetaCached(tenantSlug: string) {
    return this.rememberPublic(
      this.publicCacheKey('public-tenant-meta', tenantSlug),
      60_000,
      () => this.getPublicTenantMeta(tenantSlug),
    );
  }

  async listPublicManagement(tenantSlug: string) {
    const tenant = await this.resolveTenantForPublicOrThrow(tenantSlug);
    return this.prisma.managementMember.findMany({
      where: { tenantId: tenant.id, active: true },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        title: true,
        phone: true,
        email: true,
        note: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async listPublicManagementCached(tenantSlug: string) {
    return this.rememberPublic(
      this.publicCacheKey('public-management', tenantSlug),
      45_000,
      () => this.listPublicManagement(tenantSlug),
    );
  }

  async listPublicByTenantSlug(
    tenantSlug: string,
    query?: {
      q?: string;
      seasonId?: string;
      competitionId?: string;
      ageGroupId?: string;
      page?: number;
      pageSize?: number;
      status?: TournamentStatus;
    },
  ) {
    const tenant = await this.resolveTenantForPublicOrThrow(tenantSlug);
    const page = Math.max(1, query?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, query?.pageSize ?? 20));
    const skip = (page - 1) * pageSize;
    const q = (query?.q ?? '').trim();

    if (query?.status === TournamentStatus.DRAFT) {
      return { items: [], total: 0, page, pageSize };
    }

    let statusFilter: Prisma.TournamentWhereInput['status'];
    if (query?.status) {
      if (this.publicTournamentStatuses.includes(query.status)) {
        statusFilter = query.status;
      } else {
        statusFilter = { in: this.publicTournamentStatuses };
      }
    } else {
      statusFilter = { in: this.publicTournamentStatuses };
    }

    const seasonId = query?.seasonId?.trim();
    const competitionId = query?.competitionId?.trim();
    const ageGroupId = query?.ageGroupId?.trim();
    const where: Prisma.TournamentWhereInput = {
      tenantId: tenant.id,
      status: statusFilter,
      ...(seasonId ? { seasonId } : {}),
      ...(competitionId ? { competitionId } : {}),
      ...(ageGroupId ? { ageGroupId } : {}),
      ...(q
        ? {
            name: {
              contains: q,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [total, tournaments] = await Promise.all([
      this.prisma.tournament.count({ where }),
      this.prisma.tournament.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { tournamentTeams: true } },
          season: { select: { id: true, name: true, code: true } },
          competition: { select: { id: true, name: true, code: true } },
          ageGroup: {
            select: { id: true, name: true, shortLabel: true, code: true },
          },
        },
      }),
    ]);

    const items = tournaments.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      category: t.category,
      logoUrl: t.logoUrl,
      format: t.format,
      startsAt: t.startsAt,
      endsAt: t.endsAt,
      teamsCount: t._count.tournamentTeams,
      status: t.status,
      seasonId: t.seasonId,
      season: t.season
        ? { id: t.season.id, name: t.season.name, code: t.season.code }
        : null,
      competitionId: t.competitionId,
      competition: t.competition
        ? {
            id: t.competition.id,
            name: t.competition.name,
            code: t.competition.code,
          }
        : null,
      ageGroupId: t.ageGroupId,
      ageGroup: t.ageGroup
        ? {
            id: t.ageGroup.id,
            name: t.ageGroup.name,
            shortLabel: t.ageGroup.shortLabel,
            code: t.ageGroup.code,
          }
        : null,
    }));

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  async listPublicByTenantSlugCached(
    tenantSlug: string,
    query?: {
      q?: string;
      seasonId?: string;
      competitionId?: string;
      ageGroupId?: string;
      page?: number;
      pageSize?: number;
      status?: TournamentStatus;
    },
  ) {
    return this.rememberPublic(
      this.publicCacheKey('public-tournaments', tenantSlug, query ?? {}),
      30_000,
      () => this.listPublicByTenantSlug(tenantSlug, query),
    );
  }

  async assertPublicTournament(tenantSlug: string, tournamentId: string) {
    const tenant = await this.resolveTenantForPublicOrThrow(tenantSlug);
    const tournament = await this.prisma.tournament.findFirst({
      where: {
        id: tournamentId,
        tenantId: tenant.id,
        status: { in: this.publicTournamentStatuses },
      },
      select: { id: true },
    });
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    return { tenant, tournament };
  }

  /**
   Как getById, но только для турнира тенанта по slug и без служебных данных (оргкомитет / email).
   */
  async getPublicById(
    tenantSlug: string,
    tournamentId: string,
    filters?: MatchesFilterQueryDto,
  ) {
    const { tenant } = await this.assertPublicTournament(tenantSlug, tournamentId);
    const detail = await this.getById(tournamentId, filters);
    if (!detail) throw new NotFoundException('Tournament not found');
    const { members, ...rest } = detail as typeof detail & { members?: unknown };
    void members;
    const referenceDocuments = await this.listPublicDocumentsByTenantId(
      tenant.id,
      tournamentId,
    );
    return { ...rest, referenceDocuments };
  }

  async getPublicByIdCached(
    tenantSlug: string,
    tournamentId: string,
    filters?: MatchesFilterQueryDto,
  ) {
    return this.rememberPublic(
      this.publicCacheKey('public-tournament-detail', tenantSlug, tournamentId, filters ?? {}),
      20_000,
      () => this.getPublicById(tenantSlug, tournamentId, filters),
    );
  }

  async getPublicTable(
    tenantSlug: string,
    tournamentId: string,
    groupId?: string,
  ) {
    await this.assertPublicTournament(tenantSlug, tournamentId);
    return this.getTable(tournamentId, groupId);
  }

  async getPublicTableCached(
    tenantSlug: string,
    tournamentId: string,
    groupId?: string,
  ) {
    return this.rememberPublic(
      this.publicCacheKey('public-tournament-table', tenantSlug, tournamentId, groupId ?? ''),
      20_000,
      () => this.getPublicTable(tenantSlug, tournamentId, groupId),
    );
  }

  /** Составы команд турнира для публичного сайта (без телефонов и email). */
  async getPublicRoster(tenantSlug: string, tournamentId: string) {
    await this.assertPublicTournament(tenantSlug, tournamentId);
    const rows = await this.prisma.tournamentTeam.findMany({
      where: { tournamentId },
      orderBy: { createdAt: 'asc' },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            category: true,
            description: true,
            coachName: true,
          },
        },
        group: { select: { id: true, name: true } },
      },
    });

    const teamIds = rows.map((r) => r.teamId);
    const playersByTeam = await this.prisma.teamPlayer.findMany({
      where: { teamId: { in: teamIds }, isActive: true },
      orderBy: { createdAt: 'asc' },
      include: {
        player: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            position: true,
            photoUrl: true,
          },
        },
      },
    });

    const byTeam = new Map<string, typeof playersByTeam>();
    for (const tp of playersByTeam) {
      const list = byTeam.get(tp.teamId) ?? [];
      list.push(tp);
      byTeam.set(tp.teamId, list);
    }

    return rows.map((r) => ({
      teamId: r.team.id,
      teamName: r.team.name,
      logoUrl: r.team.logoUrl,
      category: r.team.category,
      description: r.team.description,
      coachName: r.team.coachName,
      groupId: r.groupId,
      groupName: r.group?.name ?? null,
      players: (byTeam.get(r.teamId) ?? []).map((tp) => ({
        id: tp.player.id,
        firstName: tp.player.firstName,
        lastName: tp.player.lastName,
        birthDate: tp.player.birthDate,
        jerseyNumber: tp.jerseyNumber,
        position: tp.position ?? tp.player.position,
        photoUrl: tp.player.photoUrl,
      })),
    }));
  }

  async getPublicRosterCached(tenantSlug: string, tournamentId: string) {
    return this.rememberPublic(
      this.publicCacheKey('public-tournament-roster', tenantSlug, tournamentId),
      20_000,
      () => this.getPublicRoster(tenantSlug, tournamentId),
    );
  }

  private async assertNewsSlugFree(
    tenantId: string,
    slug: string,
    tournamentId: string | null,
    excludeNewsId?: string,
  ) {
    const notId = excludeNewsId ? { id: { not: excludeNewsId } } : {};
    if (tournamentId) {
      const clash = await this.prisma.tournamentNews.findFirst({
        where: { tournamentId, slug, ...notId },
        select: { id: true },
      });
      if (clash) {
        throw new BadRequestException('News slug already exists for this tournament');
      }
    } else {
      const clash = await this.prisma.tournamentNews.findFirst({
        where: { tenantId, tournamentId: null, slug, ...notId },
        select: { id: true },
      });
      if (clash) {
        throw new BadRequestException('News slug already exists for draft items');
      }
    }
  }

  private async resolveNewsTagIds(
    tenantId: string,
    tagIds?: string[] | null,
  ): Promise<string[] | undefined> {
    if (tagIds === undefined || tagIds === null) return undefined;
    const normalized = [...new Set(tagIds.map((x) => String(x).trim()).filter(Boolean))];
    if (!normalized.length) return [];
    const rows = await this.prisma.newsTag.findMany({
      where: { tenantId, id: { in: normalized } },
      select: { id: true },
    });
    if (rows.length !== normalized.length) {
      throw new BadRequestException('One or more news tags not found');
    }
    return normalized;
  }

  listNewsTagsByTenant(tenantId: string) {
    return this.prisma.newsTag.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createNewsTagByTenant(tenantId: string, dto: CreateNewsTagDto) {
    const slug = dto.slug.trim();
    const exists = await this.prisma.newsTag.findFirst({
      where: { tenantId, slug },
      select: { id: true },
    });
    if (exists) throw new BadRequestException('News tag slug already exists');
    return this.prisma.newsTag.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        slug,
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateNewsTagByTenant(tenantId: string, tagId: string, dto: UpdateNewsTagDto) {
    const row = await this.prisma.newsTag.findFirst({
      where: { id: tagId, tenantId },
      select: { id: true, slug: true },
    });
    if (!row) throw new NotFoundException('News tag not found');
    const nextSlug = dto.slug !== undefined ? dto.slug.trim() : row.slug;
    if (nextSlug !== row.slug) {
      const exists = await this.prisma.newsTag.findFirst({
        where: { tenantId, slug: nextSlug, id: { not: tagId } },
        select: { id: true },
      });
      if (exists) throw new BadRequestException('News tag slug already exists');
    }
    return this.prisma.newsTag.update({
      where: { id: tagId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug.trim() } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async deleteNewsTagByTenant(tenantId: string, tagId: string) {
    const row = await this.prisma.newsTag.findFirst({
      where: { id: tagId, tenantId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('News tag not found');
    await this.prisma.newsTag.delete({ where: { id: tagId } });
    return { success: true };
  }

  async listNewsByTenant(tenantId: string, query?: ListTenantNewsQueryDto) {
    return this.prisma.tournamentNews.findMany({
      where: {
        tenantId,
        ...(query?.tournamentId ? { tournamentId: query.tournamentId } : {}),
        ...(query?.publishedOnly ? { published: true } : {}),
        ...(query?.section ? { section: query.section } : {}),
        ...(query?.tagId ? { newsTags: { some: { tagId: query.tagId } } } : {}),
      },
      include: {
        tournament: { select: { id: true, name: true } },
        newsTags: {
          include: { tag: { select: { id: true, name: true, slug: true, active: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async listNews(tournamentId: string, query?: ListTournamentNewsQueryDto) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    return this.prisma.tournamentNews.findMany({
      where: {
        tournamentId,
        ...(query?.publishedOnly ? { published: true } : {}),
        ...(query?.section ? { section: query.section } : {}),
        ...(query?.tagId ? { newsTags: { some: { tagId: query.tagId } } } : {}),
      },
      include: {
        tournament: { select: { id: true, name: true } },
        newsTags: {
          include: { tag: { select: { id: true, name: true, slug: true, active: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async listPublicNews(
    tenantSlug: string,
    tournamentId: string,
    query?: ListTournamentNewsQueryDto,
  ) {
    await this.assertPublicTournament(tenantSlug, tournamentId);
    return this.prisma.tournamentNews.findMany({
      where: {
        tournamentId,
        published: true,
        ...(query?.section ? { section: query.section } : {}),
        ...(query?.tagId ? { newsTags: { some: { tagId: query.tagId } } } : {}),
      },
      include: {
        newsTags: {
          include: { tag: { select: { id: true, name: true, slug: true, active: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async listPublicNewsCached(
    tenantSlug: string,
    tournamentId: string,
    query?: ListTournamentNewsQueryDto,
  ) {
    return this.rememberPublic(
      this.publicCacheKey('public-tournament-news', tenantSlug, tournamentId, query ?? {}),
      20_000,
      () => this.listPublicNews(tenantSlug, tournamentId, query),
    );
  }

  private listPublicDocumentsByTenantId(tenantId: string, tournamentId: string) {
    return this.prisma.referenceDocument.findMany({
      where: {
        tenantId,
        active: true,
        OR: [{ tournamentId: null }, { tournamentId }],
      },
      select: {
        id: true,
        title: true,
        code: true,
        url: true,
        note: true,
        sortOrder: true,
        tournamentId: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async listPublicDocuments(tenantSlug: string, tournamentId: string) {
    const { tenant } = await this.assertPublicTournament(tenantSlug, tournamentId);
    return this.listPublicDocumentsByTenantId(tenant.id, tournamentId);
  }

  async listPublicDocumentsCached(tenantSlug: string, tournamentId: string) {
    return this.rememberPublic(
      this.publicCacheKey('public-tournament-documents', tenantSlug, tournamentId),
      20_000,
      () => this.listPublicDocuments(tenantSlug, tournamentId),
    );
  }

  async createNewsByTenant(tenantId: string, dto: CreateTournamentNewsDto) {
    const tournamentId = dto.tournamentId?.trim() || null;
    if (tournamentId) {
      const t = await this.prisma.tournament.findFirst({
        where: { id: tournamentId, tenantId },
        select: { id: true },
      });
      if (!t) throw new BadRequestException('Tournament not found or access denied');
    }
    const published = dto.published ?? false;
    if (published && !tournamentId) {
      throw new BadRequestException(
        'Publishing requires linking the news item to a tournament',
      );
    }
    const resolvedTagIds = await this.resolveNewsTagIds(tenantId, dto.tagIds);
    await this.assertNewsSlugFree(tenantId, dto.slug.trim(), tournamentId);
    return this.prisma.tournamentNews.create({
      data: {
        tenantId,
        tournamentId,
        title: dto.title.trim(),
        slug: dto.slug.trim(),
        excerpt: dto.excerpt?.trim() || null,
        content: dto.content ?? null,
        coverImageUrl: dto.coverImageUrl?.trim() || null,
        section: dto.section ?? NewsSection.ANNOUNCEMENT,
        published,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
        sortOrder: dto.sortOrder ?? 0,
        ...(resolvedTagIds !== undefined
          ? {
              newsTags: {
                create: resolvedTagIds.map((tagId) => ({ tenantId, tagId })),
              },
            }
          : {}),
      },
      include: {
        tournament: { select: { id: true, name: true } },
        newsTags: {
          include: { tag: { select: { id: true, name: true, slug: true, active: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async createNews(tournamentId: string, dto: CreateTournamentNewsDto) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, tenantId: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    return this.createNewsByTenant(tournament.tenantId, {
      ...dto,
      tournamentId,
    });
  }

  async updateNewsByTenant(
    tenantId: string,
    newsId: string,
    dto: UpdateTournamentNewsDto,
  ) {
    const row = await this.prisma.tournamentNews.findFirst({
      where: { id: newsId, tenantId },
    });
    if (!row) throw new NotFoundException('News not found');

    let nextTournamentId = row.tournamentId;
    if (dto.tournamentId !== undefined) {
      const v = dto.tournamentId;
      if (v === null || (typeof v === 'string' && v.trim() === '')) {
        nextTournamentId = null;
      } else {
        const tid = typeof v === 'string' ? v.trim() : v;
        const t = await this.prisma.tournament.findFirst({
          where: { id: tid, tenantId },
          select: { id: true },
        });
        if (!t) throw new BadRequestException('Tournament not found or access denied');
        nextTournamentId = tid;
      }
    }

    const nextPublished = dto.published !== undefined ? dto.published : row.published;
    if (nextPublished && !nextTournamentId) {
      throw new BadRequestException(
        'Publishing requires linking the news item to a tournament',
      );
    }

    const nextSlug = dto.slug !== undefined ? dto.slug.trim() : row.slug;
    const resolvedTagIds = await this.resolveNewsTagIds(tenantId, dto.tagIds);
    if (nextSlug !== row.slug || nextTournamentId !== row.tournamentId) {
      await this.assertNewsSlugFree(tenantId, nextSlug, nextTournamentId, newsId);
    }

    return this.prisma.tournamentNews.update({
      where: { id: newsId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug.trim() } : {}),
        ...(dto.excerpt !== undefined ? { excerpt: dto.excerpt?.trim() || null } : {}),
        ...(dto.content !== undefined ? { content: dto.content ?? null } : {}),
        ...(dto.coverImageUrl !== undefined
          ? { coverImageUrl: dto.coverImageUrl?.trim() || null }
          : {}),
        ...(dto.section !== undefined ? { section: dto.section } : {}),
        ...(dto.published !== undefined ? { published: dto.published } : {}),
        ...(dto.publishedAt !== undefined
          ? { publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.tournamentId !== undefined ? { tournamentId: nextTournamentId } : {}),
        ...(resolvedTagIds !== undefined
          ? {
              newsTags: {
                deleteMany: {},
                ...(resolvedTagIds.length
                  ? {
                      create: resolvedTagIds.map((tagId) => ({ tenantId, tagId })),
                    }
                  : {}),
              },
            }
          : {}),
      },
      include: {
        tournament: { select: { id: true, name: true } },
        newsTags: {
          include: { tag: { select: { id: true, name: true, slug: true, active: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async updateNews(
    tournamentId: string,
    newsId: string,
    dto: UpdateTournamentNewsDto,
  ) {
    const row = await this.prisma.tournamentNews.findFirst({
      where: { id: newsId, tournamentId },
      select: { id: true, tenantId: true },
    });
    if (!row) throw new NotFoundException('News not found');
    return this.updateNewsByTenant(row.tenantId, newsId, dto);
  }

  async deleteNewsByTenant(tenantId: string, newsId: string) {
    const row = await this.prisma.tournamentNews.findFirst({
      where: { id: newsId, tenantId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('News not found');
    await this.prisma.tournamentNews.delete({ where: { id: newsId } });
    return { success: true };
  }

  async deleteNews(tournamentId: string, newsId: string) {
    const row = await this.prisma.tournamentNews.findFirst({
      where: { id: newsId, tournamentId },
      select: { id: true, tenantId: true },
    });
    if (!row) throw new NotFoundException('News not found');
    return this.deleteNewsByTenant(row.tenantId, newsId);
  }

  async listGallery(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    return this.prisma.tournamentGalleryImage.findMany({
      where: { tournamentId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async listPublicGallery(tenantSlug: string, tournamentId: string) {
    await this.assertPublicTournament(tenantSlug, tournamentId);
    return this.prisma.tournamentGalleryImage.findMany({
      where: { tournamentId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async listPublicGalleryCached(tenantSlug: string, tournamentId: string) {
    return this.rememberPublic(
      this.publicCacheKey('public-tournament-gallery', tenantSlug, tournamentId),
      20_000,
      () => this.listPublicGallery(tenantSlug, tournamentId),
    );
  }

  async listPublicTenantGallery(tenantSlug: string, limitRaw?: string | number) {
    const tenant = await this.resolveTenantForPublicOrThrow(tenantSlug);
    const parsed =
      typeof limitRaw === 'number'
        ? limitRaw
        : Number.parseInt(String(limitRaw ?? '').trim(), 10);
    const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(300, parsed)) : 120;

    const rows = await this.prisma.tournamentGalleryImage.findMany({
      where: {
        tenantId: tenant.id,
        tournament: {
          tenantId: tenant.id,
          status: { in: this.publicTournamentStatuses },
        },
      },
      select: {
        id: true,
        imageUrl: true,
        caption: true,
        sortOrder: true,
        createdAt: true,
        tournament: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { sortOrder: 'asc' }],
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      imageUrl: row.imageUrl,
      caption: row.caption,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      tournamentId: row.tournament.id,
      tournamentName: row.tournament.name,
    }));
  }

  async listPublicTenantGalleryCached(tenantSlug: string, limitRaw?: string | number) {
    return this.rememberPublic(
      this.publicCacheKey('public-tenant-gallery', tenantSlug, limitRaw ?? ''),
      20_000,
      () => this.listPublicTenantGallery(tenantSlug, limitRaw),
    );
  }

  async listPublicTenantVideo(tenantSlug: string, limitRaw?: string | number) {
    const tenant = await this.resolveTenantForPublicOrThrow(tenantSlug);
    const parsed =
      typeof limitRaw === 'number'
        ? limitRaw
        : Number.parseInt(String(limitRaw ?? '').trim(), 10);
    const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(300, parsed)) : 120;

    const videoKeywords = ['youtube', 'youtu.be', 'rutube', 'vimeo', 'video'];
    const textPredicates: Prisma.TournamentNewsWhereInput[] = videoKeywords.flatMap(
      (keyword) => [
        { content: { contains: keyword, mode: 'insensitive' } },
        { excerpt: { contains: keyword, mode: 'insensitive' } },
      ],
    );

    const rows = await this.prisma.tournamentNews.findMany({
      where: {
        tenantId: tenant.id,
        published: true,
        tournamentId: { not: null },
        tournament: {
          tenantId: tenant.id,
          status: { in: this.publicTournamentStatuses },
        },
        OR: [{ section: NewsSection.MEDIA }, ...textPredicates],
      },
      select: {
        id: true,
        tournamentId: true,
        title: true,
        section: true,
        excerpt: true,
        content: true,
        coverImageUrl: true,
        publishedAt: true,
        createdAt: true,
        tournament: { select: { id: true, name: true } },
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      tournamentId: row.tournamentId,
      tournamentName: row.tournament?.name ?? null,
      title: row.title,
      section: row.section,
      excerpt: row.excerpt,
      content: row.content,
      coverImageUrl: row.coverImageUrl,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
    }));
  }

  async listPublicTenantVideoCached(tenantSlug: string, limitRaw?: string | number) {
    return this.rememberPublic(
      this.publicCacheKey('public-tenant-video', tenantSlug, limitRaw ?? ''),
      20_000,
      () => this.listPublicTenantVideo(tenantSlug, limitRaw),
    );
  }

  async createGalleryImage(tournamentId: string, dto: CreateGalleryImageDto) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, tenantId: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    const maxSort = await this.prisma.tournamentGalleryImage.aggregate({
      where: { tournamentId },
      _max: { sortOrder: true },
    });
    const sortOrder =
      dto.sortOrder !== undefined
        ? dto.sortOrder
        : (maxSort._max.sortOrder ?? -1) + 1;
    return this.prisma.tournamentGalleryImage.create({
      data: {
        tenantId: tournament.tenantId,
        tournamentId,
        imageUrl: dto.imageUrl.trim(),
        caption: dto.caption?.trim() || null,
        sortOrder,
      },
    });
  }

  async updateGalleryImage(
    tournamentId: string,
    imageId: string,
    dto: UpdateGalleryImageDto,
  ) {
    const row = await this.prisma.tournamentGalleryImage.findFirst({
      where: { id: imageId, tournamentId },
    });
    if (!row) throw new NotFoundException('Gallery image not found');
    return this.prisma.tournamentGalleryImage.update({
      where: { id: imageId },
      data: {
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl.trim() } : {}),
        ...(dto.caption !== undefined
          ? { caption: dto.caption?.trim() || null }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async deleteGalleryImage(tournamentId: string, imageId: string) {
    const row = await this.prisma.tournamentGalleryImage.findFirst({
      where: { id: imageId, tournamentId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Gallery image not found');
    await this.prisma.tournamentGalleryImage.delete({ where: { id: imageId } });
    return { success: true };
  }

  async reorderGallery(tournamentId: string, dto: ReorderGalleryDto) {
    const { imageIds } = dto;
    const existing = await this.prisma.tournamentGalleryImage.findMany({
      where: { tournamentId },
      select: { id: true },
    });
    if (existing.length === 0) {
      throw new BadRequestException('Gallery is empty');
    }
    if (existing.length !== imageIds.length) {
      throw new BadRequestException(
        'imageIds must include every gallery image exactly once',
      );
    }
    const set = new Set(existing.map((e) => e.id));
    if (imageIds.some((id) => !set.has(id))) {
      throw new BadRequestException('Invalid image id in reorder list');
    }
    const uniq = new Set(imageIds);
    if (uniq.size !== imageIds.length) {
      throw new BadRequestException('Duplicate image id in reorder list');
    }
    await this.prisma.$transaction(
      imageIds.map((id, index) =>
        this.prisma.tournamentGalleryImage.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.listGallery(tournamentId);
  }

  async create(tenantId: string, dto: CreateTournamentDto) {
    const existing = await this.prisma.tournament.findFirst({
      where: { tenantId, slug: dto.slug },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Tournament slug already exists');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt && Number.isNaN(startsAt.getTime()))
      throw new BadRequestException('Invalid startsAt');
    if (endsAt && Number.isNaN(endsAt.getTime()))
      throw new BadRequestException('Invalid endsAt');
    if (startsAt && endsAt && startsAt >= endsAt) {
      throw new BadRequestException('startsAt must be before endsAt');
    }

    const adminIds = dto.admins?.map((a) => a.userId) ?? [];
    if (adminIds.length) {
      const found = await this.prisma.user.findMany({
        where: { id: { in: adminIds }, tenantId },
        select: { id: true },
      });
      const foundSet = new Set(found.map((u) => u.id));
      const missing = adminIds.filter((id) => !foundSet.has(id));
      if (missing.length) {
        throw new BadRequestException(
          `Admins must belong to tenant. Missing: ${missing.join(', ')}`,
        );
      }
    }

    this.assertMinTeamsByFormat(dto.format, dto.minTeams ?? 2);
    this.assertGroupedPlayoffBracketBySettings(
      dto.format,
      dto.groupCount ?? 1,
      dto.playoffQualifiersPerGroup ?? 2,
    );

    const tournament = await this.prisma.$transaction(async (tx) => {
      let stadiumIdToSet: string | undefined = undefined;
      if (dto.stadiumId) {
        const st = await tx.stadium.findFirst({
          where: { id: dto.stadiumId, tenantId },
          select: { id: true },
        });
        if (!st) {
          throw new BadRequestException('Стадион не найден');
        }
        stadiumIdToSet = dto.stadiumId;
      }

      let seasonIdToSet: string | undefined = undefined;
      const rawSeason = dto.seasonId?.trim();
      if (rawSeason) {
        const sn = await tx.season.findFirst({
          where: { id: rawSeason, tenantId },
          select: { id: true },
        });
        if (!sn) {
          throw new BadRequestException('Сезон не найден');
        }
        seasonIdToSet = sn.id;
      }

      let competitionIdToSet: string | undefined = undefined;
      const rawCompetition = dto.competitionId?.trim();
      if (rawCompetition) {
        const cp = await tx.competition.findFirst({
          where: { id: rawCompetition, tenantId },
          select: { id: true },
        });
        if (!cp) {
          throw new BadRequestException('Тип соревнования не найден');
        }
        competitionIdToSet = cp.id;
      }

      let ageGroupIdToSet: string | undefined = undefined;
      const rawAgeGroup = dto.ageGroupId?.trim();
      if (rawAgeGroup) {
        const ag = await tx.ageGroup.findFirst({
          where: { id: rawAgeGroup, tenantId },
          select: { id: true },
        });
        if (!ag) {
          throw new BadRequestException('Возрастная группа не найдена');
        }
        ageGroupIdToSet = ag.id;
      }

      const created = await tx.tournament.create({
        data: {
          tenantId,
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          // Legacy text category is deprecated; use ageGroupId.
          category: null,
          logoUrl: dto.logoUrl,
          format: dto.format,
          groupCount: dto.groupCount ?? 1,
          playoffQualifiersPerGroup: dto.playoffQualifiersPerGroup ?? 2,
          status: dto.status ?? TournamentStatus.DRAFT,
          startsAt: startsAt ?? undefined,
          endsAt: endsAt ?? undefined,
          intervalDays: dto.intervalDays ?? 7,
          allowedDays: dto.allowedDays ?? [],
          roundRobinCycles: dto.roundRobinCycles ?? 1,
          matchDurationMinutes: dto.matchDurationMinutes ?? 50,
          matchBreakMinutes: dto.matchBreakMinutes ?? 10,
          simultaneousMatches: dto.simultaneousMatches ?? 1,
          dayStartTimeDefault: dto.dayStartTimeDefault ?? '12:00',
          dayStartTimeOverrides:
            (dto.dayStartTimeOverrides as any) ?? undefined,
          minTeams: dto.minTeams ?? 2,
          pointsWin: dto.pointsWin ?? 3,
          pointsDraw: dto.pointsDraw ?? 1,
          pointsLoss: dto.pointsLoss ?? 0,
          stadiumId: stadiumIdToSet,
          seasonId: seasonIdToSet,
          competitionId: competitionIdToSet,
          ageGroupId: ageGroupIdToSet,
        },
      });

      if (dto.refereeIds?.length) {
        const refs = await tx.referee.findMany({
          where: { tenantId, id: { in: dto.refereeIds } },
          select: { id: true },
        });
        if (refs.length !== dto.refereeIds.length) {
          throw new BadRequestException('Один или несколько судей не найдены');
        }
        await tx.tournamentReferee.createMany({
          data: dto.refereeIds.map((refereeId, i) => ({
            tenantId,
            tournamentId: created.id,
            refereeId,
            sortOrder: i,
          })),
        });
      }

      if (dto.admins?.length) {
        await tx.tournamentMember.createMany({
          data: dto.admins.map((a) => ({
            tenantId,
            tournamentId: created.id,
            userId: a.userId,
            role: a.role ?? TournamentMemberRole.TOURNAMENT_ADMIN,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    if (tournament.format === TournamentFormat.MANUAL) {
      await this.ensureManualGroupsIfNeeded(
        tournament.id,
        tournament.tenantId,
        tournament.groupCount ?? 1,
        [],
      );
    }

    return tournament;
  }

  async getById(id: string, filters?: MatchesFilterQueryDto) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: { groups: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!tournament) return null;

    const matchesTotalCount = await this.prisma.match.count({
      where: { tournamentId: id },
    });

    const isGrouped =
      tournament.format === TournamentFormat.GROUPS_2 ||
      tournament.format === TournamentFormat.GROUPS_3 ||
      tournament.format === TournamentFormat.GROUPS_4 ||
      tournament.format === TournamentFormat.GROUPS_PLUS_PLAYOFF;

    if (isGrouped && matchesTotalCount === 0) {
      const expected =
        tournament.format === TournamentFormat.GROUPS_2
          ? 2
          : tournament.format === TournamentFormat.GROUPS_3
            ? 3
            : tournament.format === TournamentFormat.GROUPS_4
              ? 4
              : tournament.format === TournamentFormat.GROUPS_PLUS_PLAYOFF
                ? (tournament.groupCount ?? 2)
                : 2;

      const names = Array.from(
        { length: expected },
        (_, i) => `Группа ${String.fromCharCode(65 + i)}`,
      );
      const existing = new Set((tournament.groups ?? []).map((g) => g.name));
      const missing = names.filter((n) => !existing.has(n));
      if (missing.length) {
        await this.prisma.tournamentGroup.createMany({
          data: missing.map((name) => ({
            tenantId: tournament.tenantId,
            tournamentId: id,
            name,
            sortOrder: names.indexOf(name) + 1,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (tournament.format === TournamentFormat.MANUAL) {
      await this.ensureManualGroupsIfNeeded(
        id,
        tournament.tenantId,
        tournament.groupCount ?? 1,
        tournament.groups ?? [],
      );
      await this.ensureManualLooseTeamsAssignedToGroups(id);
    }

    const parseYmdToLocalBoundary = (ymd: string, endOfDay: boolean) => {
      // Принимаем формат YYYY-MM-DD и приводим к границам дня в local-time сервера.
      // Это важно, потому что startTime создаётся из Date() в local-time (и UI показывает local-time).
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
      if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        return new Date(
          y,
          mo - 1,
          d,
          endOfDay ? 23 : 0,
          endOfDay ? 59 : 0,
          endOfDay ? 59 : 0,
          endOfDay ? 999 : 0,
        );
      }

      // Fallback для ISO/прочих строк: берём local-день и выставляем границы.
      const dt = new Date(ymd);
      return new Date(
        dt.getFullYear(),
        dt.getMonth(),
        dt.getDate(),
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0,
      );
    };

    const dateFrom = filters?.dateFrom
      ? parseYmdToLocalBoundary(filters.dateFrom, false)
      : null;
    const dateTo = filters?.dateTo
      ? parseYmdToLocalBoundary(filters.dateTo, true)
      : null;
    const statuses = filters?.statuses?.length ? filters.statuses : null;
    const teamIds = filters?.teamIds?.length ? filters.teamIds : null;

    if (dateFrom && Number.isNaN(dateFrom.getTime()))
      throw new BadRequestException('Invalid dateFrom');
    if (dateTo && Number.isNaN(dateTo.getTime()))
      throw new BadRequestException('Invalid dateTo');
    if (dateFrom && dateTo && dateFrom > dateTo)
      throw new BadRequestException('dateFrom must be <= dateTo');

    // Stable match numbering independent of filters.
    // Order rule matches existing frontend behavior: by startTime, then by id.
    const allMatchesForNumbering = await this.prisma.match.findMany({
      where: { tournamentId: id },
      select: { id: true, startTime: true },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    });
    const matchNumberById: Record<string, number> = {};
    for (let i = 0; i < allMatchesForNumbering.length; i++) {
      matchNumberById[allMatchesForNumbering[i].id] = i + 1;
    }

    const base = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        tournamentTeams: {
          orderBy: { createdAt: 'asc' },
          include: {
            team: { select: { id: true, name: true } },
            group: { select: { id: true, name: true, sortOrder: true } },
          },
        },
        groups: { orderBy: { sortOrder: 'asc' } },
        members: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: { id: true, email: true, name: true, role: true } },
          },
        },
        stadium: {
          select: {
            id: true,
            name: true,
            city: true,
            address: true,
          },
        },
        season: {
          select: { id: true, name: true, code: true },
        },
        competition: {
          select: { id: true, name: true, code: true },
        },
        ageGroup: {
          select: { id: true, name: true, shortLabel: true, code: true },
        },
        tournamentReferees: {
          orderBy: { sortOrder: 'asc' },
          include: {
            referee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!base) return null;

    const filteredMatches = await this.prisma.match.findMany({
      where: {
        tournamentId: id,
        ...(dateFrom || dateTo
          ? {
              startTime: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
        ...(statuses ? { status: { in: statuses } } : {}),
        ...(teamIds
          ? {
              OR: [
                { homeTeamId: { in: teamIds } },
                { awayTeamId: { in: teamIds } },
              ],
            }
          : {}),
      },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        scheduleChangeReason: {
          select: { id: true, name: true, code: true, scope: true },
        },
        events: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            type: true,
            minute: true,
            playerId: true,
            teamSide: true,
            payload: true,
            protocolEventTypeId: true,
            protocolEventType: {
              select: { id: true, name: true, mapsToType: true },
            },
          },
        },
      },
    });

    return { ...base, matches: filteredMatches, matchNumberById };
  }

  async update(id: string, dto: UpdateTournamentDto) {
    const existing = await this.prisma.tournament.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        slug: true,
        logoUrl: true,
        category: true,
        format: true,
        minTeams: true,
        groupCount: true,
        playoffQualifiersPerGroup: true,
      },
    });
    if (!existing) throw new NotFoundException('Tournament not found');

    if (dto.slug && dto.slug !== existing.slug) {
      const conflict = await this.prisma.tournament.findFirst({
        where: { tenantId: existing.tenantId, slug: dto.slug },
        select: { id: true },
      });
      if (conflict)
        throw new BadRequestException('Tournament slug already exists');
    }

    const startsAt =
      dto.startsAt === null
        ? null
        : dto.startsAt
          ? new Date(dto.startsAt)
          : undefined;
    const endsAt =
      dto.endsAt === null
        ? null
        : dto.endsAt
          ? new Date(dto.endsAt)
          : undefined;

    if (startsAt && Number.isNaN(startsAt.getTime()))
      throw new BadRequestException('Invalid startsAt');
    if (endsAt && Number.isNaN(endsAt.getTime()))
      throw new BadRequestException('Invalid endsAt');
    if (
      startsAt instanceof Date &&
      endsAt instanceof Date &&
      startsAt >= endsAt
    ) {
      throw new BadRequestException('startsAt must be before endsAt');
    }

    const tenantId = existing.tenantId;
    const adminIds = dto.admins?.map((a) => a.userId) ?? [];
    if (dto.admins) {
      if (adminIds.length) {
        const found = await this.prisma.user.findMany({
          where: { id: { in: adminIds }, tenantId },
          select: { id: true },
        });
        const foundSet = new Set(found.map((u) => u.id));
        const missing = adminIds.filter((aid) => !foundSet.has(aid));
        if (missing.length) {
          throw new BadRequestException(
            `Admins must belong to tenant. Missing: ${missing.join(', ')}`,
          );
        }
      }
    }

    const logoUrlResolved =
      dto.logoUrl === undefined
        ? undefined
        : dto.logoUrl === null || dto.logoUrl === ''
          ? null
          : dto.logoUrl;

    const previousLogoUrl = existing.logoUrl;
    const removeOldLogoFromS3 =
      !!previousLogoUrl &&
      logoUrlResolved !== undefined &&
      (logoUrlResolved === null || logoUrlResolved !== previousLogoUrl);

    this.assertMinTeamsByFormat(
      dto.format ?? existing.format,
      dto.minTeams ?? existing.minTeams ?? 2,
    );
    this.assertGroupedPlayoffBracketBySettings(
      dto.format ?? existing.format,
      dto.groupCount ?? existing.groupCount ?? 1,
      dto.playoffQualifiersPerGroup ?? existing.playoffQualifiersPerGroup ?? 2,
    );

    if (dto.ageGroupId !== undefined && dto.ageGroupId !== null && dto.ageGroupId !== '') {
      const aid = String(dto.ageGroupId).trim();
      const badTeam = await this.prisma.tournamentTeam.findFirst({
        where: {
          tournamentId: id,
          team: {
            OR: [{ ageGroupId: null }, { ageGroupId: { not: aid } }],
          },
        },
        select: { team: { select: { name: true, ageGroupId: true } } },
      });
      if (badTeam) {
        throw new BadRequestException(
          `Cannot set tournament age group because team "${badTeam.team.name}" is in another age group`,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let stadiumIdForUpdate: string | null | undefined = undefined;
      if (dto.stadiumId !== undefined) {
        if (dto.stadiumId === null || dto.stadiumId === '') {
          stadiumIdForUpdate = null;
        } else {
          const st = await tx.stadium.findFirst({
            where: { id: dto.stadiumId, tenantId },
            select: { id: true },
          });
          if (!st) {
            throw new BadRequestException('Стадион не найден');
          }
          stadiumIdForUpdate = dto.stadiumId;
        }
      }

      let seasonIdForUpdate: string | null | undefined = undefined;
      if (dto.seasonId !== undefined) {
        if (dto.seasonId === null || dto.seasonId === '') {
          seasonIdForUpdate = null;
        } else {
          const sid = String(dto.seasonId).trim();
          const sn = await tx.season.findFirst({
            where: { id: sid, tenantId },
            select: { id: true },
          });
          if (!sn) {
            throw new BadRequestException('Сезон не найден');
          }
          seasonIdForUpdate = sid;
        }
      }

      let competitionIdForUpdate: string | null | undefined = undefined;
      if (dto.competitionId !== undefined) {
        if (dto.competitionId === null || dto.competitionId === '') {
          competitionIdForUpdate = null;
        } else {
          const cid = String(dto.competitionId).trim();
          const cp = await tx.competition.findFirst({
            where: { id: cid, tenantId },
            select: { id: true },
          });
          if (!cp) {
            throw new BadRequestException('Тип соревнования не найден');
          }
          competitionIdForUpdate = cid;
        }
      }

      let ageGroupIdForUpdate: string | null | undefined = undefined;
      if (dto.ageGroupId !== undefined) {
        if (dto.ageGroupId === null || dto.ageGroupId === '') {
          ageGroupIdForUpdate = null;
        } else {
          const aid = String(dto.ageGroupId).trim();
          const ag = await tx.ageGroup.findFirst({
            where: { id: aid, tenantId },
            select: { id: true },
          });
          if (!ag) {
            throw new BadRequestException('Возрастная группа не найдена');
          }
          ageGroupIdForUpdate = aid;
        }
      }

      const row = await tx.tournament.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          // Legacy text category is deprecated; use ageGroupId.
          ...(dto.category !== undefined ? { category: null } : {}),
          logoUrl: logoUrlResolved,
          format: dto.format,
          groupCount: dto.groupCount,
          playoffQualifiersPerGroup: dto.playoffQualifiersPerGroup,
          status: dto.status,
          startsAt: startsAt,
          endsAt: endsAt,
          intervalDays: dto.intervalDays,
          allowedDays: dto.allowedDays,
          roundRobinCycles: dto.roundRobinCycles,
          matchDurationMinutes: dto.matchDurationMinutes,
          matchBreakMinutes: dto.matchBreakMinutes,
          simultaneousMatches: dto.simultaneousMatches,
          dayStartTimeDefault: dto.dayStartTimeDefault,
          dayStartTimeOverrides:
            dto.dayStartTimeOverrides === null
              ? null
              : (dto.dayStartTimeOverrides as any),
          minTeams: dto.minTeams,
          pointsWin: dto.pointsWin,
          pointsDraw: dto.pointsDraw,
          pointsLoss: dto.pointsLoss,
          ...(stadiumIdForUpdate !== undefined
            ? { stadiumId: stadiumIdForUpdate }
            : {}),
          ...(seasonIdForUpdate !== undefined
            ? { seasonId: seasonIdForUpdate }
            : {}),
          ...(competitionIdForUpdate !== undefined
            ? { competitionId: competitionIdForUpdate }
            : {}),
          ...(ageGroupIdForUpdate !== undefined
            ? { ageGroupId: ageGroupIdForUpdate }
            : {}),
        },
      });

      if (dto.refereeIds !== undefined) {
        await tx.tournamentReferee.deleteMany({ where: { tournamentId: id } });
        if (dto.refereeIds.length) {
          const refs = await tx.referee.findMany({
            where: { tenantId, id: { in: dto.refereeIds } },
            select: { id: true },
          });
          if (refs.length !== dto.refereeIds.length) {
            throw new BadRequestException('Один или несколько судей не найдены');
          }
          await tx.tournamentReferee.createMany({
            data: dto.refereeIds.map((refereeId, i) => ({
              tenantId,
              tournamentId: id,
              refereeId,
              sortOrder: i,
            })),
          });
        }
      }

      if (dto.admins) {
        await tx.tournamentMember.deleteMany({ where: { tournamentId: id } });
        if (dto.admins.length) {
          await tx.tournamentMember.createMany({
            data: dto.admins.map((a) => ({
              tenantId,
              tournamentId: id,
              userId: a.userId,
              role: a.role ?? TournamentMemberRole.TOURNAMENT_ADMIN,
            })),
            skipDuplicates: true,
          });
        }
      }

      return row;
    });

    if (updated.format === TournamentFormat.MANUAL) {
      const groupRows = await this.prisma.tournamentGroup.findMany({
        where: { tournamentId: id },
        select: { name: true },
      });
      await this.ensureManualGroupsIfNeeded(
        id,
        updated.tenantId,
        updated.groupCount ?? 1,
        groupRows,
      );
    }

    if (removeOldLogoFromS3 && previousLogoUrl) {
      await this.storage.tryDeletePublicUrl(previousLogoUrl);
    }

    return updated;
  }

  async delete(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      select: { id: true, logoUrl: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const logoToRemove = tournament.logoUrl;

    await this.prisma.$transaction(async (tx) => {
      const matchIds = await tx.match.findMany({
        where: { tournamentId: id },
        select: { id: true },
      });
      const ids = matchIds.map((m) => m.id);
      if (ids.length) {
        await tx.matchEvent.deleteMany({ where: { matchId: { in: ids } } });
      }

      await tx.match.deleteMany({ where: { tournamentId: id } });
      await tx.tournamentTableRow.deleteMany({ where: { tournamentId: id } });
      await tx.tournamentTeam.deleteMany({ where: { tournamentId: id } });
      await tx.tournamentMember.deleteMany({ where: { tournamentId: id } });
      await tx.tournamentGroup.deleteMany({ where: { tournamentId: id } });

      await tx.tournament.delete({ where: { id } });
    });

    if (logoToRemove) {
      await this.storage.tryDeletePublicUrl(logoToRemove);
    }

    return { success: true };
  }

  async getTable(tournamentId: string, groupId?: string) {
    if (groupId) {
      const t = await this.prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          tournamentTeams: {
            select: {
              teamId: true,
              groupId: true,
              groupSortOrder: true,
              team: { select: { id: true, name: true } },
            },
          },
          matches: {
            where: { stage: MatchStage.GROUP, groupId },
            select: {
              homeTeamId: true,
              awayTeamId: true,
              homeScore: true,
              awayScore: true,
              status: true,
            },
          },
        },
      });
      if (!t) throw new NotFoundException('Tournament not found');

      const teams = t.tournamentTeams.filter((x) => x.groupId === groupId);
      if (!teams.length) {
        return [];
      }
      const teamIds = teams.map((x) => x.teamId);
      const names = new Map(teams.map((x) => [x.teamId, x.team.name] as const));
      const seedOrder = new Map(
        teams.map((x) => [x.teamId, x.groupSortOrder ?? 0] as const),
      );

      const rows = this.computeStandings(teamIds, t.matches, {
        win: t.pointsWin,
        draw: t.pointsDraw,
        loss: t.pointsLoss,
      }, seedOrder);

      return rows.map((r, idx) => ({
        teamId: r.teamId,
        teamName: names.get(r.teamId) ?? r.teamId,
        position: idx + 1,
        played: r.played,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        goalsFor: r.goalsFor,
        goalsAgainst: r.goalsAgainst,
        goalDiff: r.goalDiff,
        points: r.points,
      }));
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    await this.recomputeTable(tournamentId);

    const rows = await this.prisma.tournamentTableRow.findMany({
      where: { tournamentId },
      orderBy: [{ position: 'asc' }, { points: 'desc' }, { goalDiff: 'desc' }],
      include: { team: { select: { id: true, name: true } } },
    });

    return rows.map((r) => ({
      teamId: r.teamId,
      teamName: r.team.name,
      position: r.position,
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDiff: r.goalDiff,
      points: r.points,
      updatedAt: r.updatedAt,
    }));
  }

  async addTeam(tournamentId: string, teamId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, tenantId: true, status: true, ageGroupId: true },
    });
    if (!tournament) throw new BadRequestException('Tournament not found');

    if (tournament.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException('Can add teams only for draft tournaments');
    }

    await this.assertNoMatchesForTeamCompositionEdit(tournamentId);

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, tenantId: true, rating: true, ageGroupId: true },
    });
    if (!team) throw new BadRequestException('Team not found');
    if (team.tenantId !== tournament.tenantId) {
      throw new BadRequestException('Team must belong to same tenant');
    }
    if (tournament.ageGroupId && team.ageGroupId !== tournament.ageGroupId) {
      throw new BadRequestException(
        'Team age group does not match tournament age group',
      );
    }

    return this.prisma.tournamentTeam.upsert({
      where: { tournamentId_teamId: { tournamentId, teamId } },
      create: {
        tenantId: tournament.tenantId,
        tournamentId,
        teamId,
        rating: Math.min(5, Math.max(1, team.rating ?? 3)),
      },
      update: {},
    });
  }

  async removeTeam(tournamentId: string, teamId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, status: true },
    });
    if (!tournament) throw new BadRequestException('Tournament not found');
    if (tournament.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException(
        'Can remove teams only for draft tournaments',
      );
    }

    await this.assertNoMatchesForTeamCompositionEdit(tournamentId);

    await this.prisma.tournamentTeam.deleteMany({
      where: { tournamentId, teamId },
    });
    return { success: true };
  }

  async setTeamGroup(
    tournamentId: string,
    teamId: string,
    groupId: string | null,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!tournament) throw new BadRequestException('Tournament not found');

    if (tournament.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException(
        'Can change groups only for draft tournaments',
      );
    }

    await this.assertNoMatchesForTeamCompositionEdit(tournamentId);

    if (groupId) {
      const g = await this.prisma.tournamentGroup.findFirst({
        where: { id: groupId, tournamentId },
        select: { id: true },
      });
      if (!g) throw new BadRequestException('Group not found');
    }

    const tt = await this.prisma.tournamentTeam.findFirst({
      where: { tournamentId, teamId },
      select: { id: true },
    });
    if (!tt) throw new BadRequestException('Team is not in tournament');

    await this.prisma.tournamentTeam.update({
      where: { id: tt.id },
      data: { groupId },
    });

    return { success: true };
  }

  async syncTeamsGroupLayout(
    tournamentId: string,
    items: Array<{ teamId: string; groupId: string; groupSortOrder: number }>,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!tournament) throw new BadRequestException('Tournament not found');

    if (tournament.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException(
        'Can change groups only for draft tournaments',
      );
    }

    await this.assertNoMatchesForTeamCompositionEdit(tournamentId);

    const tteams = await this.prisma.tournamentTeam.findMany({
      where: { tournamentId },
      select: { teamId: true },
    });
    const teamSet = new Set(tteams.map((x) => x.teamId));
    if (!teamSet.size) {
      if (items.length) {
        throw new BadRequestException('Tournament has no teams');
      }
      return { success: true };
    }
    const itemTeamIds = items.map((i) => i.teamId);
    const itemTeamSet = new Set(itemTeamIds);
    if (itemTeamSet.size !== itemTeamIds.length) {
      throw new BadRequestException('Duplicate teamId in payload');
    }
    if (teamSet.size !== itemTeamSet.size) {
      throw new BadRequestException(
        'Group layout must include every tournament team exactly once',
      );
    }
    for (const id of teamSet) {
      if (!itemTeamSet.has(id)) {
        throw new BadRequestException(
          'Group layout must include every tournament team exactly once',
        );
      }
    }

    const groups = await this.prisma.tournamentGroup.findMany({
      where: { tournamentId },
      select: { id: true },
    });
    const groupSet = new Set(groups.map((g) => g.id));
    for (const it of items) {
      if (!groupSet.has(it.groupId)) {
        throw new BadRequestException('Invalid groupId');
      }
    }

    await this.prisma.$transaction(
      items.map((it) =>
        this.prisma.tournamentTeam.updateMany({
          where: { tournamentId, teamId: it.teamId },
          data: { groupId: it.groupId, groupSortOrder: it.groupSortOrder },
        }),
      ),
    );

    return { success: true };
  }

  async setTeamRating(tournamentId: string, teamId: string, rating: number) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('rating must be integer 1..5');
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!tournament) throw new BadRequestException('Tournament not found');

    if (tournament.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException(
        'Can change team rating only for draft tournaments',
      );
    }

    const hasEnteredResults = await this.prisma.match.findFirst({
      where: {
        tournamentId,
        homeScore: { not: null },
        awayScore: { not: null },
        status: { in: [MatchStatus.PLAYED, MatchStatus.FINISHED] },
      },
      select: { id: true },
    });
    if (hasEnteredResults) {
      throw new BadRequestException(
        'Cannot change team rating after entering results',
      );
    }

    const updated = await this.prisma.tournamentTeam.updateMany({
      where: { tournamentId, teamId, tenantId: tournament.tenantId },
      data: { rating },
    });

    if (!updated.count) {
      throw new BadRequestException('Team is not in tournament');
    }

    return { success: true };
  }

  async clearCalendar(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true },
    });
    if (!tournament) throw new BadRequestException('Tournament not found');

    const deleted = await this.prisma.$transaction(async (tx) => {
      const matchIds = await tx.match.findMany({
        where: { tournamentId },
        select: { id: true },
      });
      const ids = matchIds.map((m) => m.id);

      if (ids.length) {
        await tx.matchEvent.deleteMany({ where: { matchId: { in: ids } } });
      }

      const res = await tx.match.deleteMany({ where: { tournamentId } });
      await tx.tournamentTableRow.deleteMany({ where: { tournamentId } });
      return res.count;
    });

    return { deleted };
  }

  private dateOnlyLocal(s: string) {
    return new Date(`${s}T12:00:00`);
  }

  private getDayStart(
    t: { dayStartTimeDefault?: string; dayStartTimeOverrides?: any },
    date: Date,
  ) {
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    const def = t.dayStartTimeDefault ?? '12:00';
    const overridesRaw = t.dayStartTimeOverrides ?? {};
    const overrides: Record<number, string> = {};
    for (const [k, v] of Object.entries(overridesRaw ?? {})) {
      const day = Number(k);
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      if (typeof v !== 'string' || !timeRe.test(v)) continue;
      overrides[day] = v;
    }
    const day = date.getDay();
    const startTimeStr = overrides[day] ?? def;
    if (!timeRe.test(startTimeStr)) return { hh: 12, mm: 0 };
    const [hh, mm] = startTimeStr.split(':').map((x) => Number(x));
    return { hh, mm };
  }

  private buildRoundRobinRounds(teamIds: string[]) {
    const list: (string | null)[] = [...teamIds];
    if (list.length % 2 === 1) list.push(null);
    const n = list.length;
    const rounds = n - 1;
    const half = n / 2;
    const rotate = (arr: (string | null)[]) => {
      const fixed = arr[0];
      const rest = arr.slice(1);
      rest.unshift(rest.pop()!);
      return [fixed, ...rest];
    };
    const res: Array<Array<[string, string]>> = [];
    let arr = list;
    for (let r = 0; r < rounds; r++) {
      const pairings: Array<[string, string]> = [];
      for (let i = 0; i < half; i++) {
        const a = arr[i];
        const b = arr[n - 1 - i];
        if (!a || !b) continue;
        const home = r % 2 === 0 ? a : b;
        const away = r % 2 === 0 ? b : a;
        pairings.push([home, away]);
      }
      res.push(pairings);
      arr = rotate(arr);
    }
    return res;
  }

  async generateCalendarFromTemplate(
    tournamentId: string,
    dto: GenerateFromTemplateDto,
  ) {
    const template = (this.templates as any)[dto.templateId];
    if (!template) throw new BadRequestException('Unknown templateId');

    const t = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        groups: { orderBy: { sortOrder: 'asc' } },
        tournamentTeams: {
          orderBy: { createdAt: 'asc' },
          include: { group: { select: { id: true, name: true } } },
        },
      },
    });
    if (!t) throw new BadRequestException('Tournament not found');
    this.assertNotManualCalendarFormat(t.format);

    const teams = t.tournamentTeams.map((x) => x.teamId);
    if (teams.length !== template.groups * template.teamsPerGroup) {
      throw new BadRequestException('Teams count does not match template');
    }

    const start = this.dateOnlyLocal(dto.startDate);
    if (Number.isNaN(start.getTime()))
      throw new BadRequestException('Invalid startDate');

    const replaceExisting = dto.replaceExisting !== false;
    const existingCount = await this.prisma.match.count({
      where: { tournamentId },
    });
    if (existingCount > 0 && !replaceExisting) {
      throw new BadRequestException(
        'Calendar already exists. Delete it first or set replaceExisting=true',
      );
    }

    const duration = t.matchDurationMinutes ?? 50;
    const brk = t.matchBreakMinutes ?? 10;
    const simultaneous = dto.parallelMatches ?? t.simultaneousMatches ?? 1;
    const slotMinutes = duration + brk;

    // Ensure groups exist (A/B) and teams are assigned (use current assignment).
    const groupNames = ['Группа A', 'Группа B'].slice(0, template.groups);
    const byName = new Map(t.groups.map((g) => [g.name, g]));
    const groups = groupNames
      .map((n, idx) => byName.get(n) ?? t.groups[idx])
      .filter(Boolean) as Array<{ id: string; name: string }>;
    if (groups.length !== template.groups)
      throw new BadRequestException('Groups not initialized');

    const teamsByGroup: Record<string, string[]> = {};
    for (const g of groups) teamsByGroup[g.id] = [];
    const ratingByTeamId: Record<string, number> = Object.fromEntries(
      t.tournamentTeams.map((tt) => [tt.teamId, (tt as any).rating ?? 3]),
    );
    for (const tt of t.tournamentTeams) {
      const gid = tt.group?.id ?? null;
      if (!gid || !teamsByGroup[gid]) continue;
      teamsByGroup[gid].push(tt.teamId);
    }
    for (const g of groups) {
      teamsByGroup[g.id].sort(
        (a, b) => (ratingByTeamId[b] ?? 3) - (ratingByTeamId[a] ?? 3),
      );
      if (teamsByGroup[g.id].length !== template.teamsPerGroup) {
        throw new BadRequestException(
          'Groups composition does not match template',
        );
      }
    }

    const matchesToCreate: Prisma.MatchCreateManyInput[] = [];

    // Day 0: group stage rounds
    const groupDay = template.days.find((d: any) => d.stage === 'GROUP');
    if (groupDay) {
      const perGroupRounds = groups.map((g) =>
        this.buildRoundRobinRounds(teamsByGroup[g.id]),
      );
      const maxRounds = Math.min(
        groupDay.rounds,
        Math.max(...perGroupRounds.map((x) => x.length)),
      );

      for (let r = 0; r < maxRounds; r++) {
        const dayDate = new Date(
          start.getTime() + groupDay.dateOffsetDays * 24 * 60 * 60 * 1000,
        );
        const { hh, mm } = this.getDayStart(t, dayDate);
        const base = new Date(dayDate);
        base.setHours(hh, mm, 0, 0);

        // offset for this round within the day so rounds don't overlap
        let offsetMinutes = 0;
        for (let prev = 0; prev < r; prev++) {
          const matchesInPrevRound = groups.reduce(
            (sum, _g, gi) => sum + (perGroupRounds[gi][prev]?.length ?? 0),
            0,
          );
          const waves = Math.ceil(matchesInPrevRound / simultaneous);
          offsetMinutes += waves * slotMinutes;
        }

        const allPairings: Array<{
          home: string;
          away: string;
          groupId: string;
        }> = [];
        for (let gi = 0; gi < groups.length; gi++) {
          const g = groups[gi];
          for (const [home, away] of perGroupRounds[gi][r] ?? []) {
            allPairings.push({ home, away, groupId: g.id });
          }
        }

        for (let idx = 0; idx < allPairings.length; idx++) {
          const wave = Math.floor(idx / simultaneous);
          const startTime = new Date(
            base.getTime() + (offsetMinutes + wave * slotMinutes) * 60 * 1000,
          );
          matchesToCreate.push({
            tenantId: t.tenantId,
            tournamentId: t.id,
            homeTeamId: allPairings[idx].home,
            awayTeamId: allPairings[idx].away,
            startTime,
            stage: MatchStage.GROUP,
            groupId: allPairings[idx].groupId,
            roundNumber: r + 1,
            playoffRound: null,
          } as any);
        }
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let deletedMatches = 0;
      if (existingCount > 0 && replaceExisting) {
        const ids = await tx.match.findMany({
          where: { tournamentId },
          select: { id: true },
        });
        const matchIds = ids.map((m) => m.id);
        if (matchIds.length) {
          await tx.matchEvent.deleteMany({
            where: { matchId: { in: matchIds } },
          });
        }
        const del = await tx.match.deleteMany({ where: { tournamentId } });
        deletedMatches = del.count;
        await tx.tournamentTableRow.deleteMany({ where: { tournamentId } });
      }

      const created = await tx.match.createMany({ data: matchesToCreate });
      return { created: created.count, deleted: deletedMatches };
    });

    // Day 7: create playoff placeholders immediately (A1-B2 / B1-A2),
    // and later update them after group results are entered.
    const playoffDay = template.days.find((d: any) => d.stage === 'PLAYOFF');
    let playoff = { created: 0, skipped: false };
    if (
      playoffDay &&
      (t.format === TournamentFormat.GROUPS_PLUS_PLAYOFF ||
        t.format === TournamentFormat.GROUPS_2)
    ) {
      const includeThirdPlace = !!playoffDay.includeThirdPlace;

      const gA = groups.find((g) => g.name === 'Группа A') ?? groups[0];
      const gB = groups.find((g) => g.name === 'Группа B') ?? groups[1];

      const teamsA = teamsByGroup[gA.id] ?? [];
      const teamsB = teamsByGroup[gB.id] ?? [];
      if (teamsA.length < 2 || teamsB.length < 2) {
        throw new BadRequestException(
          'Not enough teams to build playoff placeholders',
        );
      }

      // Placeholder seeding (will be replaced later with real standings)
      const A1 = teamsA[0];
      const A2 = teamsA[1];
      const B1 = teamsB[0];
      const B2 = teamsB[1];

      const playoffDate = new Date(
        start.getTime() + playoffDay.dateOffsetDays * 24 * 60 * 60 * 1000,
      );
      const { hh, mm } = this.getDayStart(t, playoffDate);
      const base = new Date(playoffDate);
      base.setHours(hh, mm, 0, 0);

      const playoffMatches: Prisma.MatchCreateManyInput[] = [];
      const ids: Array<{
        home: string;
        away: string;
        roundNumber: number;
        playoffRound: PlayoffRound;
      }> = [
        {
          home: A1,
          away: B2,
          roundNumber: 1,
          playoffRound: PlayoffRound.SEMIFINAL,
        },
        {
          home: B1,
          away: A2,
          roundNumber: 1,
          playoffRound: PlayoffRound.SEMIFINAL,
        },
        {
          home: A1,
          away: B1,
          roundNumber: 2,
          playoffRound: PlayoffRound.FINAL,
        },
      ];
      if (includeThirdPlace) {
        ids.push({
          home: A2,
          away: B2,
          roundNumber: 2,
          playoffRound: PlayoffRound.THIRD_PLACE,
        });
      }

      // Keep same timing model as group stage: allow parallel matches.
      for (let idx = 0; idx < ids.length; idx++) {
        const wave = Math.floor(idx / simultaneous);
        const startTime = new Date(
          base.getTime() + wave * slotMinutes * 60 * 1000,
        );
        playoffMatches.push({
          tenantId: t.tenantId,
          tournamentId: t.id,
          homeTeamId: ids[idx].home,
          awayTeamId: ids[idx].away,
          stage: MatchStage.PLAYOFF,
          roundNumber: ids[idx].roundNumber,
          playoffRound: ids[idx].playoffRound,
          startTime,
        });
      }

      const created = await this.prisma.match.createMany({
        data: playoffMatches,
      });
      playoff = { created: created.count, skipped: false };

      // If groups are already finished, replace placeholders immediately.
      try {
        await this.generatePlayoff(tournamentId, { replaceExisting: true });
      } catch {
        // Ignore — group results are not ready yet.
      }
    }

    return { ...result, templateId: template.id, playoff };
  }

  private computeStandings(
    teamIds: string[],
    matches: Array<{
      homeTeamId: string;
      awayTeamId: string;
      homeScore: number | null;
      awayScore: number | null;
      status: MatchStatus;
    }>,
    points: { win: number; draw: number; loss: number },
    seedOrder?: Map<string, number>,
  ) {
    type Row = {
      teamId: string;
      played: number;
      wins: number;
      draws: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDiff: number;
      points: number;
    };

    const acc: Record<string, Row> = Object.fromEntries(
      teamIds.map((id) => [
        id,
        {
          teamId: id,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDiff: 0,
          points: 0,
        },
      ]),
    );

    const eligible = new Set<MatchStatus>([
      MatchStatus.PLAYED,
      MatchStatus.FINISHED,
    ]);
    for (const m of matches) {
      if (!eligible.has(m.status)) continue;
      if (m.homeScore === null || m.awayScore === null) continue;
      if (!acc[m.homeTeamId] || !acc[m.awayTeamId]) continue;

      const hs = m.homeScore;
      const as = m.awayScore;

      const h = acc[m.homeTeamId];
      const a = acc[m.awayTeamId];
      h.played += 1;
      a.played += 1;
      h.goalsFor += hs;
      h.goalsAgainst += as;
      a.goalsFor += as;
      a.goalsAgainst += hs;

      if (hs > as) {
        h.wins += 1;
        a.losses += 1;
        h.points += points.win;
        a.points += points.loss;
      } else if (hs < as) {
        a.wins += 1;
        h.losses += 1;
        a.points += points.win;
        h.points += points.loss;
      } else {
        h.draws += 1;
        a.draws += 1;
        h.points += points.draw;
        a.points += points.draw;
      }
    }

    const rows = Object.values(acc).map((r) => ({
      ...r,
      goalDiff: r.goalsFor - r.goalsAgainst,
    }));

    const seedCmp = (a: string, b: string) => {
      if (!seedOrder) return 0;
      const na = seedOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
      const nb = seedOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
      return na - nb;
    };

    // Sort by:
    // 1) total points
    // 2) head-to-head points (matches only between teams that are tied on total points)
    // 3) overall goal difference
    // 4) overall goals for
    const byPoints = new Map<number, typeof rows>();
    for (const r of rows) {
      const cur = byPoints.get(r.points) ?? [];
      cur.push(r);
      byPoints.set(r.points, cur);
    }

    const sortedPoints = [...byPoints.keys()].sort((a, b) => b - a);
    const sortedRows: typeof rows = [];

    for (const p of sortedPoints) {
      const group = byPoints.get(p)!;

      if (group.length > 1) {
        const set = new Set(group.map((r) => r.teamId));
        const headAcc: Record<string, number> = {};
        for (const id of set) headAcc[id] = 0;

        const eligible = new Set<MatchStatus>([
          MatchStatus.PLAYED,
          MatchStatus.FINISHED,
        ]);
        for (const m of matches) {
          if (!eligible.has(m.status)) continue;
          if (m.homeScore === null || m.awayScore === null) continue;
          if (!set.has(m.homeTeamId) || !set.has(m.awayTeamId)) continue;

          const hs = m.homeScore;
          const as = m.awayScore;
          if (hs > as) {
            headAcc[m.homeTeamId] += points.win;
            headAcc[m.awayTeamId] += points.loss;
          } else if (hs < as) {
            headAcc[m.homeTeamId] += points.loss;
            headAcc[m.awayTeamId] += points.win;
          } else {
            headAcc[m.homeTeamId] += points.draw;
            headAcc[m.awayTeamId] += points.draw;
          }
        }

        group.sort(
          (x, y) =>
            (headAcc[y.teamId] ?? 0) - (headAcc[x.teamId] ?? 0) ||
            y.goalDiff - x.goalDiff ||
            y.goalsFor - x.goalsFor ||
            seedCmp(x.teamId, y.teamId) ||
            x.teamId.localeCompare(y.teamId),
        );
      } else {
        group.sort(
          (x, y) =>
            y.goalDiff - x.goalDiff ||
            y.goalsFor - x.goalsFor ||
            seedCmp(x.teamId, y.teamId) ||
            x.teamId.localeCompare(y.teamId),
        );
      }

      sortedRows.push(...group);
    }

    return sortedRows;
  }

  private async generatePlayoffGeneric(
    tournamentId: string,
    options?: { replaceExisting?: boolean },
  ) {
    const replaceExisting = options?.replaceExisting ?? false;

    const t = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        groups: { orderBy: { sortOrder: 'asc' } },
        tournamentTeams: {
          select: { teamId: true, groupId: true, groupSortOrder: true },
        },
        matches: {
          select: {
            id: true,
            stage: true,
            playoffRound: true,
            roundNumber: true,
            groupId: true,
            startTime: true,
            status: true,
            homeTeamId: true,
            awayTeamId: true,
            homeScore: true,
            awayScore: true,
          },
        },
      },
    });

    if (!t) throw new BadRequestException('Tournament not found');

    const allowed = [
      TournamentFormat.GROUPS_PLUS_PLAYOFF,
      TournamentFormat.GROUPS_2,
      TournamentFormat.GROUPS_3,
      TournamentFormat.GROUPS_4,
      TournamentFormat.MANUAL,
    ];
    if (!allowed.includes(t.format as any)) {
      throw new BadRequestException(
        'Playoff generation is supported only for grouped formats (including MANUAL with groups)',
      );
    }

    const groups = (t.groups ?? [])
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (!groups.length) throw new BadRequestException('Groups not found');

    const k = t.playoffQualifiersPerGroup ?? 2;
    if (!Number.isInteger(k) || k < 1 || k > 8) {
      throw new BadRequestException(
        'playoffQualifiersPerGroup must be an integer 1..8',
      );
    }

    const qualifiersCount = groups.length * k;
    const isPowerOfTwo = (n: number) => n > 0 && (n & (n - 1)) === 0;
    if (!isPowerOfTwo(qualifiersCount)) {
      throw new BadRequestException(
        `Invalid playoff bracket: groups(${groups.length}) * qualifiersPerGroup(${k}) must be a power of two. Got ${qualifiersCount}.`,
      );
    }

    const rounds = Math.round(Math.log2(qualifiersCount));
    if (rounds < 1)
      throw new BadRequestException('Invalid playoff bracket size');

    // Compute top-K seeds per group (needs group results).
    const groupMatches = t.matches.filter((m) => m.stage === MatchStage.GROUP);
    const topSeedsByGroup: string[][] = [];
    for (const g of groups) {
      const inGroup = t.tournamentTeams.filter((x) => x.groupId === g.id);
      const groupTeamIds = inGroup.map((x) => x.teamId);
      const seedMap = new Map(
        inGroup.map((x) => [x.teamId, x.groupSortOrder ?? 0] as const),
      );
      if (groupTeamIds.length < k) {
        throw new BadRequestException(
          `Group ${g.name} has fewer teams than playoffQualifiersPerGroup`,
        );
      }
      const requiredPerGroup =
        (groupTeamIds.length * (groupTeamIds.length - 1)) / 2;
      const ms = groupMatches.filter((m) => m.groupId === g.id);

      const eligible = new Set<MatchStatus>([
        MatchStatus.PLAYED,
        MatchStatus.FINISHED,
      ]);
      const played = ms.filter(
        (m) =>
          eligible.has(m.status) &&
          m.homeScore !== null &&
          m.awayScore !== null,
      ).length;

      if (ms.length < requiredPerGroup) {
        throw new BadRequestException(
          `Group ${g.name} is not fully generated yet`,
        );
      }
      if (played < requiredPerGroup) {
        throw new BadRequestException(
          `Finish all group matches in ${g.name} before generating/updating playoffs`,
        );
      }

      const standings = this.computeStandings(
        groupTeamIds,
        ms.map((m) => ({
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          status: m.status,
        })),
        { win: t.pointsWin, draw: t.pointsDraw, loss: t.pointsLoss },
        seedMap,
      );

      const topK = standings.slice(0, k).map((r) => r.teamId);
      if (topK.length < k)
        throw new BadRequestException(
          `Unable to compute ${k} seeds for group ${g.name}`,
        );
      topSeedsByGroup.push(topK);
    }

    // Build rank-major seeds array: rank1 of all groups, then rank2, etc.
    const seeds: string[] = [];
    for (let rank = 1; rank <= k; rank++) {
      for (let gi = 0; gi < groups.length; gi++) {
        seeds.push(topSeedsByGroup[gi][rank - 1]);
      }
    }

    // Update existing first knockout round teams if matches already exist.
    const playoffMatches = t.matches.filter(
      (m) =>
        m.stage === MatchStage.PLAYOFF && typeof m.roundNumber === 'number',
    );
    if (playoffMatches.length) {
      const firstRoundNumber = Math.min(
        ...playoffMatches.map((m) => m.roundNumber),
      );
      const firstRoundMatches = playoffMatches
        .filter(
          (m) =>
            m.roundNumber === firstRoundNumber &&
            m.playoffRound === PlayoffRound.SEMIFINAL,
        )
        .slice()
        .sort(
          (a, b) =>
            a.startTime.getTime() - b.startTime.getTime() ||
            a.id.localeCompare(b.id),
        );

      if (firstRoundMatches.length !== qualifiersCount / 2) {
        // If bracket already exists but differs in size, fail loudly: bracket config mismatch.
        throw new BadRequestException(
          'Existing playoff matches do not match current bracket size',
        );
      }

      await this.prisma.$transaction(async (tx) => {
        const ops: Prisma.PrismaPromise<any>[] = [];
        for (let mi = 0; mi < firstRoundMatches.length; mi++) {
          const m = firstRoundMatches[mi];
          if (m.homeScore !== null || m.awayScore !== null) continue; // don't overwrite played matches
          ops.push(
            tx.match.update({
              where: { id: m.id },
              data: {
                homeTeamId: seeds[mi],
                awayTeamId: seeds[qualifiersCount - 1 - mi],
              },
            }),
          );
        }
        await Promise.all(ops);
      });

      return { created: 0, updated: true };
    }

    // If there are no playoff matches yet, create the full bracket as placeholders (participants are placeholders).
    // Timing: append after the last existing match time.
    const slotMinutes =
      (t.matchDurationMinutes ?? 50) + (t.matchBreakMinutes ?? 10);
    const last = t.matches
      .filter((m) => m.startTime)
      .slice()
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .at(-1);
    const base = last?.startTime ? new Date(last.startTime) : new Date();
    let nextStart = new Date(base.getTime() + slotMinutes * 60 * 1000);

    const planned: Array<{
      homeTeamId: string;
      awayTeamId: string;
      stage: MatchStage;
      roundNumber: number;
      playoffRound: PlayoffRound;
      startTime: Date;
    }> = [];

    const firstPlayoffRoundNumber = 1;
    let currentRoundNumber = firstPlayoffRoundNumber;
    for (let knockoutIndex = 1; knockoutIndex <= rounds; knockoutIndex++) {
      const roundNumber = currentRoundNumber++;
      const matchesInRound = qualifiersCount / 2 ** knockoutIndex;
      if (knockoutIndex === rounds) {
        const home = seeds[0];
        const away = seeds[1] ?? seeds[0];
        planned.push({
          homeTeamId: home,
          awayTeamId: away,
          stage: MatchStage.PLAYOFF,
          roundNumber,
          playoffRound: PlayoffRound.FINAL,
          startTime: nextStart,
        });
        if (qualifiersCount >= 4) {
          nextStart = new Date(nextStart.getTime() + slotMinutes * 60 * 1000);
          planned.push({
            homeTeamId: away,
            awayTeamId: home,
            stage: MatchStage.PLAYOFF,
            roundNumber,
            playoffRound: PlayoffRound.THIRD_PLACE,
            startTime: nextStart,
          });
        }
      } else {
        const pair = () => ({
          homeTeamId: seeds[0],
          awayTeamId: seeds[1] ?? seeds[0],
        });
        for (let mi = 0; mi < matchesInRound; mi++) {
          const p =
            knockoutIndex === 1
              ? {
                  homeTeamId: seeds[mi],
                  awayTeamId: seeds[qualifiersCount - 1 - mi],
                }
              : pair();
          planned.push({
            homeTeamId: p.homeTeamId,
            awayTeamId: p.awayTeamId,
            stage: MatchStage.PLAYOFF,
            roundNumber,
            playoffRound: PlayoffRound.SEMIFINAL,
            startTime: nextStart,
          });
          nextStart = new Date(nextStart.getTime() + slotMinutes * 60 * 1000);
        }
      }
    }

    await this.prisma.match.createMany({
      data: planned.map((p) => ({
        tenantId: t.tenantId,
        tournamentId: t.id,
        homeTeamId: p.homeTeamId,
        awayTeamId: p.awayTeamId,
        stage: p.stage,
        roundNumber: p.roundNumber,
        playoffRound: p.playoffRound,
        startTime: p.startTime,
      })),
    });

    return { created: planned.length };
  }

  async generatePlayoff(
    tournamentId: string,
    options?: { replaceExisting?: boolean },
  ) {
    const replaceExisting = options?.replaceExisting ?? false;
    const t = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        groups: { orderBy: { sortOrder: 'asc' } },
        tournamentTeams: { select: { teamId: true, groupId: true } },
        matches: {
          select: {
            id: true,
            stage: true,
            playoffRound: true,
            roundNumber: true,
            groupId: true,
            startTime: true,
            status: true,
            homeTeamId: true,
            awayTeamId: true,
            homeScore: true,
            awayScore: true,
          },
          orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!t) throw new BadRequestException('Tournament not found');
    if (
      t.format !== TournamentFormat.GROUPS_PLUS_PLAYOFF &&
      t.format !== TournamentFormat.GROUPS_2 &&
      t.format !== TournamentFormat.GROUPS_3 &&
      t.format !== TournamentFormat.GROUPS_4 &&
      t.format !== TournamentFormat.MANUAL
    ) {
      throw new BadRequestException(
        'Playoff generation is supported only for grouped formats (GROUPS_* or MANUAL with groups)',
      );
    }

    // Always use generic implementation to support arbitrary group counts and playoffQualifiersPerGroup.
    return this.generatePlayoffGeneric(tournamentId, { replaceExisting });

    /* Legacy hardcoded implementation (kept only for reference).
    // Special handling for 4 groups: build a quarterfinal bracket seeded by each group's 1st/2nd.
    if (t.format === TournamentFormat.GROUPS_4) {
      const gA = t.groups.find((g) => g.name === 'Группа A') ?? t.groups[0];
      const gB = t.groups.find((g) => g.name === 'Группа B') ?? t.groups[1];
      const gC = t.groups.find((g) => g.name === 'Группа C') ?? t.groups[2];
      const gD = t.groups.find((g) => g.name === 'Группа D') ?? t.groups[3];
      if (!gA || !gB || !gC || !gD) throw new BadRequestException('Groups A/B/C/D not found');

      const groups = [
        { key: 'A', g: gA },
        { key: 'B', g: gB },
        { key: 'C', g: gC },
        { key: 'D', g: gD },
      ] as const;

      const groupMatches = t.matches.filter((m) => m.stage === MatchStage.GROUP);
      const byGroup = (gid: string) => groupMatches.filter((m) => m.groupId === gid);

      const getTeamsAndCheck = (gid: string) => {
        const teams = t.tournamentTeams.filter((x) => x.groupId === gid).map((x) => x.teamId);
        if (teams.length < 2) throw new BadRequestException('Each group must have at least 2 teams for playoffs');
        const required = (teams.length * (teams.length - 1)) / 2;
        const ms = byGroup(gid);
        const playedCount = ms.filter(
          (m) => (m.status === MatchStatus.PLAYED || m.status === MatchStatus.FINISHED) && m.homeScore !== null && m.awayScore !== null,
        ).length;
        if (ms.length < required) throw new BadRequestException('Group stage is not fully generated yet');
        if (playedCount < required) throw new BadRequestException('Finish all group matches (enter scores) before generating playoffs');
        return { teams, required, ms };
      };

      const standings = groups.map(({ g }) => {
        const { teams, ms } = getTeamsAndCheck(g.id);
        // For now assume 1st/2nd seeds are enough to build a quarterfinal bracket.
        const s = this.computeStandings(teams, ms, { win: t.pointsWin, draw: t.pointsDraw, loss: t.pointsLoss });
        const seed1 = s[0]?.teamId;
        const seed2 = s[1]?.teamId;
        return { groupId: g.id, seed1, seed2 };
      });

      const A1 = standings[0]?.seed1;
      const A2 = standings[0]?.seed2;
      const B1 = standings[1]?.seed1;
      const B2 = standings[1]?.seed2;
      const C1 = standings[2]?.seed1;
      const C2 = standings[2]?.seed2;
      const D1 = standings[3]?.seed1;
      const D2 = standings[3]?.seed2;
      if (!A1 || !A2 || !B1 || !B2 || !C1 || !C2 || !D1 || !D2) throw new BadRequestException('Unable to compute group seeds');

      const existingPlayoff = t.matches.some((m) => m.stage === MatchStage.PLAYOFF);
      if (existingPlayoff && !replaceExisting) {
        throw new BadRequestException('Playoff already exists. Clear calendar first (or implement replace for playoffs).');
      }

      // If placeholders already exist (created during calendar generation), update only quarterfinal participants.
      if (existingPlayoff && replaceExisting) {
        const finalMatch = t.matches
          .filter((m) => m.stage === MatchStage.PLAYOFF && m.playoffRound === PlayoffRound.FINAL)
          .slice()
          .sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0))[0];
        if (!finalMatch?.roundNumber) {
          throw new BadRequestException('Final match not found in existing playoff');
        }
        const qfRound = finalMatch.roundNumber - 2;

        const quarterMatches = t.matches
          .filter((m) => m.stage === MatchStage.PLAYOFF && m.playoffRound === PlayoffRound.SEMIFINAL && m.roundNumber === qfRound)
          .slice()
          .sort((a, b) => a.startTime.getTime() - b.startTime.getTime() || a.id.localeCompare(b.id));

        if (quarterMatches.length < 4) {
          throw new BadRequestException('Quarterfinal matches are missing; regenerate calendar');
        }

        const updates: Prisma.PrismaPromise<any>[] = [];
        const applyIfNoScores = (m: typeof quarterMatches[number], homeTeamId: string, awayTeamId: string) => {
          if (m.homeScore === null && m.awayScore === null) {
            updates.push(this.prisma.match.update({ where: { id: m.id }, data: { homeTeamId, awayTeamId } }));
          }
        };

        applyIfNoScores(quarterMatches[0], A1, B2);
        applyIfNoScores(quarterMatches[1], B1, A2);
        applyIfNoScores(quarterMatches[2], C1, D2);
        applyIfNoScores(quarterMatches[3], D1, C2);

        await this.prisma.$transaction(updates);
        return { created: 0, updatedCount: updates.length };
      }

      // Otherwise create full bracket (quarterfinals + semifinals + final + third).
      const slotMinutes = (t.matchDurationMinutes ?? 50) + (t.matchBreakMinutes ?? 10);
      const base = t.matches.length ? new Date(t.matches[t.matches.length - 1].startTime) : new Date();

      const start1 = new Date(base.getTime() + slotMinutes * 60 * 1000);
      const start2 = new Date(start1.getTime() + slotMinutes * 60 * 1000);
      const start3 = new Date(start2.getTime() + slotMinutes * 60 * 1000);
      const start4 = new Date(start3.getTime() + slotMinutes * 60 * 1000);
      const start5 = new Date(start4.getTime() + slotMinutes * 60 * 1000);
      const start6 = new Date(start5.getTime() + slotMinutes * 60 * 1000);
      const start7 = new Date(start6.getTime() + slotMinutes * 60 * 1000);
      const start8 = new Date(start7.getTime() + slotMinutes * 60 * 1000);

      const created = await this.prisma.match.createMany({
        data: [
          // Quarterfinals (encoded as SEMIFINAL with roundNumber=1)
          {
            tenantId: t.tenantId,
            tournamentId: t.id,
            homeTeamId: A1,
            awayTeamId: B2,
            stage: MatchStage.PLAYOFF,
            roundNumber: 1,
            playoffRound: PlayoffRound.SEMIFINAL,
            startTime: start1,
          },
          {
            tenantId: t.tenantId,
            tournamentId: t.id,
            homeTeamId: B1,
            awayTeamId: A2,
            stage: MatchStage.PLAYOFF,
            roundNumber: 1,
            playoffRound: PlayoffRound.SEMIFINAL,
            startTime: start2,
          },
          {
            tenantId: t.tenantId,
            tournamentId: t.id,
            homeTeamId: C1,
            awayTeamId: D2,
            stage: MatchStage.PLAYOFF,
            roundNumber: 1,
            playoffRound: PlayoffRound.SEMIFINAL,
            startTime: start3,
          },
          {
            tenantId: t.tenantId,
            tournamentId: t.id,
            homeTeamId: D1,
            awayTeamId: C2,
            stage: MatchStage.PLAYOFF,
            roundNumber: 1,
            playoffRound: PlayoffRound.SEMIFINAL,
            startTime: start4,
          },
          // Semifinals placeholders (encoded as SEMIFINAL with roundNumber=2)
          {
            tenantId: t.tenantId,
            tournamentId: t.id,
            homeTeamId: A1,
            awayTeamId: B1,
            stage: MatchStage.PLAYOFF,
            roundNumber: 2,
            playoffRound: PlayoffRound.SEMIFINAL,
            startTime: start5,
          },
          {
            tenantId: t.tenantId,
            tournamentId: t.id,
            homeTeamId: C1,
            awayTeamId: D1,
            stage: MatchStage.PLAYOFF,
            roundNumber: 2,
            playoffRound: PlayoffRound.SEMIFINAL,
            startTime: start6,
          },
          // Final (roundNumber=3) and third place
          {
            tenantId: t.tenantId,
            tournamentId: t.id,
            homeTeamId: A1,
            awayTeamId: C1,
            stage: MatchStage.PLAYOFF,
            roundNumber: 3,
            playoffRound: PlayoffRound.FINAL,
            startTime: start7,
          },
          {
            tenantId: t.tenantId,
            tournamentId: t.id,
            homeTeamId: B1,
            awayTeamId: D1,
            stage: MatchStage.PLAYOFF,
            roundNumber: 3,
            playoffRound: PlayoffRound.THIRD_PLACE,
            startTime: start8,
          },
        ],
      });

      return { created: created.count };
    }

    const gA = t.groups.find((g) => g.name === 'Группа A') ?? t.groups[0];
    const gB = t.groups.find((g) => g.name === 'Группа B') ?? t.groups[1];
    if (!gA || !gB) throw new BadRequestException('Groups A/B not found');

    const teamsA = t.tournamentTeams.filter((x) => x.groupId === gA.id).map((x) => x.teamId);
    const teamsB = t.tournamentTeams.filter((x) => x.groupId === gB.id).map((x) => x.teamId);
    if (teamsA.length !== 4 || teamsB.length !== 4) {
      throw new BadRequestException('Each group must have exactly 4 teams');
    }

    const groupMatches = t.matches.filter((m) => m.stage === MatchStage.GROUP);
    const groupMatchesA = groupMatches.filter((m) => m.groupId === gA.id);
    const groupMatchesB = groupMatches.filter((m) => m.groupId === gB.id);

    // Require all group matches to be played to seed playoffs.
    const requiredPerGroup = 6; // 4 teams round-robin => 6 matches
    const played = (ms: typeof groupMatchesA) =>
      ms.filter((m) => (m.status === MatchStatus.PLAYED || m.status === MatchStatus.FINISHED) && m.homeScore !== null && m.awayScore !== null).length;
    if (groupMatchesA.length < requiredPerGroup || groupMatchesB.length < requiredPerGroup) {
      throw new BadRequestException('Group stage is not fully generated yet');
    }
    if (played(groupMatchesA) < requiredPerGroup || played(groupMatchesB) < requiredPerGroup) {
      throw new BadRequestException('Finish all group matches (enter scores) before generating playoffs');
    }

    const standingsA = this.computeStandings(teamsA, groupMatchesA, { win: t.pointsWin, draw: t.pointsDraw, loss: t.pointsLoss });
    const standingsB = this.computeStandings(teamsB, groupMatchesB, { win: t.pointsWin, draw: t.pointsDraw, loss: t.pointsLoss });

    const A1 = standingsA[0]?.teamId;
    const A2 = standingsA[1]?.teamId;
    const B1 = standingsB[0]?.teamId;
    const B2 = standingsB[1]?.teamId;
    if (!A1 || !A2 || !B1 || !B2) throw new BadRequestException('Unable to compute group standings');

    const existingPlayoff = t.matches.some((m) => m.stage === MatchStage.PLAYOFF);
    if (existingPlayoff && !replaceExisting) {
      throw new BadRequestException('Playoff already exists. Clear calendar first (or implement replace for playoffs).');
    }

    // If playoff already exists (placeholders were created during calendar generation),
    // update teams in existing semifinal/final/third-place matches instead of creating duplicates.
    if (existingPlayoff && replaceExisting) {
      const semis = t.matches
        .filter((m) => m.stage === MatchStage.PLAYOFF && m.playoffRound === PlayoffRound.SEMIFINAL)
        .slice()
        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime() || a.id.localeCompare(b.id));

      const finals = t.matches.filter(
        (m) => m.stage === MatchStage.PLAYOFF && m.playoffRound === PlayoffRound.FINAL,
      );
      const thirdPlaces = t.matches.filter(
        (m) => m.stage === MatchStage.PLAYOFF && m.playoffRound === PlayoffRound.THIRD_PLACE,
      );

      if (semis.length < 2) {
        throw new BadRequestException('Playoff semifinals are missing; cannot replace existing playoff teams.');
      }

      const semi1 = semis.find((m) => teamsA.includes(m.homeTeamId) && teamsB.includes(m.awayTeamId)) ?? semis[0];
      const semi2 = semis.find((m) => teamsB.includes(m.homeTeamId) && teamsA.includes(m.awayTeamId)) ?? semis[1];

      const updated = await this.prisma.$transaction(async (tx) => {
        const ops: Prisma.PrismaPromise<any>[] = [];
        // Update teams only if semifinals scores aren't entered yet.
        if (semi1.homeScore === null && semi1.awayScore === null) {
          ops.push(tx.match.update({ where: { id: semi1.id }, data: { homeTeamId: A1, awayTeamId: B2 } }));
        }
        if (semi2.homeScore === null && semi2.awayScore === null) {
          ops.push(tx.match.update({ where: { id: semi2.id }, data: { homeTeamId: B1, awayTeamId: A2 } }));
        }

        if (finals[0]?.id) {
          const final = finals[0];
          if (final.homeScore === null && final.awayScore === null) {
            ops.push(tx.match.update({ where: { id: final.id }, data: { homeTeamId: A1, awayTeamId: B1 } }));
          }
        }
        if (thirdPlaces[0]?.id) {
          const tp = thirdPlaces[0];
          if (tp.homeScore === null && tp.awayScore === null) {
            ops.push(
              tx.match.update({
                where: { id: tp.id },
                data: { homeTeamId: A2, awayTeamId: B2 },
              }),
            );
          }
        }

        return Promise.all(ops);
      });

      return { created: 0, updatedCount: Array.isArray(updated) ? updated.length : 0 };
    }

    const slotMinutes = (t.matchDurationMinutes ?? 50) + (t.matchBreakMinutes ?? 10);
    const base = t.matches.length ? new Date(t.matches[t.matches.length - 1].startTime) : new Date();
    const start1 = new Date(base.getTime() + slotMinutes * 60 * 1000);
    const start2 = new Date(start1.getTime() + slotMinutes * 60 * 1000);
    const start3 = new Date(start2.getTime() + slotMinutes * 60 * 1000);
    const start4 = new Date(start3.getTime() + slotMinutes * 60 * 1000);

    // Semifinals: 1A vs 2B, 1B vs 2A
    const created = await this.prisma.match.createMany({
      data: [
        {
          tenantId: t.tenantId,
          tournamentId: t.id,
          homeTeamId: A1,
          awayTeamId: B2,
          stage: MatchStage.PLAYOFF,
          roundNumber: 1,
          playoffRound: PlayoffRound.SEMIFINAL,
          startTime: start1,
        },
        {
          tenantId: t.tenantId,
          tournamentId: t.id,
          homeTeamId: B1,
          awayTeamId: A2,
          stage: MatchStage.PLAYOFF,
          roundNumber: 1,
          playoffRound: PlayoffRound.SEMIFINAL,
          startTime: start2,
        },
        // Final and third place are placeholders for now: we will fill teams after semifinals.
        // For MVP we create them with same pairs as a placeholder and user can edit later.
        {
          tenantId: t.tenantId,
          tournamentId: t.id,
          homeTeamId: A1,
          awayTeamId: B1,
          stage: MatchStage.PLAYOFF,
          roundNumber: 2,
          playoffRound: PlayoffRound.FINAL,
          startTime: start3,
        },
        {
          tenantId: t.tenantId,
          tournamentId: t.id,
          homeTeamId: A2,
          awayTeamId: B2,
          stage: MatchStage.PLAYOFF,
          roundNumber: 2,
          playoffRound: PlayoffRound.THIRD_PLACE,
          startTime: start4,
        },
      ],
    });

    return { created: created.count };
    */
  }

  async reorderRound(
    tournamentId: string,
    roundDate: string,
    dto: ReorderRoundDto,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(roundDate)) {
      throw new BadRequestException('roundDate must be in YYYY-MM-DD format');
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        tenantId: true,
        format: true,
        matchDurationMinutes: true,
        matchBreakMinutes: true,
        simultaneousMatches: true,
        dayStartTimeDefault: true,
        dayStartTimeOverrides: true,
      },
    });
    if (!tournament) throw new BadRequestException('Tournament not found');
    if (
      tournament.format !== TournamentFormat.SINGLE_GROUP &&
      tournament.format !== TournamentFormat.MANUAL
    ) {
      throw new BadRequestException(
        `Format ${tournament.format} is not supported yet for round reorder`,
      );
    }

    const matchIds = dto.matchIds ?? [];
    if (!matchIds.length) throw new BadRequestException('matchIds is required');
    const uniq = new Set(matchIds);
    if (uniq.size !== matchIds.length)
      throw new BadRequestException('matchIds must be unique');

    // We use UTC day boundaries because frontend groups rounds by `toISOString().slice(0, 10)`.
    const dayStartUtc = new Date(`${roundDate}T00:00:00.000Z`);
    if (Number.isNaN(dayStartUtc.getTime())) {
      throw new BadRequestException('Invalid roundDate');
    }
    const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);

    const matches = await this.prisma.match.findMany({
      where: {
        tournamentId,
        startTime: { gte: dayStartUtc, lt: dayEndUtc },
      },
      select: { id: true },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    });

    const existingIds = matches.map((m) => m.id);
    if (existingIds.length !== matchIds.length) {
      throw new BadRequestException(
        'matchIds length must match number of matches in round',
      );
    }
    const existingSet = new Set(existingIds);
    const missing = matchIds.filter((id) => !existingSet.has(id));
    if (missing.length) {
      throw new BadRequestException(
        `matchIds must belong to this round. Missing: ${missing.join(', ')}`,
      );
    }

    const duration = tournament.matchDurationMinutes ?? 50;
    const brk = tournament.matchBreakMinutes ?? 10;
    const simultaneous = tournament.simultaneousMatches ?? 1;
    if (!Number.isInteger(duration) || duration < 1) {
      throw new BadRequestException('matchDurationMinutes must be >= 1');
    }
    if (!Number.isInteger(brk) || brk < 0) {
      throw new BadRequestException('matchBreakMinutes must be >= 0');
    }
    if (!Number.isInteger(simultaneous) || simultaneous < 1) {
      throw new BadRequestException('simultaneousMatches must be >= 1');
    }

    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    const dayStartTimeDefault = tournament.dayStartTimeDefault ?? '12:00';
    if (!timeRe.test(dayStartTimeDefault)) {
      throw new BadRequestException(
        'dayStartTimeDefault must be in HH:mm format',
      );
    }

    const overridesRaw = (tournament.dayStartTimeOverrides as any) ?? {};
    const overrides: Record<number, string> = {};
    for (const [k, v] of Object.entries(overridesRaw)) {
      const day = Number(k);
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      if (typeof v !== 'string' || !timeRe.test(v)) continue;
      overrides[day] = v;
    }

    // Use same "local date-only" strategy as calendar generation.
    const base = new Date(`${roundDate}T12:00:00`);
    const day = base.getDay();
    const startTimeStr = overrides[day] ?? dayStartTimeDefault;
    const [hh, mm] = startTimeStr.split(':').map((x) => Number(x));
    const roundStart = new Date(base);
    roundStart.setHours(hh, mm, 0, 0);

    const slotMinutes = duration + brk;
    if (slotMinutes < 1) {
      throw new BadRequestException('Invalid slot size');
    }

    const updates: Prisma.PrismaPromise<any>[] = [];
    for (let idx = 0; idx < matchIds.length; idx++) {
      const matchId = matchIds[idx];
      const wave = Math.floor(idx / simultaneous);
      const offsetMinutes = wave * slotMinutes;
      const startTime = new Date(
        roundStart.getTime() + offsetMinutes * 60 * 1000,
      );
      updates.push(
        this.prisma.match.update({
          where: { id: matchId },
          data: { startTime },
        }),
      );
    }

    // Extra safety: with simultaneousMatches=1 all times must be unique.
    if (simultaneous === 1) {
      const times = updates.map((_, i) => {
        const wave = Math.floor(i / simultaneous);
        return roundStart.getTime() + wave * slotMinutes * 60 * 1000;
      });
      const uniqTimes = new Set(times);
      if (uniqTimes.size !== times.length) {
        throw new BadRequestException(
          'Reorder would create overlapping matches',
        );
      }
    }

    await this.prisma.$transaction(updates);
    return { success: true };
  }

  async generateCalendar(tournamentId: string, dto: GenerateCalendarDto) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { tournamentTeams: { select: { teamId: true, rating: true } } },
    });
    if (!tournament) throw new BadRequestException('Tournament not found');
    this.assertNotManualCalendarFormat(tournament.format);

    const teamRatingsById: Record<string, number> = {};
    for (const tt of tournament.tournamentTeams) {
      teamRatingsById[tt.teamId] = tt.rating ?? 3;
    }

    const teams = tournament.tournamentTeams.map((t) => t.teamId);
    if (teams.length < (tournament.minTeams ?? 2)) {
      throw new BadRequestException('Not enough teams to generate calendar');
    }

    const uniq = new Set(teams);
    if (uniq.size !== teams.length) {
      throw new BadRequestException('Duplicate teamIds in tournamentTeams');
    }

    const groupCount = (tournament as any).groupCount ?? 1;
    if (!Number.isInteger(groupCount) || groupCount < 0 || groupCount > 8) {
      throw new BadRequestException('groupCount must be 0..8');
    }

    const startSource =
      dto.startDate ??
      (tournament.startsAt
        ? tournament.startsAt.toISOString().slice(0, 10)
        : null);
    if (!startSource) {
      throw new BadRequestException(
        'startDate is required (or set tournament.startsAt)',
      );
    }

    const parseDateOnlyLocal = (s: string) => new Date(`${s}T12:00:00`);
    const start = parseDateOnlyLocal(startSource);
    if (Number.isNaN(start.getTime()))
      throw new BadRequestException('Invalid startDate');

    if (tournament.startsAt) {
      const minStart = parseDateOnlyLocal(
        tournament.startsAt.toISOString().slice(0, 10),
      );
      const dayStart = parseDateOnlyLocal(startSource);
      if (dayStart < minStart) {
        throw new BadRequestException(
          'startDate must be on or after tournament.startsAt',
        );
      }
    }
    if (tournament.endsAt) {
      const maxEnd = parseDateOnlyLocal(
        tournament.endsAt.toISOString().slice(0, 10),
      );
      if (parseDateOnlyLocal(startSource) > maxEnd) {
        throw new BadRequestException(
          'startDate must be on or before tournament.endsAt',
        );
      }
    }

    const intervalDays = dto.intervalDays ?? tournament.intervalDays ?? 7;
    const allowedDays = dto.allowedDays ?? tournament.allowedDays ?? [];
    const allowed = allowedDays.length ? new Set(allowedDays) : null;
    if (allowedDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw new BadRequestException(
        'allowedDays must be integers in range 0..6',
      );
    }

    const matchDurationMinutes =
      dto.matchDurationMinutes ?? tournament.matchDurationMinutes ?? 50;
    const matchBreakMinutes =
      dto.matchBreakMinutes ?? tournament.matchBreakMinutes ?? 10;
    const simultaneousMatches =
      dto.simultaneousMatches ?? tournament.simultaneousMatches ?? 1;
    if (!Number.isInteger(matchDurationMinutes) || matchDurationMinutes < 1) {
      throw new BadRequestException('matchDurationMinutes must be >= 1');
    }
    if (!Number.isInteger(matchBreakMinutes) || matchBreakMinutes < 0) {
      throw new BadRequestException('matchBreakMinutes must be >= 0');
    }
    if (!Number.isInteger(simultaneousMatches) || simultaneousMatches < 1) {
      throw new BadRequestException('simultaneousMatches must be >= 1');
    }

    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    const dayStartTimeDefault =
      dto.dayStartTimeDefault ?? tournament.dayStartTimeDefault ?? '12:00';
    if (!timeRe.test(dayStartTimeDefault)) {
      throw new BadRequestException(
        'dayStartTimeDefault must be in HH:mm format',
      );
    }

    const overridesSource = (dto.dayStartTimeOverrides ??
      (tournament.dayStartTimeOverrides as any) ??
      {}) as Record<string, string>;
    const dayStartTimeOverrides: Record<number, string> = {};
    for (const [k, v] of Object.entries(overridesSource ?? {})) {
      const day = Number(k);
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        throw new BadRequestException(
          'dayStartTimeOverrides keys must be 0..6',
        );
      }
      if (typeof v !== 'string' || !timeRe.test(v)) {
        throw new BadRequestException(
          'dayStartTimeOverrides values must be HH:mm',
        );
      }
      dayStartTimeOverrides[day] = v;
    }

    const matchesToCreate: {
      tenantId: string;
      tournamentId: string;
      homeTeamId: string;
      awayTeamId: string;
      stage: MatchStage;
      roundNumber: number;
      groupId?: string | null;
      playoffRound?: PlayoffRound | null;
      startTime: Date;
    }[] = [];

    const roundsPerDay = dto.roundsPerDay ?? 1;
    if (!Number.isInteger(roundsPerDay) || roundsPerDay < 1) {
      throw new BadRequestException('roundsPerDay must be >= 1');
    }

    const roundRobinCycles = dto.roundRobinCycles ?? tournament.roundRobinCycles ?? 1;
    if (
      !Number.isInteger(roundRobinCycles) ||
      roundRobinCycles < 1 ||
      roundRobinCycles > 4
    ) {
      throw new BadRequestException(
        'roundRobinCycles must be an integer in range 1..4',
      );
    }
    const schedulingMode = dto.schedulingMode ?? 'FLOW';

    const buildRoundRobinRounds = (teamIds: string[]) => {
      const list: (string | null)[] = [...teamIds];
      if (list.length % 2 === 1) list.push(null);

      const n = list.length;
      const rounds = n - 1;
      const half = n / 2;

      const rotate = (arr: (string | null)[]) => {
        const fixed = arr[0];
        const rest = arr.slice(1);
        rest.unshift(rest.pop()!);
        return [fixed, ...rest];
      };

      const res: Array<Array<[string, string]>> = [];
      let arr = list;
      for (let r = 0; r < rounds; r++) {
        const pairings: Array<[string, string]> = [];
        for (let i = 0; i < half; i++) {
          const a = arr[i];
          const b = arr[n - 1 - i];
          if (!a || !b) continue;
          const home = r % 2 === 0 ? a : b;
          const away = r % 2 === 0 ? b : a;
          pairings.push([home, away]);
        }
        res.push(pairings);
        arr = rotate(arr);
      }
      return res;
    };

    const expandRoundRobinCycles = (
      rounds: Array<Array<[string, string]>>,
      cycles: number,
    ) => {
      const expanded: Array<Array<[string, string]>> = [];
      for (let cycleIdx = 0; cycleIdx < cycles; cycleIdx++) {
        const swapHomeAway = cycleIdx % 2 === 1;
        for (const round of rounds) {
          expanded.push(
            round.map(([home, away]) =>
              swapHomeAway ? ([away, home] as [string, string]) : [home, away],
            ),
          );
        }
      }
      return expanded;
    };

    type PlannedMatch = {
      homeTeamId: string;
      awayTeamId: string;
      stage: MatchStage;
      roundNumber: number;
      groupId?: string | null;
      playoffRound?: PlayoffRound | null;
    };
    type PlannedRound = {
      roundNumber: number;
      matches: PlannedMatch[];
    };

    const roundsToSchedule: PlannedRound[] = [];

    if (tournament.format === TournamentFormat.SINGLE_GROUP) {
      if (groupCount !== 1) {
        throw new BadRequestException(
          'For SINGLE_GROUP format groupCount must be 1',
        );
      }
      const orderedTeams = teams
        .slice()
        .sort((a, b) => (teamRatingsById[b] ?? 3) - (teamRatingsById[a] ?? 3));
      const rr = expandRoundRobinCycles(
        buildRoundRobinRounds(orderedTeams),
        roundRobinCycles,
      );
      for (let i = 0; i < rr.length; i++) {
        roundsToSchedule.push({
          roundNumber: i + 1,
          matches: rr[i].map(([homeTeamId, awayTeamId]) => ({
            homeTeamId,
            awayTeamId,
            stage: MatchStage.GROUP,
            roundNumber: i + 1,
            groupId: null,
            playoffRound: null,
          })),
        });
      }

      // Rating-aware order of group rounds:
      // weaker matchups earlier, stronger matchups later.
      roundsToSchedule.sort((a, b) => {
        const score = (pr: PlannedRound) =>
          pr.matches.reduce(
            (acc, m) =>
              acc +
              (teamRatingsById[m.homeTeamId] ?? 3) +
              (teamRatingsById[m.awayTeamId] ?? 3),
            0,
          );
        return score(a) - score(b);
      });

      for (let i = 0; i < roundsToSchedule.length; i++) {
        const rn = i + 1;
        roundsToSchedule[i].roundNumber = rn;
        for (const m of roundsToSchedule[i].matches) m.roundNumber = rn;
      }
    } else if (tournament.format === TournamentFormat.PLAYOFF) {
      if (groupCount !== 0) {
        throw new BadRequestException(
          'For PLAYOFF format groupCount must be 0',
        );
      }

      const participants = teams
        .slice()
        .sort((a, b) => (teamRatingsById[b] ?? 3) - (teamRatingsById[a] ?? 3));
      const participantsCount = participants.length;
      const isPowerOfTwo = (n: number) => n > 0 && (n & (n - 1)) === 0;

      if (participantsCount < 4 || !isPowerOfTwo(participantsCount)) {
        throw new BadRequestException(
          `For PLAYOFF format teams count must be 4, 8, 16, 32, 64... Got ${participantsCount}.`,
        );
      }

      const rounds = Math.round(Math.log2(participantsCount));
      const firstRoundNumber = 1;

      const roundLabelForMatches = (
        matchesInRound: number,
      ): PlayoffRound | null => {
        if (matchesInRound === 1) return PlayoffRound.FINAL;
        if (matchesInRound === 2) return PlayoffRound.SEMIFINAL;
        if (matchesInRound === 4) return PlayoffRound.QUARTERFINAL;
        if (matchesInRound === 8) return PlayoffRound.ROUND_OF_16;
        return null;
      };

      const pickPlaceholderPair = () => ({
        homeTeamId: participants[0],
        awayTeamId: participants[1] ?? participants[0],
      });

      for (let knockoutIndex = 1; knockoutIndex <= rounds; knockoutIndex++) {
        const roundNumber = firstRoundNumber + (knockoutIndex - 1);
        const matchesInRound = participantsCount / 2 ** knockoutIndex;
        const matches: PlannedMatch[] = [];

        if (knockoutIndex === 1) {
          // First round: real seeded pairings (1 vs N, 2 vs N-1, ...).
          for (let mi = 0; mi < matchesInRound; mi++) {
            const homeTeamId = participants[mi];
            const awayTeamId = participants[participantsCount - 1 - mi];
            matches.push({
              homeTeamId,
              awayTeamId,
              stage: MatchStage.PLAYOFF,
              roundNumber,
              groupId: null,
              playoffRound: roundLabelForMatches(matchesInRound),
            });
          }
        } else if (knockoutIndex === rounds) {
          // Final round with optional third-place match.
          const pair = pickPlaceholderPair();
          matches.push({
            homeTeamId: pair.homeTeamId,
            awayTeamId: pair.awayTeamId,
            stage: MatchStage.PLAYOFF,
            roundNumber,
            groupId: null,
            playoffRound: PlayoffRound.FINAL,
          });
          if (participantsCount >= 4) {
            matches.push({
              homeTeamId: pair.awayTeamId,
              awayTeamId: pair.homeTeamId,
              stage: MatchStage.PLAYOFF,
              roundNumber,
              groupId: null,
              playoffRound: PlayoffRound.THIRD_PLACE,
            });
          }
        } else {
          // Intermediate rounds: placeholder participants get propagated by played results.
          const pair = pickPlaceholderPair();
          for (let mi = 0; mi < matchesInRound; mi++) {
            matches.push({
              homeTeamId: pair.homeTeamId,
              awayTeamId: pair.awayTeamId,
              stage: MatchStage.PLAYOFF,
              roundNumber,
              groupId: null,
              playoffRound: roundLabelForMatches(matchesInRound),
            });
          }
        }

        roundsToSchedule.push({ roundNumber, matches });
      }
    } else if (
      tournament.format === TournamentFormat.GROUPS_PLUS_PLAYOFF ||
      tournament.format === TournamentFormat.GROUPS_2 ||
      tournament.format === TournamentFormat.GROUPS_3 ||
      tournament.format === TournamentFormat.GROUPS_4
    ) {
      const expected =
        tournament.format === TournamentFormat.GROUPS_PLUS_PLAYOFF
          ? groupCount
          : tournament.format === TournamentFormat.GROUPS_2
            ? 2
            : tournament.format === TournamentFormat.GROUPS_3
              ? 3
              : tournament.format === TournamentFormat.GROUPS_4
                ? 4
                : groupCount;

      if (tournament.format === TournamentFormat.GROUPS_PLUS_PLAYOFF) {
        if (groupCount < 1) {
          throw new BadRequestException(
            'For GROUPS_PLUS_PLAYOFF format groupCount must be >= 1',
          );
        }
      } else if (groupCount !== expected) {
        throw new BadRequestException(
          `For ${tournament.format} format groupCount must be ${expected}`,
        );
      }

      if (teams.length < expected * 2) {
        throw new BadRequestException('Not enough teams to split into groups');
      }

      // We prefer equal group sizes. For MVP require divisibility.
      if (teams.length % expected !== 0) {
        throw new BadRequestException(
          'Teams count must be divisible by groupCount',
        );
      }

      const groupStage = await this.prisma.$transaction(async (tx) => {
        const existingGroups = await tx.tournamentGroup.findMany({
          where: { tournamentId },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true },
        });

        const groupNames = Array.from(
          { length: expected },
          (_, i) => `Группа ${String.fromCharCode(65 + i)}`,
        );
        const groups: Array<{ id: string; name: string }> = [];
        for (let i = 0; i < groupNames.length; i++) {
          const name = groupNames[i];
          const g =
            existingGroups.find((x) => x.name === name) ??
            (await tx.tournamentGroup.create({
              data: {
                tenantId: tournament.tenantId,
                tournamentId,
                name,
                sortOrder: i + 1,
              },
              select: { id: true, name: true },
            }));
          groups.push(g);
        }

        const tts = await tx.tournamentTeam.findMany({
          where: { tournamentId },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            teamId: true,
            groupId: true,
            rating: true,
            createdAt: true,
          },
        });

        const size = tts.length / expected;

        const ratingByTeamId: Record<string, number> = Object.fromEntries(
          tts.map((tt) => [tt.teamId, tt.rating ?? 3]),
        );

        // Prefer existing group assignments set by admin (draggable UI).
        // We'll only overwrite groupId if assignments are missing/incomplete.
        const bucketsFromExisting: string[][] = groups.map((g) =>
          tts
            .filter((tt) => tt.groupId === g.id)
            .slice()
            .sort(
              (a, b) =>
                (ratingByTeamId[b.teamId] ?? 3) -
                  (ratingByTeamId[a.teamId] ?? 3) ||
                a.createdAt.getTime() - b.createdAt.getTime(),
            )
            .map((tt) => tt.teamId),
        );

        const assignedCount = bucketsFromExisting.reduce(
          (acc, b) => acc + b.length,
          0,
        );
        const canUseExistingAssignments =
          assignedCount === tts.length &&
          bucketsFromExisting.every((b) => b.length === size);

        if (canUseExistingAssignments) {
          return {
            buckets: bucketsFromExisting,
            groupIds: groups.map((g) => g.id),
          };
        }

        // Fallback: Rating-aware distribution:
        // 1) sort by rating desc (strongest first), tie-break by createdAt asc
        // 2) distribute using i % expected to spread strong teams across groups
        const sortedTts = tts
          .slice()
          .sort(
            (a, b) =>
              (ratingByTeamId[b.teamId] ?? 3) -
                (ratingByTeamId[a.teamId] ?? 3) ||
              a.createdAt.getTime() - b.createdAt.getTime(),
          );

        const buckets: string[][] = Array.from({ length: expected }).map(
          () => [],
        );
        for (let i = 0; i < sortedTts.length; i++) {
          buckets[i % expected].push(sortedTts[i].teamId);
        }

        if (buckets.some((x) => x.length !== size)) {
          throw new BadRequestException(
            'Unable to split teams into equal groups',
          );
        }

        const teamIdToGroupIndex = new Map<string, number>();
        for (let gi = 0; gi < buckets.length; gi++) {
          for (const teamId of buckets[gi]) {
            teamIdToGroupIndex.set(teamId, gi);
          }
        }

        const updates: Prisma.PrismaPromise<any>[] = [];
        for (const tt of tts) {
          const idx = teamIdToGroupIndex.get(tt.teamId);
          const groupId = typeof idx === 'number' ? groups[idx].id : null;
          if (!groupId) continue;
          updates.push(
            tx.tournamentTeam.update({
              where: { id: tt.id },
              data: { groupId },
            }),
          );
        }
        await Promise.all(updates);

        return { buckets, groupIds: groups.map((g) => g.id) };
      });

      const perGroupRounds = groupStage.buckets.map((teamIds) =>
        expandRoundRobinCycles(
          buildRoundRobinRounds(teamIds),
          roundRobinCycles,
        ),
      );
      const maxRounds = Math.max(...perGroupRounds.map((x) => x.length));
      for (let i = 0; i < maxRounds; i++) {
        const rNo = i + 1;
        const matches: PlannedMatch[] = [];
        for (let gi = 0; gi < perGroupRounds.length; gi++) {
          const gId = groupStage.groupIds[gi];
          const rr = perGroupRounds[gi][i] ?? [];
          for (const [homeTeamId, awayTeamId] of rr) {
            matches.push({
              homeTeamId,
              awayTeamId,
              stage: MatchStage.GROUP,
              roundNumber: rNo,
              groupId: gId,
              playoffRound: null,
            });
          }
        }
        roundsToSchedule.push({ roundNumber: rNo, matches });
      }

      // Rating-aware order of group rounds:
      // weaker matchups earlier, stronger later.
      const roundStrength = (pr: PlannedRound) =>
        pr.matches.reduce(
          (acc, m) =>
            acc +
            (teamRatingsById[m.homeTeamId] ?? 3) +
            (teamRatingsById[m.awayTeamId] ?? 3),
          0,
        );
      const groupRounds = roundsToSchedule
        .slice(0, maxRounds)
        .sort((a, b) => roundStrength(a) - roundStrength(b));
      for (let i = 0; i < groupRounds.length; i++) {
        const rn = i + 1;
        groupRounds[i].roundNumber = rn;
        for (const m of groupRounds[i].matches) m.roundNumber = rn;
      }
      roundsToSchedule.splice(0, maxRounds, ...groupRounds);

      // Create playoff placeholders immediately (before group results),
      // so the UI can show "победитель матча N" chains and seed labels.
      if (
        tournament.format === TournamentFormat.GROUPS_PLUS_PLAYOFF ||
        tournament.format === TournamentFormat.GROUPS_2 ||
        tournament.format === TournamentFormat.GROUPS_3 ||
        tournament.format === TournamentFormat.GROUPS_4
      ) {
        const k = tournament.playoffQualifiersPerGroup ?? 2;
        if (!Number.isInteger(k) || k < 1 || k > 8) {
          throw new BadRequestException(
            'playoffQualifiersPerGroup must be an integer 1..8',
          );
        }

        const qualifiersCount = expected * k;
        const isPowerOfTwo = (n: number) => n > 0 && (n & (n - 1)) === 0;
        if (!isPowerOfTwo(qualifiersCount)) {
          throw new BadRequestException(
            `Invalid playoff bracket: groups(${expected}) * qualifiersPerGroup(${k}) must be a power of two. Got ${qualifiersCount}.`,
          );
        }

        const rounds = Math.round(Math.log2(qualifiersCount));
        if (rounds < 1)
          throw new BadRequestException('Invalid playoff bracket size');

        // Seed placeholders: pick teams in current group order (tournamentTeams.createdAt asc),
        // and build a rank-major seeds array: rank1 of all groups, then rank2, etc.
        const seeds: string[] = [];
        for (let rank = 1; rank <= k; rank++) {
          for (let gi = 0; gi < expected; gi++) {
            const teamId = groupStage.buckets[gi]?.[rank - 1];
            if (!teamId)
              throw new BadRequestException(
                'Not enough teams in one of the groups for playoff placeholders',
              );
            seeds.push(teamId);
          }
        }
        if (seeds.length !== qualifiersCount)
          throw new BadRequestException('Unable to build playoff seeds');

        const firstPlayoffRoundNumber = maxRounds + 1;

        const pickPlaceholderPair = () => ({
          homeTeamId: seeds[0],
          awayTeamId: seeds[1] ?? seeds[0],
        });

        for (let knockoutIndex = 1; knockoutIndex <= rounds; knockoutIndex++) {
          const roundNumber = firstPlayoffRoundNumber + (knockoutIndex - 1);
          const matchesInRound = qualifiersCount / 2 ** knockoutIndex;

          const matches: PlannedMatch[] = [];

          if (knockoutIndex === 1) {
            // First knockout round uses real seeds pairing.
            for (let mi = 0; mi < matchesInRound; mi++) {
              const homeTeamId = seeds[mi];
              const awayTeamId = seeds[qualifiersCount - 1 - mi];
              matches.push({
                homeTeamId,
                awayTeamId,
                stage: MatchStage.PLAYOFF,
                roundNumber,
                groupId: null,
                playoffRound: PlayoffRound.SEMIFINAL,
              });
            }
          } else if (knockoutIndex === rounds) {
            // Final round: create FINAL (+ optional THIRD_PLACE).
            const pair = pickPlaceholderPair();
            matches.push({
              homeTeamId: pair.homeTeamId,
              awayTeamId: pair.awayTeamId,
              stage: MatchStage.PLAYOFF,
              roundNumber,
              groupId: null,
              playoffRound: PlayoffRound.FINAL,
            });
            if (qualifiersCount >= 4) {
              matches.push({
                homeTeamId: pair.awayTeamId,
                awayTeamId: pair.homeTeamId,
                stage: MatchStage.PLAYOFF,
                roundNumber,
                groupId: null,
                playoffRound: PlayoffRound.THIRD_PLACE,
              });
            }
          } else {
            // Intermediate rounds: placeholders, participants will be propagated after scores.
            const pair = pickPlaceholderPair();
            for (let mi = 0; mi < matchesInRound; mi++) {
              matches.push({
                homeTeamId: pair.homeTeamId,
                awayTeamId: pair.awayTeamId,
                stage: MatchStage.PLAYOFF,
                roundNumber,
                groupId: null,
                playoffRound: PlayoffRound.SEMIFINAL,
              });
            }
          }

          roundsToSchedule.push({ roundNumber, matches });
        }
      }
    } else {
      throw new BadRequestException(
        `Format ${tournament.format} is not supported yet for calendar generation`,
      );
    }

    // In any playoff round where both matches exist, keep "3rd place" before "final",
    // so the final is always the very last match in schedule and numbering.
    for (const round of roundsToSchedule) {
      if (!round.matches?.length) continue;
      const hasFinal = round.matches.some(
        (m) =>
          m.stage === MatchStage.PLAYOFF &&
          m.playoffRound === PlayoffRound.FINAL,
      );
      const hasThird = round.matches.some(
        (m) =>
          m.stage === MatchStage.PLAYOFF &&
          m.playoffRound === PlayoffRound.THIRD_PLACE,
      );
      if (!hasFinal || !hasThird) continue;
      round.matches.sort((a, b) => {
        const w = (m: PlannedMatch) => {
          if (m.stage !== MatchStage.PLAYOFF) return 0;
          if (m.playoffRound === PlayoffRound.FINAL) return 2;
          if (m.playoffRound === PlayoffRound.THIRD_PLACE) return 1;
          return 0;
        };
        return w(a) - w(b);
      });
    }

    const slotMinutes = matchDurationMinutes + matchBreakMinutes;
    const minutesFromMidnight = (hhmm: string) => {
      const [hh, mm] = hhmm.split(':').map((x) => Number(x));
      return hh * 60 + mm;
    };
    const minutesUntilMidnightFromStart = (hhmm: string) =>
      24 * 60 - minutesFromMidnight(hhmm);

    const getDayStartMeta = (roundDateBase: Date) => {
      const day = roundDateBase.getDay();
      const startTimeStr = dayStartTimeOverrides[day] ?? dayStartTimeDefault;
      const [hh, mm] = startTimeStr.split(':').map((x) => Number(x));
      const roundStart = new Date(roundDateBase);
      roundStart.setHours(hh, mm, 0, 0);
      return {
        roundStart,
        roundStartMs: roundStart.getTime(),
        availableMinutes: minutesUntilMidnightFromStart(startTimeStr),
      };
    };

    let roundDate = new Date(start);
    let lastRoundDate: Date | null = null;
    let lastMatchStart: Date | null = null;

    for (let batchStart = 0; batchStart < roundsToSchedule.length; ) {
      if (batchStart > 0) {
        roundDate = new Date(
          roundDate.getTime() + intervalDays * 24 * 60 * 60 * 1000,
        );
      }
      if (allowed) {
        while (!allowed.has(roundDate.getDay())) {
          roundDate = new Date(roundDate.getTime() + 24 * 60 * 60 * 1000);
        }
      }
      lastRoundDate = new Date(roundDate);

      const { roundStartMs, availableMinutes } = getDayStartMeta(roundDate);
      const dayRounds = roundsToSchedule.slice(
        batchStart,
        Math.min(batchStart + roundsPerDay, roundsToSchedule.length),
      );

      let usedMinutes = 0;
      if (schedulingMode === 'STRICT_ROUNDS') {
        let cursorMs = roundStartMs;
        for (const round of dayRounds) {
          let matchIndex = 0;
          for (const m of round.matches) {
            const wave = Math.floor(matchIndex / simultaneousMatches);
            const startTime = new Date(cursorMs + wave * slotMinutes * 60 * 1000);
            matchesToCreate.push({
              tenantId: tournament.tenantId,
              tournamentId: tournament.id,
              homeTeamId: m.homeTeamId,
              awayTeamId: m.awayTeamId,
              stage: m.stage,
              roundNumber: m.roundNumber,
              groupId: m.groupId ?? null,
              playoffRound: m.playoffRound ?? null,
              startTime,
            });
            lastMatchStart = startTime;
            matchIndex += 1;
          }
          const waves = Math.ceil((round.matches?.length ?? 0) / simultaneousMatches);
          cursorMs += waves * slotMinutes * 60 * 1000;
        }
        usedMinutes = Math.ceil((cursorMs - roundStartMs) / (60 * 1000));
      } else {
        const pending = dayRounds.flatMap((round, roundOffset) =>
          round.matches.map((m, matchOrder) => ({
            ...m,
            order: roundOffset * 1000 + matchOrder,
          })),
        );
        pending.sort(
          (a, b) => a.roundNumber - b.roundNumber || a.order - b.order,
        );

        const teamBusyUntil = new Map<string, number>();
        let cursorMs = roundStartMs;

        const pickBestSlotSet = (
          candidates: typeof pending,
          limit: number,
        ) => {
          let best: typeof candidates = [];
          const used = new Set<string>();
          const chosen: typeof candidates = [];

          const dfs = (idx: number) => {
            if (chosen.length > best.length) {
              best = [...chosen];
              if (best.length >= limit) return;
            }
            if (idx >= candidates.length) return;
            const remaining = candidates.length - idx;
            if (chosen.length + remaining <= best.length) return;

            for (let i = idx; i < candidates.length; i++) {
              const c = candidates[i];
              if (used.has(c.homeTeamId) || used.has(c.awayTeamId)) continue;
              chosen.push(c);
              used.add(c.homeTeamId);
              used.add(c.awayTeamId);
              dfs(i + 1);
              chosen.pop();
              used.delete(c.homeTeamId);
              used.delete(c.awayTeamId);
              if (best.length >= limit) return;
            }
          };

          dfs(0);
          return best.slice(0, limit);
        };

        while (pending.length) {
          const candidates = pending.filter((m) => {
            const homeBusy = teamBusyUntil.get(m.homeTeamId) ?? roundStartMs;
            const awayBusy = teamBusyUntil.get(m.awayTeamId) ?? roundStartMs;
            return homeBusy <= cursorMs && awayBusy <= cursorMs;
          });

          const slotSet = pickBestSlotSet(candidates, simultaneousMatches);

          for (const m of slotSet) {
            const startTime = new Date(cursorMs);
            matchesToCreate.push({
              tenantId: tournament.tenantId,
              tournamentId: tournament.id,
              homeTeamId: m.homeTeamId,
              awayTeamId: m.awayTeamId,
              stage: m.stage,
              roundNumber: m.roundNumber,
              groupId: m.groupId ?? null,
              playoffRound: m.playoffRound ?? null,
              startTime,
            });
            lastMatchStart = startTime;

            const busyUntil = cursorMs + slotMinutes * 60 * 1000;
            teamBusyUntil.set(m.homeTeamId, busyUntil);
            teamBusyUntil.set(m.awayTeamId, busyUntil);
          }
          if (slotSet.length) {
            const selectedIds = new Set(slotSet.map((m) => `${m.roundNumber}:${m.homeTeamId}:${m.awayTeamId}:${m.order}`));
            for (let i = pending.length - 1; i >= 0; i--) {
              const key = `${pending[i].roundNumber}:${pending[i].homeTeamId}:${pending[i].awayTeamId}:${pending[i].order}`;
              if (selectedIds.has(key)) pending.splice(i, 1);
            }
          }

          cursorMs += slotMinutes * 60 * 1000;
        }
        usedMinutes = Math.ceil((cursorMs - roundStartMs) / (60 * 1000));
      }
      if (usedMinutes > availableMinutes) {
        throw new BadRequestException(
          `В один календарный день не помещается столько туров: нужно ${usedMinutes} мин. слотов, а до полуночи от времени начала дня остаётся ${availableMinutes} мин. Уменьши «туров в день», увеличь «параллельно», сократи длительность/перерыв или разнеси туры по дням.`,
        );
      }

      batchStart += dayRounds.length;
    }

    if (tournament.endsAt && (lastMatchStart || lastRoundDate)) {
      const maxEnd = parseDateOnlyLocal(
        tournament.endsAt.toISOString().slice(0, 10),
      );
      const lastDay = parseDateOnlyLocal(
        (lastMatchStart ?? lastRoundDate!).toISOString().slice(0, 10),
      );
      if (lastDay > maxEnd) {
        throw new BadRequestException(
          'Calendar exceeds tournament.endsAt. Reduce intervalDays / adjust allowedDays / expand date range',
        );
      }
    }

    const replaceExisting = dto.replaceExisting !== false;

    const result = await this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.match.count({ where: { tournamentId } });
      if (existingCount > 0 && !replaceExisting) {
        throw new BadRequestException(
          'Calendar already exists. Delete it first or set replaceExisting=true',
        );
      }

      let deletedMatches = 0;
      if (existingCount > 0 && replaceExisting) {
        const ids = await tx.match.findMany({
          where: { tournamentId },
          select: { id: true },
        });
        const matchIds = ids.map((m) => m.id);
        if (matchIds.length) {
          await tx.matchEvent.deleteMany({
            where: { matchId: { in: matchIds } },
          });
        }
        const del = await tx.match.deleteMany({ where: { tournamentId } });
        deletedMatches = del.count;
        await tx.tournamentTableRow.deleteMany({ where: { tournamentId } });
      }

      const created = await tx.match.createMany({ data: matchesToCreate });
      return { created: created.count, deleted: deletedMatches };
    });

    return result;
  }

  async recomputeTable(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        tournamentTeams: { select: { teamId: true } },
      },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const teamIds = tournament.tournamentTeams.map((t) => t.teamId);
    if (!teamIds.length) {
      await this.prisma.tournamentTableRow.deleteMany({
        where: { tournamentId },
      });
      return { success: true };
    }

    const matches = await this.prisma.match.findMany({
      where: {
        tournamentId,
        stage: MatchStage.GROUP,
        status: { in: [MatchStatus.PLAYED, MatchStatus.FINISHED] },
        homeScore: { not: null },
        awayScore: { not: null },
      },
      select: {
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
      },
    });

    type Acc = {
      played: number;
      wins: number;
      draws: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
      points: number;
    };

    const acc: Record<string, Acc> = Object.fromEntries(
      teamIds.map((id) => [
        id,
        {
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          points: 0,
        },
      ]),
    );

    for (const m of matches) {
      const hs = m.homeScore ?? 0;
      const as = m.awayScore ?? 0;

      if (acc[m.homeTeamId]) {
        acc[m.homeTeamId].played += 1;
        acc[m.homeTeamId].goalsFor += hs;
        acc[m.homeTeamId].goalsAgainst += as;
      }
      if (acc[m.awayTeamId]) {
        acc[m.awayTeamId].played += 1;
        acc[m.awayTeamId].goalsFor += as;
        acc[m.awayTeamId].goalsAgainst += hs;
      }

      if (hs > as) {
        if (acc[m.homeTeamId]) {
          acc[m.homeTeamId].wins += 1;
          acc[m.homeTeamId].points += tournament.pointsWin;
        }
        if (acc[m.awayTeamId]) {
          acc[m.awayTeamId].losses += 1;
          acc[m.awayTeamId].points += tournament.pointsLoss;
        }
      } else if (hs < as) {
        if (acc[m.awayTeamId]) {
          acc[m.awayTeamId].wins += 1;
          acc[m.awayTeamId].points += tournament.pointsWin;
        }
        if (acc[m.homeTeamId]) {
          acc[m.homeTeamId].losses += 1;
          acc[m.homeTeamId].points += tournament.pointsLoss;
        }
      } else {
        if (acc[m.homeTeamId]) {
          acc[m.homeTeamId].draws += 1;
          acc[m.homeTeamId].points += tournament.pointsDraw;
        }
        if (acc[m.awayTeamId]) {
          acc[m.awayTeamId].draws += 1;
          acc[m.awayTeamId].points += tournament.pointsDraw;
        }
      }
    }

    const computed = teamIds.map((teamId) => {
      const a = acc[teamId];
      const goalDiff = a.goalsFor - a.goalsAgainst;
      return { teamId, ...a, goalDiff };
    });

    computed.sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points;
      if (y.goalDiff !== x.goalDiff) return y.goalDiff - x.goalDiff;
      if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
      return x.teamId.localeCompare(y.teamId);
    });

    const tenantId = tournament.tenantId;

    const ops: Prisma.PrismaPromise<any>[] = [];
    for (let i = 0; i < computed.length; i++) {
      const row = computed[i];
      ops.push(
        this.prisma.tournamentTableRow.upsert({
          where: { tournamentId_teamId: { tournamentId, teamId: row.teamId } },
          create: {
            tenantId,
            tournamentId,
            teamId: row.teamId,
            position: i + 1,
            played: row.played,
            wins: row.wins,
            draws: row.draws,
            losses: row.losses,
            goalsFor: row.goalsFor,
            goalsAgainst: row.goalsAgainst,
            goalDiff: row.goalDiff,
            points: row.points,
          },
          update: {
            position: i + 1,
            played: row.played,
            wins: row.wins,
            draws: row.draws,
            losses: row.losses,
            goalsFor: row.goalsFor,
            goalsAgainst: row.goalsAgainst,
            goalDiff: row.goalDiff,
            points: row.points,
          },
        }),
      );
    }

    await this.prisma.$transaction([
      ...ops,
      this.prisma.tournamentTableRow.deleteMany({
        where: { tournamentId, teamId: { notIn: teamIds } },
      }),
    ]);

    return { success: true };
  }
}

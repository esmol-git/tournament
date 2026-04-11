import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  MatchEventType,
  MatchScheduleReasonScope,
  MatchStatus,
  MatchStage,
  PlayoffRound,
  MatchTeamSide,
  Prisma,
  TournamentFormat,
  TournamentMemberRole,
  UserRole,
} from '@prisma/client';
import { assertTournamentStaffCanManage } from '../auth/tournament-staff-access.util';
import { JwtPayload } from '../auth/jwt.strategy';
import { ApiErrorCode } from '../common/api-error-codes';
import {
  throwInsufficientRole,
  throwTournamentNotFound,
} from '../common/api-exceptions';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { ListTenantMatchesQueryDto } from './dto/list-tenant-matches-query.dto';
import { ListStandaloneMatchesQueryDto } from './dto/list-standalone-matches-query.dto';
import { ProtocolEventDto, UpdateProtocolDto } from './dto/update-protocol.dto';
import { BulkUpdateMatchesDto } from './dto/bulk-update-matches.dto';
import { ListMatchSuggestionsQueryDto } from './dto/list-match-suggestions-query.dto';
import { TournamentsService } from '../tournaments/tournaments.service';
import { collectScheduleWarningsForMatch } from './schedule-conflict.util';
import { sendTelegramTenantNotification } from '../notifications/telegram-tenant-notify';
import { sendEmailTenantNotification } from '../notifications/email-tenant-notify';

const PROTOCOL_ROLES: UserRole[] = [
  UserRole.TENANT_ADMIN,
  UserRole.TOURNAMENT_ADMIN,
  UserRole.MODERATOR,
  UserRole.REFEREE,
];

const MUTATION_LOCKED_STATUSES = new Set<MatchStatus>([
  MatchStatus.FINISHED,
  MatchStatus.PLAYED,
  MatchStatus.CANCELED,
]);

const MATCH_EVENTS_API = {
  orderBy: { createdAt: 'asc' as const },
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
} satisfies Prisma.Match$eventsArgs;

const MATCH_DETAIL_INCLUDE = {
  homeTeam: { select: { id: true, name: true } },
  awayTeam: { select: { id: true, name: true } },
  stadium: {
    select: { id: true, name: true, city: true, address: true },
  },
  scheduleChangeReason: {
    select: { id: true, name: true, code: true, scope: true },
  },
  events: MATCH_EVENTS_API,
} satisfies Prisma.MatchInclude;

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly config: ConfigService,
  ) {}

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private formatLocalDateTime(date: Date): string {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()} ${pad2(
      date.getHours(),
    )}:${pad2(date.getMinutes())}`;
  }

  private async sendTelegramIfEnabled(params: {
    tenantId: string;
    kind: 'rescheduled' | 'protocol_published';
    lines: string[];
    matchId?: string;
    tournamentId?: string | null;
  }) {
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    if (!botToken) return;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: params.tenantId },
      select: {
        telegramNotifyChatId: true,
        telegramNotifyOnMatchRescheduled: true,
        telegramNotifyOnProtocolPublished: true,
      },
    });
    if (!tenant?.telegramNotifyChatId?.trim()) return;
    if (
      (params.kind === 'rescheduled' &&
        !tenant.telegramNotifyOnMatchRescheduled) ||
      (params.kind === 'protocol_published' &&
        !tenant.telegramNotifyOnProtocolPublished)
    ) {
      return;
    }
    const payloadObj = { lines: params.lines };
    const dedupeKey = createHash('sha1')
      .update(JSON.stringify(payloadObj))
      .digest('hex');
    const dedupeSince = new Date(Date.now() - 5 * 60 * 1000);
    const duplicated = await this.prisma.telegramNotificationDelivery.findFirst(
      {
        where: {
          tenantId: params.tenantId,
          channel: 'TELEGRAM',
          kind: params.kind,
          chatId: tenant.telegramNotifyChatId.trim(),
          dedupeKey,
          createdAt: { gte: dedupeSince },
          status: { in: ['QUEUED', 'SENT'] },
        },
        select: { id: true },
      },
    );
    if (duplicated) return;

    const delivery = await this.prisma.telegramNotificationDelivery.create({
      data: {
        tenantId: params.tenantId,
        channel: 'TELEGRAM',
        kind: params.kind,
        chatId: tenant.telegramNotifyChatId.trim(),
        status: 'QUEUED',
        attempts: 0,
        payload: payloadObj,
        dedupeKey,
        matchId: params.matchId ?? null,
        tournamentId: params.tournamentId ?? null,
      },
      select: { id: true },
    });

    const maxAttempts = 3;
    let lastError = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.prisma.telegramNotificationDelivery.update({
        where: { id: delivery.id },
        data: { attempts: attempt, lastAttemptAt: new Date() },
      });
      try {
        await sendTelegramTenantNotification({
          botToken,
          chatId: tenant.telegramNotifyChatId.trim(),
          lines: params.lines,
        });
        await this.prisma.telegramNotificationDelivery.update({
          where: { id: delivery.id },
          data: { status: 'SENT', sentAt: new Date() },
        });
        return;
      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : String(e);
        if (attempt < maxAttempts) {
          await this.sleep(attempt * 1200);
        }
      }
    }

    await this.prisma.telegramNotificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'FAILED', errorMessage: lastError.slice(0, 4000) },
    });
    this.logger.warn(
      `Telegram delivery failed (tenant=${params.tenantId}, kind=${params.kind}): ${lastError}`,
    );
  }

  private parseRecipients(raw: string | null | undefined): string[] {
    return String(raw ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  }

  private async getMatchRoleBasedEmailRecipients(params: {
    tenantId: string;
    matchId: string;
    includeTeamCoachRole: boolean;
    includeTeamAdminRole: boolean;
  }): Promise<string[]> {
    if (!params.includeTeamCoachRole && !params.includeTeamAdminRole) return [];
    const match = await this.prisma.match.findUnique({
      where: { id: params.matchId },
      select: { homeTeamId: true, awayTeamId: true, tenantId: true },
    });
    if (!match || match.tenantId !== params.tenantId) return [];
    const teamIds = [match.homeTeamId, match.awayTeamId];
    const emails = new Set<string>();

    if (params.includeTeamCoachRole) {
      const teams = await this.prisma.team.findMany({
        where: { tenantId: params.tenantId, id: { in: teamIds } },
        select: { coachEmail: true },
      });
      for (const team of teams) {
        for (const email of this.parseRecipients(team.coachEmail))
          emails.add(email);
      }
    }

    if (params.includeTeamAdminRole) {
      const admins = await this.prisma.teamAdmin.findMany({
        where: { teamId: { in: teamIds } },
        select: { user: { select: { email: true } } },
      });
      for (const admin of admins) {
        for (const email of this.parseRecipients(admin.user.email))
          emails.add(email);
      }
    }

    return Array.from(emails);
  }

  private async sendEmailIfEnabled(params: {
    tenantId: string;
    kind: 'rescheduled' | 'protocol_published';
    subject: string;
    lines: string[];
    matchId?: string;
    tournamentId?: string | null;
  }) {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const secure = ['1', 'true', 'yes', 'on'].includes(
      String(this.config.get<string>('SMTP_SECURE') ?? '').toLowerCase(),
    );
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS')?.trim();
    const from =
      this.config.get<string>('SMTP_FROM')?.trim() ||
      'Tournament Platform <no-reply@localhost>';
    if (!host || !Number.isFinite(port)) return;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: params.tenantId },
      select: {
        emailNotifyEnabled: true,
        emailNotifyRecipients: true,
        emailNotifyOnMatchRescheduled: true,
        emailNotifyOnProtocolPublished: true,
        emailNotifyMatchTeamCoachRole: true,
        emailNotifyMatchTeamAdminRole: true,
      },
    });
    if (!tenant?.emailNotifyEnabled) return;
    if (
      (params.kind === 'rescheduled' &&
        !tenant.emailNotifyOnMatchRescheduled) ||
      (params.kind === 'protocol_published' &&
        !tenant.emailNotifyOnProtocolPublished)
    ) {
      return;
    }
    const recipients = new Set(
      this.parseRecipients(tenant.emailNotifyRecipients),
    );
    if (params.matchId) {
      const roleBased = await this.getMatchRoleBasedEmailRecipients({
        tenantId: params.tenantId,
        matchId: params.matchId,
        includeTeamCoachRole: tenant.emailNotifyMatchTeamCoachRole,
        includeTeamAdminRole: tenant.emailNotifyMatchTeamAdminRole,
      });
      for (const email of roleBased) recipients.add(email);
    }
    const resolvedRecipients = Array.from(recipients);
    if (!resolvedRecipients.length) return;

    const payloadObj = { subject: params.subject, lines: params.lines };
    const dedupeKey = createHash('sha1')
      .update(JSON.stringify(payloadObj))
      .digest('hex');
    const dedupeSince = new Date(Date.now() - 5 * 60 * 1000);
    const duplicated = await this.prisma.telegramNotificationDelivery.findFirst(
      {
        where: {
          tenantId: params.tenantId,
          channel: 'EMAIL',
          kind: params.kind,
          chatId: resolvedRecipients.join(','),
          dedupeKey,
          createdAt: { gte: dedupeSince },
          status: { in: ['QUEUED', 'SENT'] },
        },
        select: { id: true },
      },
    );
    if (duplicated) return;

    const delivery = await this.prisma.telegramNotificationDelivery.create({
      data: {
        tenantId: params.tenantId,
        channel: 'EMAIL',
        kind: params.kind,
        chatId: resolvedRecipients.join(','),
        status: 'QUEUED',
        attempts: 0,
        payload: payloadObj,
        dedupeKey,
        matchId: params.matchId ?? null,
        tournamentId: params.tournamentId ?? null,
      },
      select: { id: true },
    });

    const maxAttempts = 3;
    let lastError = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.prisma.telegramNotificationDelivery.update({
        where: { id: delivery.id },
        data: { attempts: attempt, lastAttemptAt: new Date() },
      });
      try {
        await sendEmailTenantNotification({
          transport: { host, port, secure, user, pass },
          from,
          to: resolvedRecipients,
          subject: params.subject,
          text: params.lines.join('\n'),
        });
        await this.prisma.telegramNotificationDelivery.update({
          where: { id: delivery.id },
          data: { status: 'SENT', sentAt: new Date() },
        });
        return;
      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : String(e);
        if (attempt < maxAttempts) await this.sleep(attempt * 1200);
      }
    }

    await this.prisma.telegramNotificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'FAILED', errorMessage: lastError.slice(0, 4000) },
    });
    this.logger.warn(
      `Email delivery failed (tenant=${params.tenantId}, kind=${params.kind}): ${lastError}`,
    );
  }

  private async notifyMatchRescheduledById(params: {
    matchId: string;
    previousStartTime: Date;
  }) {
    const row = await this.prisma.match.findUnique({
      where: { id: params.matchId },
      select: {
        id: true,
        tenantId: true,
        startTime: true,
        scheduleChangeNote: true,
        scheduleChangeReason: { select: { name: true } },
        stadium: { select: { name: true } },
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        tournament: { select: { name: true } },
      },
    });
    if (!row) return;
    await this.sendTelegramIfEnabled({
      tenantId: row.tenantId,
      kind: 'rescheduled',
      matchId: row.id,
      lines: [
        'Матч перенесен',
        '',
        `${row.homeTeam.name} - ${row.awayTeam.name}`,
        `Турнир: ${row.tournament?.name ?? '—'}`,
        `Было: ${this.formatLocalDateTime(params.previousStartTime)}`,
        `Стало: ${this.formatLocalDateTime(row.startTime)}`,
        row.stadium?.name
          ? `Площадка: ${row.stadium.name}`
          : 'Площадка: не указана',
        row.scheduleChangeReason?.name
          ? `Причина: ${row.scheduleChangeReason.name}`
          : row.scheduleChangeNote?.trim()
            ? `Причина: ${row.scheduleChangeNote.trim()}`
            : 'Причина: не указана',
      ],
    });
    await this.sendEmailIfEnabled({
      tenantId: row.tenantId,
      kind: 'rescheduled',
      matchId: row.id,
      subject: `Матч перенесен: ${row.homeTeam.name} - ${row.awayTeam.name}`,
      lines: [
        'Матч перенесен',
        '',
        `${row.homeTeam.name} - ${row.awayTeam.name}`,
        `Турнир: ${row.tournament?.name ?? '—'}`,
        `Было: ${this.formatLocalDateTime(params.previousStartTime)}`,
        `Стало: ${this.formatLocalDateTime(row.startTime)}`,
        row.stadium?.name
          ? `Площадка: ${row.stadium.name}`
          : 'Площадка: не указана',
        row.scheduleChangeReason?.name
          ? `Причина: ${row.scheduleChangeReason.name}`
          : row.scheduleChangeNote?.trim()
            ? `Причина: ${row.scheduleChangeNote.trim()}`
            : 'Причина: не указана',
      ],
    });
  }

  private async notifyProtocolPublishedById(params: { matchId: string }) {
    const row = await this.prisma.match.findUnique({
      where: { id: params.matchId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        startTime: true,
        homeScore: true,
        awayScore: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        tournament: { select: { name: true } },
      },
    });
    if (!row) return;
    if (
      row.status !== MatchStatus.PLAYED &&
      row.status !== MatchStatus.FINISHED &&
      row.status !== MatchStatus.CANCELED
    ) {
      return;
    }
    const score =
      row.homeScore !== null && row.awayScore !== null
        ? `${row.homeScore}:${row.awayScore}`
        : '—';
    await this.sendTelegramIfEnabled({
      tenantId: row.tenantId,
      kind: 'protocol_published',
      matchId: row.id,
      lines: [
        'Опубликован протокол матча',
        '',
        `${row.homeTeam.name} - ${row.awayTeam.name}`,
        `Счет: ${score}`,
        `Дата: ${this.formatLocalDateTime(row.startTime)}`,
        `Турнир: ${row.tournament?.name ?? '—'}`,
      ],
    });
    await this.sendEmailIfEnabled({
      tenantId: row.tenantId,
      kind: 'protocol_published',
      matchId: row.id,
      subject: `Опубликован протокол: ${row.homeTeam.name} - ${row.awayTeam.name}`,
      lines: [
        'Опубликован протокол матча',
        '',
        `${row.homeTeam.name} - ${row.awayTeam.name}`,
        `Счет: ${score}`,
        `Дата: ${this.formatLocalDateTime(row.startTime)}`,
        `Турнир: ${row.tournament?.name ?? '—'}`,
      ],
    });
  }

  /** Проверка площадки матча: тенант и (если задан белый список у турнира) вхождение в него. */
  private async assertMatchStadiumAllowed(
    client: Pick<PrismaService, 'stadium' | 'tournamentStadium' | 'tournament'>,
    tenantId: string,
    tournamentId: string | null,
    stadiumId: string | null | undefined,
  ) {
    if (stadiumId === undefined) return;
    const raw =
      stadiumId === null || stadiumId === ''
        ? null
        : String(stadiumId).trim() || null;
    if (!raw) return;

    const st = await client.stadium.findFirst({
      where: { id: raw, tenantId },
      select: { id: true },
    });
    if (!st) {
      throw new BadRequestException('Стадион не найден');
    }
    if (!tournamentId) return;

    const [links, tour] = await Promise.all([
      client.tournamentStadium.findMany({
        where: { tournamentId },
        select: { stadiumId: true },
      }),
      client.tournament.findUnique({
        where: { id: tournamentId },
        select: { stadiumId: true },
      }),
    ]);
    const allowed = new Set<string>();
    for (const l of links) allowed.add(l.stadiumId);
    if (tour?.stadiumId) allowed.add(tour.stadiumId);
    if (allowed.size === 0) return;
    if (!allowed.has(raw)) {
      throw new BadRequestException(
        'Укажите стадион из площадок турнира или очистите поле',
      );
    }
  }

  private async syncTournamentLifecycleAfterMatches(tournamentId: string) {
    try {
      await this.tournamentsService.syncTournamentLifecycleStatus(tournamentId);
    } catch {
      /* не блокируем сохранение матча */
    }
  }

  private assertMatchMutable(status: MatchStatus) {
    if (MUTATION_LOCKED_STATUSES.has(status)) {
      throw new BadRequestException(
        'Завершённый матч нельзя изменять или удалять',
      );
    }
  }

  /** Длительность слота для проверки пересечений: из турнира или по умолчанию (свободные матчи). */
  private async resolveMatchDurationMinutes(
    tournamentId: string | null | undefined,
  ): Promise<number> {
    if (tournamentId) {
      const t = await this.prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { matchDurationMinutes: true },
      });
      if (t) return Math.max(1, t.matchDurationMinutes);
    }
    return 90;
  }

  private async withScheduleWarnings<
    T extends { id: string } & Record<string, unknown>,
  >(row: T): Promise<T & { scheduleWarnings: string[] }> {
    const m = row as unknown as {
      id: string;
      tenantId: string;
      startTime: Date;
      homeTeamId: string;
      awayTeamId: string;
      stadiumId: string | null;
      tournamentId: string | null;
    };
    const durationMinutes = await this.resolveMatchDurationMinutes(
      m.tournamentId,
    );
    const scheduleWarnings = await collectScheduleWarningsForMatch(
      this.prisma,
      {
        tenantId: m.tenantId,
        startTime: m.startTime,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        excludeMatchId: m.id,
        stadiumId: m.stadiumId,
        durationMinutes,
      },
    );
    return { ...row, scheduleWarnings };
  }

  /**
   * Правка протокола у завершённого матча: админы, супер-админ; модератор — только если
   * назначен модератором этого турнира ({@link TournamentMemberRole.MODERATOR}).
   */
  private async canOverrideLockedProtocol(
    actorRole: UserRole,
    opts: { tournamentId: string | null; actorUserId?: string },
  ): Promise<boolean> {
    if (
      actorRole === UserRole.TENANT_ADMIN ||
      actorRole === UserRole.TOURNAMENT_ADMIN ||
      actorRole === UserRole.SUPER_ADMIN
    ) {
      return true;
    }
    if (
      actorRole === UserRole.MODERATOR &&
      opts.tournamentId &&
      opts.actorUserId
    ) {
      const m = await this.prisma.tournamentMember.findFirst({
        where: {
          tournamentId: opts.tournamentId,
          userId: opts.actorUserId,
          role: TournamentMemberRole.MODERATOR,
        },
        select: { id: true },
      });
      return !!m;
    }
    return false;
  }

  private async validateScheduleReason(
    tenantId: string,
    reasonId: string,
    kind: 'POSTPONE' | 'CANCEL',
  ) {
    const row = await this.prisma.matchScheduleReason.findFirst({
      where: { id: reasonId, tenantId, active: true },
    });
    if (!row) {
      throw new BadRequestException('Неизвестная причина из справочника');
    }
    const ok =
      row.scope === MatchScheduleReasonScope.BOTH ||
      (kind === 'POSTPONE' &&
        row.scope === MatchScheduleReasonScope.POSTPONE) ||
      (kind === 'CANCEL' && row.scope === MatchScheduleReasonScope.CANCEL);
    if (!ok) {
      throw new BadRequestException(
        'Эта причина не подходит для данного действия',
      );
    }
  }

  private async buildProtocolEventRows(
    tenantId: string,
    events: ProtocolEventDto[] | undefined,
  ): Promise<Omit<Prisma.MatchEventCreateManyInput, 'matchId'>[]> {
    if (!events?.length) return [];
    const ids = [
      ...new Set(
        events.map((e) => e.protocolEventTypeId).filter(Boolean) as string[],
      ),
    ];
    const catalog =
      ids.length > 0
        ? await this.prisma.protocolEventType.findMany({
            where: { id: { in: ids }, tenantId, active: true },
          })
        : [];
    const byId = new Map(catalog.map((p) => [p.id, p]));
    return events.map((e) => {
      const payload =
        e.payload && typeof e.payload === 'object'
          ? (e.payload as Record<string, unknown>)
          : null;
      if (e.type === MatchEventType.GOAL) {
        if (!e.teamSide) {
          throw new BadRequestException(
            'Для события "Гол" нужно указать команду',
          );
        }
        if (!e.playerId) {
          throw new BadRequestException(
            'Для события "Гол" нужно указать игрока',
          );
        }
      }
      if (e.type === MatchEventType.CARD) {
        if (!e.teamSide) {
          throw new BadRequestException(
            'Для события "Карточка" нужно указать команду',
          );
        }
        if (!e.playerId) {
          throw new BadRequestException(
            'Для события "Карточка" нужно указать игрока',
          );
        }
        const rawCardType = String(
          payload?.cardType ?? payload?.color ?? payload?.cardColor ?? '',
        )
          .trim()
          .toLowerCase();
        if (
          rawCardType &&
          !rawCardType.includes('yellow') &&
          !rawCardType.includes('red')
        ) {
          throw new BadRequestException(
            'Для события "Карточка" передан некорректный тип карточки',
          );
        }
      }
      if (e.type === MatchEventType.SUBSTITUTION) {
        if (!e.teamSide) {
          throw new BadRequestException(
            'Для события "Замена" нужно указать команду',
          );
        }
        if (!e.playerId) {
          throw new BadRequestException(
            'Для события "Замена" нужно указать заменяемого игрока',
          );
        }
        const playerInId = String(payload?.playerInId ?? '').trim();
        if (!playerInId) {
          throw new BadRequestException(
            'Для события "Замена" нужно указать выходящего игрока',
          );
        }
        if (playerInId === e.playerId) {
          throw new BadRequestException(
            'Для события "Замена" игроки на вход и выход не должны совпадать',
          );
        }
      }

      let protocolEventTypeId: string | null = null;
      if (e.protocolEventTypeId) {
        const pet = byId.get(e.protocolEventTypeId);
        if (!pet) {
          throw new BadRequestException('Неизвестный тип события протокола');
        }
        if (pet.mapsToType !== e.type) {
          throw new BadRequestException(
            'Тип строки справочника не совпадает с полем type события',
          );
        }
        protocolEventTypeId = pet.id;
      }
      const row: Omit<Prisma.MatchEventCreateManyInput, 'matchId'> = {
        type: e.type,
        minute: e.minute ?? null,
        playerId: e.playerId ?? null,
        teamSide: e.teamSide ?? null,
        protocolEventTypeId,
      };
      if (e.payload !== undefined) {
        row.payload = e.payload as Prisma.InputJsonValue;
      }
      return row;
    });
  }

  private validateScoreVsGoalEvents(dto: UpdateProtocolDto) {
    if (!dto.events?.length) return;
    if (dto.status === MatchStatus.CANCELED) return;

    let homeGoals = 0;
    let awayGoals = 0;
    let hasGoalEvents = false;

    for (const event of dto.events) {
      if (event.type !== MatchEventType.GOAL) continue;
      hasGoalEvents = true;
      if (event.teamSide === MatchTeamSide.HOME) {
        homeGoals += 1;
      } else if (event.teamSide === MatchTeamSide.AWAY) {
        awayGoals += 1;
      } else {
        throw new BadRequestException(
          'Для каждого события "Гол" нужно указать команду',
        );
      }
    }

    if (!hasGoalEvents) return;
    if (dto.homeScore !== homeGoals || dto.awayScore !== awayGoals) {
      throw new BadRequestException(
        'Счёт матча должен совпадать с количеством голов в протоколе',
      );
    }
  }

  /**
   * Согласовано с мобильным клиентом: после замены вышедший игрок не может участвовать
   * в событиях на более поздней минуте; вошедший по замене — на более ранней.
   * После второй жёлтой или красной игрок удалён — события с ним на более поздних минутах недопустимы.
   */
  private validateSubstitutionPlayerTimeline(dto: UpdateProtocolDto) {
    if (!dto.events?.length) return;
    if (dto.status === MatchStatus.CANCELED) return;

    type SubRow = { idx: number; m: number; out: string; inn: string };
    const subs: SubRow[] = [];
    for (let idx = 0; idx < dto.events.length; idx++) {
      const e = dto.events[idx];
      if (e.type !== MatchEventType.SUBSTITUTION) continue;
      const m = e.minute;
      if (m === undefined || m === null || !Number.isFinite(Number(m))) {
        continue;
      }
      const out = String(e.playerId ?? '').trim();
      const payload = e.payload as Record<string, unknown> | undefined;
      const inn = String(payload?.playerInId ?? '').trim();
      if (!out || !inn) continue;
      subs.push({ idx, m: Number(m), out, inn });
    }
    subs.sort((a, b) => a.m - b.m || a.idx - b.idx);

    const outAt = new Map<string, number>();
    const inAt = new Map<string, number>();

    for (const { m, out, inn } of subs) {
      if (outAt.has(out)) {
        throw new BadRequestException(
          'Игрок уже ушёл с поля по более ранней замене — повторно указать его в замене нельзя.',
        );
      }
      outAt.set(out, m);
      inAt.set(inn, m);
    }

    type CardRow = { idx: number; m: number; pid: string; isRed: boolean };
    const cardRows: CardRow[] = [];
    for (let idx = 0; idx < dto.events.length; idx++) {
      const e = dto.events[idx];
      if (e.type !== MatchEventType.CARD) continue;
      const m = e.minute;
      if (m === undefined || m === null || !Number.isFinite(Number(m))) {
        continue;
      }
      const pid = String(e.playerId ?? '').trim();
      if (!pid) continue;
      const payload = e.payload as Record<string, unknown> | undefined;
      const raw = String(
        payload?.cardType ?? payload?.color ?? payload?.cardColor ?? '',
      )
        .trim()
        .toLowerCase();
      const isRed =
        raw.includes('red') ||
        raw.includes('крас') ||
        raw === 'r';
      const isYellow =
        !isRed &&
        (raw.includes('yellow') ||
          raw.includes('желт') ||
          raw === 'y' ||
          raw === '');
      if (raw && !isRed && !isYellow) {
        continue;
      }
      cardRows.push({ idx, m: Number(m), pid, isRed });
    }
    cardRows.sort((a, b) => a.m - b.m || a.idx - b.idx);

    const yellowCount = new Map<string, number>();
    const sentOffAt = new Map<string, number>();

    for (const { m, pid, isRed } of cardRows) {
      const so = sentOffAt.get(pid);
      if (so !== undefined && m > so) {
        throw new BadRequestException(
          `Игрок уже удалён с поля (${so}′) — нельзя добавить событие с этим игроком на ${m}′.`,
        );
      }
      if (isRed) {
        sentOffAt.set(pid, m);
      } else {
        const c = (yellowCount.get(pid) ?? 0) + 1;
        yellowCount.set(pid, c);
        if (c >= 2) {
          sentOffAt.set(pid, m);
        }
      }
    }

    const checkPid = (pid: string, E: number) => {
      const p = pid.trim();
      if (!p) return;
      const mi = inAt.get(p);
      if (mi !== undefined && E < mi) {
        throw new BadRequestException(
          `Игрок ещё не был на поле (выход на ${mi}′).`,
        );
      }
      const mo = outAt.get(p);
      if (mo !== undefined && E > mo) {
        throw new BadRequestException(
          `Игрок уже ушёл с поля по замене (${mo}′) — событие на ${E}′ недопустимо.`,
        );
      }
      const so = sentOffAt.get(p);
      if (so !== undefined && E > so) {
        throw new BadRequestException(
          `Игрок удалён с поля (${so}′) — событие на ${E}′ недопустимо.`,
        );
      }
    };

    for (const e of dto.events) {
      const E = e.minute;
      if (E === undefined || E === null || !Number.isFinite(Number(E))) {
        continue;
      }
      const En = Number(E);
      if (e.type === MatchEventType.GOAL || e.type === MatchEventType.CARD) {
        checkPid(String(e.playerId ?? ''), En);
        const payload = e.payload as Record<string, unknown> | undefined;
        const assist = String(
          payload?.assistId ?? payload?.assistPlayerId ?? '',
        ).trim();
        const scorer = String(e.playerId ?? '').trim();
        if (assist && assist !== scorer) {
          checkPid(assist, En);
        }
      }
      if (e.type === MatchEventType.SUBSTITUTION) {
        const out = String(e.playerId ?? '').trim();
        const inn = String(
          (e.payload as Record<string, unknown> | undefined)?.playerInId ?? '',
        ).trim();
        if (!out || !inn) continue;
        checkPid(out, En);
        checkPid(inn, En);
      }
    }
  }

  private isUnknownPlayoffTeamName(name: string) {
    const normalized = name.trim().toLowerCase();
    return (
      normalized.includes('победитель матча') ||
      normalized.includes('проигравший матча') ||
      /^[a-z]\d+$/i.test(normalized)
    );
  }

  private isCompletedWithScore(m: {
    status: MatchStatus;
    homeScore: number | null;
    awayScore: number | null;
  }) {
    return (
      (m.status === MatchStatus.PLAYED || m.status === MatchStatus.FINISHED) &&
      m.homeScore !== null &&
      m.awayScore !== null
    );
  }

  private hasResolvedPenaltyScore(events?: { payload?: unknown }[]) {
    if (!events?.length) return false;
    return events.some((e) => {
      const payload = e.payload as Record<string, unknown> | null | undefined;
      if (!payload || payload.metaType !== 'PENALTY_SCORE') return false;
      const home = payload.homeScore;
      const away = payload.awayScore;
      return (
        typeof home === 'number' &&
        typeof away === 'number' &&
        Number.isFinite(home) &&
        Number.isFinite(away) &&
        home >= 0 &&
        away >= 0 &&
        home !== away
      );
    });
  }

  private penaltyWinnerSide(events?: { payload?: unknown }[]) {
    if (!events?.length) return null as MatchTeamSide | null;
    for (const e of events) {
      const payload = e.payload as Record<string, unknown> | null | undefined;
      if (!payload || payload.metaType !== 'PENALTY_SCORE') continue;
      const home = payload.homeScore;
      const away = payload.awayScore;
      if (
        typeof home === 'number' &&
        typeof away === 'number' &&
        Number.isFinite(home) &&
        Number.isFinite(away) &&
        home !== away
      ) {
        return home > away ? MatchTeamSide.HOME : MatchTeamSide.AWAY;
      }
    }
    return null;
  }

  private resolveWinnerLoserTeams(m: {
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number | null;
    awayScore: number | null;
    events?: { payload?: unknown }[];
  }): { winnerTeamId: string; loserTeamId: string } | null {
    if (m.homeScore === null || m.awayScore === null) return null;
    if (m.homeScore > m.awayScore) {
      return { winnerTeamId: m.homeTeamId, loserTeamId: m.awayTeamId };
    }
    if (m.awayScore > m.homeScore) {
      return { winnerTeamId: m.awayTeamId, loserTeamId: m.homeTeamId };
    }
    const penWinner = this.penaltyWinnerSide(m.events);
    if (penWinner === MatchTeamSide.HOME) {
      return { winnerTeamId: m.homeTeamId, loserTeamId: m.awayTeamId };
    }
    if (penWinner === MatchTeamSide.AWAY) {
      return { winnerTeamId: m.awayTeamId, loserTeamId: m.homeTeamId };
    }
    return null;
  }

  /**
   * Групповой этап MANUAL с несколькими группами: матч должен иметь groupId, обе команды — в этой группе
   * (таблица и статистика считаются по groupId матча).
   */
  private async assertManualGroupStageTeamsMatchGroup(
    tournamentId: string,
    tournament: { format: TournamentFormat; groupCount: number | null },
    params: {
      stage: MatchStage;
      groupId: string | null;
      homeTeamId: string;
      awayTeamId: string;
    },
  ) {
    if (tournament.format !== TournamentFormat.MANUAL) return;
    if (params.stage !== MatchStage.GROUP) return;
    const gc = tournament.groupCount ?? 1;
    if (gc > 1 && !params.groupId) {
      throw new BadRequestException(
        'Для турнира с несколькими группами укажите группу матча (групповой этап).',
      );
    }
    if (!params.groupId) return;

    const tts = await this.prisma.tournamentTeam.findMany({
      where: {
        tournamentId,
        teamId: { in: [params.homeTeamId, params.awayTeamId] },
      },
      select: { teamId: true, groupId: true },
    });
    if (tts.length !== 2) {
      throw new BadRequestException(
        'Обе команды должны быть в составе турнира',
      );
    }
    for (const tt of tts) {
      if (tt.groupId !== params.groupId) {
        throw new BadRequestException(
          'Обе команды должны состоять в выбранной группе (вкладка «Составы»).',
        );
      }
    }
  }

  /** Только для турниров `MANUAL`: матч создаётся вручную, без генерации. */
  async createMatch(
    tournamentId: string,
    actorRole: UserRole,
    dto: CreateMatchDto,
  ) {
    if (!PROTOCOL_ROLES.includes(actorRole)) {
      throwInsufficientRole();
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, tenantId: true, format: true, groupCount: true },
    });
    if (!tournament) throwTournamentNotFound();
    if (tournament.format !== TournamentFormat.MANUAL) {
      throw new BadRequestException(
        'Ручное создание матчей доступно только для турниров с форматом «только ручное расписание» (MANUAL)',
      );
    }

    if (dto.homeTeamId === dto.awayTeamId) {
      throw new BadRequestException('Выберите две разные команды');
    }

    const inTournament = await this.prisma.tournamentTeam.findMany({
      where: { tournamentId },
      select: { teamId: true },
    });
    const allowed = new Set(inTournament.map((x) => x.teamId));
    if (!allowed.has(dto.homeTeamId) || !allowed.has(dto.awayTeamId)) {
      throw new BadRequestException(
        'Обе команды должны быть в составе турнира',
      );
    }

    if (dto.groupId) {
      const g = await this.prisma.tournamentGroup.findFirst({
        where: { id: dto.groupId, tournamentId },
        select: { id: true },
      });
      if (!g) {
        throw new BadRequestException(
          'Указанная группа не относится к этому турниру',
        );
      }
    }

    const stage = dto.stage ?? MatchStage.GROUP;
    await this.assertManualGroupStageTeamsMatchGroup(tournamentId, tournament, {
      stage,
      groupId: dto.groupId ?? null,
      homeTeamId: dto.homeTeamId,
      awayTeamId: dto.awayTeamId,
    });

    const start = new Date(dto.startTime);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('Некорректная дата/время начала');
    }

    const stadiumIdForCreate =
      dto.stadiumId && String(dto.stadiumId).trim()
        ? String(dto.stadiumId).trim()
        : null;
    await this.assertMatchStadiumAllowed(
      this.prisma,
      tournament.tenantId,
      tournamentId,
      stadiumIdForCreate,
    );

    const roundNumber = dto.roundNumber ?? 1;
    const groupId = dto.groupId ?? null;
    const playoffRound = dto.playoffRound ?? null;

    const duplicate = await this.prisma.match.findFirst({
      where: {
        tournamentId,
        homeTeamId: dto.homeTeamId,
        awayTeamId: dto.awayTeamId,
        startTime: start,
        stage,
        roundNumber,
        groupId,
        playoffRound,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        message:
          'Матч с такими командами, временем начала и этапом уже есть в турнире',
        code: ApiErrorCode.MATCH_DUPLICATE,
      });
    }

    const created = await this.prisma.match.create({
      data: {
        tenantId: tournament.tenantId,
        tournamentId,
        homeTeamId: dto.homeTeamId,
        awayTeamId: dto.awayTeamId,
        startTime: start,
        stage,
        roundNumber,
        groupId,
        playoffRound,
        stadiumId: stadiumIdForCreate,
        ...(dto.publishedOnPublic !== undefined
          ? { publishedOnPublic: dto.publishedOnPublic }
          : {}),
      },
    });

    await this.recomputeTable(tournamentId);
    await this.syncTournamentLifecycleAfterMatches(tournamentId);
    return this.withScheduleWarnings(created);
  }

  async deleteMatch(
    tournamentId: string,
    matchId: string,
    actorRole: UserRole,
  ) {
    if (!PROTOCOL_ROLES.includes(actorRole)) {
      throwInsufficientRole();
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { format: true },
    });
    if (!tournament) throwTournamentNotFound();
    if (tournament.format !== TournamentFormat.MANUAL) {
      throw new BadRequestException(
        'Удаление отдельного матча доступно только для турниров с форматом MANUAL',
      );
    }

    const existing = await this.prisma.match.findFirst({
      where: { id: matchId, tournamentId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Match not found');
    this.assertMatchMutable(existing.status);

    await this.prisma.$transaction(async (tx) => {
      await tx.matchEvent.deleteMany({ where: { matchId } });
      await tx.match.delete({ where: { id: matchId } });
    });

    await this.recomputeTable(tournamentId);
    await this.syncTournamentLifecycleAfterMatches(tournamentId);
    return { success: true };
  }

  async updateMatch(
    tournamentId: string,
    matchId: string,
    actorRole: UserRole,
    data: {
      startTime?: Date;
      homeTeamId?: string;
      awayTeamId?: string;
      roundNumber?: number;
      groupId?: string | null;
      scheduleChangeReasonId?: string;
      scheduleChangeNote?: string;
      stadiumId?: string | null;
      publishedOnPublic?: boolean;
    },
  ) {
    if (!PROTOCOL_ROLES.includes(actorRole)) {
      throwInsufficientRole();
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { format: true, groupCount: true },
    });
    if (!tournament) throwTournamentNotFound();

    if (
      (data.roundNumber !== undefined || data.groupId !== undefined) &&
      tournament.format !== TournamentFormat.MANUAL
    ) {
      throw new BadRequestException(
        'Номер тура и группа доступны только для формата MANUAL',
      );
    }

    if (data.groupId) {
      const g = await this.prisma.tournamentGroup.findFirst({
        where: { id: data.groupId, tournamentId },
        select: { id: true },
      });
      if (!g) {
        throw new BadRequestException(
          'Указанная группа не относится к этому турниру',
        );
      }
    }

    const match = await this.prisma.match.findFirst({
      where: { id: matchId, tournamentId },
      select: {
        id: true,
        homeTeamId: true,
        awayTeamId: true,
        status: true,
        stage: true,
        groupId: true,
        startTime: true,
        tenantId: true,
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const visibilityOnly =
      data.publishedOnPublic !== undefined &&
      data.startTime === undefined &&
      data.homeTeamId === undefined &&
      data.awayTeamId === undefined &&
      data.roundNumber === undefined &&
      data.groupId === undefined &&
      data.scheduleChangeReasonId === undefined &&
      data.scheduleChangeNote === undefined &&
      data.stadiumId === undefined;
    if (visibilityOnly) {
      const updated = await this.prisma.match.update({
        where: { id: matchId },
        data: { publishedOnPublic: data.publishedOnPublic },
      });
      return this.withScheduleWarnings(updated);
    }

    this.assertMatchMutable(match.status);

    const startTimeChanged =
      data.startTime !== undefined &&
      data.startTime.getTime() !== match.startTime.getTime();
    if (startTimeChanged) {
      const postponeReasonId = data.scheduleChangeReasonId?.trim();
      if (postponeReasonId) {
        await this.validateScheduleReason(
          match.tenantId,
          postponeReasonId,
          'POSTPONE',
        );
      }
    }

    const schedulePatch: {
      scheduleChangeReasonId?: string | null;
      scheduleChangeNote?: string | null;
    } = {};
    if (startTimeChanged) {
      if (data.scheduleChangeReasonId !== undefined) {
        schedulePatch.scheduleChangeReasonId =
          data.scheduleChangeReasonId || null;
      }
      if (data.scheduleChangeNote !== undefined) {
        schedulePatch.scheduleChangeNote = data.scheduleChangeNote?.trim()
          ? data.scheduleChangeNote.trim()
          : null;
      }
    }

    const wantsTeamChange =
      data.homeTeamId !== undefined || data.awayTeamId !== undefined;

    let nextHome = match.homeTeamId;
    let nextAway = match.awayTeamId;
    if (wantsTeamChange) {
      if (tournament.format !== TournamentFormat.MANUAL) {
        throw new BadRequestException(
          'Смена пар команд доступна только для турниров с форматом «только ручное расписание» (MANUAL)',
        );
      }
      nextHome = data.homeTeamId ?? match.homeTeamId;
      nextAway = data.awayTeamId ?? match.awayTeamId;
      if (nextHome === nextAway) {
        throw new BadRequestException('Выберите две разные команды');
      }
      const inTournament = await this.prisma.tournamentTeam.findMany({
        where: { tournamentId },
        select: { teamId: true },
      });
      const allowed = new Set(inTournament.map((x) => x.teamId));
      if (!allowed.has(nextHome) || !allowed.has(nextAway)) {
        throw new BadRequestException(
          'Обе команды должны быть в составе турнира',
        );
      }
    }

    const teamsChanged =
      nextHome !== match.homeTeamId || nextAway !== match.awayTeamId;

    const nextGroupId =
      data.groupId !== undefined ? data.groupId : match.groupId;

    await this.assertManualGroupStageTeamsMatchGroup(tournamentId, tournament, {
      stage: match.stage,
      groupId: nextGroupId,
      homeTeamId: nextHome,
      awayTeamId: nextAway,
    });

    if (data.stadiumId !== undefined) {
      await this.assertMatchStadiumAllowed(
        this.prisma,
        match.tenantId,
        tournamentId,
        data.stadiumId && String(data.stadiumId).trim()
          ? String(data.stadiumId).trim()
          : null,
      );
    }

    const stadiumPatch =
      data.stadiumId !== undefined
        ? {
            stadiumId:
              data.stadiumId && String(data.stadiumId).trim()
                ? String(data.stadiumId).trim()
                : null,
          }
        : {};

    const visPatch: Prisma.MatchUncheckedUpdateInput =
      data.publishedOnPublic !== undefined
        ? { publishedOnPublic: data.publishedOnPublic }
        : {};

    if (!teamsChanged) {
      if (tournament.format === TournamentFormat.MANUAL) {
        const patch: Prisma.MatchUncheckedUpdateInput = {};
        if (data.startTime !== undefined) patch.startTime = data.startTime;
        if (data.roundNumber !== undefined)
          patch.roundNumber = data.roundNumber;
        if (data.groupId !== undefined) patch.groupId = data.groupId;
        Object.assign(patch, schedulePatch, stadiumPatch, visPatch);
        if (Object.keys(patch).length === 0) {
          return this.withScheduleWarnings(
            await this.prisma.match.findUniqueOrThrow({
              where: { id: matchId },
            }),
          );
        }
        const updated = await this.prisma.match.update({
          where: { id: matchId },
          data: patch,
        });
        if (startTimeChanged) {
          void this.notifyMatchRescheduledById({
            matchId,
            previousStartTime: match.startTime,
          }).catch(() => undefined);
        }
        await this.recomputeTable(tournamentId);
        await this.syncTournamentLifecycleAfterMatches(tournamentId);
        return this.withScheduleWarnings(updated);
      }
      if (
        data.startTime === undefined &&
        Object.keys(schedulePatch).length === 0 &&
        Object.keys(stadiumPatch).length === 0 &&
        Object.keys(visPatch).length === 0
      ) {
        return this.withScheduleWarnings(
          await this.prisma.match.findUniqueOrThrow({ where: { id: matchId } }),
        );
      }
      const updated = await this.prisma.match.update({
        where: { id: matchId },
        data: {
          ...(data.startTime !== undefined
            ? { startTime: data.startTime }
            : {}),
          ...schedulePatch,
          ...stadiumPatch,
          ...visPatch,
        },
      });
      if (startTimeChanged) {
        void this.notifyMatchRescheduledById({
          matchId,
          previousStartTime: match.startTime,
        }).catch(() => undefined);
      }
      return this.withScheduleWarnings(updated);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.matchEvent.deleteMany({ where: { matchId } });
      await tx.match.update({
        where: { id: matchId },
        data: {
          ...(data.startTime !== undefined
            ? { startTime: data.startTime }
            : {}),
          ...(data.roundNumber !== undefined
            ? { roundNumber: data.roundNumber }
            : {}),
          ...(data.groupId !== undefined ? { groupId: data.groupId } : {}),
          ...schedulePatch,
          ...stadiumPatch,
          ...visPatch,
          homeTeamId: nextHome,
          awayTeamId: nextAway,
          homeScore: null,
          awayScore: null,
          status: MatchStatus.SCHEDULED,
        },
      });
    });

    await this.recomputeTable(tournamentId);
    await this.syncTournamentLifecycleAfterMatches(tournamentId);
    if (startTimeChanged) {
      void this.notifyMatchRescheduledById({
        matchId,
        previousStartTime: match.startTime,
      }).catch(() => undefined);
    }
    return this.withScheduleWarnings(
      await this.prisma.match.findUniqueOrThrow({ where: { id: matchId } }),
    );
  }

  async bulkUpdateTournamentMatches(
    tournamentId: string,
    actorRole: UserRole,
    dto: BulkUpdateMatchesDto,
  ) {
    if (!PROTOCOL_ROLES.includes(actorRole)) {
      throwInsufficientRole();
    }

    const uniqueIds = Array.from(
      new Set(
        (dto.matchIds ?? []).map((id) => String(id).trim()).filter(Boolean),
      ),
    );
    if (!uniqueIds.length) {
      throw new BadRequestException('Не выбраны матчи для массового изменения');
    }
    const hasScheduleBulkPatch =
      dto.shiftMinutes !== undefined ||
      dto.stadiumId !== undefined ||
      dto.scheduleChangeReasonId !== undefined ||
      dto.scheduleChangeNote !== undefined;
    const hasAnyPatch =
      hasScheduleBulkPatch || dto.publishedOnPublic !== undefined;
    if (!hasAnyPatch) {
      throw new BadRequestException('Не указаны поля для массового изменения');
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, tenantId: true },
    });
    if (!tournament) throwTournamentNotFound();

    const rows = await this.prisma.match.findMany({
      where: { tournamentId, id: { in: uniqueIds } },
      select: { id: true, status: true, startTime: true, tenantId: true },
    });
    if (rows.length !== uniqueIds.length) {
      throw new NotFoundException(
        'Один или несколько матчей не найдены в этом турнире',
      );
    }

    const visibilityOnly =
      dto.publishedOnPublic !== undefined && !hasScheduleBulkPatch;
    if (visibilityOnly) {
      const res = await this.prisma.match.updateMany({
        where: { tournamentId, id: { in: uniqueIds } },
        data: { publishedOnPublic: dto.publishedOnPublic },
      });
      return {
        success: true,
        updatedCount: res.count,
        ids: uniqueIds,
      };
    }

    const locked = rows.filter((m) => MUTATION_LOCKED_STATUSES.has(m.status));
    if (locked.length) {
      throw new BadRequestException(
        `Нельзя изменить ${locked.length} матч(ей): есть завершенные/сыгранные/отмененные`,
      );
    }

    if (dto.scheduleChangeReasonId?.trim()) {
      await this.validateScheduleReason(
        tournament.tenantId,
        dto.scheduleChangeReasonId.trim(),
        'POSTPONE',
      );
    }

    let normalizedStadiumId: string | null | undefined = undefined;
    if (dto.stadiumId !== undefined) {
      normalizedStadiumId =
        dto.stadiumId && String(dto.stadiumId).trim()
          ? String(dto.stadiumId).trim()
          : null;
      await this.assertMatchStadiumAllowed(
        this.prisma,
        tournament.tenantId,
        tournamentId,
        normalizedStadiumId,
      );
    }

    const shift = Number(dto.shiftMinutes ?? 0);
    const updatedIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const patch: Prisma.MatchUncheckedUpdateInput = {};
        if (dto.shiftMinutes !== undefined && shift !== 0) {
          patch.startTime = new Date(row.startTime.getTime() + shift * 60_000);
        }
        if (dto.scheduleChangeReasonId !== undefined) {
          patch.scheduleChangeReasonId = dto.scheduleChangeReasonId || null;
        }
        if (dto.scheduleChangeNote !== undefined) {
          patch.scheduleChangeNote = dto.scheduleChangeNote?.trim()
            ? dto.scheduleChangeNote.trim()
            : null;
        }
        if (dto.stadiumId !== undefined) {
          patch.stadiumId = normalizedStadiumId;
        }
        if (dto.publishedOnPublic !== undefined) {
          patch.publishedOnPublic = dto.publishedOnPublic;
        }
        if (Object.keys(patch).length === 0) continue;
        await tx.match.update({ where: { id: row.id }, data: patch });
        updatedIds.push(row.id);
      }
    });

    if (dto.shiftMinutes !== undefined && shift !== 0) {
      for (const row of rows) {
        void this.notifyMatchRescheduledById({
          matchId: row.id,
          previousStartTime: row.startTime,
        }).catch(() => undefined);
      }
    }

    return { success: true, updatedCount: updatedIds.length, ids: updatedIds };
  }

  async quickUpdateTournamentMatchStatus(
    tournamentId: string,
    matchId: string,
    actorRole: UserRole,
    status: MatchStatus,
  ) {
    if (
      status !== MatchStatus.SCHEDULED &&
      status !== MatchStatus.LIVE &&
      status !== MatchStatus.FINISHED
    ) {
      throw new BadRequestException(
        'Разрешены только статусы SCHEDULED, LIVE, FINISHED',
      );
    }
    if (!PROTOCOL_ROLES.includes(actorRole)) {
      throwInsufficientRole();
    }
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, tournamentId },
      select: { id: true, status: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    this.assertMatchMutable(match.status);
    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: { status },
    });
    await this.syncTournamentLifecycleAfterMatches(tournamentId);
    return updated;
  }

  async listMatchConflictSuggestions(
    tournamentId: string,
    matchId: string,
    actorRole: UserRole,
    query: ListMatchSuggestionsQueryDto,
  ) {
    if (!PROTOCOL_ROLES.includes(actorRole)) {
      throwInsufficientRole();
    }
    const limit = Math.max(1, Math.min(10, Number(query.limit ?? 5)));
    const target = await this.prisma.match.findFirst({
      where: { id: matchId, tournamentId },
      select: {
        id: true,
        tenantId: true,
        tournamentId: true,
        startTime: true,
        stadiumId: true,
        homeTeamId: true,
        awayTeamId: true,
        status: true,
      },
    });
    if (!target) throw new NotFoundException('Match not found');
    this.assertMatchMutable(target.status);

    const durationMinutes = await this.resolveMatchDurationMinutes(
      target.tournamentId,
    );
    const durationMs = Math.max(1, durationMinutes) * 60 * 1000;
    const baseTs = target.startTime.getTime();
    /** Сдвиги времени на той же площадке: короткие пресеты + сетка до 6 ч + реже до 24 ч. */
    const shiftOffsetsMin = (() => {
      const out = new Set<number>();
      for (const m of [15, 30, 45, 60, 90, 120, 180, 240, 360]) out.add(m);
      for (let m = 15; m <= 6 * 60; m += 15) out.add(m);
      for (let m = 6 * 60 + 30; m <= 12 * 60; m += 30) out.add(m);
      for (let m = 13 * 60; m <= 23 * 60; m += 60) out.add(m);
      out.add(24 * 60);
      return [...out].sort((a, b) => a - b);
    })();

    const [tourLinks, tournament, tenantStadiums] = await Promise.all([
      this.prisma.tournamentStadium.findMany({
        where: { tournamentId },
        select: { stadiumId: true },
      }),
      this.prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { stadiumId: true },
      }),
      this.prisma.stadium.findMany({
        where: { tenantId: target.tenantId },
        select: { id: true, name: true },
      }),
    ]);
    const allowedStadiumIds = new Set<string>();
    for (const row of tourLinks) allowedStadiumIds.add(row.stadiumId);
    if (tournament?.stadiumId) allowedStadiumIds.add(tournament.stadiumId);
    const stadiumPool =
      allowedStadiumIds.size > 0
        ? tenantStadiums.filter((s) => allowedStadiumIds.has(s.id))
        : tenantStadiums;
    const stadiumNameById = new Map(stadiumPool.map((s) => [s.id, s.name]));

    type Candidate = {
      key: string;
      kind: 'shift' | 'next_day' | 'alt_stadium';
      label: string;
      startTime: Date;
      stadiumId: string | null;
    };
    const candidatesRaw: Candidate[] = shiftOffsetsMin.map((m) => ({
      key: `shift:${m}`,
      kind: m >= 24 * 60 ? 'next_day' : 'shift',
      label:
        m >= 24 * 60
          ? 'Следующий день'
          : m >= 60 && m % 60 === 0
            ? `+${m / 60} ч`
            : `+${m} мин`,
      startTime: new Date(baseTs + m * 60_000),
      stadiumId: target.stadiumId,
    }));
    for (const st of stadiumPool) {
      if (target.stadiumId && st.id === target.stadiumId) continue;
      candidatesRaw.push({
        key: `stadium:${st.id}`,
        kind: 'alt_stadium',
        label: `Площадка: ${st.name}`,
        startTime: new Date(baseTs),
        stadiumId: st.id,
      });
    }

    const dedupeKey = (c: Candidate) =>
      `${c.startTime.getTime()}|${c.stadiumId ?? ''}`;
    const candidates: Candidate[] = [];
    const bestByKey = new Map<string, Candidate>();
    for (const c of candidatesRaw) {
      const k = dedupeKey(c);
      const prev = bestByKey.get(k);
      if (!prev || c.label.length < prev.label.length) {
        bestByKey.set(k, c);
      }
    }
    for (const c of bestByKey.values()) candidates.push(c);

    const minCandidateTs = Math.min(
      ...candidates.map((c) => c.startTime.getTime()),
    );
    const maxCandidateTs = Math.max(
      ...candidates.map((c) => c.startTime.getTime()),
    );
    const windowMin = new Date(minCandidateTs - durationMs);
    const windowMax = new Date(maxCandidateTs + durationMs);
    const others = await this.prisma.match.findMany({
      where: {
        tenantId: target.tenantId,
        id: { not: target.id },
        status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
        startTime: { gte: windowMin, lte: windowMax },
      },
      select: {
        id: true,
        startTime: true,
        stadiumId: true,
        homeTeamId: true,
        awayTeamId: true,
        tournamentId: true,
      },
    });

    const overlaps = (a0: number, a1: number, b0: number, b1: number) =>
      a0 < b1 && b0 < a1;
    /** Окно ±90 мин от начала слота: вес сильнее для ближних к центру слота матчей. */
    const NEARBY_WINDOW_MS = 90 * 60 * 1000;
    const ranked = candidates
      .map((c) => {
        const c0 = c.startTime.getTime();
        const c1 = c0 + durationMs;
        let teamConflicts = 0;
        let stadiumConflicts = 0;
        let crossTournamentConflicts = 0;
        let nearbyCount = 0;
        let nearbyLoadWeighted = 0;
        for (const m of others) {
          const m0 = m.startTime.getTime();
          const m1 = m0 + durationMs;
          const dist = Math.abs(m0 - c0);
          if (dist <= NEARBY_WINDOW_MS) {
            nearbyCount += 1;
            nearbyLoadWeighted += 1 - dist / NEARBY_WINDOW_MS;
          }
          if (!overlaps(c0, c1, m0, m1)) continue;
          const isTeamConflict =
            m.homeTeamId === target.homeTeamId ||
            m.awayTeamId === target.homeTeamId ||
            m.homeTeamId === target.awayTeamId ||
            m.awayTeamId === target.awayTeamId;
          if (isTeamConflict) {
            teamConflicts += 1;
          } else if (
            c.stadiumId &&
            m.stadiumId &&
            c.stadiumId === m.stadiumId
          ) {
            stadiumConflicts += 1;
          }
          if (m.tournamentId && m.tournamentId !== tournamentId) {
            crossTournamentConflicts += 1;
          }
        }
        const totalConflicts = teamConflicts + stadiumConflicts;
        const score =
          totalConflicts * 100 +
          teamConflicts * 20 +
          stadiumConflicts * 12 +
          crossTournamentConflicts * 5 +
          Math.round(nearbyLoadWeighted * 14);
        const explain: string[] = [];
        if (c.kind === 'alt_stadium') {
          explain.push('Смена площадки при том же времени начала');
        } else if (c.kind === 'next_day') {
          explain.push('Старт на следующий календарный день от текущего времени');
        } else {
          explain.push('Сдвиг времени начала в пределах суток');
        }
        if (teamConflicts > 0) {
          explain.push(`пересечения по командам: ${teamConflicts}`);
        }
        if (stadiumConflicts > 0) {
          explain.push(`пересечения по площадке: ${stadiumConflicts}`);
        }
        if (crossTournamentConflicts > 0) {
          explain.push(
            `пересечения с другими турнирами: ${crossTournamentConflicts}`,
          );
        }
        if (nearbyCount > 0) {
          explain.push(
            `матчей в окне ±90 мин: ${nearbyCount} (вес загрузки: ${nearbyLoadWeighted.toFixed(1)})`,
          );
        }
        if (totalConflicts === 0) {
          explain.push('нет пересечений по командам и площадке в этом слоте');
        }
        return {
          id: c.key,
          kind: c.kind,
          label: c.label,
          startTime: c.startTime,
          stadiumId: c.stadiumId,
          stadiumName: c.stadiumId
            ? (stadiumNameById.get(c.stadiumId) ?? null)
            : null,
          conflicts: {
            total: totalConflicts,
            team: teamConflicts,
            stadium: stadiumConflicts,
            crossTournament: crossTournamentConflicts,
            nearbyLoad: nearbyCount,
            nearbyLoadWeighted,
          },
          explain,
          score,
        };
      })
      .sort(
        (a, b) =>
          a.score - b.score || a.startTime.getTime() - b.startTime.getTime(),
      )
      .slice(0, limit);

    return {
      items: ranked.map((row) => ({
        id: row.id,
        kind: row.kind,
        label: row.label,
        startTime: row.startTime,
        stadiumId: row.stadiumId,
        stadiumName: row.stadiumName,
        conflicts: row.conflicts,
        explain: row.explain,
      })),
    };
  }

  async updateProtocol(
    tournamentId: string,
    matchId: string,
    actorRole: UserRole,
    dto: UpdateProtocolDto,
    actorUserId?: string,
  ) {
    if (!PROTOCOL_ROLES.includes(actorRole)) {
      throwInsufficientRole();
    }

    const match = await this.prisma.match.findFirst({
      where: { id: matchId, tournamentId },
      select: {
        id: true,
        tenantId: true,
        homeTeamId: true,
        awayTeamId: true,
        stage: true,
        playoffRound: true,
        roundNumber: true,
        status: true,
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (
      !(await this.canOverrideLockedProtocol(actorRole, {
        tournamentId,
        actorUserId,
      }))
    ) {
      this.assertMatchMutable(match.status);
    }

    if (
      match.stage === MatchStage.PLAYOFF &&
      dto.homeScore === dto.awayScore &&
      !this.hasResolvedPenaltyScore(
        dto.events as { payload?: Record<string, unknown> }[] | undefined,
      )
    ) {
      throw new BadRequestException(
        'В матчах плей-офф ничья недопустима без решающей серии пенальти',
      );
    }
    this.validateScoreVsGoalEvents(dto);
    this.validateSubstitutionPlayerTimeline(dto);

    const updated = await this.runProtocolTransaction(matchId, dto, {
      tenantId: match.tenantId,
      previousStatus: match.status,
    });

    await this.recomputeTable(tournamentId);

    // GROUPS_* и MANUAL (несколько групп): после протокола пробуем обновить/создать плей-офф по таблицам групп.
    if (match.stage === MatchStage.GROUP) {
      try {
        await this.tournamentsService.generatePlayoff(tournamentId, {
          replaceExisting: true,
        });
      } catch {
        // If group standings aren't ready yet, or replace is not possible — just ignore.
      }
    }

    // Propagate winners from current knockout round to the next knockout round.
    // This is required for longer playoffs (e.g. 4 groups => QF => SF => FINAL/3rd).
    if (match.stage === MatchStage.PLAYOFF) {
      try {
        await this.syncNextPlayoffRound(tournamentId, match.roundNumber);
      } catch {
        // Ignore: if there is no next round or scores aren't ready.
      }
    }

    if (match.stage === MatchStage.PLAYOFF) {
      try {
        await this.syncFinalThirdFromSemifinals(tournamentId);
      } catch {
        // Ignore: final/third may not exist yet, or semifinal results aren't complete.
      }
    }

    await this.syncTournamentLifecycleAfterMatches(tournamentId);
    if (
      match.status !== MatchStatus.PLAYED &&
      match.status !== MatchStatus.FINISHED &&
      match.status !== MatchStatus.CANCELED &&
      (updated.status === MatchStatus.PLAYED ||
        updated.status === MatchStatus.FINISHED ||
        updated.status === MatchStatus.CANCELED)
    ) {
      void this.notifyProtocolPublishedById({ matchId }).catch(() => undefined);
    }
    return updated;
  }

  private async runProtocolTransaction(
    matchId: string,
    dto: UpdateProtocolDto,
    ctx: { tenantId: string; previousStatus: MatchStatus },
  ) {
    const nextStatus = dto.status ?? MatchStatus.PLAYED;
    const becameCanceled =
      nextStatus === MatchStatus.CANCELED &&
      ctx.previousStatus !== MatchStatus.CANCELED;

    if (becameCanceled) {
      if (!dto.scheduleChangeReasonId) {
        throw new BadRequestException(
          'При отмене матча укажите причину из справочника',
        );
      }
      await this.validateScheduleReason(
        ctx.tenantId,
        dto.scheduleChangeReasonId,
        'CANCEL',
      );
    }

    const eventRows =
      dto.events !== undefined
        ? await this.buildProtocolEventRows(ctx.tenantId, dto.events)
        : null;

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.MatchUncheckedUpdateInput = {
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        status: nextStatus,
      };

      if (becameCanceled) {
        if (dto.scheduleChangeReasonId !== undefined) {
          data.scheduleChangeReasonId = dto.scheduleChangeReasonId || null;
        }
        if (dto.scheduleChangeNote !== undefined) {
          data.scheduleChangeNote = dto.scheduleChangeNote?.trim()
            ? dto.scheduleChangeNote.trim()
            : null;
        }
      }

      const m = await tx.match.update({
        where: { id: matchId },
        data,
      });

      if (dto.events !== undefined) {
        await tx.matchEvent.deleteMany({ where: { matchId } });
        if (eventRows!.length) {
          await tx.matchEvent.createMany({
            data: eventRows!.map((row) => ({
              matchId,
              type: row.type,
              minute: row.minute,
              playerId: row.playerId,
              teamSide: row.teamSide,
              payload: row.payload,
              protocolEventTypeId: row.protocolEventTypeId,
            })),
          });
        }
      }

      return m;
    });
  }

  /** Матч без турнира: протокол без пересчёта таблицы и плей-офф. */
  async updateStandaloneProtocol(
    tenantId: string,
    matchId: string,
    actorRole: UserRole,
    dto: UpdateProtocolDto,
    actorUserId?: string,
  ) {
    if (!PROTOCOL_ROLES.includes(actorRole)) {
      throwInsufficientRole();
    }

    const match = await this.prisma.match.findFirst({
      where: { id: matchId, tenantId, tournamentId: null },
      select: { id: true, status: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (
      !(await this.canOverrideLockedProtocol(actorRole, {
        tournamentId: null,
        actorUserId,
      }))
    ) {
      this.assertMatchMutable(match.status);
    }
    this.validateScoreVsGoalEvents(dto);
    this.validateSubstitutionPlayerTimeline(dto);

    return this.runProtocolTransaction(matchId, dto, {
      tenantId,
      previousStatus: match.status,
    });
  }

  async createStandaloneMatch(
    tenantId: string,
    actorRole: UserRole,
    dto: {
      homeTeamId: string;
      awayTeamId: string;
      startTime: string;
      stadiumId?: string;
    },
  ) {
    if (!PROTOCOL_ROLES.includes(actorRole)) {
      throwInsufficientRole();
    }

    if (dto.homeTeamId === dto.awayTeamId) {
      throw new BadRequestException('Выберите две разные команды');
    }

    const [home, away] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: dto.homeTeamId, tenantId },
        select: { id: true },
      }),
      this.prisma.team.findFirst({
        where: { id: dto.awayTeamId, tenantId },
        select: { id: true },
      }),
    ]);
    if (!home || !away) {
      throw new BadRequestException(
        'Обе команды должны принадлежать вашему арендатору',
      );
    }

    const start = new Date(dto.startTime);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('Некорректная дата/время начала');
    }

    const stadiumIdForCreate =
      dto.stadiumId && String(dto.stadiumId).trim()
        ? String(dto.stadiumId).trim()
        : null;
    await this.assertMatchStadiumAllowed(
      this.prisma,
      tenantId,
      null,
      stadiumIdForCreate,
    );

    const duplicateStandalone = await this.prisma.match.findFirst({
      where: {
        tenantId,
        tournamentId: null,
        homeTeamId: dto.homeTeamId,
        awayTeamId: dto.awayTeamId,
        startTime: start,
      },
      select: { id: true },
    });
    if (duplicateStandalone) {
      throw new ConflictException({
        message:
          'Свободный матч с такими командами и временем начала уже существует',
        code: ApiErrorCode.MATCH_DUPLICATE,
      });
    }

    const created = await this.prisma.match.create({
      data: {
        tenantId,
        tournamentId: null,
        homeTeamId: dto.homeTeamId,
        awayTeamId: dto.awayTeamId,
        startTime: start,
        stage: MatchStage.GROUP,
        roundNumber: 1,
        groupId: null,
        playoffRound: null,
        stadiumId: stadiumIdForCreate,
      },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        stadium: {
          select: { id: true, name: true, city: true, address: true },
        },
      },
    });
    return this.withScheduleWarnings(created);
  }

  async listStandaloneMatches(
    tenantId: string,
    actorRole: UserRole,
    query?: ListStandaloneMatchesQueryDto,
  ) {
    if (!PROTOCOL_ROLES.includes(actorRole)) {
      throwInsufficientRole();
    }

    const where: Prisma.MatchWhereInput = {
      tenantId,
      tournamentId: null,
    };
    if (query?.teamId) {
      where.OR = [{ homeTeamId: query.teamId }, { awayTeamId: query.teamId }];
    }
    if (query?.status) {
      where.status = query.status;
    } else if (query?.includeLocked === false) {
      where.status = {
        notIn: [MatchStatus.FINISHED, MatchStatus.PLAYED, MatchStatus.CANCELED],
      };
    }

    return this.prisma.match.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        stadium: {
          select: { id: true, name: true, city: true, address: true },
        },
        scheduleChangeReason: {
          select: { id: true, name: true, code: true, scope: true },
        },
        events: MATCH_EVENTS_API,
      },
    });
  }

  async listTenantMatches(
    tenantId: string,
    actorRole: UserRole,
    actorUserId: string,
    query: ListTenantMatchesQueryDto,
  ) {
    if (!PROTOCOL_ROLES.includes(actorRole)) {
      throwInsufficientRole();
    }

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.MatchWhereInput = {
      tenantId,
      tournamentId: { not: null },
    };

    if (actorRole === UserRole.MODERATOR) {
      const memberships = await this.prisma.tournamentMember.findMany({
        where: {
          userId: actorUserId,
          role: TournamentMemberRole.MODERATOR,
          tournament: { tenantId },
        },
        select: { tournamentId: true },
      });
      const allowedTournamentIds = [
        ...new Set(memberships.map((m) => m.tournamentId).filter(Boolean)),
      ] as string[];
      if (!allowedTournamentIds.length) {
        return { items: [], total: 0, page, pageSize };
      }
      if (query.tournamentId) {
        if (!allowedTournamentIds.includes(query.tournamentId)) {
          return { items: [], total: 0, page, pageSize };
        }
        where.tournamentId = query.tournamentId;
      } else {
        where.tournamentId = { in: allowedTournamentIds };
      }
    } else if (query.tournamentId) {
      where.tournamentId = query.tournamentId;
    }
    if (query.teamId) {
      where.OR = [{ homeTeamId: query.teamId }, { awayTeamId: query.teamId }];
    }
    if (query.status) {
      where.status = query.status;
    } else if (query.includeLocked === false) {
      where.status = {
        notIn: [MatchStatus.FINISHED, MatchStatus.PLAYED, MatchStatus.CANCELED],
      };
    }

    if (query.dateFrom || query.dateTo) {
      const st: Prisma.DateTimeFilter = {};
      if (query.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(query.dateFrom)) {
        const [y, m, d] = query.dateFrom.split('-').map(Number);
        st.gte = new Date(y, m - 1, d, 0, 0, 0, 0);
      }
      if (query.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(query.dateTo)) {
        const [y, m, d] = query.dateTo.split('-').map(Number);
        st.lte = new Date(y, m - 1, d, 23, 59, 59, 999);
      }
      if (Object.keys(st).length) where.startTime = st;
    }

    if (actorRole === UserRole.TOURNAMENT_ADMIN) {
      where.tournament = {
        is: {
          tenantId,
          createdByUserId: actorUserId,
        },
      };
    }

    const include = {
      tournament: {
        select: {
          id: true,
          name: true,
          slug: true,
          format: true,
          calendarColor: true,
        },
      },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      stadium: {
        select: { id: true, name: true, city: true, address: true },
      },
      scheduleChangeReason: {
        select: { id: true, name: true, code: true, scope: true },
      },
      events: MATCH_EVENTS_API,
    } satisfies Prisma.MatchInclude;

    // For strict UI consistency, optionally filter undetermined playoff matches on the backend.
    if (query.excludeUndeterminedPlayoff !== false) {
      const allItems = await this.prisma.match.findMany({
        where,
        orderBy: { startTime: 'asc' },
        include,
      });

      const needsSemiCheck = allItems
        .filter((m) => m.stage === MatchStage.PLAYOFF)
        .filter(
          (m) =>
            m.playoffRound === PlayoffRound.FINAL ||
            m.playoffRound === PlayoffRound.THIRD_PLACE,
        )
        .map((m) => `${m.tournamentId}:${m.roundNumber ?? 0}`);

      const semiReadyMap = new Map<string, boolean>();
      const uniqueSemiKeys = Array.from(new Set(needsSemiCheck));
      await Promise.all(
        uniqueSemiKeys.map(async (key) => {
          const [tournamentId, roundNumberRaw] = key.split(':');
          const roundNumber = Number(roundNumberRaw);
          if (
            !tournamentId ||
            !Number.isFinite(roundNumber) ||
            roundNumber <= 0
          ) {
            semiReadyMap.set(key, false);
            return;
          }
          const semis = await this.prisma.match.findMany({
            where: {
              tournamentId,
              stage: MatchStage.PLAYOFF,
              playoffRound: PlayoffRound.SEMIFINAL,
              roundNumber: roundNumber - 1,
            },
            select: {
              status: true,
              homeScore: true,
              awayScore: true,
            },
            orderBy: { startTime: 'asc' },
          });
          const ready =
            semis.length >= 2 &&
            semis.slice(0, 2).every((m) => this.isCompletedWithScore(m));
          semiReadyMap.set(key, ready);
        }),
      );

      const filtered = allItems.filter((m) => {
        if (m.stage !== MatchStage.PLAYOFF) return true;

        if (
          this.isUnknownPlayoffTeamName(m.homeTeam.name) ||
          this.isUnknownPlayoffTeamName(m.awayTeam.name)
        ) {
          return false;
        }

        if (
          m.playoffRound === PlayoffRound.FINAL ||
          m.playoffRound === PlayoffRound.THIRD_PLACE
        ) {
          const key = `${m.tournamentId}:${m.roundNumber ?? 0}`;
          return semiReadyMap.get(key) === true;
        }

        return true;
      });

      const items = filtered.slice(skip, skip + pageSize);
      return { items, total: filtered.length, page, pageSize };
    }

    const [total, items] = await Promise.all([
      this.prisma.match.count({ where }),
      this.prisma.match.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { startTime: 'asc' },
        include,
      }),
    ]);

    return { items, total, page, pageSize };
  }

  async updateStandaloneMatch(
    tenantId: string,
    matchId: string,
    actorRole: UserRole,
    data: {
      startTime?: Date;
      homeTeamId?: string;
      awayTeamId?: string;
      scheduleChangeReasonId?: string;
      scheduleChangeNote?: string;
      stadiumId?: string | null;
    },
  ) {
    if (!PROTOCOL_ROLES.includes(actorRole)) {
      throwInsufficientRole();
    }

    const match = await this.prisma.match.findFirst({
      where: { id: matchId, tenantId, tournamentId: null },
      select: {
        id: true,
        homeTeamId: true,
        awayTeamId: true,
        status: true,
        startTime: true,
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    this.assertMatchMutable(match.status);

    const startTimeChanged =
      data.startTime !== undefined &&
      data.startTime.getTime() !== match.startTime.getTime();
    if (startTimeChanged) {
      const postponeReasonId = data.scheduleChangeReasonId?.trim();
      if (postponeReasonId) {
        await this.validateScheduleReason(
          tenantId,
          postponeReasonId,
          'POSTPONE',
        );
      }
    }

    const schedulePatch: {
      scheduleChangeReasonId?: string | null;
      scheduleChangeNote?: string | null;
    } = {};
    if (startTimeChanged) {
      if (data.scheduleChangeReasonId !== undefined) {
        schedulePatch.scheduleChangeReasonId =
          data.scheduleChangeReasonId || null;
      }
      if (data.scheduleChangeNote !== undefined) {
        schedulePatch.scheduleChangeNote = data.scheduleChangeNote?.trim()
          ? data.scheduleChangeNote.trim()
          : null;
      }
    }

    const wantsTeamChange =
      data.homeTeamId !== undefined || data.awayTeamId !== undefined;

    let nextHome = match.homeTeamId;
    let nextAway = match.awayTeamId;
    if (wantsTeamChange) {
      nextHome = data.homeTeamId ?? match.homeTeamId;
      nextAway = data.awayTeamId ?? match.awayTeamId;
      if (nextHome === nextAway) {
        throw new BadRequestException('Выберите две разные команды');
      }
      const teams = await this.prisma.team.findMany({
        where: { id: { in: [nextHome, nextAway] }, tenantId },
        select: { id: true },
      });
      if (teams.length !== 2) {
        throw new BadRequestException(
          'Обе команды должны принадлежать вашему арендатору',
        );
      }
    }

    const teamsChanged =
      nextHome !== match.homeTeamId || nextAway !== match.awayTeamId;

    if (data.stadiumId !== undefined) {
      await this.assertMatchStadiumAllowed(
        this.prisma,
        tenantId,
        null,
        data.stadiumId && String(data.stadiumId).trim()
          ? String(data.stadiumId).trim()
          : null,
      );
    }

    const stadiumPatch =
      data.stadiumId !== undefined
        ? {
            stadiumId:
              data.stadiumId && String(data.stadiumId).trim()
                ? String(data.stadiumId).trim()
                : null,
          }
        : {};

    if (!teamsChanged) {
      if (
        data.startTime === undefined &&
        Object.keys(schedulePatch).length === 0 &&
        Object.keys(stadiumPatch).length === 0
      ) {
        return this.withScheduleWarnings(
          await this.prisma.match.findUniqueOrThrow({
            where: { id: matchId },
            include: MATCH_DETAIL_INCLUDE,
          }),
        );
      }
      return this.withScheduleWarnings(
        await this.prisma.match.update({
          where: { id: matchId },
          data: {
            ...(data.startTime !== undefined
              ? { startTime: data.startTime }
              : {}),
            ...schedulePatch,
            ...stadiumPatch,
          },
          include: MATCH_DETAIL_INCLUDE,
        }),
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.matchEvent.deleteMany({ where: { matchId } });
      await tx.match.update({
        where: { id: matchId },
        data: {
          ...(data.startTime !== undefined
            ? { startTime: data.startTime }
            : {}),
          ...schedulePatch,
          ...stadiumPatch,
          homeTeamId: nextHome,
          awayTeamId: nextAway,
          homeScore: null,
          awayScore: null,
          status: MatchStatus.SCHEDULED,
        },
      });
    });

    return this.withScheduleWarnings(
      await this.prisma.match.findUniqueOrThrow({
        where: { id: matchId },
        include: MATCH_DETAIL_INCLUDE,
      }),
    );
  }

  async deleteStandaloneMatch(
    tenantId: string,
    matchId: string,
    actorRole: UserRole,
  ) {
    if (!PROTOCOL_ROLES.includes(actorRole)) {
      throwInsufficientRole();
    }

    const existing = await this.prisma.match.findFirst({
      where: { id: matchId, tenantId, tournamentId: null },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Match not found');
    this.assertMatchMutable(existing.status);

    await this.prisma.$transaction(async (tx) => {
      await tx.matchEvent.deleteMany({ where: { matchId } });
      await tx.match.delete({ where: { id: matchId } });
    });

    return { success: true };
  }

  async attachMatchToTournament(
    tenantId: string,
    matchId: string,
    user: JwtPayload,
    tournamentId: string,
  ) {
    if (!PROTOCOL_ROLES.includes(user.role)) {
      throwInsufficientRole();
    }

    const match = await this.prisma.match.findFirst({
      where: { id: matchId, tenantId, tournamentId: null },
      select: {
        id: true,
        homeTeamId: true,
        awayTeamId: true,
        status: true,
        stage: true,
        groupId: true,
        stadiumId: true,
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    this.assertMatchMutable(match.status);

    const tournament = await this.prisma.tournament.findFirst({
      where: { id: tournamentId, tenantId },
      select: { id: true, format: true, groupCount: true },
    });
    if (!tournament) throwTournamentNotFound();

    await assertTournamentStaffCanManage(this.prisma, tournamentId, user);

    if (tournament.format !== TournamentFormat.MANUAL) {
      throw new BadRequestException(
        'Прикрепление доступно только к турнирам с ручным расписанием (MANUAL), без автогенерации календаря',
      );
    }

    const inTournament = await this.prisma.tournamentTeam.findMany({
      where: { tournamentId },
      select: { teamId: true },
    });
    const allowed = new Set(inTournament.map((x) => x.teamId));
    if (!allowed.has(match.homeTeamId) || !allowed.has(match.awayTeamId)) {
      throw new BadRequestException(
        'Обе команды матча должны быть в составе выбранного турнира (вкладка «Составы» турнира). Сначала добавьте команды в турнир.',
      );
    }

    const attachData: { tournamentId: string; groupId?: string | null } = {
      tournamentId,
    };

    const gc = tournament.groupCount ?? 1;
    if (gc > 1 && match.stage === MatchStage.GROUP) {
      if (match.groupId) {
        await this.assertManualGroupStageTeamsMatchGroup(
          tournamentId,
          tournament,
          {
            stage: MatchStage.GROUP,
            groupId: match.groupId,
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
          },
        );
      } else {
        const tts = await this.prisma.tournamentTeam.findMany({
          where: {
            tournamentId,
            teamId: { in: [match.homeTeamId, match.awayTeamId] },
          },
          select: { teamId: true, groupId: true },
        });
        const gHome = tts.find((x) => x.teamId === match.homeTeamId)?.groupId;
        const gAway = tts.find((x) => x.teamId === match.awayTeamId)?.groupId;
        if (!gHome || !gAway) {
          throw new BadRequestException(
            'Для турнира с несколькими группами обе команды должны быть не только в составе, но и распределены по группам (вкладка «Составы»).',
          );
        }
        if (gHome !== gAway) {
          throw new BadRequestException(
            'Команды состоят в разных группах — такой матч нельзя учесть как один групповой этап. Поменяйте составы или создайте матч внутри турнира после расстановки по группам.',
          );
        }
        attachData.groupId = gHome;
      }
    }

    if (match.stadiumId) {
      await this.assertMatchStadiumAllowed(
        this.prisma,
        tenantId,
        tournamentId,
        match.stadiumId,
      );
    }

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: attachData,
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        stadium: {
          select: { id: true, name: true, city: true, address: true },
        },
        events: {
          select: {
            id: true,
            type: true,
            minute: true,
            playerId: true,
            teamSide: true,
            payload: true,
          },
        },
      },
    });

    await this.recomputeTable(tournamentId);
    return updated;
  }

  /** Убрать матч из турнира MANUAL → в «свободные»; пересчёт таблицы турнира. */
  async detachMatchFromTournament(
    tenantId: string,
    matchId: string,
    user: JwtPayload,
  ) {
    if (!PROTOCOL_ROLES.includes(user.role)) {
      throwInsufficientRole();
    }

    const match = await this.prisma.match.findFirst({
      where: { id: matchId, tenantId },
      select: { id: true, tournamentId: true, status: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    this.assertMatchMutable(match.status);
    if (!match.tournamentId) {
      throw new BadRequestException('Матч уже не привязан к турниру');
    }

    const tournament = await this.prisma.tournament.findFirst({
      where: { id: match.tournamentId, tenantId },
      select: { id: true, format: true },
    });
    if (!tournament) throwTournamentNotFound();

    await assertTournamentStaffCanManage(this.prisma, tournament.id, user);

    if (tournament.format !== TournamentFormat.MANUAL) {
      throw new BadRequestException(
        'Открепление доступно только для турниров с ручным расписанием (MANUAL)',
      );
    }

    const previousTournamentId = match.tournamentId;

    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        tournamentId: null,
        groupId: null,
      },
    });

    await this.recomputeTable(previousTournamentId);

    return this.prisma.match.findUniqueOrThrow({
      where: { id: matchId },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        events: {
          select: {
            id: true,
            type: true,
            minute: true,
            playerId: true,
            teamSide: true,
            payload: true,
          },
        },
      },
    });
  }

  private async syncNextPlayoffRound(
    tournamentId: string,
    currentRoundNumber: number | null,
  ) {
    if (currentRoundNumber === null || currentRoundNumber === undefined) return;

    const current = await this.prisma.match.findMany({
      where: {
        tournamentId,
        stage: MatchStage.PLAYOFF,
        roundNumber: currentRoundNumber,
      },
      select: {
        id: true,
        startTime: true,
        homeTeamId: true,
        awayTeamId: true,
        status: true,
        homeScore: true,
        awayScore: true,
        events: { select: { payload: true } },
      },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    });

    if (!current.length) return;

    const nextMatches = await this.prisma.match.findMany({
      where: {
        tournamentId,
        stage: MatchStage.PLAYOFF,
        roundNumber: currentRoundNumber + 1,
      },
      select: {
        id: true,
        startTime: true,
        homeScore: true,
        awayScore: true,
      },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    });

    if (!nextMatches.length) return;

    const hasResult = (m: (typeof current)[number]) =>
      (m.status === MatchStatus.PLAYED || m.status === MatchStatus.FINISHED) &&
      m.homeScore !== null &&
      m.awayScore !== null;

    const updates: Prisma.PrismaPromise<any>[] = [];
    for (let i = 0; i < nextMatches.length; i++) {
      const left = current[i * 2];
      const right = current[i * 2 + 1];
      const next = nextMatches[i];
      if (!left || !right) continue;
      if (!hasResult(left) || !hasResult(right)) continue;

      if (next.homeScore !== null || next.awayScore !== null) continue; // don't overwrite after score entry

      const leftResolved = this.resolveWinnerLoserTeams(left);
      const rightResolved = this.resolveWinnerLoserTeams(right);
      if (!leftResolved || !rightResolved) continue;

      updates.push(
        this.prisma.match.update({
          where: { id: next.id },
          data: {
            homeTeamId: leftResolved.winnerTeamId,
            awayTeamId: rightResolved.winnerTeamId,
          },
        }),
      );
    }

    if (updates.length) {
      await this.prisma.$transaction(updates);
    }
  }

  private async syncFinalThirdFromSemifinals(tournamentId: string) {
    const [final, third] = await Promise.all([
      this.prisma.match.findFirst({
        where: {
          tournamentId,
          stage: MatchStage.PLAYOFF,
          playoffRound: PlayoffRound.FINAL,
        },
        select: {
          id: true,
          roundNumber: true,
          startTime: true,
          homeScore: true,
          awayScore: true,
        },
        orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.match.findFirst({
        where: {
          tournamentId,
          stage: MatchStage.PLAYOFF,
          playoffRound: PlayoffRound.THIRD_PLACE,
        },
        select: {
          id: true,
          roundNumber: true,
          startTime: true,
          homeScore: true,
          awayScore: true,
        },
        orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
      }),
    ]);

    // If finals don't exist yet, nothing to sync.
    if (!final && !third) return;

    // Pick the semifinal round that feeds the final/third.
    const targetSemiRound =
      final?.roundNumber !== null && final?.roundNumber !== undefined
        ? final.roundNumber - 1
        : third?.roundNumber !== null && third?.roundNumber !== undefined
          ? third.roundNumber - 1
          : null;

    const semis = await this.prisma.match.findMany({
      where: {
        tournamentId,
        stage: MatchStage.PLAYOFF,
        playoffRound: PlayoffRound.SEMIFINAL,
        ...(targetSemiRound !== null ? { roundNumber: targetSemiRound } : {}),
      },
      select: {
        id: true,
        startTime: true,
        roundNumber: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        status: true,
        events: { select: { payload: true } },
      },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    });

    if (semis.length < 2) {
      // Fallback: if roundNumber wasn't set as expected, use last two semis by time.
      if (targetSemiRound !== null) {
        const allSemis = await this.prisma.match.findMany({
          where: {
            tournamentId,
            stage: MatchStage.PLAYOFF,
            playoffRound: PlayoffRound.SEMIFINAL,
          },
          select: {
            id: true,
            startTime: true,
            homeTeamId: true,
            awayTeamId: true,
            homeScore: true,
            awayScore: true,
            status: true,
            events: { select: { payload: true } },
          },
          orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
          take: 2,
        });
        if (allSemis.length < 2) return;

        const semi1 = allSemis[0];

        const semi2 = allSemis[1];
        const semiHasResult = (m: typeof semi1) =>
          (m.status === MatchStatus.PLAYED ||
            m.status === MatchStatus.FINISHED) &&
          m.homeScore !== null &&
          m.awayScore !== null;
        if (!semiHasResult(semi1) || !semiHasResult(semi2)) return;

        const r1 = this.resolveWinnerLoserTeams(semi1);
        const r2 = this.resolveWinnerLoserTeams(semi2);
        if (!r1 || !r2) return;

        if (final && final.homeScore === null && final.awayScore === null) {
          await this.prisma.match.update({
            where: { id: final.id },
            data: { homeTeamId: r1.winnerTeamId, awayTeamId: r2.winnerTeamId },
          });
        }
        if (third && third.homeScore === null && third.awayScore === null) {
          await this.prisma.match.update({
            where: { id: third.id },
            data: { homeTeamId: r1.loserTeamId, awayTeamId: r2.loserTeamId },
          });
        }
        return;
      }
      return;
    }

    const semi1 = semis[0];
    const semi2 = semis[1];

    const semiHasResult = (m: typeof semi1) =>
      (m.status === MatchStatus.PLAYED || m.status === MatchStatus.FINISHED) &&
      m.homeScore !== null &&
      m.awayScore !== null;

    if (!semiHasResult(semi1) || !semiHasResult(semi2)) return;

    const r1 = this.resolveWinnerLoserTeams(semi1);
    const r2 = this.resolveWinnerLoserTeams(semi2);
    if (!r1 || !r2) return;

    if (final && final.homeScore === null && final.awayScore === null) {
      await this.prisma.match.update({
        where: { id: final.id },
        data: { homeTeamId: r1.winnerTeamId, awayTeamId: r2.winnerTeamId },
      });
    }

    if (third && third.homeScore === null && third.awayScore === null) {
      await this.prisma.match.update({
        where: { id: third.id },
        data: { homeTeamId: r1.loserTeamId, awayTeamId: r2.loserTeamId },
      });
    }
  }

  private async recomputeTable(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { tournamentTeams: { select: { teamId: true } } },
    });
    if (!tournament) return;

    const teamIds = tournament.tournamentTeams.map((t) => t.teamId);
    if (!teamIds.length) {
      await this.prisma.tournamentTableRow.deleteMany({
        where: { tournamentId },
      });
      return;
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
  }
}

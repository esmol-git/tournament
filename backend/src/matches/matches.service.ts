import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { TournamentsService } from '../tournaments/tournaments.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
  ) {}

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
      },
    });

    await this.recomputeTable(tournamentId);
    await this.syncTournamentLifecycleAfterMatches(tournamentId);
    return created;
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

    if (!teamsChanged) {
      if (tournament.format === TournamentFormat.MANUAL) {
        const patch: Prisma.MatchUncheckedUpdateInput = {};
        if (data.startTime !== undefined) patch.startTime = data.startTime;
        if (data.roundNumber !== undefined)
          patch.roundNumber = data.roundNumber;
        if (data.groupId !== undefined) patch.groupId = data.groupId;
        Object.assign(patch, schedulePatch, stadiumPatch);
        if (Object.keys(patch).length === 0) {
          return this.prisma.match.findUniqueOrThrow({
            where: { id: matchId },
          });
        }
        const updated = await this.prisma.match.update({
          where: { id: matchId },
          data: patch,
        });
        await this.recomputeTable(tournamentId);
        await this.syncTournamentLifecycleAfterMatches(tournamentId);
        return updated;
      }
      if (
        data.startTime === undefined &&
        Object.keys(schedulePatch).length === 0 &&
        Object.keys(stadiumPatch).length === 0
      ) {
        return this.prisma.match.findUniqueOrThrow({ where: { id: matchId } });
      }
      return this.prisma.match.update({
        where: { id: matchId },
        data: {
          ...(data.startTime !== undefined
            ? { startTime: data.startTime }
            : {}),
          ...schedulePatch,
          ...stadiumPatch,
        },
      });
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
    return this.prisma.match.findUniqueOrThrow({ where: { id: matchId } });
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

    return this.prisma.match.create({
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
    if (query.tournamentId) {
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
        return this.prisma.match.findUniqueOrThrow({
          where: { id: matchId },
          include: MATCH_DETAIL_INCLUDE,
        });
      }
      return this.prisma.match.update({
        where: { id: matchId },
        data: {
          ...(data.startTime !== undefined
            ? { startTime: data.startTime }
            : {}),
          ...schedulePatch,
          ...stadiumPatch,
        },
        include: MATCH_DETAIL_INCLUDE,
      });
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

    return this.prisma.match.findUniqueOrThrow({
      where: { id: matchId },
      include: MATCH_DETAIL_INCLUDE,
    });
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

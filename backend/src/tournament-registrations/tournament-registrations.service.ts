import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TournamentRegistrationStatus,
  TournamentStatus,
  UserRole,
} from '@prisma/client';
import { JwtPayload } from '../auth/jwt.strategy';
import { assertTournamentStaffCanManage } from '../auth/tournament-staff-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { CreateTournamentRegistrationDto } from './dto/create-tournament-registration.dto';
import { ReviewTournamentRegistrationDto } from './dto/review-tournament-registration.dto';
import { deliverTenantTelegramNotification } from '../notifications/tenant-telegram-delivery.util';

const REGISTRATION_INCLUDE = {
  team: { select: { id: true, name: true, slug: true, logoUrl: true } },
  submittedBy: {
    select: { id: true, name: true, lastName: true, username: true },
  },
  reviewedBy: {
    select: { id: true, name: true, lastName: true, username: true },
  },
} as const;

@Injectable()
export class TournamentRegistrationsService {
  private readonly MAX_TEAMS_PER_TOURNAMENT = 512;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly config: ConfigService,
  ) {}

  private mapRow(row: {
    id: string
    tournamentId: string
    teamId: string
    status: TournamentRegistrationStatus
    message: string | null
    adminNote: string | null
    attachmentUrl: string | null
    attachmentFileName: string | null
    submittedAt: Date | null
    reviewedAt: Date | null
    createdAt: Date
    updatedAt: Date
    team: { id: string; name: string; slug: string | null; logoUrl: string | null }
    submittedBy: {
      id: string
      name: string
      lastName: string
      username: string
    } | null
    reviewedBy: {
      id: string
      name: string
      lastName: string
      username: string
    } | null
  }) {
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      teamId: row.teamId,
      status: row.status,
      message: row.message,
      adminNote: row.adminNote,
      attachmentUrl: row.attachmentUrl,
      attachmentFileName: row.attachmentFileName,
      submittedAt: row.submittedAt,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      team: row.team,
      submittedBy: row.submittedBy,
      reviewedBy: row.reviewedBy,
    };
  }

  private async tournamentCapacity(tournamentId: string, maxTeams: number | null) {
    const current = await this.prisma.tournamentTeam.count({
      where: { tournamentId },
    });
    const cap = maxTeams ?? this.MAX_TEAMS_PER_TOURNAMENT;
    return { current, cap, full: current >= cap };
  }

  private async loadTournamentForRegistration(tournamentId: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        name: true,
        tenantId: true,
        status: true,
        ageGroupId: true,
        registrationEnabled: true,
        registrationOpensAt: true,
        registrationClosesAt: true,
        maxTeams: true,
      },
    });
    if (!t) throw new NotFoundException('Турнир не найден');
    return t;
  }

  async listForTournament(tournamentId: string, user: JwtPayload) {
    const tournament = await this.loadTournamentForRegistration(tournamentId);
    if (user.tenantId !== tournament.tenantId && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Нет доступа к ресурсу другой организации');
    }

    const isStaff =
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.TENANT_ADMIN ||
      user.role === UserRole.TOURNAMENT_ADMIN;

    if (!isStaff) {
      throw new ForbiddenException('Недостаточно прав');
    }

    const rows = await this.prisma.tournamentRegistration.findMany({
      where: { tournamentId },
      orderBy: [{ status: 'asc' }, { submittedAt: 'desc' }, { createdAt: 'desc' }],
      include: REGISTRATION_INCLUDE,
    });

    return {
      items: rows.map((r) => this.mapRow(r)),
      total: rows.length,
    };
  }

  private async notifyRegistrationSubmitted(
    row: ReturnType<typeof this.mapRow>,
    tournament: { id: string; name: string; tenantId: string },
  ) {
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    if (!botToken) return;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tournament.tenantId },
      select: {
        telegramNotifyChatId: true,
        telegramNotifyOnRegistrationSubmitted: true,
      },
    });
    if (!tenant?.telegramNotifyOnRegistrationSubmitted) return;

    await deliverTenantTelegramNotification({
      prisma: this.prisma,
      botToken,
      tenantId: tournament.tenantId,
      kind: 'registration_submitted',
      tournamentId: tournament.id,
      enabled: tenant.telegramNotifyOnRegistrationSubmitted,
      chatId: tenant.telegramNotifyChatId,
      lines: [
        'Новая заявка на турнир',
        `Турнир: ${tournament.name}`,
        `Команда: ${row.team.name}`,
        row.message ? `Комментарий: ${row.message}` : '',
      ].filter(Boolean),
    });
  }

  private isOrganizerStaff(user: JwtPayload): boolean {
    return (
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.TENANT_ADMIN ||
      user.role === UserRole.TOURNAMENT_ADMIN
    );
  }

  private assertRegistrationWindow(tournament: {
    registrationOpensAt: Date | null
    registrationClosesAt: Date | null
  }) {
    const now = new Date();
    if (
      tournament.registrationOpensAt &&
      now.getTime() < tournament.registrationOpensAt.getTime()
    ) {
      throw new BadRequestException('Приём заявок ещё не открыт');
    }
    if (
      tournament.registrationClosesAt &&
      now.getTime() > tournament.registrationClosesAt.getTime()
    ) {
      throw new BadRequestException('Приём заявок завершён');
    }
  }

  async create(
    tournamentId: string,
    dto: CreateTournamentRegistrationDto,
    user: JwtPayload,
  ) {
    const tournament = await this.loadTournamentForRegistration(tournamentId);
    if (user.tenantId !== tournament.tenantId) {
      throw new ForbiddenException('Нет доступа к ресурсу другой организации');
    }
    if (tournament.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException(
        'Заявки принимаются только для турниров в статусе «Черновик»',
      );
    }

    const organizerRecords = this.isOrganizerStaff(user);
    const teamId = dto.teamId.trim();

    if (!organizerRecords) {
      throw new ForbiddenException('Недостаточно прав');
    }
    if (user.role === UserRole.TOURNAMENT_ADMIN) {
      await assertTournamentStaffCanManage(
        this.prisma,
        tournamentId,
        user,
      );
    }

    this.assertRegistrationWindow(tournament);

    const team = await this.prisma.team.findFirst({
      where: { id: teamId, tenantId: tournament.tenantId },
      select: { id: true, ageGroupId: true },
    });
    if (!team) throw new BadRequestException('Команда не найдена');

    if (tournament.ageGroupId && team.ageGroupId !== tournament.ageGroupId) {
      throw new BadRequestException(
        'Возрастная группа команды не совпадает с турниром',
      );
    }

    const existingTeam = await this.prisma.tournamentTeam.findUnique({
      where: { tournamentId_teamId: { tournamentId, teamId } },
    });
    if (existingTeam) {
      throw new BadRequestException('Команда уже добавлена в турнир');
    }

    const now = new Date();
    const submittedFields = {
      status: TournamentRegistrationStatus.SUBMITTED,
      submittedAt: now,
      submittedByUserId: user.sub,
      adminNote: null,
      reviewedAt: null,
      reviewedByUserId: null,
    };

    const attachmentUrl = dto.attachmentUrl?.trim() || null;
    const attachmentFileName = dto.attachmentFileName?.trim() || null;

    const row = await this.prisma.tournamentRegistration.upsert({
      where: { tournamentId_teamId: { tournamentId, teamId } },
      create: {
        tenantId: tournament.tenantId,
        tournamentId,
        teamId,
        message: dto.message?.trim() || null,
        attachmentUrl,
        attachmentFileName,
        ...submittedFields,
      },
      update: {
        message: dto.message?.trim() || null,
        attachmentUrl,
        attachmentFileName,
        ...submittedFields,
      },
      include: REGISTRATION_INCLUDE,
    });

    const mapped = this.mapRow(row);
    if (row.status === TournamentRegistrationStatus.SUBMITTED) {
      void this.notifyRegistrationSubmitted(mapped, tournament).catch(
        () => undefined,
      );
    }
    return mapped;
  }

  async submit(registrationId: string, tournamentId: string, user: JwtPayload) {
    const reg = await this.prisma.tournamentRegistration.findFirst({
      where: { id: registrationId, tournamentId },
      include: { tournament: true },
    });
    if (!reg) throw new NotFoundException('Заявка не найдена');

    if (!this.isOrganizerStaff(user)) {
      throw new ForbiddenException('Недостаточно прав');
    }
    if (user.role === UserRole.TOURNAMENT_ADMIN) {
      await assertTournamentStaffCanManage(this.prisma, tournamentId, user);
    }

    const tournament = await this.loadTournamentForRegistration(tournamentId);
    this.assertRegistrationWindow(tournament);

    if (
      reg.status !== TournamentRegistrationStatus.DRAFT &&
      reg.status !== TournamentRegistrationStatus.WAITLIST
    ) {
      throw new BadRequestException('Заявку нельзя отправить в текущем статусе');
    }

    const updated = await this.prisma.tournamentRegistration.update({
      where: { id: reg.id },
      data: {
        status: TournamentRegistrationStatus.SUBMITTED,
        submittedAt: new Date(),
        submittedByUserId: user.sub,
        adminNote: null,
        reviewedAt: null,
        reviewedByUserId: null,
      },
      include: REGISTRATION_INCLUDE,
    });
    const mapped = this.mapRow(updated);
    void this.notifyRegistrationSubmitted(mapped, reg.tournament).catch(
      () => undefined,
    );
    return mapped;
  }

  async withdraw(registrationId: string, tournamentId: string, user: JwtPayload) {
    const reg = await this.prisma.tournamentRegistration.findFirst({
      where: { id: registrationId, tournamentId },
    });
    if (!reg) throw new NotFoundException('Заявка не найдена');

    await assertTournamentStaffCanManage(this.prisma, tournamentId, user);

    if (reg.status === TournamentRegistrationStatus.APPROVED) {
      throw new BadRequestException(
        'Одобренную заявку нельзя отозвать — удалите команду из турнира вручную',
      );
    }

    const updated = await this.prisma.tournamentRegistration.update({
      where: { id: reg.id },
      data: { status: TournamentRegistrationStatus.WITHDRAWN },
      include: REGISTRATION_INCLUDE,
    });
    return this.mapRow(updated);
  }

  async review(
    registrationId: string,
    tournamentId: string,
    dto: ReviewTournamentRegistrationDto,
    user: JwtPayload,
  ) {
    await assertTournamentStaffCanManage(this.prisma, tournamentId, user);

    const reg = await this.prisma.tournamentRegistration.findFirst({
      where: { id: registrationId, tournamentId },
      include: { tournament: true },
    });
    if (!reg) throw new NotFoundException('Заявка не найдена');

    if (
      reg.status !== TournamentRegistrationStatus.SUBMITTED &&
      reg.status !== TournamentRegistrationStatus.WAITLIST
    ) {
      throw new BadRequestException('Можно рассмотреть только отправленную заявку');
    }

    if (dto.status === TournamentRegistrationStatus.APPROVED) {
      const { full } = await this.tournamentCapacity(
        tournamentId,
        reg.tournament.maxTeams,
      );
      if (full) {
        throw new BadRequestException(
          'Лимит команд в турнире исчерпан — отправьте заявку в лист ожидания',
        );
      }

      await this.tournamentsService.addTeam(tournamentId, reg.teamId);

      const updated = await this.prisma.tournamentRegistration.update({
        where: { id: reg.id },
        data: {
          status: TournamentRegistrationStatus.APPROVED,
          adminNote: dto.adminNote?.trim() || null,
          reviewedAt: new Date(),
          reviewedByUserId: user.sub,
        },
        include: REGISTRATION_INCLUDE,
      });
      return this.mapRow(updated);
    }

    const updated = await this.prisma.tournamentRegistration.update({
      where: { id: reg.id },
      data: {
        status: dto.status,
        adminNote: dto.adminNote?.trim() || null,
        reviewedAt: new Date(),
        reviewedByUserId: user.sub,
      },
      include: REGISTRATION_INCLUDE,
    });
    return this.mapRow(updated);
  }

  async registrationStats(tournamentId: string) {
    const grouped = await this.prisma.tournamentRegistration.groupBy({
      by: ['status'],
      where: { tournamentId },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const g of grouped) {
      counts[g.status] = g._count._all;
    }
    return counts;
  }
}

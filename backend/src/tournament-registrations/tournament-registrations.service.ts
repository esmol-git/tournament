import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  ) {}

  private mapRow(row: {
    id: string
    tournamentId: string
    teamId: string
    status: TournamentRegistrationStatus
    message: string | null
    adminNote: string | null
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
      submittedAt: row.submittedAt,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      team: row.team,
      submittedBy: row.submittedBy,
      reviewedBy: row.reviewedBy,
    };
  }

  private async assertTeamAdminForTeam(
    teamId: string,
    user: JwtPayload,
  ): Promise<void> {
    const link = await this.prisma.teamAdmin.findFirst({
      where: { teamId, userId: user.sub },
      select: { id: true },
    });
    if (!link) {
      throw new ForbiddenException('Нет прав на эту команду');
    }
  }

  private async teamIdsForTeamAdmin(userId: string): Promise<string[]> {
    const rows = await this.prisma.teamAdmin.findMany({
      where: { userId },
      select: { teamId: true },
    });
    return rows.map((r) => r.teamId);
  }

  private isRegistrationWindowOpen(tournament: {
    registrationEnabled: boolean
    registrationOpensAt: Date | null
    registrationClosesAt: Date | null
  }): boolean {
    if (!tournament.registrationEnabled) return false;
    const now = Date.now();
    if (
      tournament.registrationOpensAt &&
      tournament.registrationOpensAt.getTime() > now
    ) {
      return false;
    }
    if (
      tournament.registrationClosesAt &&
      tournament.registrationClosesAt.getTime() < now
    ) {
      return false;
    }
    return true;
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

    let teamFilter: string[] | null = null;
    if (user.role === UserRole.TEAM_ADMIN) {
      teamFilter = await this.teamIdsForTeamAdmin(user.sub);
      if (teamFilter.length === 0) return { items: [], total: 0 };
    } else if (!isStaff) {
      throw new ForbiddenException('Недостаточно прав');
    }

    const rows = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId,
        ...(teamFilter ? { teamId: { in: teamFilter } } : {}),
      },
      orderBy: [{ status: 'asc' }, { submittedAt: 'desc' }, { createdAt: 'desc' }],
      include: REGISTRATION_INCLUDE,
    });

    return {
      items: rows.map((r) => this.mapRow(r)),
      total: rows.length,
    };
  }

  async listOpportunities(tenantId: string, user: JwtPayload) {
    if (user.role !== UserRole.TEAM_ADMIN) {
      throw new ForbiddenException('Доступно только администраторам команд');
    }
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException('Нет доступа к ресурсу другой организации');
    }

    const teamIds = await this.teamIdsForTeamAdmin(user.sub);
    if (teamIds.length === 0) return { items: [] };

    const now = new Date();
    const tournaments = await this.prisma.tournament.findMany({
      where: {
        tenantId,
        status: TournamentStatus.DRAFT,
        registrationEnabled: true,
        OR: [
          { registrationOpensAt: null },
          { registrationOpensAt: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { registrationClosesAt: null },
              { registrationClosesAt: { gte: now } },
            ],
          },
        ],
      },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        startsAt: true,
        endsAt: true,
        minTeams: true,
        maxTeams: true,
        registrationEnabled: true,
        registrationOpensAt: true,
        registrationClosesAt: true,
        ageGroup: { select: { id: true, name: true, shortLabel: true } },
        registrations: {
          where: { teamId: { in: teamIds } },
          select: {
            id: true,
            teamId: true,
            status: true,
            submittedAt: true,
          },
        },
        _count: { select: { tournamentTeams: true } },
      },
    });

    return {
      items: tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        startsAt: t.startsAt,
        endsAt: t.endsAt,
        minTeams: t.minTeams,
        maxTeams: t.maxTeams,
        ageGroup: t.ageGroup,
        teamsCount: t._count.tournamentTeams,
        myRegistrations: t.registrations,
        registrationOpen: this.isRegistrationWindowOpen(t),
      })),
    };
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
    if (!this.isRegistrationWindowOpen(tournament)) {
      throw new BadRequestException('Приём заявок на этот турнир сейчас закрыт');
    }

    const teamId = dto.teamId.trim();
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, tenantId: tournament.tenantId },
      select: { id: true, ageGroupId: true },
    });
    if (!team) throw new BadRequestException('Команда не найдена');

    if (user.role === UserRole.TEAM_ADMIN) {
      await this.assertTeamAdminForTeam(teamId, user);
    } else if (
      user.role !== UserRole.TENANT_ADMIN &&
      user.role !== UserRole.TOURNAMENT_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Недостаточно прав');
    }

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

    const row = await this.prisma.tournamentRegistration.upsert({
      where: { tournamentId_teamId: { tournamentId, teamId } },
      create: {
        tenantId: tournament.tenantId,
        tournamentId,
        teamId,
        status: TournamentRegistrationStatus.DRAFT,
        message: dto.message?.trim() || null,
        submittedByUserId: user.sub,
      },
      update: {
        message: dto.message?.trim() || null,
        ...(user.role === UserRole.TEAM_ADMIN
          ? {}
          : { submittedByUserId: user.sub }),
      },
      include: REGISTRATION_INCLUDE,
    });

    if (
      row.status === TournamentRegistrationStatus.REJECTED ||
      row.status === TournamentRegistrationStatus.WITHDRAWN
    ) {
      const reset = await this.prisma.tournamentRegistration.update({
        where: { id: row.id },
        data: {
          status: TournamentRegistrationStatus.DRAFT,
          adminNote: null,
          reviewedAt: null,
          reviewedByUserId: null,
          submittedAt: null,
        },
        include: REGISTRATION_INCLUDE,
      });
      return this.mapRow(reset);
    }

    return this.mapRow(row);
  }

  async submit(registrationId: string, tournamentId: string, user: JwtPayload) {
    const reg = await this.prisma.tournamentRegistration.findFirst({
      where: { id: registrationId, tournamentId },
      include: { tournament: true },
    });
    if (!reg) throw new NotFoundException('Заявка не найдена');

    if (user.role === UserRole.TEAM_ADMIN) {
      await this.assertTeamAdminForTeam(reg.teamId, user);
    } else if (
      user.role !== UserRole.TENANT_ADMIN &&
      user.role !== UserRole.TOURNAMENT_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Недостаточно прав');
    }

    if (!this.isRegistrationWindowOpen(reg.tournament)) {
      throw new BadRequestException('Приём заявок на этот турнир сейчас закрыт');
    }

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
    return this.mapRow(updated);
  }

  async withdraw(registrationId: string, tournamentId: string, user: JwtPayload) {
    const reg = await this.prisma.tournamentRegistration.findFirst({
      where: { id: registrationId, tournamentId },
    });
    if (!reg) throw new NotFoundException('Заявка не найдена');

    if (user.role === UserRole.TEAM_ADMIN) {
      await this.assertTeamAdminForTeam(reg.teamId, user);
    } else {
      await assertTournamentStaffCanManage(this.prisma, tournamentId, user);
    }

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

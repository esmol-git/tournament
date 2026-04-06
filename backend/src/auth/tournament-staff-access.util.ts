import { ForbiddenException } from '@nestjs/common';
import { TournamentMemberRole, UserRole } from '@prisma/client';
import { ApiErrorCode } from '../common/api-error-codes';
import { throwTournamentNotFound } from '../common/api-exceptions';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt.strategy';

/**
 * Явный allowlist: только SUPER_ADMIN, TENANT_ADMIN и TOURNAMENT_ADMIN (с ограничением по создателю).
 * SUPER_ADMIN обходит проверку тенанта. Любая другая роль — Forbidden (новые роли в enum не «протекают» сюда).
 */
export async function assertTournamentStaffCanManage(
  prisma: PrismaService,
  tournamentId: string,
  user: JwtPayload,
): Promise<void> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { tenantId: true, createdByUserId: true },
  });

  if (!t) {
    throwTournamentNotFound();
  }

  if (user.role === UserRole.SUPER_ADMIN) {
    return;
  }

  if (t.tenantId !== user.tenantId) {
    throw new ForbiddenException({
      message: 'Нет доступа к ресурсу другой организации',
      code: ApiErrorCode.CROSS_TENANT_ACCESS_DENIED,
    });
  }

  if (user.role === UserRole.TENANT_ADMIN) {
    return;
  }

  if (user.role === UserRole.TOURNAMENT_ADMIN) {
    if (t.createdByUserId !== user.sub) {
      throw new ForbiddenException({
        message: 'Нет доступа к этому турниру',
        code: ApiErrorCode.TOURNAMENT_ACCESS_DENIED,
      });
    }
    return;
  }

  throw new ForbiddenException({
    message: 'Недостаточно прав для этой операции',
    code: ApiErrorCode.INSUFFICIENT_ROLE,
  });
}

/**
 * Просмотр турнира/таблицы и работа с матчами (расписание, протокол):
 * супер-админ, админ тенанта, админ турнира (создатель), либо пользователь с ролью MODERATOR,
 * назначенный модератором этого турнира ({@link TournamentMemberRole.MODERATOR}).
 */
export async function assertTournamentMatchStaffCanManage(
  prisma: PrismaService,
  tournamentId: string,
  user: JwtPayload,
): Promise<void> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { tenantId: true, createdByUserId: true },
  });

  if (!t) {
    throwTournamentNotFound();
  }

  if (user.role === UserRole.SUPER_ADMIN) {
    return;
  }

  if (t.tenantId !== user.tenantId) {
    throw new ForbiddenException({
      message: 'Нет доступа к ресурсу другой организации',
      code: ApiErrorCode.CROSS_TENANT_ACCESS_DENIED,
    });
  }

  if (user.role === UserRole.TENANT_ADMIN) {
    return;
  }

  if (user.role === UserRole.TOURNAMENT_ADMIN) {
    if (t.createdByUserId !== user.sub) {
      throw new ForbiddenException({
        message: 'Нет доступа к этому турниру',
        code: ApiErrorCode.TOURNAMENT_ACCESS_DENIED,
      });
    }
    return;
  }

  if (user.role === UserRole.MODERATOR) {
    const m = await prisma.tournamentMember.findFirst({
      where: {
        tournamentId,
        userId: user.sub,
        role: TournamentMemberRole.MODERATOR,
      },
      select: { id: true },
    });
    if (m) {
      return;
    }
  }

  throw new ForbiddenException({
    message: 'Недостаточно прав для этой операции',
    code: ApiErrorCode.INSUFFICIENT_ROLE,
  });
}

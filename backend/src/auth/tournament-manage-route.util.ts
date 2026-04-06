import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ApiErrorCode } from '../common/api-error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt.strategy';
import { assertTournamentStaffCanManage } from './tournament-staff-access.util';

/**
 * Общая проверка для маршрутов с `params.id` или `params.tournamentId` (управление турниром и его контентом).
 */
export async function assertTournamentManageRoute(
  prisma: PrismaService,
  params: Record<string, string> | undefined,
  user: JwtPayload | undefined,
): Promise<void> {
  if (!user) {
    throw new UnauthorizedException({
      message: 'Требуется авторизация',
      code: ApiErrorCode.UNAUTHORIZED,
    });
  }
  const tournamentId = params?.id ?? params?.tournamentId;
  if (!tournamentId) {
    throw new ForbiddenException({
      message: 'Не указан идентификатор турнира',
      code: ApiErrorCode.TOURNAMENT_ID_REQUIRED,
    });
  }
  await assertTournamentStaffCanManage(prisma, tournamentId, user);
}

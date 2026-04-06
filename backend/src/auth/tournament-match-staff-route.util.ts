import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ApiErrorCode } from '../common/api-error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt.strategy';
import { assertTournamentMatchStaffCanManage } from './tournament-staff-access.util';

/**
 * Маршруты просмотра турнира и операций с матчами (в т.ч. протокол).
 */
export async function assertTournamentMatchStaffRoute(
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
  await assertTournamentMatchStaffCanManage(prisma, tournamentId, user);
}

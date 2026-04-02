import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt.strategy';

/**
 * Для TOURNAMENT_ADMIN — только турниры, созданные этим пользователем.
 * TENANT_ADMIN и прочие роли панели (кроме SUPER_ADMIN) — все турниры тенанта после проверки tenantId.
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
    throw new NotFoundException();
  }
  if (t.tenantId !== user.tenantId) {
    throw new ForbiddenException('Нет доступа к этому турниру');
  }
  if (user.role === UserRole.SUPER_ADMIN) {
    return;
  }
  if (user.role === UserRole.TOURNAMENT_ADMIN) {
    if (t.createdByUserId !== user.sub) {
      throw new ForbiddenException({
        message: 'Нет доступа к этому турниру',
        code: 'TOURNAMENT_ACCESS_DENIED',
      });
    }
  }
}

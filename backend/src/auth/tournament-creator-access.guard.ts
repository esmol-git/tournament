import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { JwtPayload } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { assertTournamentStaffCanManage } from './tournament-staff-access.util';

/**
 * После JwtAuthGuard. Для `TOURNAMENT_ADMIN` — только турнир, созданный этим пользователем.
 * Ожидает `params.id` или `params.tournamentId`.
 */
@Injectable()
export class TournamentCreatorAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ params?: Record<string, string>; user?: JwtPayload }>();
    const user = req.user;
    if (!user) {
      return true;
    }

    const params = req.params ?? {};
    const tournamentId = params.id ?? params.tournamentId;
    if (!tournamentId) {
      return true;
    }

    await assertTournamentStaffCanManage(this.prisma, tournamentId, user);
    return true;
  }
}

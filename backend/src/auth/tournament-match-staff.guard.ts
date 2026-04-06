import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtPayload } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { assertTournamentMatchStaffRoute } from './tournament-match-staff-route.util';

/**
 * Просмотр турнира в админке и работа с матчами/протоколом (включая модераторов турнира).
 */
@Injectable()
export class TournamentMatchStaffGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ params?: Record<string, string>; user?: JwtPayload }>();
    await assertTournamentMatchStaffRoute(this.prisma, req.params, req.user);
    return true;
  }
}

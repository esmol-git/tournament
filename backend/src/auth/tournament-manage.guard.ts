import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtPayload } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { assertTournamentManageRoute } from './tournament-manage-route.util';

/**
 * Управление турниром: карточка (чтение для админки), PATCH/DELETE, составы, календарь, плей-офф, таблица в панели.
 * Не публичный сайт — публичные данные идут через PublicModule.
 */
@Injectable()
export class TournamentManageGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ params?: Record<string, string>; user?: JwtPayload }>();
    await assertTournamentManageRoute(this.prisma, req.params, req.user);
    return true;
  }
}

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtPayload } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { assertTournamentManageRoute } from './tournament-manage-route.util';

/**
 * Контент внутри турнира: новости и галерея по `tournaments/:id/...`.
 * Сейчас та же проверка staff, что и {@link TournamentManageGuard}; разделение — для явной модели доступов.
 */
@Injectable()
export class TournamentContentGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ params?: Record<string, string>; user?: JwtPayload }>();
    await assertTournamentManageRoute(this.prisma, req.params, req.user);
    return true;
  }
}

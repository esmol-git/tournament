import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiErrorCode } from '../common/api-error-codes';
import { JwtPayload } from './jwt.strategy';

/**
 * Должен идти в `@UseGuards` **после** `JwtAuthGuard`, иначе `req.user` ещё не заполнен.
 */
@Injectable()
export class TenantZoneGuard implements CanActivate {
  private readonly tenantApiPrefixes = [
    '/users',
    '/teams',
    '/players',
    '/matches',
    '/tournaments',
    '/tenants/',
    '/meta',
    '/upload',
  ];

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ path?: string; url?: string; user?: JwtPayload }>();
    const user = req.user;
    if (!user) return true;

    const path = (req.path ?? req.url ?? '').split('?')[0];
    if (user.role === UserRole.SUPER_ADMIN) {
      const isTenantPath = this.tenantApiPrefixes.some((p) =>
        path.startsWith(p),
      );
      if (isTenantPath) {
        throw new ForbiddenException({
          message:
            'Глобальный администратор не может пользоваться tenant API; используйте платформенные эндпоинты',
          code: ApiErrorCode.INSUFFICIENT_ROLE,
        });
      }
    }
    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ApiErrorCode } from '../common/api-error-codes';
import { ROLES_KEY } from './roles.decorator';
import { JwtPayload } from './jwt.strategy';

/**
 * RBAC по `req.user.role`.
 *
 * Контракт: `req.user` задаётся `JwtStrategy.validate()` после загрузки пользователя из БД;
 * `role` здесь — актуальная роль из записи User, а не значение из сырого JWT payload.
 * (См. `jwt.strategy.ts`: токен лишь подтверждает `sub`, права читаются из БД.)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();

    if (!req.user) {
      throw new UnauthorizedException({
        message: 'Требуется авторизация',
        code: ApiErrorCode.UNAUTHORIZED,
      });
    }

    if (!requiredRoles.includes(req.user.role)) {
      throw new ForbiddenException({
        message: 'Недостаточно прав для этой операции',
        code: ApiErrorCode.INSUFFICIENT_ROLE,
      });
    }

    return true;
  }
}

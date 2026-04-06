import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { UserRole } from '@prisma/client';
import { ApiErrorCode } from '../common/api-error-codes';
import { JwtPayload } from './jwt.strategy';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Команды / игроки: модератор может только читать (GET/HEAD/OPTIONS), без мутаций.
 */
@Injectable()
export class ModeratorReadOnlyStaffGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const method = (req.method ?? 'GET').toUpperCase();
    if (SAFE_METHODS.has(method)) return true;
    if (req.user?.role === UserRole.MODERATOR) {
      throw new ForbiddenException({
        message: 'Недостаточно прав для изменения данных',
        code: ApiErrorCode.INSUFFICIENT_ROLE,
      });
    }
    return true;
  }
}

/**
 * Справочники и прочие разделы, недоступные модератору целиком.
 */
@Injectable()
export class ModeratorForbiddenStaffGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (req.user?.role === UserRole.MODERATOR) {
      throw new ForbiddenException({
        message: 'Раздел недоступен для роли модератора',
        code: ApiErrorCode.INSUFFICIENT_ROLE,
      });
    }
    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiErrorCode } from '../common/api-error-codes';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (req.user?.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException({
        message:
          'Доступ к платформенным операциям только у глобального администратора',
        code: ApiErrorCode.INSUFFICIENT_ROLE,
      });
    }
    return true;
  }
}

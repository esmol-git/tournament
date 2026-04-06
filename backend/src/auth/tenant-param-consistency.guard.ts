import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ApiErrorCode } from '../common/api-error-codes';
import { JwtPayload } from './jwt.strategy';

/**
 * Должен идти в `@UseGuards` **после** `JwtAuthGuard`, иначе `req.user` ещё не заполнен.
 */
@Injectable()
export class TenantParamConsistencyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ user?: JwtPayload; params?: Record<string, unknown> }>();

    const user = req.user;
    const tenantIdFromJwt = user?.tenantId;
    if (!tenantIdFromJwt) return true;

    const tenantIdFromParams = req.params?.tenantId;
    if (!tenantIdFromParams || typeof tenantIdFromParams !== 'string') {
      return true;
    }

    if (tenantIdFromParams !== tenantIdFromJwt) {
      throw new ForbiddenException({
        message: 'Идентификатор организации в запросе не совпадает с сессией',
        code: ApiErrorCode.CROSS_TENANT_ACCESS_DENIED,
      });
    }

    return true;
  }
}

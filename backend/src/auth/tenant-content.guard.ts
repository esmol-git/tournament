import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiErrorCode } from '../common/api-error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt.strategy';
import { assertTenantContentCanManage } from './tenant-content-access.util';

/**
 * Мутации контента организации: `POST|PATCH|DELETE .../tenants/:tenantId/news*`, `.../news-tags*`.
 */
@Injectable()
export class TenantContentGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ params?: Record<string, string>; user?: JwtPayload }>();

    const user = req.user;
    if (!user) {
      throw new UnauthorizedException({
        message: 'Требуется авторизация',
        code: ApiErrorCode.UNAUTHORIZED,
      });
    }

    const tenantId = req.params?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException({
        message: 'Не указан идентификатор организации',
        code: ApiErrorCode.TENANT_ID_REQUIRED,
      });
    }

    await assertTenantContentCanManage(this.prisma, tenantId, user);
    return true;
  }
}

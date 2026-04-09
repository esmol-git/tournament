import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiErrorCode } from '../common/api-error-codes';
import { JwtPayload } from './jwt.strategy';

const RESTRICTED_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.USER,
  UserRole.REFEREE,
]);

/**
 * После JwtAuthGuard / TenantZoneGuard.
 * Для USER и REFEREE разрешены только «личные» эндпоинты (профиль, чтение общих ui-settings организации), без управления организацией.
 */
@Injectable()
export class TenantAdminStaffGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ path?: string; url?: string; user?: JwtPayload }>();
    const user = req.user;
    if (!user) return true;

    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    if (!RESTRICTED_ROLES.has(user.role)) {
      return true;
    }

    const path = (req.path ?? req.url ?? '').split('?')[0] ?? '';

    if (this.isAllowedForRestrictedRole(path)) {
      return true;
    }

    throw new ForbiddenException({
      message: 'Недостаточно прав для панели организатора',
      code: ApiErrorCode.ADMIN_STAFF_ROLE_REQUIRED,
    });
  }

  private isAllowedForRestrictedRole(path: string): boolean {
    if (path === '/auth/me' || path === '/auth/logout') return true;

    /** Судья: календарь матчей организации (совпадает с `PROTOCOL_ROLES` на `MatchesService.listTenantMatches`). */
    if (/^\/tenants\/[^/]+\/matches\/?$/.test(path)) {
      return true;
    }

    if (path === '/users/me' || path.startsWith('/users/me/')) {
      if (path.startsWith('/users/me/tenant-subscription-plan')) return false;
      if (path.startsWith('/users/me/tenant-public-branding')) return false;
      if (path.startsWith('/users/me/tenant-social-links')) return false;
      return true;
    }

    return false;
  }
}

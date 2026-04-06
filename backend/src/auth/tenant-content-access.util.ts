import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiErrorCode } from '../common/api-error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt.strategy';

const TENANT_CONTENT_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.TENANT_ADMIN,
]);

/**
 * Мутации контента организации (новости/теги на уровне `tenants/:tenantId/...`), не привязанные к одному турниру.
 * Явный allowlist: SUPER_ADMIN, TENANT_ADMIN (модератор — без доступа).
 */
export async function assertTenantContentCanManage(
  prisma: PrismaService,
  tenantId: string,
  user: JwtPayload,
): Promise<void> {
  if (user.role === UserRole.SUPER_ADMIN) {
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) {
    throw new NotFoundException({
      message: 'Организация не найдена',
      code: ApiErrorCode.TENANT_NOT_FOUND,
    });
  }

  if (user.tenantId !== tenantId) {
    throw new ForbiddenException({
      message: 'Нет доступа к ресурсу другой организации',
      code: ApiErrorCode.CROSS_TENANT_ACCESS_DENIED,
    });
  }

  if (!TENANT_CONTENT_ROLES.has(user.role)) {
    throw new ForbiddenException({
      message: 'Недостаточно прав для управления контентом организации',
      code: ApiErrorCode.TENANT_CONTENT_ACCESS_DENIED,
    });
  }
}

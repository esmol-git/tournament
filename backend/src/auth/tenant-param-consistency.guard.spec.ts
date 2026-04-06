import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TenantParamConsistencyGuard } from './tenant-param-consistency.guard';
import { ApiErrorCode } from '../common/api-error-codes';

function mockContext(partial: {
  tenantIdJwt?: string;
  tenantIdParam?: string;
  path?: string;
}): ExecutionContext {
  const req = {
    user: partial.tenantIdJwt
      ? {
          sub: 'u1',
          email: 'a@b.c',
          tenantId: partial.tenantIdJwt,
          role: UserRole.TENANT_ADMIN,
        }
      : undefined,
    params: partial.tenantIdParam
      ? { tenantId: partial.tenantIdParam }
      : {},
    path: partial.path ?? '/tenants/x/tournaments',
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as ExecutionContext;
}

describe('TenantParamConsistencyGuard', () => {
  const guard = new TenantParamConsistencyGuard();

  it('allows when JWT has no tenantId', () => {
    expect(
      guard.canActivate(mockContext({ tenantIdJwt: undefined, tenantIdParam: 't2' })),
    ).toBe(true);
  });

  it('allows when route has no tenantId param', () => {
    expect(
      guard.canActivate(
        mockContext({ tenantIdJwt: 't1', tenantIdParam: undefined }),
      ),
    ).toBe(true);
  });

  it('allows when param matches JWT tenantId', () => {
    expect(
      guard.canActivate(
        mockContext({ tenantIdJwt: 'same', tenantIdParam: 'same' }),
      ),
    ).toBe(true);
  });

  it('throws CROSS_TENANT_ACCESS_DENIED when param differs from JWT', () => {
    try {
      guard.canActivate(
        mockContext({ tenantIdJwt: 'tenant-a', tenantIdParam: 'tenant-b' }),
      );
      fail('expected ForbiddenException');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const res = (e as ForbiddenException).getResponse() as {
        code?: string;
      };
      expect(res.code).toBe(ApiErrorCode.CROSS_TENANT_ACCESS_DENIED);
    }
  });
});

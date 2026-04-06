/**
 * P0: HttpOnly refresh cookie, refresh без body, logout;
 * подписка / блокировка тенанта (login и после выдачи JWT).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole, SubscriptionStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AUTH_REFRESH_COOKIE_NAME } from '../src/auth/auth-refresh-cookie.util';

const hasDbAndJwt =
  Boolean(process.env.DATABASE_URL?.trim()) &&
  Boolean(process.env.JWT_SECRET?.trim());

const describeOrSkip = hasDbAndJwt ? describe : describe.skip;

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` } as const;
}

/** Первая часть каждого Set-Cookie для заголовка Cookie. */
function cookieHeaderFromSetCookie(
  setCookie: string | string[] | undefined,
): string {
  if (!setCookie) return '';
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  return arr
    .map((c) => c.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

describeOrSkip('Auth & subscription (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let suffix: string;
  let slugOk: string;
  let slugBlocked: string;
  let slugExpiredLogin: string;
  let slugFlip: string;
  let tenantOkId: string;
  let tenantBlockedId: string;
  let tenantExpiredLoginId: string;
  let tenantFlipId: string;
  let passwordPlain: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
    slugOk = `e2e-auth-ok-${suffix}`;
    slugBlocked = `e2e-auth-blocked-${suffix}`;
    slugExpiredLogin = `e2e-auth-exp-login-${suffix}`;
    slugFlip = `e2e-auth-flip-${suffix}`;
    passwordPlain = 'E2eAuth!sub9';

    const passwordHash = await bcrypt.hash(passwordPlain, 8);

    const [tOk, tBlocked, tExpLogin, tFlip] = await Promise.all([
      prisma.tenant.create({
        data: {
          name: 'E2E Auth OK',
          slug: slugOk,
          blocked: false,
          subscriptionStatus: SubscriptionStatus.NONE,
        },
      }),
      prisma.tenant.create({
        data: {
          name: 'E2E Blocked',
          slug: slugBlocked,
          blocked: true,
          subscriptionStatus: SubscriptionStatus.NONE,
        },
      }),
      prisma.tenant.create({
        data: {
          name: 'E2E Expired at login',
          slug: slugExpiredLogin,
          blocked: false,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionEndsAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
      }),
      prisma.tenant.create({
        data: {
          name: 'E2E Flip after login',
          slug: slugFlip,
          blocked: false,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    tenantOkId = tOk.id;
    tenantBlockedId = tBlocked.id;
    tenantExpiredLoginId = tExpLogin.id;
    tenantFlipId = tFlip.id;

    await prisma.user.create({
      data: {
        email: `e2e-auth-${suffix}@test.local`,
        username: `e2eauth${suffix}`,
        password: passwordHash,
        name: 'Auth',
        lastName: 'User',
        role: UserRole.TENANT_ADMIN,
        tenantId: tenantOkId,
      },
    });

    await prisma.user.create({
      data: {
        email: `e2e-blocked-${suffix}@test.local`,
        username: `e2eblk${suffix}`,
        password: passwordHash,
        name: 'Blocked',
        lastName: 'Tenant',
        role: UserRole.TENANT_ADMIN,
        tenantId: tenantBlockedId,
      },
    });

    await prisma.user.create({
      data: {
        email: `e2e-exp-${suffix}@test.local`,
        username: `e2eexp${suffix}`,
        password: passwordHash,
        name: 'Exp',
        lastName: 'Login',
        role: UserRole.TENANT_ADMIN,
        tenantId: tenantExpiredLoginId,
      },
    });

    await prisma.user.create({
      data: {
        email: `e2e-flip-${suffix}@test.local`,
        username: `e2eflip${suffix}`,
        password: passwordHash,
        name: 'Flip',
        lastName: 'User',
        role: UserRole.TENANT_ADMIN,
        tenantId: tenantFlipId,
      },
    });
  });

  afterAll(async () => {
    if (!app || !prisma) return;
    const tenantIds = [
      tenantOkId,
      tenantBlockedId,
      tenantExpiredLoginId,
      tenantFlipId,
    ].filter(Boolean);
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await app.close();
  });

  it('POST /auth/login sets HttpOnly refresh cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: `e2eauth${suffix}`,
        password: passwordPlain,
        tenantSlug: slugOk,
      })
      .expect(200);

    const raw = res.headers['set-cookie'];
    expect(raw).toBeDefined();
    const joined = Array.isArray(raw) ? raw.join('\n') : String(raw);
    expect(joined).toContain(AUTH_REFRESH_COOKIE_NAME);
    expect(joined.toLowerCase()).toContain('httponly');
  });

  it('POST /auth/refresh with Cookie only (no body) returns 200', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: `e2eauth${suffix}`,
        password: passwordPlain,
        tenantSlug: slugOk,
      })
      .expect(200);

    const cookie = cookieHeaderFromSetCookie(loginRes.headers['set-cookie']);
    expect(cookie).toContain(AUTH_REFRESH_COOKIE_NAME);

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .send({})
      .expect(200);

    expect(refreshRes.body?.accessToken).toBeTruthy();
    expect(refreshRes.body?.user).toBeTruthy();
  });

  it('POST /auth/logout clears refresh cookie and revokes session', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: `e2eauth${suffix}`,
        password: passwordPlain,
        tenantSlug: slugOk,
      })
      .expect(200);

    const accessToken = loginRes.body?.accessToken as string;
    expect(accessToken).toBeTruthy();

    const cookie = cookieHeaderFromSetCookie(loginRes.headers['set-cookie']);

    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .set({ ...bearer(accessToken), Cookie: cookie })
      .expect(200);

    const cleared = logoutRes.headers['set-cookie'];
    const clearedStr = Array.isArray(cleared)
      ? cleared.join('\n')
      : String(cleared ?? '');
    expect(clearedStr).toContain(AUTH_REFRESH_COOKIE_NAME);
    expect(clearedStr.toLowerCase()).toMatch(/max-age=0|expires=.*1970/);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .send({})
      .expect(401);
  });

  it('POST /auth/login for blocked tenant returns 401 TENANT_BLOCKED', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: `e2eblk${suffix}`,
        password: passwordPlain,
        tenantSlug: slugBlocked,
      })
      .expect(401);

    expect(res.body?.code).toBe('TENANT_BLOCKED');
  });

  it('POST /auth/login for expired subscription returns 403 SUBSCRIPTION_EXPIRED', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: `e2eexp${suffix}`,
        password: passwordPlain,
        tenantSlug: slugExpiredLogin,
      })
      .expect(403);

    expect(res.body?.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('GET /users/me returns 403 TENANT_BLOCKED after tenant is blocked', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: `e2eauth${suffix}`,
        password: passwordPlain,
        tenantSlug: slugOk,
      })
      .expect(200);

    const accessToken = loginRes.body?.accessToken as string;

    await prisma.tenant.update({
      where: { id: tenantOkId },
      data: { blocked: true },
    });

    try {
      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set(bearer(accessToken))
        .expect(403);
      expect(res.body?.code).toBe('TENANT_BLOCKED');
    } finally {
      await prisma.tenant.update({
        where: { id: tenantOkId },
        data: { blocked: false },
      });
    }
  });

  it('GET /users/me returns 403 SUBSCRIPTION_EXPIRED after subscription end', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: `e2eflip${suffix}`,
        password: passwordPlain,
        tenantSlug: slugFlip,
      })
      .expect(200);

    const accessToken = loginRes.body?.accessToken as string;

    await prisma.tenant.update({
      where: { id: tenantFlipId },
      data: {
        subscriptionEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      },
    });

    try {
      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set(bearer(accessToken))
        .expect(403);
      expect(res.body?.code).toBe('SUBSCRIPTION_EXPIRED');
    } finally {
      await prisma.tenant.update({
        where: { id: tenantFlipId },
        data: {
          subscriptionEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          subscriptionStatus: SubscriptionStatus.ACTIVE,
        },
      });
    }
  });

});

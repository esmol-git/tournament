/**
 * P1: публичный API без JWT; MODERATOR (справочники запрещены, список турниров / чтение команд — да;
 * мутации команд — нет); тариф audit_log (FREE → 403, WORLD_CUP → 200).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import type { JwtPayload } from '../src/auth/jwt.strategy';

const hasDbAndJwt =
  Boolean(process.env.DATABASE_URL?.trim()) &&
  Boolean(process.env.JWT_SECRET?.trim());

const describeOrSkip = hasDbAndJwt ? describe : describe.skip;

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` } as const;
}

describeOrSkip('P1 public, moderator, subscription plan (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let config: ConfigService;

  let suffix: string;
  let tenantSlug: string;
  let tenantId: string;
  let tokenModerator: string;
  let tokenTenantAdmin: string;

  async function signUserToken(user: {
    id: string;
    email: string | null;
    tenantId: string;
    role: UserRole;
  }): Promise<string> {
    const secret = config.get<string>('JWT_SECRET')?.trim();
    if (!secret) throw new Error('JWT_SECRET is not configured');
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email ?? '',
      tenantId: user.tenantId,
      role: user.role,
    };
    return jwtService.signAsync(payload, {
      secret,
      expiresIn: '1h',
      algorithm: 'HS256',
    });
  }

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
    jwtService = app.get(JwtService);
    config = app.get(ConfigService);

    suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
    tenantSlug = `e2e-p1-${suffix}`;
    const passwordHash = await bcrypt.hash('E2eP1!plan9', 8);

    const tenant = await prisma.tenant.create({
      data: {
        name: 'E2E P1 guards',
        slug: tenantSlug,
        blocked: false,
        subscriptionStatus: SubscriptionStatus.NONE,
        subscriptionPlan: SubscriptionPlan.FREE,
      },
    });
    tenantId = tenant.id;

    const mod = await prisma.user.create({
      data: {
        email: `e2e-p1-mod-${suffix}@test.local`,
        username: `e2ep1mod${suffix}`,
        password: passwordHash,
        name: 'Mod',
        lastName: 'Erator',
        role: UserRole.MODERATOR,
        tenantId,
      },
    });

    const admin = await prisma.user.create({
      data: {
        email: `e2e-p1-adm-${suffix}@test.local`,
        username: `e2ep1adm${suffix}`,
        password: passwordHash,
        name: 'Tenant',
        lastName: 'Admin',
        role: UserRole.TENANT_ADMIN,
        tenantId,
      },
    });

    tokenModerator = await signUserToken({
      id: mod.id,
      email: mod.email,
      tenantId: mod.tenantId,
      role: UserRole.MODERATOR,
    });

    tokenTenantAdmin = await signUserToken({
      id: admin.id,
      email: admin.email,
      tenantId: admin.tenantId,
      role: UserRole.TENANT_ADMIN,
    });
  });

  afterAll(async () => {
    if (!app || !prisma || !tenantId) return;
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await app.close();
  });

  describe('public API without JWT', () => {
    it('GET /public/tenants/:slug returns 200 and no credentials in body', async () => {
      const res = await request(app.getHttpServer())
        .get(`/public/tenants/${tenantSlug}`)
        .expect(200);

      expect(res.body?.slug).toBe(tenantSlug);
      expect(res.body?.name).toBeTruthy();
      const raw = JSON.stringify(res.body).toLowerCase();
      expect(raw).not.toContain('password');
      expect(raw).not.toContain('refreshtoken');
    });

    it('GET /public/tenants/:slug/tournaments returns 200 with items array', async () => {
      const res = await request(app.getHttpServer())
        .get(`/public/tenants/${tenantSlug}/tournaments`)
        .expect(200);

      expect(Array.isArray(res.body?.items)).toBe(true);
      expect(typeof res.body?.total).toBe('number');
    });
  });

  describe('MODERATOR staff scope', () => {
    it('GET /tenants/:id/tournaments returns 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/tournaments`)
        .set(bearer(tokenModerator))
        .expect(200);

      expect(Array.isArray(res.body?.items)).toBe(true);
    });

    it('GET /tenants/:id/age-groups returns 403 INSUFFICIENT_ROLE', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/age-groups`)
        .set(bearer(tokenModerator))
        .expect(403);

      expect(res.body?.code).toBe('INSUFFICIENT_ROLE');
    });

    it('POST /tenants/:id/teams returns 403 INSUFFICIENT_ROLE (read-only)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/teams`)
        .set(bearer(tokenModerator))
        .send({})
        .expect(403);

      expect(res.body?.code).toBe('INSUFFICIENT_ROLE');
    });
  });

  describe('SubscriptionPlanFeatureGuard (audit_log)', () => {
    it('GET admin-audit summary returns 403 SUBSCRIPTION_PLAN_INSUFFICIENT on FREE', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/admin-audit-log/summary`)
        .set(bearer(tokenTenantAdmin))
        .expect(403);

      expect(res.body?.code).toBe('SUBSCRIPTION_PLAN_INSUFFICIENT');
    });

    it('GET admin-audit summary returns 200 on WORLD_CUP plan', async () => {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { subscriptionPlan: SubscriptionPlan.WORLD_CUP },
      });

      try {
        const res = await request(app.getHttpServer())
          .get(`/tenants/${tenantId}/admin-audit-log/summary`)
          .set(bearer(tokenTenantAdmin))
          .expect(200);

        expect(res.body).toBeDefined();
      } finally {
        await prisma.tenant.update({
          where: { id: tenantId },
          data: { subscriptionPlan: SubscriptionPlan.FREE },
        });
      }
    });
  });
});

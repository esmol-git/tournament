/**
 * TenantZoneGuard: SUPER_ADMIN не ходит в tenant API, только в /platform/*.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
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

describeOrSkip('SUPER_ADMIN tenant zone (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let config: ConfigService;

  let suffix: string;
  let tenantId: string;
  let tokenSuperAdmin: string;

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
    const slug = `e2e-sa-zone-${suffix}`;
    const passwordHash = await bcrypt.hash('E2eSaZone!test9', 8);

    const tenant = await prisma.tenant.create({
      data: { name: 'E2E SuperAdmin zone', slug },
    });
    tenantId = tenant.id;

    const superAdmin = await prisma.user.create({
      data: {
        email: `e2e-sa-${suffix}@test.local`,
        username: `e2esa${suffix}`,
        password: passwordHash,
        name: 'Super',
        lastName: 'Admin',
        role: UserRole.SUPER_ADMIN,
        tenantId,
      },
    });

    tokenSuperAdmin = await signUserToken({
      id: superAdmin.id,
      email: superAdmin.email,
      tenantId: superAdmin.tenantId,
      role: UserRole.SUPER_ADMIN,
    });
  });

  afterAll(async () => {
    if (!app || !prisma || !tenantId) return;
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await app.close();
  });

  it('GET /tenants/:tenantId/tournaments returns 403 INSUFFICIENT_ROLE', async () => {
    const res = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/tournaments`)
      .set(bearer(tokenSuperAdmin))
      .expect(403);

    expect(res.body?.code).toBe('INSUFFICIENT_ROLE');
  });

  it('GET /users/me returns 403 INSUFFICIENT_ROLE', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set(bearer(tokenSuperAdmin))
      .expect(403);

    expect(res.body?.code).toBe('INSUFFICIENT_ROLE');
  });

  it('GET /platform/tenants returns 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/platform/tenants')
      .set(bearer(tokenSuperAdmin))
      .expect(200);

    expect(Array.isArray(res.body?.items)).toBe(true);
    expect(typeof res.body?.total).toBe('number');
  });
});

/**
 * REFEREE не ходит в панель организатора (список турниров тенанта).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionStatus, UserRole } from '@prisma/client';
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

describeOrSkip('REFEREE tenant staff scope (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let config: ConfigService;

  let tenantId: string;
  let tokenReferee: string;

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

    const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
    const slug = `e2e-ref-${suffix}`;
    const passwordHash = await bcrypt.hash('E2eReferee!9', 8);

    const tenant = await prisma.tenant.create({
      data: {
        name: 'E2E Referee',
        slug,
        blocked: false,
        subscriptionStatus: SubscriptionStatus.NONE,
      },
    });
    tenantId = tenant.id;

    const referee = await prisma.user.create({
      data: {
        email: `e2e-ref-${suffix}@test.local`,
        username: `e2eref${suffix}`,
        password: passwordHash,
        name: 'Ref',
        lastName: 'Eree',
        role: UserRole.REFEREE,
        tenantId,
      },
    });

    tokenReferee = await signUserToken({
      id: referee.id,
      email: referee.email,
      tenantId: referee.tenantId,
      role: UserRole.REFEREE,
    });
  });

  afterAll(async () => {
    if (!app || !prisma || !tenantId) return;
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await app.close();
  });

  it('GET /tenants/:tenantId/tournaments returns 403 ADMIN_STAFF_ROLE_REQUIRED', async () => {
    const res = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/tournaments`)
      .set(bearer(tokenReferee))
      .expect(403);

    expect(res.body?.code).toBe('ADMIN_STAFF_ROLE_REQUIRED');
  });
});

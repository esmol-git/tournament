/**
 * Object-level authorization (OWASP): подмена tournament / tenant id.
 * Требуется `DATABASE_URL` и `JWT_SECRET` (как у основного приложения).
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

describeOrSkip('Tournament access (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let config: ConfigService;

  let tenantAId: string;
  let tenantBId: string;

  let tokenTenantAdminA: string;
  let tokenTournamentAdminOwn: string;
  let tokenTournamentAdminOther: string;
  let tokenTenantAdminB: string;
  let tokenViewerA: string;

  let tournamentOwnId: string;
  let tournamentOtherSameTenantId: string;
  let tournamentBId: string;

  async function signUserToken(user: {
    id: string;
    email: string | null;
    tenantId: string;
    role: UserRole;
  }): Promise<string> {
    const secret = config.get<string>('JWT_SECRET')?.trim();
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
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
    const slugA = `e2e-acc-a-${suffix}`;
    const slugB = `e2e-acc-b-${suffix}`;
    const passwordHash = await bcrypt.hash('E2eAccess!test9', 8);

    const tenantA = await prisma.tenant.create({
      data: { name: 'E2E Access A', slug: slugA },
    });
    const tenantB = await prisma.tenant.create({
      data: { name: 'E2E Access B', slug: slugB },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const tenantAdminA = await prisma.user.create({
      data: {
        email: `e2e-tna-${suffix}@test.local`,
        username: `e2etna${suffix}`,
        password: passwordHash,
        name: 'Tenant',
        lastName: 'AdminA',
        role: UserRole.TENANT_ADMIN,
        tenantId: tenantAId,
      },
    });

    const tournamentAdminOwn = await prisma.user.create({
      data: {
        email: `e2e-toa-${suffix}@test.local`,
        username: `e2etoa${suffix}`,
        password: passwordHash,
        name: 'Tourn',
        lastName: 'Own',
        role: UserRole.TOURNAMENT_ADMIN,
        tenantId: tenantAId,
      },
    });

    const tournamentAdminOther = await prisma.user.create({
      data: {
        email: `e2e-toa2-${suffix}@test.local`,
        username: `e2etoa2${suffix}`,
        password: passwordHash,
        name: 'Tourn',
        lastName: 'Other',
        role: UserRole.TOURNAMENT_ADMIN,
        tenantId: tenantAId,
      },
    });

    const tenantAdminB = await prisma.user.create({
      data: {
        email: `e2e-tnb-${suffix}@test.local`,
        username: `e2etnb${suffix}`,
        password: passwordHash,
        name: 'Tenant',
        lastName: 'AdminB',
        role: UserRole.TENANT_ADMIN,
        tenantId: tenantBId,
      },
    });

    const viewerA = await prisma.user.create({
      data: {
        email: `e2e-view-${suffix}@test.local`,
        username: `e2eview${suffix}`,
        password: passwordHash,
        name: 'Viewer',
        lastName: 'User',
        role: UserRole.USER,
        tenantId: tenantAId,
      },
    });

    const tOwn = await prisma.tournament.create({
      data: {
        name: 'Own tournament',
        slug: `own-${suffix}`,
        tenantId: tenantAId,
        createdByUserId: tournamentAdminOwn.id,
      },
    });
    const tOther = await prisma.tournament.create({
      data: {
        name: 'Peer tournament',
        slug: `peer-${suffix}`,
        tenantId: tenantAId,
        createdByUserId: tournamentAdminOther.id,
      },
    });
    const tB = await prisma.tournament.create({
      data: {
        name: 'Tenant B tournament',
        slug: `tb-${suffix}`,
        tenantId: tenantBId,
        createdByUserId: tenantAdminB.id,
      },
    });

    tournamentOwnId = tOwn.id;
    tournamentOtherSameTenantId = tOther.id;
    tournamentBId = tB.id;

    tokenTenantAdminA = await signUserToken(tenantAdminA);
    tokenTournamentAdminOwn = await signUserToken(tournamentAdminOwn);
    tokenTournamentAdminOther = await signUserToken(tournamentAdminOther);
    tokenTenantAdminB = await signUserToken(tenantAdminB);
    tokenViewerA = await signUserToken(viewerA);
  });

  afterAll(async () => {
    if (!app || !prisma) return;
    await prisma.tournament.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await prisma.user.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    });
    await app.close();
  });

  it('returns 401 for PATCH without token', async () => {
    await request(app.getHttpServer())
      .patch(`/tournaments/${tournamentOwnId}`)
      .send({ name: 'No auth' })
      .expect(401);
  });

  it('allows TOURNAMENT_ADMIN to PATCH own tournament (200)', async () => {
    await request(app.getHttpServer())
      .patch(`/tournaments/${tournamentOwnId}`)
      .set(bearer(tokenTournamentAdminOwn))
      .send({ name: 'Updated by owner' })
      .expect(200);
  });

  it('allows peer TOURNAMENT_ADMIN to PATCH their own tournament (200)', async () => {
    await request(app.getHttpServer())
      .patch(`/tournaments/${tournamentOtherSameTenantId}`)
      .set(bearer(tokenTournamentAdminOther))
      .send({ name: 'Updated by peer admin' })
      .expect(200);
  });

  it('forbids TOURNAMENT_ADMIN from PATCH peer tournament in same tenant (403)', async () => {
    await request(app.getHttpServer())
      .patch(`/tournaments/${tournamentOtherSameTenantId}`)
      .set(bearer(tokenTournamentAdminOwn))
      .send({ name: 'Hacked title' })
      .expect(403);
  });

  it('forbids cross-tenant read GET tournament (403)', async () => {
    await request(app.getHttpServer())
      .get(`/tournaments/${tournamentBId}`)
      .set(bearer(tokenTournamentAdminOwn))
      .expect(403);
  });

  it('forbids cross-tenant PATCH tournament (403)', async () => {
    await request(app.getHttpServer())
      .patch(`/tournaments/${tournamentBId}`)
      .set(bearer(tokenTournamentAdminOwn))
      .send({ name: 'Cross-tenant' })
      .expect(403);
  });

  it('allows TENANT_ADMIN to PATCH any tournament in own tenant (200)', async () => {
    await request(app.getHttpServer())
      .patch(`/tournaments/${tournamentOtherSameTenantId}`)
      .set(bearer(tokenTenantAdminA))
      .send({ name: 'By tenant admin' })
      .expect(200);
  });

  it('forbids USER (viewer) from mutating tournament (403)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/tournaments/${tournamentOwnId}`)
      .set(bearer(tokenViewerA))
      .send({ name: 'Viewer try' })
      .expect(403);
    expect(res.body?.code ?? res.body?.message).toBeTruthy();
  });

  it('forbids tenantId substitution on tenant route (JWT tenant A, path tenant B) (403)', async () => {
    await request(app.getHttpServer())
      .get(`/tenants/${tenantBId}/tournaments`)
      .set(bearer(tokenTenantAdminA))
      .expect(403);
  });

  it('forbids tenant B admin from listing tenant A tournaments via path (403)', async () => {
    await request(app.getHttpServer())
      .get(`/tenants/${tenantAId}/tournaments`)
      .set(bearer(tokenTenantAdminB))
      .expect(403);
  });

  it('returns 404 for non-existent tournament id (object probe)', async () => {
    await request(app.getHttpServer())
      .get(`/tournaments/nonexistent-tournament-id-xyz`)
      .set(bearer(tokenTenantAdminA))
      .expect(404);
  });
});

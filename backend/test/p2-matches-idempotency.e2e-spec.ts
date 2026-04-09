/**
 * P2: повторный attach после успешного — матч уже не standalone → 404;
 * второй createMatch с тем же телом — **409** `MATCH_DUPLICATE`;
 * второй POST standalone-matches с тем же телом — **409** `MATCH_DUPLICATE`.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionStatus, TournamentFormat, UserRole } from '@prisma/client';
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

describeOrSkip('Matches idempotency baseline (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let config: ConfigService;

  let suffix: string;
  let tenantId: string;
  let tokenAdmin: string;
  let teamHomeId: string;
  let teamAwayId: string;
  let tournamentId: string;

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
    const slug = `e2e-p2-m-${suffix}`;
    const passwordHash = await bcrypt.hash('E2eP2Match!9', 8);

    const tenant = await prisma.tenant.create({
      data: {
        name: 'E2E P2 matches',
        slug,
        blocked: false,
        subscriptionStatus: SubscriptionStatus.NONE,
      },
    });
    tenantId = tenant.id;

    const admin = await prisma.user.create({
      data: {
        email: `e2e-p2m-${suffix}@test.local`,
        username: `e2ep2m${suffix}`,
        password: passwordHash,
        name: 'P2',
        lastName: 'Admin',
        role: UserRole.TENANT_ADMIN,
        tenantId,
      },
    });

    tokenAdmin = await signUserToken({
      id: admin.id,
      email: admin.email,
      tenantId: admin.tenantId,
      role: UserRole.TENANT_ADMIN,
    });

    const http = app.getHttpServer();

    const teamHome = await request(http)
      .post(`/tenants/${tenantId}/teams`)
      .set(bearer(tokenAdmin))
      .send({ name: `Home ${suffix}`, slug: `home-${suffix}` })
      .expect(201);
    teamHomeId = teamHome.body?.id as string;

    const teamAway = await request(http)
      .post(`/tenants/${tenantId}/teams`)
      .set(bearer(tokenAdmin))
      .send({ name: `Away ${suffix}`, slug: `away-${suffix}` })
      .expect(201);
    teamAwayId = teamAway.body?.id as string;

    const tourRes = await request(http)
      .post(`/tenants/${tenantId}/tournaments`)
      .set(bearer(tokenAdmin))
      .send({
        name: `Manual ${suffix}`,
        slug: `man-${suffix}`,
        format: TournamentFormat.MANUAL,
        groupCount: 1,
        minTeams: 2,
      })
      .expect(201);
    tournamentId = tourRes.body?.id as string;

    await request(http)
      .post(`/tournaments/${tournamentId}/teams/${teamHomeId}`)
      .set(bearer(tokenAdmin))
      .expect(201);

    await request(http)
      .post(`/tournaments/${tournamentId}/teams/${teamAwayId}`)
      .set(bearer(tokenAdmin))
      .expect(201);
  });

  afterAll(async () => {
    if (!app || !prisma || !tenantId) return;
    await prisma.match.deleteMany({ where: { tenantId } });
    await prisma.tournamentTeam.deleteMany({ where: { tenantId } });
    await prisma.tournament.deleteMany({ where: { tenantId } });
    await prisma.team.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await app.close();
  });

  it('second attach of the same match returns 404 (already linked)', async () => {
    const http = app.getHttpServer();
    const startTime = new Date().toISOString();

    const standalone = await request(http)
      .post(`/tenants/${tenantId}/standalone-matches`)
      .set(bearer(tokenAdmin))
      .send({
        homeTeamId: teamHomeId,
        awayTeamId: teamAwayId,
        startTime,
      })
      .expect(201);

    const matchId = standalone.body?.id as string;
    expect(matchId).toBeTruthy();

    await request(http)
      .post(`/tenants/${tenantId}/standalone-matches/${matchId}/attach`)
      .set(bearer(tokenAdmin))
      .send({ tournamentId })
      .expect(201);

    await request(http)
      .post(`/tenants/${tenantId}/standalone-matches/${matchId}/attach`)
      .set(bearer(tokenAdmin))
      .send({ tournamentId })
      .expect(404);
  });

  it('second createMatch with same payload returns 409 MATCH_DUPLICATE', async () => {
    const http = app.getHttpServer();
    const startTime = new Date(Date.now() + 120_000).toISOString();
    const body = {
      homeTeamId: teamHomeId,
      awayTeamId: teamAwayId,
      startTime,
    };

    const a = await request(http)
      .post(`/tournaments/${tournamentId}/matches`)
      .set(bearer(tokenAdmin))
      .send(body)
      .expect(201);

    expect(a.body?.id).toBeTruthy();

    const dup = await request(http)
      .post(`/tournaments/${tournamentId}/matches`)
      .set(bearer(tokenAdmin))
      .send(body)
      .expect(409);

    expect(dup.body?.code).toBe('MATCH_DUPLICATE');

    const countSameSlot = await prisma.match.count({
      where: {
        tournamentId,
        homeTeamId: teamHomeId,
        awayTeamId: teamAwayId,
        startTime: new Date(startTime),
      },
    });
    expect(countSameSlot).toBe(1);
  });

  it('second createStandaloneMatch with same payload returns 409 MATCH_DUPLICATE', async () => {
    const http = app.getHttpServer();
    const startTime = new Date(Date.now() + 180_000).toISOString();
    const body = {
      homeTeamId: teamHomeId,
      awayTeamId: teamAwayId,
      startTime,
    };

    const first = await request(http)
      .post(`/tenants/${tenantId}/standalone-matches`)
      .set(bearer(tokenAdmin))
      .send(body)
      .expect(201);

    expect(first.body?.id).toBeTruthy();

    const dup = await request(http)
      .post(`/tenants/${tenantId}/standalone-matches`)
      .set(bearer(tokenAdmin))
      .send(body)
      .expect(409);

    expect(dup.body?.code).toBe('MATCH_DUPLICATE');

    const countStandalone = await prisma.match.count({
      where: {
        tenantId,
        tournamentId: null,
        homeTeamId: teamHomeId,
        awayTeamId: teamAwayId,
        startTime: new Date(startTime),
      },
    });
    expect(countStandalone).toBe(1);
  });
});

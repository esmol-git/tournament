/**
 * Лимит /auth/login (5/мин на IP). Включается через E2E_AUTH_THROTTLE=1 в app.module.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const hasDbAndJwt =
  Boolean(process.env.DATABASE_URL?.trim()) &&
  Boolean(process.env.JWT_SECRET?.trim());

const describeOrSkip = hasDbAndJwt ? describe : describe.skip;

describeOrSkip('Auth login throttling (e2e)', () => {
  let app: INestApplication<App>;
  let prevThrottle: string | undefined;

  beforeAll(async () => {
    prevThrottle = process.env.E2E_AUTH_THROTTLE;
    process.env.E2E_AUTH_THROTTLE = '1';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (prevThrottle === undefined) delete process.env.E2E_AUTH_THROTTLE;
    else process.env.E2E_AUTH_THROTTLE = prevThrottle;
    await app?.close();
  });

  it('returns 429 on 6th POST /auth/login within the same minute', async () => {
    const http = app.getHttpServer();
    const body = {
      username: 'no-such-user-e2e-throttle',
      password: 'wrong',
      tenantSlug: 'no-such-tenant-e2e-throttle',
    };

    for (let i = 0; i < 5; i += 1) {
      await request(http)
        .post('/auth/login')
        .send(body)
        .expect((res) => {
          expect([401, 403]).toContain(res.status);
        });
    }

    await request(http).post('/auth/login').send(body).expect(429);
  });
});

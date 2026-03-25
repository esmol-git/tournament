import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  // Express + Multer: загрузка файлов через FileInterceptor (multer) в контроллерах
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use((req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.trim()
        ? incoming.trim()
        : randomUUID();
    (req as { requestId?: string }).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  const isProd = process.env.NODE_ENV === 'production';
  const allowedOriginPatterns = [/^https?:\/\/([a-z0-9-]+)\.lvh\.me(:\d+)?$/i];
  const allowedOrigins = new Set([
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ]);
  // Production: comma-separated origins, e.g. CORS_ORIGINS=https://tournament-platform.ru,https://www.tournament-platform.ru
  for (const o of (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    allowedOrigins.add(o);
  }

  // Базовые security headers. CSP отключён — Swagger UI использует inline-скрипты.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: isProd
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  // Для dev-среды (когда заходят по IP типа `http://192.168.x.x:3000`) разрешаем все origins,
  // чтобы публичные страницы могли без проблем делать запросы к API.
  app.enableCors({
    origin: isProd
      ? (origin, callback) => {
          if (!origin) {
            callback(null, true);
            return;
          }
          if (allowedOrigins.has(origin)) {
            callback(null, true);
            return;
          }
          const isPatternAllowed = allowedOriginPatterns.some((re) => re.test(origin));
          callback(
            isPatternAllowed ? null : new Error('Not allowed by CORS'),
            isPatternAllowed,
          );
        }
      : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Tournament Platform API')
    .setDescription('API for multi-tenant tournament platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 4000);
}

bootstrap();

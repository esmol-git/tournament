import { Module } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MetaModule } from './meta/meta.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { MatchesModule } from './matches/matches.module';
import { TeamsModule } from './teams/teams.module';
import { PlayersModule } from './players/players.module';
import { StorageModule } from './storage/storage.module';
import { PlatformModule } from './platform/platform.module';
import { PublicModule } from './public/public.module';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { TenantSubscriptionGuard } from './auth/tenant-subscription.guard';
import { TenantAdminStaffGuard } from './auth/tenant-admin-staff.guard';
import {
  ModeratorForbiddenStaffGuard,
  ModeratorReadOnlyStaffGuard,
} from './auth/moderator-staff-scope.guard';
import { AuditModule } from './audit/audit.module';
import { PlansModule } from './plans/plans.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LeadsModule } from './leads/leads.module';

function truthyEnv(v: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(v ?? '').toLowerCase());
}

function authBruteForcePath(context: ExecutionContext): string {
  const req = context.switchToHttp().getRequest();
  const raw = (req?.path ?? req?.url ?? '') as string;
  return raw.split('?')[0];
}

function isOptionsRequest(context: ExecutionContext): boolean {
  return context.switchToHttp().getRequest()?.method === 'OPTIONS';
}

/**
 * Jest задаёт JEST_WORKER_ID — тогда throttling отключаем для обычных e2e.
 * Явно `E2E_AUTH_THROTTLE=1` в процессе (см. throttle-login e2e) — снова включаем лимит на /auth/*.
 */
function skipThrottlingUnderJest(): boolean {
  if (process.env.E2E_AUTH_THROTTLE === '1') return false;
  return Boolean(process.env.JEST_WORKER_ID);
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({}),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const globalPerMinute = Number(
          config.get('THROTTLE_GLOBAL_PER_MINUTE'),
        );
        const globalLimit =
          Number.isFinite(globalPerMinute) && globalPerMinute > 0
            ? globalPerMinute
            : 2000;

        const useRedis = truthyEnv(config.get<string>('USE_REDIS_THROTTLE'));
        const redisUrl =
          config.get<string>('REDIS_URL')?.trim() || 'redis://127.0.0.1:6379';

        let storage:
          | InstanceType<typeof ThrottlerStorageRedisService>
          | undefined;
        if (useRedis) {
          const redis = new Redis(redisUrl, {
            maxRetriesPerRequest: null,
            enableOfflineQueue: false,
            retryStrategy: (times) => {
              if (times > 8) return null;
              return Math.min(times * 200, 3000);
            },
          });
          // Иначе ioredis шлёт «Unhandled error event» при недоступном Redis.
          redis.on('error', () => {
            /* throttler сам получит отказ на команде */
          });
          storage = new ThrottlerStorageRedisService(redis);
        }

        return {
          ...(storage ? { storage } : {}),
          throttlers: [
            {
              name: 'default',
              ttl: seconds(60),
              limit: 5,
              // Только login / register / refresh (жёсткий лимит; refresh — @Throttle 10).
              skipIf: (context: ExecutionContext) => {
                if (skipThrottlingUnderJest()) return true;
                if (isOptionsRequest(context)) return true;
                const path = authBruteForcePath(context);
                return !/^\/auth\/(login|register|refresh)$/.test(path);
              },
            },
            {
              name: 'global',
              ttl: seconds(60),
              limit: globalLimit,
              // Общий «потолок» на IP против сканирования; админка обычно укладывается в 2000/мин.
              skipIf: (context: ExecutionContext) =>
                skipThrottlingUnderJest() || isOptionsRequest(context),
            },
          ],
        };
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    MetaModule,
    TournamentsModule,
    MatchesModule,
    TeamsModule,
    PlayersModule,
    // S3 / MinIO — StorageService, POST /upload
    StorageModule,
    PlatformModule,
    PublicModule,
    LeadsModule,
    AuditModule,
    PlansModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    TenantSubscriptionGuard,
    TenantAdminStaffGuard,
    ModeratorReadOnlyStaffGuard,
    ModeratorForbiddenStaffGuard,
    AllExceptionsFilter,
    { provide: APP_FILTER, useExisting: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

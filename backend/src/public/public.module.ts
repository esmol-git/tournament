import { Module } from '@nestjs/common';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { CompetitionEditionsModule } from '../competition-editions/competition-editions.module';
import { PublicController } from './public.controller';
import { PublicHttpCacheInterceptor } from './public-http-cache.interceptor';

@Module({
  imports: [TournamentsModule, CompetitionEditionsModule],
  controllers: [PublicController],
  providers: [PublicHttpCacheInterceptor],
})
export class PublicModule {}

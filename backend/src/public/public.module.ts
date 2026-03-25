import { Module } from '@nestjs/common';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { PublicController } from './public.controller';

@Module({
  imports: [TournamentsModule],
  controllers: [PublicController],
})
export class PublicModule {}

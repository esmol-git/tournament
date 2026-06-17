import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { MatchStartingSoonScheduler } from '../notifications/match-starting-soon.scheduler';

@Module({
  imports: [PrismaModule, TournamentsModule, AuthModule],
  controllers: [MatchesController],
  providers: [MatchesService, MatchStartingSoonScheduler],
})
export class MatchesModule {}

import { Module } from '@nestjs/common';
import { TournamentRostersController } from './tournament-rosters.controller';
import { TournamentRostersService } from './tournament-rosters.service';

@Module({
  controllers: [TournamentRostersController],
  providers: [TournamentRostersService],
  exports: [TournamentRostersService],
})
export class TournamentRostersModule {}

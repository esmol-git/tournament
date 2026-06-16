import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { TournamentRegistrationsController } from './tournament-registrations.controller';
import { TournamentRegistrationsService } from './tournament-registrations.service';

@Module({
  imports: [PrismaModule, AuthModule, forwardRef(() => TournamentsModule)],
  controllers: [TournamentRegistrationsController],
  providers: [TournamentRegistrationsService],
  exports: [TournamentRegistrationsService],
})
export class TournamentRegistrationsModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TournamentTemplatesController } from './tournament-templates.controller';
import { TournamentTemplatesService } from './tournament-templates.service';

@Module({
  imports: [PrismaModule],
  controllers: [TournamentTemplatesController],
  providers: [TournamentTemplatesService],
  exports: [TournamentTemplatesService],
})
export class TournamentTemplatesModule {}

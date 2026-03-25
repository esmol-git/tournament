import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { TeamCategoriesController } from './team-categories/team-categories.controller';
import { TeamCategoriesService } from './team-categories/team-categories.service';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [TeamsController, TeamCategoriesController],
  providers: [TeamsService, TeamCategoriesService],
})
export class TeamsModule {}

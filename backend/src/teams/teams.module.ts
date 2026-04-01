import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { StadiumsController } from './stadiums/stadiums.controller';
import { StadiumsService } from './stadiums/stadiums.service';
import { RefereesController } from './referees/referees.controller';
import { RefereesService } from './referees/referees.service';
import { RefereeCategoriesController } from './referee-categories/referee-categories.controller';
import { RefereeCategoriesService } from './referee-categories/referee-categories.service';
import { RefereePositionsController } from './referee-positions/referee-positions.controller';
import { RefereePositionsService } from './referee-positions/referee-positions.service';
import { ManagementMembersController } from './management-members/management-members.controller';
import { ManagementMembersService } from './management-members/management-members.service';
import { CompetitionsController } from './competitions/competitions.controller';
import { CompetitionsService } from './competitions/competitions.service';
import { SeasonsController } from './seasons/seasons.controller';
import { SeasonsService } from './seasons/seasons.service';
import { ReferenceDocumentsController } from './reference-documents/reference-documents.controller';
import { ReferenceDocumentsService } from './reference-documents/reference-documents.service';
import { AgeGroupsController } from './age-groups/age-groups.controller';
import { AgeGroupsService } from './age-groups/age-groups.service';
import { RegionsController } from './regions/regions.controller';
import { RegionsService } from './regions/regions.service';
import { ProtocolEventTypesController } from './protocol-event-types/protocol-event-types.controller';
import { ProtocolEventTypesService } from './protocol-event-types/protocol-event-types.service';
import { MatchScheduleReasonsController } from './match-schedule-reasons/match-schedule-reasons.controller';
import { MatchScheduleReasonsService } from './match-schedule-reasons/match-schedule-reasons.service';
import { TeamCategoriesController } from './team-categories/team-categories.controller';
import { TeamCategoriesService } from './team-categories/team-categories.service';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [
    TeamsController,
    StadiumsController,
    RefereesController,
    RefereeCategoriesController,
    RefereePositionsController,
    ManagementMembersController,
    CompetitionsController,
    SeasonsController,
    ReferenceDocumentsController,
    AgeGroupsController,
    RegionsController,
    ProtocolEventTypesController,
    MatchScheduleReasonsController,
    TeamCategoriesController,
  ],
  providers: [
    TeamsService,
    StadiumsService,
    RefereesService,
    RefereeCategoriesService,
    RefereePositionsService,
    ManagementMembersService,
    CompetitionsService,
    SeasonsService,
    ReferenceDocumentsService,
    AgeGroupsService,
    RegionsService,
    ProtocolEventTypesService,
    MatchScheduleReasonsService,
    TeamCategoriesService,
  ],
})
export class TeamsModule {}

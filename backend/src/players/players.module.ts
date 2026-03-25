import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [PlayersController],
  providers: [PlayersService],
})
export class PlayersModule {}

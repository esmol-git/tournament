import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { StoragePublicController } from './storage-public.controller';

@Module({
  controllers: [StorageController, StoragePublicController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}

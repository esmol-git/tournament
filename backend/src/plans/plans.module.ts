import { Module } from '@nestjs/common';
import { PublicPlansController } from './public-plans.controller';
import { PublicPlansService } from './public-plans.service';

@Module({
  controllers: [PublicPlansController],
  providers: [PublicPlansService],
})
export class PlansModule {}

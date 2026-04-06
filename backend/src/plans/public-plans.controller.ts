import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PublicPlansService,
  type PublicPlanItemDto,
} from './public-plans.service';

/**
 * Публичный прайс для лендинга: без авторизации.
 * Цены — справочные; лимиты и `features` согласованы с `subscription-plan-features.util`.
 */
@ApiTags('public-plans')
@Controller('api/plans')
export class PublicPlansController {
  constructor(private readonly publicPlans: PublicPlansService) {}

  @Get()
  @ApiOperation({ summary: 'Публичный список тарифов (для лендинга)' })
  async getPublicPlans(): Promise<PublicPlanItemDto[]> {
    return this.publicPlans.getPublicPlans();
  }
}

import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { Request } from 'express';
import { CreateDemoLeadDto } from './dto/create-demo-lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('public')
@Controller('public/leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post('demo')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Отправить заявку на демо с лендинга' })
  createDemoLead(@Body() dto: CreateDemoLeadDto, @Req() req: Request) {
    return this.leadsService.createDemoLead(dto, req);
  }
}

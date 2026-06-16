import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantParamConsistencyGuard } from '../auth/tenant-param-consistency.guard';
import { TenantSubscriptionGuard } from '../auth/tenant-subscription.guard';
import { TenantZoneGuard } from '../auth/tenant-zone.guard';
import { TenantAdminStaffGuard } from '../auth/tenant-admin-staff.guard';
import { TournamentManageGuard } from '../auth/tournament-manage.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { CreateTournamentRegistrationDto } from './dto/create-tournament-registration.dto';
import { ReviewTournamentRegistrationDto } from './dto/review-tournament-registration.dto';
import { TournamentRegistrationsService } from './tournament-registrations.service';

@ApiTags('tournament-registrations')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
)
@Controller()
export class TournamentRegistrationsController {
  constructor(private readonly service: TournamentRegistrationsService) {}

  @Get('tournaments/:id/registrations')
  list(
    @Param('id') tournamentId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.listForTournament(tournamentId, req.user);
  }

  @Get('tournaments/:id/registrations/stats')
  @UseGuards(TournamentManageGuard)
  stats(@Param('id') tournamentId: string) {
    return this.service.registrationStats(tournamentId);
  }

  @Post('tournaments/:id/registrations')
  create(
    @Param('id') tournamentId: string,
    @Body() dto: CreateTournamentRegistrationDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.create(tournamentId, dto, req.user);
  }

  @Post('tournaments/:id/registrations/:registrationId/submit')
  submit(
    @Param('id') tournamentId: string,
    @Param('registrationId') registrationId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.submit(registrationId, tournamentId, req.user);
  }

  @Patch('tournaments/:id/registrations/:registrationId/review')
  @UseGuards(TournamentManageGuard)
  review(
    @Param('id') tournamentId: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: ReviewTournamentRegistrationDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.review(registrationId, tournamentId, dto, req.user);
  }

  @Delete('tournaments/:id/registrations/:registrationId')
  withdraw(
    @Param('id') tournamentId: string,
    @Param('registrationId') registrationId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.withdraw(registrationId, tournamentId, req.user);
  }
}

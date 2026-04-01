import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantParamConsistencyGuard } from '../auth/tenant-param-consistency.guard';
import { TenantSubscriptionGuard } from '../auth/tenant-subscription.guard';
import { TenantZoneGuard } from '../auth/tenant-zone.guard';
import { UserQueryDto } from './dto/user-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { Request } from 'express';
import { JwtPayload } from '../auth/jwt.strategy';
import { UiSettingsDto } from './dto/ui-settings.dto';
import { UpdateTenantSocialLinksDto } from './dto/update-tenant-social-links.dto';

@ApiTags('users')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/ui-settings')
  async getMyUiSettings(@Req() req: Request & { user: JwtPayload }) {
    return this.usersService.getUiSettings(req.user.sub);
  }

  @Patch('me/ui-settings')
  async patchMyUiSettings(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UiSettingsDto,
  ) {
    return this.usersService.patchUiSettings(req.user.sub, dto);
  }

  @Get('me')
  async getMe(@Req() req: Request & { user: JwtPayload }) {
    return this.usersService.getProfile(req.user.sub, req.user.tenantId);
  }

  @Patch('me')
  async patchMe(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UpdateMyProfileDto,
  ) {
    return this.usersService.updateMyProfile(
      req.user.sub,
      req.user.tenantId,
      dto,
    );
  }

  @Get('me/tenant-social-links')
  async getMyTenantSocialLinks(@Req() req: Request & { user: JwtPayload }) {
    return this.usersService.getMyTenantSocialLinks(req.user.sub, req.user.tenantId);
  }

  @Patch('me/tenant-social-links')
  async patchMyTenantSocialLinks(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UpdateTenantSocialLinksDto,
  ) {
    return this.usersService.updateMyTenantSocialLinks(
      req.user.sub,
      req.user.tenantId,
      dto,
    );
  }

  @Get()
  async findAll(
    @Req() req: Request & { user: JwtPayload },
    @Query() query: UserQueryDto,
  ) {
    return this.usersService.findAll(req.user.tenantId, query, {
      excludeUserId: query.excludeSelf ? req.user.sub : undefined,
    });
  }

  @Post()
  async create(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(req.user.tenantId, dto);
  }

  @Patch(':id')
  async update(
    @Req() req: Request & { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  async delete(
    @Req() req: Request & { user: JwtPayload },
    @Param('id') id: string,
  ) {
    return this.usersService.delete(req.user.tenantId, id, req.user.sub);
  }

  @Post(':id/block')
  async block(
    @Req() req: Request & { user: JwtPayload },
    @Param('id') id: string,
    @Body('blocked') blocked: boolean,
  ) {
    return this.usersService.setBlocked(req.user.tenantId, id, blocked, req.user.sub);
  }
}

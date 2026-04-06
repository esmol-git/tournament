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
import { TenantAdminStaffGuard } from '../auth/tenant-admin-staff.guard';
import { UserQueryDto } from './dto/user-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { Request } from 'express';
import { JwtPayload } from '../auth/jwt.strategy';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { UiSettingsDto } from './dto/ui-settings.dto';
import { UpdateTenantSocialLinksDto } from './dto/update-tenant-social-links.dto';
import { UpdateTenantPublicBrandingDto } from './dto/update-tenant-public-branding.dto';
import { UpdateMyTenantSubscriptionPlanDto } from './dto/update-my-tenant-subscription-plan.dto';
import { UpdateTenantAllowUserDeletionDto } from './dto/update-tenant-allow-user-deletion.dto';

@ApiTags('users')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Настройки админ-UI организации (тема/локаль/акцент) — общие для всех пользователей tenant. */
  @Get('me/ui-settings')
  async getMyUiSettings(@Req() req: Request & { user: JwtPayload }) {
    return this.usersService.getTenantUiSettings(req.user.tenantId);
  }

  @Patch('me/ui-settings')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN)
  async patchMyUiSettings(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UiSettingsDto,
  ) {
    return this.usersService.patchTenantUiSettings(req.user.tenantId, dto);
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
      req.user.role,
    );
  }

  @Get('me/tenant-social-links')
  async getMyTenantSocialLinks(@Req() req: Request & { user: JwtPayload }) {
    return this.usersService.getMyTenantSocialLinks(
      req.user.sub,
      req.user.tenantId,
    );
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

  @Get('me/tenant-public-branding')
  async getMyTenantPublicBranding(@Req() req: Request & { user: JwtPayload }) {
    return this.usersService.getMyTenantPublicBranding(
      req.user.sub,
      req.user.tenantId,
    );
  }

  @Patch('me/tenant-public-branding')
  async patchMyTenantPublicBranding(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UpdateTenantPublicBrandingDto,
  ) {
    return this.usersService.updateMyTenantPublicBranding(
      req.user.sub,
      req.user.tenantId,
      dto,
    );
  }

  @Get('me/tenant-subscription-plan')
  async getMyTenantSubscriptionPlan(
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.usersService.getMyTenantSubscriptionPlan(
      req.user.sub,
      req.user.tenantId,
    );
  }

  @Patch('me/tenant-subscription-plan')
  async patchMyTenantSubscriptionPlan(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UpdateMyTenantSubscriptionPlanDto,
  ) {
    return this.usersService.updateMyTenantSubscriptionPlan(
      req.user.sub,
      req.user.tenantId,
      dto,
    );
  }

  @Patch('me/tenant-allow-user-deletion')
  async patchMyTenantAllowUserDeletion(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UpdateTenantAllowUserDeletionDto,
  ) {
    return this.usersService.updateMyTenantAllowUserDeletion(
      req.user.sub,
      req.user.tenantId,
      dto.allowUserDeletion,
    );
  }

  /** Список пользователей тенанта: управление — только TENANT_ADMIN; выбор в формах (напр. админы турнира) — ещё и TOURNAMENT_ADMIN. */
  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.TOURNAMENT_ADMIN)
  async findAll(
    @Req() req: Request & { user: JwtPayload },
    @Query() query: UserQueryDto,
  ) {
    return this.usersService.findAll(req.user.tenantId, query, {
      excludeUserId: query.excludeSelf ? req.user.sub : undefined,
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.TENANT_ADMIN)
  async create(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(req.user.tenantId, dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TENANT_ADMIN)
  async update(
    @Req() req: Request & { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TENANT_ADMIN)
  async delete(
    @Req() req: Request & { user: JwtPayload },
    @Param('id') id: string,
  ) {
    return this.usersService.delete(req.user.tenantId, id, req.user.sub);
  }

  @Post(':id/block')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TENANT_ADMIN)
  async block(
    @Req() req: Request & { user: JwtPayload },
    @Param('id') id: string,
    @Body('blocked') blocked: boolean,
  ) {
    return this.usersService.setBlocked(
      req.user.tenantId,
      id,
      blocked,
      req.user.sub,
    );
  }
}

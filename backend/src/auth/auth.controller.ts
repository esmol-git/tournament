import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  clearAuthRefreshCookie,
  parseRefreshTokenFromCookieHeader,
  setAuthRefreshCookie,
} from './auth-refresh-cookie.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { seconds, Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtPayload } from './jwt.strategy';
import { TenantParamConsistencyGuard } from './tenant-param-consistency.guard';
import { TenantZoneGuard } from './tenant-zone.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    setAuthRefreshCookie(res, req, result.refreshToken);
    return result;
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const originalHost = (req.headers as Record<string, unknown>)[
      'x-original-host'
    ];
    const host =
      typeof originalHost === 'string' ? originalHost : req.headers.host;
    const result = await this.authService.loginFromHost(dto, host);
    setAuthRefreshCookie(res, req, result.refreshToken);
    return result;
  }

  @Post('platform/login')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  async platformLogin(
    @Body() dto: PlatformLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.platformLogin(dto);
    setAuthRefreshCookie(res, req, result.refreshToken);
    return result;
  }

  @Get('tenant/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveTenant(@Req() req: { headers: { host?: string } }) {
    const originalHost = (req.headers as Record<string, unknown>)[
      'x-original-host'
    ];
    const host =
      typeof originalHost === 'string' ? originalHost : req.headers.host;
    return this.authService.resolveTenantFromHost(host);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard, TenantParamConsistencyGuard, TenantZoneGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request & { user: JwtPayload },
    @Res({ passthrough: true }) res: Response,
  ) {
    clearAuthRefreshCookie(res, req);
    return this.authService.logout(req.user.sub);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fromBody = dto.refreshToken?.trim();
    const fromCookie = parseRefreshTokenFromCookieHeader(req.headers.cookie);
    const raw = fromBody || fromCookie;
    if (!raw) {
      throw new UnauthorizedException({
        message: 'Сессия истекла. Войдите снова.',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }
    const result = await this.authService.refresh(raw);
    setAuthRefreshCookie(res, req, result.refreshToken);
    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, TenantParamConsistencyGuard, TenantZoneGuard)
  async me(@Req() req: { user: JwtPayload }) {
    return this.authService.me(req.user.sub);
  }
}

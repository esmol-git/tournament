import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
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
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: { headers: { host?: string } },
  ) {
    const originalHost = (req.headers as Record<string, unknown>)['x-original-host'];
    const host = typeof originalHost === 'string' ? originalHost : req.headers.host;
    return this.authService.loginFromHost(dto, host);
  }

  @Post('platform/login')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  async platformLogin(@Body() dto: PlatformLoginDto) {
    return this.authService.platformLogin(dto);
  }

  @Get('tenant/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveTenant(@Req() req: { headers: { host?: string } }) {
    const originalHost = (req.headers as Record<string, unknown>)['x-original-host'];
    const host = typeof originalHost === 'string' ? originalHost : req.headers.host;
    return this.authService.resolveTenantFromHost(host);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard, TenantParamConsistencyGuard, TenantZoneGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: { user: JwtPayload }) {
    return this.authService.logout(req.user.sub);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, TenantParamConsistencyGuard, TenantZoneGuard)
  async me(@Req() req: { user: JwtPayload }) {
    return this.authService.me(req.user.sub);
  }
}

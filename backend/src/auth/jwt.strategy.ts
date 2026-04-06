import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiErrorCode } from '../common/api-error-codes';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '@prisma/client';
import { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = configService.get<string>('JWT_SECRET')?.trim();
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException({
        message: 'Недействительный или просроченный токен',
        code: ApiErrorCode.UNAUTHORIZED,
      });
    }

    const user = await this.usersService.findForJwtValidation(payload.sub);
    if (!user || user.blocked) {
      throw new UnauthorizedException({
        message: 'Недействительный или просроченный токен',
        code: ApiErrorCode.UNAUTHORIZED,
      });
    }

    return {
      sub: user.id,
      email: user.email ?? '',
      tenantId: user.tenantId,
      role: user.role,
    };
  }
}

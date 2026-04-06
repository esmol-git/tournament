import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiErrorCode } from '../common/api-error-codes';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(
    err: unknown,
    user: TUser,
    _info: unknown,
    _context: ExecutionContext,
  ): TUser {
    if (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException({
        message: 'Требуется авторизация',
        code: ApiErrorCode.UNAUTHORIZED,
      });
    }
    if (!user) {
      throw new UnauthorizedException({
        message: 'Требуется авторизация',
        code: ApiErrorCode.UNAUTHORIZED,
      });
    }
    return user;
  }
}

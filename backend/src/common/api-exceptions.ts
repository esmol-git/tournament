import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiErrorCode } from './api-error-codes';

export function throwTournamentNotFound(): never {
  throw new NotFoundException({
    message: 'Турнир не найден',
    code: ApiErrorCode.TOURNAMENT_NOT_FOUND,
  });
}

export function throwInsufficientRole(
  message = 'Недостаточно прав для этой операции',
): never {
  throw new ForbiddenException({
    message,
    code: ApiErrorCode.INSUFFICIENT_ROLE,
  });
}

export function throwUnauthorized(message = 'Требуется авторизация'): never {
  throw new UnauthorizedException({
    message,
    code: ApiErrorCode.UNAUTHORIZED,
  });
}

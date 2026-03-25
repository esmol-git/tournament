import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (req.user?.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Platform access requires SUPER_ADMIN role');
    }
    return true;
  }
}

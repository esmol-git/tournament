import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { TenantContentGuard } from './tenant-content.guard';
import { TournamentContentGuard } from './tournament-content.guard';
import { TournamentManageGuard } from './tournament-manage.guard';
import { TournamentMatchStaffGuard } from './tournament-match-staff.guard';

@Module({
  imports: [PassportModule, JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    TournamentManageGuard,
    TournamentMatchStaffGuard,
    TournamentContentGuard,
    TenantContentGuard,
  ],
  exports: [
    AuthService,
    TournamentManageGuard,
    TournamentMatchStaffGuard,
    TournamentContentGuard,
    TenantContentGuard,
  ],
})
export class AuthModule {}

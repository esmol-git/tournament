import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './jwt.strategy';
import { UserRole } from '@prisma/client';
import {
  assertSubscriptionNotExpired,
  isTenantSubscriptionActive,
} from './subscription-access.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private async createRefreshToken(params: {
    userId: string;
    tenantId: string;
  }) {
    const rawToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const ttlDays =
      this.configService.get<number>('REFRESH_TOKEN_TTL_DAYS') ??
      // Keep it reasonable by default.
      30;

    await this.prisma.refreshToken.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        tokenHash,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });

    return rawToken;
  }

  private hashRefreshToken(rawToken: string) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private toTenantSlug(source: string): string {
    const base = source
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (base) return base;
    return `tenant-${crypto.randomBytes(4).toString('hex')}`;
  }

  private async ensureUniqueTenantSlug(base: string): Promise<string> {
    let candidate = base;
    let i = 2;
    while (await this.prisma.tenant.findUnique({ where: { slug: candidate } })) {
      candidate = `${base}-${i++}`;
    }
    return candidate;
  }

  async register(dto: RegisterDto) {
    const { email, password, firstName, lastName, tenantName, username } = dto;
    const normalizedUsername = username.trim().toLowerCase();
    const baseSlug = this.toTenantSlug(tenantName);
    const tenantSlug = await this.ensureUniqueTenantSlug(baseSlug);
    const tenant = await this.prisma.tenant.create({
      data: {
        slug: tenantSlug,
        name: tenantName.trim(),
      },
    });
    if (tenant.blocked) {
      throw new UnauthorizedException('Tenant is blocked');
    }
    assertSubscriptionNotExpired(tenant);

    const existing = await this.prisma.user.findFirst({
      where: { email, tenantId: tenant.id },
    });
    if (existing) {
      throw new UnauthorizedException('User already exists');
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        username: normalizedUsername,
        password: hashed,
        name: firstName.trim(),
        lastName: lastName.trim(),
        role: UserRole.TENANT_ADMIN,
        tenantId: tenant.id,
      },
    });

    const token = await this.signToken({
      sub: user.id,
      email: user.email,
      tenantId: tenant.id,
      role: user.role,
    });

    const refreshToken = await this.createRefreshToken({
      userId: user.id,
      tenantId: tenant.id,
    });

    return {
      accessToken: token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        lastName: user.lastName ?? '',
        role: user.role,
        tenantId: tenant.id,
      },
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        subscriptionPlan: tenant.subscriptionPlan,
        subscriptionStatus: tenant.subscriptionStatus,
        subscriptionEndsAt: tenant.subscriptionEndsAt,
      },
    };
  }

  async login(dto: LoginDto) {
    const { username, password } = dto;
    const tenantSlug = dto.tenantSlug?.trim();
    if (!tenantSlug) {
      throw new BadRequestException('Tenant slug is required for login');
    }
    const normalizedUsername = username.trim().toLowerCase();

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });
    if (!tenant) {
      throw new UnauthorizedException('Tenant not found');
    }
    if (tenant.blocked) {
      throw new UnauthorizedException('Tenant is blocked');
    }
    assertSubscriptionNotExpired(tenant);

    const user = await this.prisma.user.findFirst({
      where: { username: normalizedUsername, tenantId: tenant.id },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.signToken({
      sub: user.id,
      email: user.email,
      tenantId: tenant.id,
      role: user.role,
    });

    const refreshToken = await this.createRefreshToken({
      userId: user.id,
      tenantId: tenant.id,
    });

    return {
      accessToken: token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        lastName: user.lastName ?? '',
        role: user.role,
        tenantId: tenant.id,
      },
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        subscriptionPlan: tenant.subscriptionPlan,
        subscriptionStatus: tenant.subscriptionStatus,
        subscriptionEndsAt: tenant.subscriptionEndsAt,
      },
    };
  }

  private tenantSlugFromHost(hostname?: string): string | null {
    if (!hostname) return null

    const host = hostname.split(':')[0]?.toLowerCase()
    if (!host) return null

    // Dev: localhost (без subdomain) не даёт tenantSlug.
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return null

    // Dev: tenant.localhost -> tenant
    if (host.endsWith('.localhost')) {
      const parts = host.split('.')
      // [tenant, localhost]
      return parts.length === 2 ? parts[0]! : null
    }

    const parts = host.split('.')
    if (parts.length < 3) return null

    const sub = parts[0]!
    if (!sub || sub === 'www') return null
    return sub
  }

  async resolveTenantFromHost(hostname?: string): Promise<{
    tenantSlug: string | null
    blocked: boolean
  }> {
    const slug = this.tenantSlugFromHost(hostname)
    if (!slug) return { tenantSlug: null, blocked: false }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { slug: true, blocked: true },
    })

    if (!tenant) return { tenantSlug: null, blocked: false }
    return { tenantSlug: tenant.slug, blocked: tenant.blocked }
  }

  async loginFromHost(dto: LoginDto, hostname?: string) {
    const dtoTenantSlug = dto.tenantSlug?.trim()
    const hostResolved = await this.resolveTenantFromHost(hostname)
    const tenantSlug = dtoTenantSlug || hostResolved.tenantSlug

    if (!tenantSlug) throw new BadRequestException('Tenant slug is required for login')
    if (!dtoTenantSlug && hostResolved.blocked) throw new UnauthorizedException('Tenant is blocked')

    return this.login({ ...dto, tenantSlug })
  }

  async platformLogin(dto: PlatformLoginDto) {
    const normalizedUsername = dto.username.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { username: normalizedUsername, role: UserRole.SUPER_ADMIN },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.signToken({
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    });
    const refreshToken = await this.createRefreshToken({
      userId: user.id,
      tenantId: user.tenantId,
    });

    return {
      accessToken: token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        lastName: user.lastName ?? '',
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async me(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        lastName: true,
        role: true,
        tenantId: true,
        blocked: true,
        createdAt: true,
        tenant: {
          select: {
            subscriptionPlan: true,
            subscriptionStatus: true,
            subscriptionEndsAt: true,
            blocked: true,
          },
        },
      },
    });
    if (!u) {
      throw new UnauthorizedException('Invalid token');
    }
    const { tenant, ...rest } = u;
    return {
      ...rest,
      tenantSubscription: tenant
        ? {
            plan: tenant.subscriptionPlan,
            status: tenant.subscriptionStatus,
            endsAt: tenant.subscriptionEndsAt,
            active: isTenantSubscriptionActive(tenant),
          }
        : null,
    };
  }

  async refresh(refreshTokenRaw: string) {
    const tokenHash = this.hashRefreshToken(refreshTokenRaw);

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: true,
        tenant: true,
      },
    });

    if (
      !record ||
      record.revokedAt ||
      record.expiresAt <= new Date() ||
      record.user.blocked
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (record.user.role !== UserRole.SUPER_ADMIN) {
      if (record.tenant.blocked) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      assertSubscriptionNotExpired(record.tenant);
    }

    // Rotation: revoke current refresh token and issue a new one.
    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });

    const newRefreshToken = await this.createRefreshToken({
      userId: record.userId,
      tenantId: record.tenantId,
    });

    const accessToken = await this.signToken({
      sub: record.userId,
      email: record.user.email,
      tenantId: record.tenantId,
      role: record.user.role,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: record.user.id,
        email: record.user.email,
        username: record.user.username,
        name: record.user.name,
        lastName: record.user.lastName ?? '',
        role: record.user.role,
        tenantId: record.tenantId,
      },
    };
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  private async signToken(payload: JwtPayload): Promise<string> {
    const secret = this.configService.get<string>('JWT_SECRET') ?? 'dev-secret';
    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn: '7d',
    });
  }
}

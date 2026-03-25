import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { UserQueryDto } from './dto/user-query.dto';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  UiSettingsDto,
  type ThemeMode,
  type UiAccent,
  type UiLocale,
} from './dto/ui-settings.dto';

const DEFAULT_UI: {
  themeMode: ThemeMode;
  locale: UiLocale;
  accent: UiAccent;
} = {
  themeMode: 'system',
  locale: 'ru',
  accent: 'emerald',
};

const THEME_SET = new Set<string>(['light', 'dark', 'system']);
const LOCALE_SET = new Set<string>(['ru', 'en']);
const ACCENT_SET = new Set<string>([
  'emerald',
  'blue',
  'violet',
  'rose',
  'amber',
  'cyan',
]);

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  getUiSettings(userId: string) {
    return this.prisma.user
      .findUnique({
        where: { id: userId },
        select: { uiSettings: true },
      })
      .then((u) => this.normalizeUiSettings(u?.uiSettings ?? null));
  }

  async patchUiSettings(userId: string, dto: UiSettingsDto) {
    const current = await this.getUiSettings(userId);
    const next = {
      themeMode: dto.themeMode ?? current.themeMode,
      locale: dto.locale ?? current.locale,
      accent: dto.accent ?? current.accent,
    };
    await this.prisma.user.update({
      where: { id: userId },
      data: { uiSettings: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  }

  private normalizeUiSettings(raw: Prisma.JsonValue | null) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ...DEFAULT_UI };
    }
    const o = raw as Record<string, unknown>;
    const themeRaw = o.themeMode;
    const localeRaw = o.locale;
    const accentRaw = o.accent;
    const themeMode =
      typeof themeRaw === 'string' && THEME_SET.has(themeRaw.toLowerCase())
        ? (themeRaw.toLowerCase() as ThemeMode)
        : DEFAULT_UI.themeMode;
    const locale =
      typeof localeRaw === 'string' && LOCALE_SET.has(localeRaw.toLowerCase())
        ? (localeRaw.toLowerCase() as UiLocale)
        : DEFAULT_UI.locale;
    const accent =
      typeof accentRaw === 'string' && ACCENT_SET.has(accentRaw.toLowerCase())
        ? (accentRaw.toLowerCase() as UiAccent)
        : DEFAULT_UI.accent;
    return { themeMode, locale, accent };
  }

  async findAll(tenantId: string, query: UserQueryDto) {
    const { search, role, page = 1, pageSize = 20 } = query;

    const where: any = { tenantId };

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => this.toUserDto(u)),
      total,
      page,
      pageSize,
    };
  }

  async create(tenantId: string, dto: CreateUserDto) {
    const { email, username, name, lastName, password, role } = dto;
    const normalizedUsername = username.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new Error('User with this email already exists');
    }

    const existingUsername = await this.prisma.user.findFirst({
      where: { tenantId, username: normalizedUsername },
    });
    if (existingUsername) {
      throw new Error('User with this username already exists in organization');
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        username: normalizedUsername,
        name,
        lastName: lastName?.trim() ?? '',
        password: hashed,
        role: role ?? UserRole.USER,
        tenantId,
      },
    });

    return this.toUserDto(user);
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    const data: any = { ...dto };
    const current = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });
    if (!current) {
      throw new Error('User not found');
    }
    if (current.tenantId !== tenantId) {
      throw new ForbiddenException('Tenant mismatch');
    }

    if (dto.username !== undefined) {
      data.username = dto.username.trim().toLowerCase();
      const existingUsername = await this.prisma.user.findFirst({
        where: {
          tenantId: current.tenantId,
          username: data.username,
          id: { not: id },
        },
      });
      if (existingUsername) {
        throw new Error('User with this username already exists in organization');
      }
    }

    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName.trim();
    }

    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    } else {
      delete data.password;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
    });

    return this.toUserDto(user);
  }

  async delete(tenantId: string, id: string) {
    const current = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });
    if (!current) {
      throw new Error('User not found');
    }
    if (current.tenantId !== tenantId) {
      throw new ForbiddenException('Tenant mismatch');
    }
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }

  async setBlocked(tenantId: string, id: string, blocked: boolean) {
    const current = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });
    if (!current) {
      throw new Error('User not found');
    }
    if (current.tenantId !== tenantId) {
      throw new ForbiddenException('Tenant mismatch');
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: { blocked },
    });

    return this.toUserDto(user);
  }

  private toUserDto(u: any) {
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      name: u.name,
      lastName: u.lastName ?? '',
      role: u.role,
      blocked: u.blocked,
      createdAt: u.createdAt,
    };
  }
}

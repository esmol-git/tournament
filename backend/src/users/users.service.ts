import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { UserQueryDto } from './dto/user-query.dto';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { UpdateTenantSocialLinksDto } from './dto/update-tenant-social-links.dto';
import { tenantHasSubscriptionPlanFeature } from '../auth/subscription-plan-features.util';
import { UpdateTenantPublicBrandingDto } from './dto/update-tenant-public-branding.dto';
import { UpdateMyTenantSubscriptionPlanDto } from './dto/update-my-tenant-subscription-plan.dto';
import { UiSettingsDto } from './dto/ui-settings.dto';
import { normalizeAdminUiSettings } from './normalize-admin-ui-settings';
const PUBLIC_THEME_SET = new Set<string>(['light', 'dark', 'system']);
const PUBLIC_LANDING_SET = new Set<string>([
  'about',
  'tournaments',
  'participants',
  'media',
]);
const PUBLIC_TAB_ORDER_VALUES = ['table', 'chessboard', 'progress', 'playoff'] as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeOptionalLink(value?: string | null) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeHexColor(
    value: string | undefined,
    fallback: string,
  ): string | undefined {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) return fallback;
    return trimmed.toLowerCase();
  }

  private normalizeTabsOrder(
    value: string | undefined,
    fallback = 'table,chessboard,progress,playoff',
  ): string | undefined {
    if (value === undefined) return undefined;
    const raw = value
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    const unique: string[] = [];
    for (const item of raw) {
      if (!PUBLIC_TAB_ORDER_VALUES.includes(item as (typeof PUBLIC_TAB_ORDER_VALUES)[number])) {
        continue;
      }
      if (!unique.includes(item)) unique.push(item);
    }
    for (const item of PUBLIC_TAB_ORDER_VALUES) {
      if (!unique.includes(item)) unique.push(item);
    }
    return unique.join(',') || fallback;
  }

  async getProfile(userId: string, tenantId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!u || u.tenantId !== tenantId) {
      throw new NotFoundException('User not found');
    }
    return this.toUserDto(u);
  }

  async updateMyProfile(
    userId: string,
    tenantId: string,
    dto: UpdateMyProfileDto,
  ) {
    const newPass =
      dto.password !== undefined && String(dto.password).trim() !== ''
        ? dto.password
        : undefined;

    if (newPass) {
      const cur = dto.currentPassword?.trim();
      if (!cur) {
        throw new BadRequestException('Укажите текущий пароль');
      }
      const row = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { password: true, tenantId: true },
      });
      if (!row || row.tenantId !== tenantId) {
        throw new NotFoundException('User not found');
      }
      const match = await bcrypt.compare(cur, row.password);
      if (!match) {
        throw new BadRequestException('Неверный текущий пароль');
      }
    }

    const patch: UpdateUserDto = {};
    if (dto.username !== undefined) patch.username = dto.username;
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.lastName !== undefined) patch.lastName = dto.lastName;
    if (newPass) patch.password = newPass;
    return this.update(tenantId, userId, patch);
  }

  async getMyTenantSocialLinks(userId: string, tenantId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true, role: true },
    });
    if (!u || u.tenantId !== tenantId) {
      throw new NotFoundException('User not found');
    }
    if (u.role !== UserRole.TENANT_ADMIN && u.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only tenant admin can manage social links');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        websiteUrl: true,
        socialYoutubeUrl: true,
        socialInstagramUrl: true,
        socialTelegramUrl: true,
        showWebsiteLink: true,
        socialMaxUrl: true,
        showSocialYoutubeLink: true,
        showSocialInstagramLink: true,
        showSocialTelegramLink: true,
        showSocialMaxLink: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return {
      websiteUrl: tenant.websiteUrl,
      socialYoutubeUrl: tenant.socialYoutubeUrl,
      socialInstagramUrl: tenant.socialInstagramUrl,
      socialTelegramUrl: tenant.socialTelegramUrl,
      showWebsiteLink: tenant.showWebsiteLink,
      socialMaxUrl: tenant.socialMaxUrl,
      showSocialYoutubeLink: tenant.showSocialYoutubeLink,
      showSocialInstagramLink: tenant.showSocialInstagramLink,
      showSocialTelegramLink: tenant.showSocialTelegramLink,
      showSocialMaxLink: tenant.showSocialMaxLink,
    };
  }

  async updateMyTenantSocialLinks(
    userId: string,
    tenantId: string,
    dto: UpdateTenantSocialLinksDto,
  ) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true, role: true },
    });
    if (!u || u.tenantId !== tenantId) {
      throw new NotFoundException('User not found');
    }
    if (u.role !== UserRole.TENANT_ADMIN && u.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only tenant admin can manage social links');
    }

    const data: Prisma.TenantUpdateInput = {};
    const websiteUrl = this.normalizeOptionalLink(dto.websiteUrl);
    const socialYoutubeUrl = this.normalizeOptionalLink(dto.socialYoutubeUrl);
    const socialInstagramUrl = this.normalizeOptionalLink(dto.socialInstagramUrl);
    const socialTelegramUrl = this.normalizeOptionalLink(dto.socialTelegramUrl);
    const showWebsiteLink = dto.showWebsiteLink;
    const socialMaxUrl = this.normalizeOptionalLink(dto.socialMaxUrl);
    const showSocialYoutubeLink = dto.showSocialYoutubeLink;
    const showSocialInstagramLink = dto.showSocialInstagramLink;
    const showSocialTelegramLink = dto.showSocialTelegramLink;
    const showSocialMaxLink = dto.showSocialMaxLink;

    if (websiteUrl !== undefined) data.websiteUrl = websiteUrl;
    if (socialYoutubeUrl !== undefined) data.socialYoutubeUrl = socialYoutubeUrl;
    if (socialInstagramUrl !== undefined) data.socialInstagramUrl = socialInstagramUrl;
    if (socialTelegramUrl !== undefined) data.socialTelegramUrl = socialTelegramUrl;
    if (showWebsiteLink !== undefined) data.showWebsiteLink = showWebsiteLink;
    if (socialMaxUrl !== undefined) data.socialMaxUrl = socialMaxUrl;
    if (showSocialYoutubeLink !== undefined) data.showSocialYoutubeLink = showSocialYoutubeLink;
    if (showSocialInstagramLink !== undefined) {
      data.showSocialInstagramLink = showSocialInstagramLink;
    }
    if (showSocialTelegramLink !== undefined) data.showSocialTelegramLink = showSocialTelegramLink;
    if (showSocialMaxLink !== undefined) data.showSocialMaxLink = showSocialMaxLink;

    if (Object.keys(data).length === 0) {
      return this.getMyTenantSocialLinks(userId, tenantId);
    }

    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data,
      select: {
        websiteUrl: true,
        socialYoutubeUrl: true,
        socialInstagramUrl: true,
        socialTelegramUrl: true,
        showWebsiteLink: true,
        socialMaxUrl: true,
        showSocialYoutubeLink: true,
        showSocialInstagramLink: true,
        showSocialTelegramLink: true,
        showSocialMaxLink: true,
      },
    });

    return tenant;
  }

  async getMyTenantPublicBranding(userId: string, tenantId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true, role: true },
    });
    if (!u || u.tenantId !== tenantId) {
      throw new NotFoundException('User not found');
    }
    if (u.role !== UserRole.TENANT_ADMIN && u.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only tenant admin can manage public branding');
    }
    const tenantRow = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        subscriptionPlan: true,
        publicLogoUrl: true,
        publicFaviconUrl: true,
        publicAccentPrimary: true,
        publicAccentSecondary: true,
        publicThemeMode: true,
        publicTagline: true,
        publicOrganizationDisplayName: true,
        publicContactPhone: true,
        publicContactEmail: true,
        publicContactAddress: true,
        publicContactHours: true,
        publicSeoTitle: true,
        publicSeoDescription: true,
        publicOgImageUrl: true,
        publicDefaultLanding: true,
        publicTournamentTabsOrder: true,
        publicShowLeaderInFacts: true,
        publicShowTopStats: true,
        publicShowNewsInSidebar: true,
      },
    });
    if (!tenantRow) {
      throw new NotFoundException('Tenant not found');
    }
    if (
      u.role !== UserRole.SUPER_ADMIN &&
      !tenantHasSubscriptionPlanFeature(tenantRow.subscriptionPlan, 'public_site_admin_settings')
    ) {
      throw new ForbiddenException({
        message: 'Публичные настройки доступны с тарифа Premier',
        code: 'SUBSCRIPTION_PLAN_INSUFFICIENT',
      });
    }
    const { subscriptionPlan: _sp, ...tenant } = tenantRow;
    return tenant;
  }

  async updateMyTenantPublicBranding(
    userId: string,
    tenantId: string,
    dto: UpdateTenantPublicBrandingDto,
  ) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true, role: true },
    });
    if (!u || u.tenantId !== tenantId) {
      throw new NotFoundException('User not found');
    }
    if (u.role !== UserRole.TENANT_ADMIN && u.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only tenant admin can manage public branding');
    }

    const tenantForPlan = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionPlan: true },
    });
    if (!tenantForPlan) {
      throw new NotFoundException('Tenant not found');
    }
    if (
      u.role !== UserRole.SUPER_ADMIN &&
      !tenantHasSubscriptionPlanFeature(tenantForPlan.subscriptionPlan, 'public_site_admin_settings')
    ) {
      throw new ForbiddenException({
        message: 'Публичные настройки доступны с тарифа Premier',
        code: 'SUBSCRIPTION_PLAN_INSUFFICIENT',
      });
    }

    const data: Prisma.TenantUpdateInput = {};
    const logoUrl = this.normalizeOptionalLink(dto.publicLogoUrl);
    const faviconUrl = this.normalizeOptionalLink(dto.publicFaviconUrl);
    const accentPrimary = this.normalizeHexColor(dto.publicAccentPrimary, '#123c67');
    const accentSecondary = this.normalizeHexColor(dto.publicAccentSecondary, '#c80a48');
    const themeMode =
      typeof dto.publicThemeMode === 'string' &&
      PUBLIC_THEME_SET.has(dto.publicThemeMode.trim().toLowerCase())
        ? dto.publicThemeMode.trim().toLowerCase()
        : undefined;
    const tagline =
      dto.publicTagline === undefined
        ? undefined
        : dto.publicTagline === null
          ? null
          : dto.publicTagline.trim() || null;
    const organizationDisplayName =
      dto.publicOrganizationDisplayName === undefined
        ? undefined
        : dto.publicOrganizationDisplayName === null
          ? null
          : dto.publicOrganizationDisplayName.trim() || null;
    const contactPhone =
      dto.publicContactPhone === undefined
        ? undefined
        : dto.publicContactPhone === null
          ? null
          : dto.publicContactPhone.trim() || null;
    const contactEmail =
      dto.publicContactEmail === undefined
        ? undefined
        : dto.publicContactEmail === null
          ? null
          : dto.publicContactEmail.trim() || null;
    const contactAddress =
      dto.publicContactAddress === undefined
        ? undefined
        : dto.publicContactAddress === null
          ? null
          : dto.publicContactAddress.trim() || null;
    const contactHours =
      dto.publicContactHours === undefined
        ? undefined
        : dto.publicContactHours === null
          ? null
          : dto.publicContactHours.trim() || null;
    const seoTitle =
      dto.publicSeoTitle === undefined
        ? undefined
        : dto.publicSeoTitle === null
          ? null
          : dto.publicSeoTitle.trim() || null;
    const seoDescription =
      dto.publicSeoDescription === undefined
        ? undefined
        : dto.publicSeoDescription === null
          ? null
          : dto.publicSeoDescription.trim() || null;
    const ogImageUrl = this.normalizeOptionalLink(dto.publicOgImageUrl);
    const defaultLanding =
      typeof dto.publicDefaultLanding === 'string' &&
      PUBLIC_LANDING_SET.has(dto.publicDefaultLanding.trim().toLowerCase())
        ? dto.publicDefaultLanding.trim().toLowerCase()
        : undefined;
    const tabsOrder = this.normalizeTabsOrder(dto.publicTournamentTabsOrder);

    if (logoUrl !== undefined) data.publicLogoUrl = logoUrl;
    if (faviconUrl !== undefined) data.publicFaviconUrl = faviconUrl;
    if (accentPrimary !== undefined) data.publicAccentPrimary = accentPrimary;
    if (accentSecondary !== undefined) data.publicAccentSecondary = accentSecondary;
    if (themeMode !== undefined) data.publicThemeMode = themeMode;
    if (tagline !== undefined) data.publicTagline = tagline;
    if (organizationDisplayName !== undefined) {
      data.publicOrganizationDisplayName = organizationDisplayName;
    }
    if (contactPhone !== undefined) data.publicContactPhone = contactPhone;
    if (contactEmail !== undefined) data.publicContactEmail = contactEmail;
    if (contactAddress !== undefined) data.publicContactAddress = contactAddress;
    if (contactHours !== undefined) data.publicContactHours = contactHours;
    if (seoTitle !== undefined) data.publicSeoTitle = seoTitle;
    if (seoDescription !== undefined) data.publicSeoDescription = seoDescription;
    if (ogImageUrl !== undefined) data.publicOgImageUrl = ogImageUrl;
    if (defaultLanding !== undefined) data.publicDefaultLanding = defaultLanding;
    if (tabsOrder !== undefined) data.publicTournamentTabsOrder = tabsOrder;
    if (dto.publicShowLeaderInFacts !== undefined) {
      data.publicShowLeaderInFacts = dto.publicShowLeaderInFacts;
    }
    if (dto.publicShowTopStats !== undefined) {
      data.publicShowTopStats = dto.publicShowTopStats;
    }
    if (dto.publicShowNewsInSidebar !== undefined) {
      data.publicShowNewsInSidebar = dto.publicShowNewsInSidebar;
    }

    if (Object.keys(data).length === 0) {
      return this.getMyTenantPublicBranding(userId, tenantId);
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data,
      select: {
        publicLogoUrl: true,
        publicFaviconUrl: true,
        publicAccentPrimary: true,
        publicAccentSecondary: true,
        publicThemeMode: true,
        publicTagline: true,
        publicOrganizationDisplayName: true,
        publicContactPhone: true,
        publicContactEmail: true,
        publicContactAddress: true,
        publicContactHours: true,
        publicSeoTitle: true,
        publicSeoDescription: true,
        publicOgImageUrl: true,
        publicDefaultLanding: true,
        publicTournamentTabsOrder: true,
        publicShowLeaderInFacts: true,
        publicShowTopStats: true,
        publicShowNewsInSidebar: true,
      },
    });
  }

  async getMyTenantSubscriptionPlan(userId: string, tenantId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true, role: true },
    });
    if (!u || u.tenantId !== tenantId) {
      throw new NotFoundException('User not found');
    }
    if (u.role !== UserRole.TENANT_ADMIN && u.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only tenant admin can manage subscription plan');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async updateMyTenantSubscriptionPlan(
    userId: string,
    tenantId: string,
    dto: UpdateMyTenantSubscriptionPlanDto,
  ) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true, role: true },
    });
    if (!u || u.tenantId !== tenantId) {
      throw new NotFoundException('User not found');
    }
    if (u.role !== UserRole.TENANT_ADMIN && u.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only tenant admin can change subscription plan');
    }
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { subscriptionPlan: dto.subscriptionPlan },
      select: {
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
      },
    });
  }

  getTenantUiSettings(tenantId: string) {
    return this.prisma.tenant
      .findUnique({
        where: { id: tenantId },
        select: { adminUiSettings: true },
      })
      .then((t) => normalizeAdminUiSettings(t?.adminUiSettings ?? null));
  }

  async patchTenantUiSettings(tenantId: string, dto: UiSettingsDto) {
    const current = await this.getTenantUiSettings(tenantId);
    const next = {
      themeMode: dto.themeMode ?? current.themeMode,
      locale: dto.locale ?? current.locale,
      accent: dto.accent ?? current.accent,
    };
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { adminUiSettings: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  }

  async findAll(
    tenantId: string,
    query: UserQueryDto,
    opts?: { excludeUserId?: string },
  ) {
    const { search, role, page = 1, pageSize = 20 } = query;

    const where: any = { tenantId };

    if (opts?.excludeUserId) {
      where.id = { not: opts.excludeUserId };
    }

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
    const normalizedEmail = email?.trim() ? email.trim() : null;

    if (normalizedEmail) {
      const existing = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existing) {
        throw new BadRequestException('User with this email already exists');
      }
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
        email: normalizedEmail,
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

  async delete(tenantId: string, id: string, actorUserId?: string) {
    if (actorUserId && id === actorUserId) {
      throw new BadRequestException('Нельзя удалить собственную учётную запись');
    }
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

  async setBlocked(
    tenantId: string,
    id: string,
    blocked: boolean,
    actorUserId?: string,
  ) {
    if (actorUserId && id === actorUserId) {
      throw new BadRequestException('Нельзя заблокировать собственную учётную запись');
    }
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

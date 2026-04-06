import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveAuditDisplayFields } from './admin-audit-display';
import {
  type AuditHumanActionLang,
  formatAdminAuditHumanAction,
  formatAdminAuditHumanActionParts,
} from './admin-audit-human-action';
import {
  auditResourceLabelKey,
  fetchAuditResourceLabels,
  fetchAuditUserLabels,
} from './admin-audit-labels';
import {
  ListAdminAuditLogQueryDto,
  type AdminAuditQuickFilter,
} from './dto/list-admin-audit-log.query.dto';

function normalizeAuditLocale(raw?: string): AuditHumanActionLang {
  return raw?.trim().toLowerCase() === 'en' ? 'en' : 'ru';
}

function parseRangeStart(raw?: string): Date | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00.000Z`);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseRangeEnd(raw?: string): Date | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T23:59:59.999Z`);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function appendAnd(
  where: Prisma.AdminAuditLogWhereInput,
  clause: Prisma.AdminAuditLogWhereInput,
): void {
  const prev = where.AND;
  const arr = Array.isArray(prev) ? [...prev] : prev ? [prev] : [];
  arr.push(clause);
  where.AND = arr;
}

function utcCalendarDayRangeUtc(reference: Date): { start: Date; end: Date } {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const d = reference.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
  return { start, end };
}

const errorOr5xxWhere: Prisma.AdminAuditLogWhereInput = {
  OR: [{ result: 'error' }, { httpStatus: { gte: 500, lte: 599 } }],
};

const deniedWhere: Prisma.AdminAuditLogWhereInput = {
  OR: [{ result: 'denied' }, { httpStatus: 401 }, { httpStatus: 403 }],
};

const adminAuditLogListSelect = {
  id: true,
  userId: true,
  tenantId: true,
  role: true,
  action: true,
  resourceType: true,
  resourceId: true,
  result: true,
  httpStatus: true,
  errorCode: true,
  path: true,
  method: true,
  createdAt: true,
} satisfies Prisma.AdminAuditLogSelect;

type AdminAuditLogListRow = Prisma.AdminAuditLogGetPayload<{
  select: typeof adminAuditLogListSelect;
}>;

function applyQuickFilter(
  where: Prisma.AdminAuditLogWhereInput,
  quick: AdminAuditQuickFilter | undefined,
): void {
  if (!quick || quick === 'all') {
    return;
  }
  switch (quick) {
    case 'success':
      where.result = 'success';
      return;
    case 'delete':
      where.method = 'DELETE';
      return;
    case 'forbidden':
      appendAnd(where, {
        OR: [{ httpStatus: 403 }, { httpStatus: 401 }, { result: 'denied' }],
      });
      return;
    case 'error':
      appendAnd(where, {
        OR: [{ result: 'error' }, { httpStatus: { gte: 500, lte: 599 } }],
      });
      return;
    default:
      return;
  }
}

export type AdminAuditLogItemDto = {
  id: string;
  userId: string | null;
  tenantId: string | null;
  role: string | null;
  /** Семантический код как записан в БД (фильтры, отладка). */
  action: string;
  /** Тип ресурса после разбора path (для подписи в UI; может отличаться от `resourceType` у старых `http.*`). */
  displayResourceType: string;
  displayResourceId: string | null;
  /** Подпись сущности (название турнира, тега, матч «А — Б» и т.д.). */
  resourceLabel: string | null;
  /** Пользователь: имя / логин / email. */
  userLabel: string | null;
  /** Человекочитаемое описание с подписью сущности. */
  humanAction: string;
  /** Краткая подпись действия для таблицы (без объекта в «ёлочках»). */
  humanActionSummary: string;
  /** Детали для тултипа: название сущности, путь, полный id. */
  humanActionDetail: string | null;
  resourceType: string;
  resourceId: string | null;
  result: string;
  httpStatus: number | null;
  errorCode: string | null;
  path: string | null;
  method: string | null;
  createdAt: string;
};

export type AdminAuditLogDetailDto = AdminAuditLogItemDto & {
  requestBody: string | null;
  requestHeaders: string | null;
};

export type AdminAuditLogSummaryBucketDto = {
  total: number;
  errors: number;
  denied: number;
};

export type AdminAuditLogSummaryResponseDto = {
  last24h: AdminAuditLogSummaryBucketDto;
  /** Удалений турниров за календарный день UTC. */
  todayTournamentDeletesUtc: number;
  topUser: { userId: string; count: number; userLabel: string | null } | null;
  forUser?: {
    userId: string;
    last24h: AdminAuditLogSummaryBucketDto;
    last7d: AdminAuditLogSummaryBucketDto;
  };
};

type AuditLogRowCore = {
  id: string;
  userId: string | null;
  tenantId: string | null;
  role: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: string;
  httpStatus: number | null;
  errorCode: string | null;
  path: string | null;
  method: string | null;
  createdAt: Date;
};

function buildAuditItem(
  r: AuditLogRowCore,
  display: ReturnType<typeof resolveAuditDisplayFields>,
  resourceLabels: ReadonlyMap<string, string>,
  userLabels: ReadonlyMap<string, string>,
  lang: AuditHumanActionLang,
): AdminAuditLogItemDto {
  const resId = display.resourceId?.trim() ? display.resourceId.trim() : null;
  const rk =
    resId && display.resourceType
      ? auditResourceLabelKey(display.resourceType, resId)
      : null;
  const resourceLabel = rk ? (resourceLabels.get(rk) ?? null) : null;
  const userLabel = r.userId ? (userLabels.get(r.userId) ?? null) : null;

  const humanInput = {
    action: display.action,
    resourceId: display.resourceId,
    path: r.path,
    method: r.method,
    resourceLabel,
  };
  const humanParts = formatAdminAuditHumanActionParts(humanInput, lang);

  return {
    id: r.id,
    userId: r.userId,
    tenantId: r.tenantId,
    role: r.role,
    action: r.action,
    displayResourceType: display.resourceType,
    displayResourceId: display.resourceId,
    resourceLabel,
    userLabel,
    humanAction: formatAdminAuditHumanAction(humanInput, lang),
    humanActionSummary: humanParts.summary,
    humanActionDetail: humanParts.detail,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    result: r.result,
    httpStatus: r.httpStatus,
    errorCode: r.errorCode,
    path: r.path,
    method: r.method,
    createdAt: r.createdAt.toISOString(),
  };
}

@Injectable()
export class AdminAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  private async toItems(
    tenantId: string,
    rows: AdminAuditLogListRow[],
    lang: AuditHumanActionLang,
  ): Promise<AdminAuditLogItemDto[]> {
    if (rows.length === 0) {
      return [];
    }
    const displays = rows.map((r) => resolveAuditDisplayFields(r));
    const [resourceLabels, userLabels] = await Promise.all([
      fetchAuditResourceLabels(this.prisma, tenantId, displays, lang),
      fetchAuditUserLabels(
        this.prisma,
        tenantId,
        rows.map((r) => r.userId),
      ),
    ]);
    return rows.map((r, i) =>
      buildAuditItem(r, displays[i], resourceLabels, userLabels, lang),
    );
  }

  async summary(
    tenantId: string,
    forUserId?: string,
  ): Promise<AdminAuditLogSummaryResponseDto> {
    const now = new Date();
    const last24hAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7dAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const { start: todayStart, end: todayEnd } = utcCalendarDayRangeUtc(now);

    const where24: Prisma.AdminAuditLogWhereInput = {
      tenantId,
      createdAt: { gte: last24hAt },
    };
    const where7: Prisma.AdminAuditLogWhereInput = {
      tenantId,
      createdAt: { gte: last7dAt },
    };

    const [total24, errors24, denied24, tournamentDeletesToday, topGroup] =
      await Promise.all([
        this.prisma.adminAuditLog.count({ where: where24 }),
        this.prisma.adminAuditLog.count({
          where: { AND: [where24, errorOr5xxWhere] },
        }),
        this.prisma.adminAuditLog.count({
          where: { AND: [where24, deniedWhere] },
        }),
        this.prisma.adminAuditLog.count({
          where: {
            tenantId,
            action: 'tournament.delete',
            createdAt: { gte: todayStart, lte: todayEnd },
          },
        }),
        this.prisma.adminAuditLog.groupBy({
          by: ['userId'],
          where: {
            tenantId,
            createdAt: { gte: last24hAt },
            userId: { not: null },
          },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 1,
        }),
      ]);

    const top = topGroup[0];
    let topUser: AdminAuditLogSummaryResponseDto['topUser'] = null;
    if (top?.userId != null && top._count?.id != null) {
      const userLabels = await fetchAuditUserLabels(this.prisma, tenantId, [
        top.userId,
      ]);
      topUser = {
        userId: top.userId,
        count: top._count.id,
        userLabel: userLabels.get(top.userId) ?? null,
      };
    }

    const out: AdminAuditLogSummaryResponseDto = {
      last24h: {
        total: total24,
        errors: errors24,
        denied: denied24,
      },
      todayTournamentDeletesUtc: tournamentDeletesToday,
      topUser,
    };

    const uid = forUserId?.trim();
    if (uid) {
      const uw: Prisma.AdminAuditLogWhereInput = { userId: uid };
      const [ut24, ue24, ud24, ut7, ue7, ud7] = await Promise.all([
        this.prisma.adminAuditLog.count({ where: { AND: [where24, uw] } }),
        this.prisma.adminAuditLog.count({
          where: { AND: [where24, uw, errorOr5xxWhere] },
        }),
        this.prisma.adminAuditLog.count({
          where: { AND: [where24, uw, deniedWhere] },
        }),
        this.prisma.adminAuditLog.count({ where: { AND: [where7, uw] } }),
        this.prisma.adminAuditLog.count({
          where: { AND: [where7, uw, errorOr5xxWhere] },
        }),
        this.prisma.adminAuditLog.count({
          where: { AND: [where7, uw, deniedWhere] },
        }),
      ]);
      out.forUser = {
        userId: uid,
        last24h: { total: ut24, errors: ue24, denied: ud24 },
        last7d: { total: ut7, errors: ue7, denied: ud7 },
      };
    }

    return out;
  }

  async getById(
    tenantId: string,
    logId: string,
    locale?: string,
  ): Promise<AdminAuditLogDetailDto> {
    const row = await this.prisma.adminAuditLog.findFirst({
      where: { id: logId, tenantId },
    });
    if (!row) {
      throw new NotFoundException('Audit log entry not found');
    }
    const lang = normalizeAuditLocale(locale);
    const display = resolveAuditDisplayFields(row);
    const [resourceLabels, userLabels] = await Promise.all([
      fetchAuditResourceLabels(this.prisma, tenantId, [display], lang),
      fetchAuditUserLabels(this.prisma, tenantId, [row.userId]),
    ]);
    const item = buildAuditItem(row, display, resourceLabels, userLabels, lang);
    return {
      ...item,
      requestBody: row.requestBody ?? null,
      requestHeaders: row.requestHeaders ?? null,
    };
  }

  async list(
    tenantId: string,
    query: ListAdminAuditLogQueryDto,
  ): Promise<{
    items: AdminAuditLogItemDto[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const where: Prisma.AdminAuditLogWhereInput = {
      tenantId,
    };

    if (query.userId?.trim()) {
      where.userId = query.userId.trim();
    }
    if (query.role?.trim()) {
      where.role = query.role.trim();
    }
    if (query.httpStatus !== undefined && query.httpStatus !== null) {
      where.httpStatus = query.httpStatus;
    }
    if (query.errorCode?.trim()) {
      where.errorCode = query.errorCode.trim();
    }
    if (query.action?.trim()) {
      where.action = query.action.trim();
    }
    if (query.resourceType?.trim()) {
      where.resourceType = query.resourceType.trim();
    }

    const from = parseRangeStart(query.dateFrom);
    const to = parseRangeEnd(query.dateTo);
    if (from || to) {
      where.createdAt = {};
      if (from) {
        where.createdAt.gte = from;
      }
      if (to) {
        where.createdAt.lte = to;
      }
    }

    applyQuickFilter(where, query.quickFilter);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: adminAuditLogListSelect,
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    const lang = normalizeAuditLocale(query.locale);
    const items = await this.toItems(tenantId, rows, lang);

    return { items, total, limit, offset };
  }
}

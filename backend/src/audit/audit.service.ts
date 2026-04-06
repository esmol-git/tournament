import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditResult = 'success' | 'denied' | 'error';

export type AuditLogInput = {
  userId: string | null;
  tenantId: string | null;
  role: UserRole | string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: AuditResult;
  httpStatus?: number | null;
  errorCode?: string | null;
  path?: string | null;
  method?: string | null;
  requestBody?: string | null;
  requestHeaders?: string | null;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Не блокирует ответ: ошибки записи только в лог приложения.
   */
  enqueue(entry: AuditLogInput): void {
    void this.persist(entry).catch((err: unknown) => {
      this.logger.warn(
        `Admin audit write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  private async persist(entry: AuditLogInput): Promise<void> {
    await this.prisma.adminAuditLog.create({
      data: {
        userId: entry.userId,
        tenantId: entry.tenantId,
        role:
          entry.role === null || entry.role === undefined
            ? null
            : String(entry.role),
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        result: entry.result,
        httpStatus: entry.httpStatus ?? null,
        errorCode: entry.errorCode ?? null,
        path: entry.path ?? null,
        method: entry.method ?? null,
        requestBody: entry.requestBody ?? null,
        requestHeaders: entry.requestHeaders ?? null,
      },
    });
  }
}

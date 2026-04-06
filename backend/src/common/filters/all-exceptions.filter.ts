import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtPayload } from '../../auth/jwt.strategy';
import { AuditService } from '../../audit/audit.service';
import { buildAuditRequestSnapshot } from '../../audit/audit-request-snapshot';
import {
  isAuditableAdminApiPath,
  resolveAdminAuditMeta,
} from '../../audit/admin-audit-resolve';

function httpErrorTitle(status: number): string {
  const map: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return map[status] ?? 'Error';
}

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly audit: AuditService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<
      Request & { requestId?: string; user?: JwtPayload }
    >();

    const isProd = process.env.NODE_ENV === 'production';
    const requestId = request.requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] | Record<string, unknown> =
      'Internal server error';
    let error = 'Internal Server Error';
    /** Пробрасываем из `ForbiddenException({ message, code })` и аналогов для клиента. */
    let clientCode: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        error = httpErrorTitle(status);
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        if (body.message !== undefined) {
          message = body.message as string | string[] | Record<string, unknown>;
        } else {
          message = exception.message;
        }
        if (typeof body.error === 'string') {
          error = body.error;
        } else {
          error = httpErrorTitle(status);
        }
        if (body.code !== undefined) {
          clientCode = body.code;
        }
      } else {
        message = exception.message;
        error = httpErrorTitle(status);
      }
    } else if (exception instanceof Error) {
      if (!isProd) {
        message = exception.message;
      }
      this.logger.error(
        requestId ? `[${requestId}] ${exception.message}` : exception.message,
        exception.stack,
      );
    } else {
      this.logger.error('Unknown exception', exception);
    }

    const path = request.url?.split('?')[0] ?? request.url ?? '';
    const method = request.method ?? 'GET';
    this.maybeAuditFailure(request, path, method, status, clientCode);

    const payload: Record<string, unknown> = {
      statusCode: status,
      error,
      message,
      path,
      timestamp: new Date().toISOString(),
    };

    if (requestId) {
      payload.requestId = requestId;
    }
    if (clientCode !== undefined) {
      payload.code = clientCode;
    }

    response.status(status).json(payload);
  }

  private maybeAuditFailure(
    request: Request & { user?: JwtPayload },
    path: string,
    method: string,
    status: number,
    clientCode: unknown,
  ): void {
    if (!isAuditableAdminApiPath(path)) {
      return;
    }
    if (status !== 401 && status !== 403 && status !== 500) {
      return;
    }

    const resolved = resolveAdminAuditMeta(method, path);
    const auditMeta = resolved ?? {
      action: `${method} ${path}`,
      resourceType: 'admin_api',
      resourceId: null as string | null,
    };
    const user = request.user;
    const errorCode =
      typeof clientCode === 'string'
        ? clientCode
        : clientCode != null
          ? String(clientCode)
          : null;

    const snap = buildAuditRequestSnapshot(request);
    this.audit.enqueue({
      userId: user?.sub ?? null,
      tenantId: user?.tenantId ?? null,
      role: user?.role ?? null,
      action: auditMeta.action,
      resourceType: auditMeta.resourceType,
      resourceId: auditMeta.resourceId,
      result: status === 500 ? 'error' : 'denied',
      httpStatus: status,
      errorCode,
      path,
      method,
      requestBody: snap.requestBody,
      requestHeaders: snap.requestHeaders,
    });
  }
}

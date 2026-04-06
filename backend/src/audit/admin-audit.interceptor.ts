import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { JwtPayload } from '../auth/jwt.strategy';
import { AuditService } from './audit.service';
import { buildAuditRequestSnapshot } from './audit-request-snapshot';
import {
  mergeAuditResourceId,
  resolveAdminAuditMutation,
} from './admin-audit-resolve';

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const path = (req.path ?? req.url ?? '').split('?')[0];
    const meta = resolveAdminAuditMutation(req.method, path);
    if (!meta) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (data: unknown) => {
          const user = req.user;
          const resourceId = mergeAuditResourceId(meta, data);
          const snap = buildAuditRequestSnapshot(req);
          this.audit.enqueue({
            userId: user?.sub ?? null,
            tenantId: user?.tenantId ?? null,
            role: user?.role ?? null,
            action: meta.action,
            resourceType: meta.resourceType,
            resourceId,
            result: 'success',
            path,
            method: req.method,
            requestBody: snap.requestBody,
            requestHeaders: snap.requestHeaders,
          });
        },
      }),
    );
  }
}

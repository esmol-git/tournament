import { resolveAdminAuditMeta } from './admin-audit-resolve';

export type AuditDisplayFields = {
  action: string;
  resourceType: string;
  resourceId: string | null;
};

/**
 * Для старых записей с action `http.*` повторно разбираем path/method — получаем ту же семантику,
 * что и при новой записи (например DELETE …/match-schedule-reasons/:id).
 */
export function resolveAuditDisplayFields(row: {
  action: string;
  resourceType: string;
  resourceId: string | null;
  method: string | null;
  path: string | null;
}): AuditDisplayFields {
  if (
    !row.action.startsWith('http.') ||
    !row.method?.trim() ||
    !row.path?.trim()
  ) {
    return {
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
    };
  }
  const resolved = resolveAdminAuditMeta(row.method, row.path);
  if (!resolved) {
    return {
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
    };
  }
  return {
    action: resolved.action,
    resourceType: resolved.resourceType,
    resourceId: resolved.resourceId ?? row.resourceId,
  };
}

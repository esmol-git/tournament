export type AdminAuditLogRow = {
  id: string
  userId: string | null
  tenantId: string | null
  role: string | null
  action: string
  /** Семантический тип ресурса (после разбора URL; удобно для подписи в таблице). */
  displayResourceType: string
  displayResourceId: string | null
  resourceLabel: string | null
  userLabel: string | null
  humanAction: string
  /** Краткий текст действия (для строки таблицы). */
  humanActionSummary?: string
  /** Детали для тултипа (объект, путь, id). */
  humanActionDetail?: string | null
  resourceType: string
  resourceId: string | null
  result: string
  httpStatus: number | null
  errorCode: string | null
  path: string | null
  method: string | null
  createdAt: string
}

export type AdminAuditLogListResponse = {
  items: AdminAuditLogRow[]
  total: number
  limit: number
  offset: number
}

export type AdminAuditLogSummaryBucket = {
  total: number
  errors: number
  denied: number
}

export type AdminAuditLogSummaryResponse = {
  last24h: AdminAuditLogSummaryBucket
  todayTournamentDeletesUtc: number
  topUser: { userId: string; count: number; userLabel: string | null } | null
  forUser?: {
    userId: string
    last24h: AdminAuditLogSummaryBucket
    last7d: AdminAuditLogSummaryBucket
  }
}

export type AdminAuditLogDetail = AdminAuditLogRow & {
  requestBody: string | null
  requestHeaders: string | null
}

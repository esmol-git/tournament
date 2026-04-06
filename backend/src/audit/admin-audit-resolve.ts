/**
 * Сопоставление HTTP-метода и пути с семантикой аудита (без выполнения хендлера).
 * Порядок правил: от более специфичных к общим.
 */
export type AdminAuditMeta = {
  action: string;
  resourceType: string;
  resourceId: string | null;
};

type Matcher = {
  /** null — любой метод */
  methods: readonly string[] | null;
  pattern: RegExp;
  resolve: (m: RegExpMatchArray) => AdminAuditMeta;
};

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function meta(
  action: string,
  resourceType: string,
  resourceId: string | null,
): AdminAuditMeta {
  return { action, resourceType, resourceId };
}

/** Явные правила; последние — запасные для GET/ошибок по префиксу турнира. */
const MATCHERS: Matcher[] = [
  {
    methods: ['PATCH'],
    pattern: /^\/tournaments\/([^/]+)\/gallery\/reorder$/,
    resolve: (m) =>
      meta('tournament.gallery_reorder', 'tournament_gallery', m[1]),
  },
  {
    methods: ['PATCH'],
    pattern: /^\/tournaments\/([^/]+)\/gallery\/([^/]+)$/,
    resolve: (m) =>
      meta('tournament.gallery_update', 'tournament_gallery_image', m[2]),
  },
  {
    methods: ['DELETE'],
    pattern: /^\/tournaments\/([^/]+)\/gallery\/([^/]+)$/,
    resolve: (m) =>
      meta('tournament.gallery_delete', 'tournament_gallery_image', m[2]),
  },
  {
    methods: ['POST'],
    pattern: /^\/tournaments\/([^/]+)\/gallery$/,
    resolve: (m) =>
      meta('tournament.gallery_create', 'tournament_gallery', m[1]),
  },
  {
    methods: ['PATCH'],
    pattern: /^\/tournaments\/([^/]+)\/news\/([^/]+)$/,
    resolve: (m) => meta('tournament.news_update', 'tournament_news', m[2]),
  },
  {
    methods: ['DELETE'],
    pattern: /^\/tournaments\/([^/]+)\/news\/([^/]+)$/,
    resolve: (m) => meta('tournament.news_delete', 'tournament_news', m[2]),
  },
  {
    methods: ['POST'],
    pattern: /^\/tournaments\/([^/]+)\/news$/,
    resolve: (m) => meta('tournament.news_create', 'tournament_news', m[1]),
  },
  {
    methods: ['PATCH'],
    pattern: /^\/tenants\/([^/]+)\/news\/([^/]+)$/,
    resolve: (m) => meta('tenant.news_update', 'tenant_news', m[2]),
  },
  {
    methods: ['DELETE'],
    pattern: /^\/tenants\/([^/]+)\/news\/([^/]+)$/,
    resolve: (m) => meta('tenant.news_delete', 'tenant_news', m[2]),
  },
  {
    methods: ['POST'],
    pattern: /^\/tenants\/([^/]+)\/news$/,
    resolve: () => meta('tenant.news_create', 'tenant_news', null),
  },
  {
    methods: ['PATCH'],
    pattern: /^\/tenants\/([^/]+)\/news-tags\/([^/]+)$/,
    resolve: (m) => meta('tenant.news_tag_update', 'news_tag', m[2]),
  },
  {
    methods: ['DELETE'],
    pattern: /^\/tenants\/([^/]+)\/news-tags\/([^/]+)$/,
    resolve: (m) => meta('tenant.news_tag_delete', 'news_tag', m[2]),
  },
  {
    methods: ['POST'],
    pattern: /^\/tenants\/([^/]+)\/news-tags$/,
    resolve: () => meta('tenant.news_tag_create', 'news_tag', null),
  },
  {
    methods: ['PATCH'],
    pattern: /^\/tenants\/([^/]+)\/match-schedule-reasons\/([^/]+)$/,
    resolve: (m) =>
      meta(
        'tenant.match_schedule_reason_update',
        'match_schedule_reason',
        m[2],
      ),
  },
  {
    methods: ['DELETE'],
    pattern: /^\/tenants\/([^/]+)\/match-schedule-reasons\/([^/]+)$/,
    resolve: (m) =>
      meta(
        'tenant.match_schedule_reason_delete',
        'match_schedule_reason',
        m[2],
      ),
  },
  {
    methods: ['POST'],
    pattern: /^\/tenants\/([^/]+)\/match-schedule-reasons$/,
    resolve: () =>
      meta(
        'tenant.match_schedule_reason_create',
        'match_schedule_reason',
        null,
      ),
  },
  {
    methods: ['POST'],
    pattern: /^\/tournaments\/([^/]+)\/rounds\/([^/]+)\/reorder$/,
    resolve: (m) => meta('tournament.round_reorder', 'tournament', m[1]),
  },
  {
    methods: ['PATCH'],
    pattern: /^\/tournaments\/([^/]+)\/matches\/([^/]+)\/protocol$/,
    resolve: (m) => meta('tournament.match_protocol_update', 'match', m[2]),
  },
  {
    methods: ['PATCH'],
    pattern: /^\/tournaments\/([^/]+)\/matches\/([^/]+)$/,
    resolve: (m) => meta('tournament.match_update', 'match', m[2]),
  },
  {
    methods: ['DELETE'],
    pattern: /^\/tournaments\/([^/]+)\/matches\/([^/]+)$/,
    resolve: (m) => meta('tournament.match_delete', 'match', m[2]),
  },
  {
    methods: ['POST'],
    pattern: /^\/tournaments\/([^/]+)\/matches$/,
    resolve: (m) => meta('tournament.match_create', 'tournament', m[1]),
  },
  {
    methods: ['PATCH'],
    pattern: /^\/tenants\/([^/]+)\/standalone-matches\/([^/]+)\/protocol$/,
    resolve: (m) => meta('standalone.match_protocol_update', 'match', m[2]),
  },
  {
    methods: ['PATCH'],
    pattern: /^\/tenants\/([^/]+)\/standalone-matches\/([^/]+)$/,
    resolve: (m) => meta('standalone.match_update', 'match', m[2]),
  },
  {
    methods: ['DELETE'],
    pattern: /^\/tenants\/([^/]+)\/standalone-matches\/([^/]+)$/,
    resolve: (m) => meta('standalone.match_delete', 'match', m[2]),
  },
  {
    methods: ['POST'],
    pattern: /^\/tenants\/([^/]+)\/standalone-matches\/([^/]+)\/attach$/,
    resolve: (m) => meta('standalone.match_attach_tournament', 'match', m[2]),
  },
  {
    methods: ['POST'],
    pattern: /^\/tenants\/([^/]+)\/matches\/([^/]+)\/detach$/,
    resolve: (m) => meta('tournament.match_detach', 'match', m[2]),
  },
  {
    methods: ['POST'],
    pattern: /^\/tenants\/([^/]+)\/standalone-matches$/,
    resolve: () => meta('standalone.match_create', 'match', null),
  },
  {
    methods: ['PUT'],
    pattern: /^\/tournaments\/([^/]+)\/teams\/group-layout$/,
    resolve: (m) =>
      meta('tournament.teams_group_layout_sync', 'tournament', m[1]),
  },
  {
    methods: ['PATCH'],
    pattern: /^\/tournaments\/([^/]+)\/teams\/([^/]+)\/group$/,
    resolve: (m) => meta('tournament.team_set_group', 'tournament_team', m[2]),
  },
  {
    methods: ['PATCH'],
    pattern: /^\/tournaments\/([^/]+)\/teams\/([^/]+)\/rating$/,
    resolve: (m) => meta('tournament.team_set_rating', 'tournament_team', m[2]),
  },
  {
    methods: ['POST'],
    pattern: /^\/tournaments\/([^/]+)\/teams\/([^/]+)$/,
    resolve: (m) => meta('tournament.team_add', 'tournament_team', m[2]),
  },
  {
    methods: ['DELETE'],
    pattern: /^\/tournaments\/([^/]+)\/teams\/([^/]+)$/,
    resolve: (m) => meta('tournament.team_remove', 'tournament_team', m[2]),
  },
  {
    methods: ['POST'],
    pattern: /^\/tournaments\/([^/]+)\/calendar$/,
    resolve: (m) => meta('tournament.calendar_generate', 'tournament', m[1]),
  },
  {
    methods: ['DELETE'],
    pattern: /^\/tournaments\/([^/]+)\/calendar$/,
    resolve: (m) => meta('tournament.calendar_clear', 'tournament', m[1]),
  },
  {
    methods: ['POST'],
    pattern: /^\/tournaments\/([^/]+)\/playoff$/,
    resolve: (m) => meta('tournament.playoff_generate', 'tournament', m[1]),
  },
  {
    methods: ['POST'],
    pattern: /^\/tenants\/([^/]+)\/tournaments$/,
    resolve: () => meta('tournament.create', 'tournament', null),
  },
  {
    methods: ['PATCH'],
    pattern: /^\/tournaments\/([^/]+)$/,
    resolve: (m) => meta('tournament.update', 'tournament', m[1]),
  },
  {
    methods: ['DELETE'],
    pattern: /^\/tournaments\/([^/]+)$/,
    resolve: (m) => meta('tournament.delete', 'tournament', m[1]),
  },
  {
    methods: null,
    pattern: /^\/tournaments\/([^/]+)\/table$/,
    resolve: (m) => meta('tournament.table_read', 'tournament', m[1]),
  },
  {
    methods: null,
    pattern: /^\/tournaments\/([^/]+)\/news$/,
    resolve: (m) => meta('tournament.news_list_read', 'tournament', m[1]),
  },
  {
    methods: null,
    pattern: /^\/tournaments\/([^/]+)$/,
    resolve: (m) => meta('tournament.read', 'tournament', m[1]),
  },
  {
    methods: null,
    pattern: /^\/tenants\/([^/]+)\/tournaments$/,
    resolve: (m) => meta('tenant.tournament_list_read', 'tenant', m[1]),
  },
  {
    methods: null,
    pattern: /^\/tenants\/([^/]+)\/news$/,
    resolve: (m) => meta('tenant.news_list_read', 'tenant', m[1]),
  },
  {
    methods: null,
    pattern: /^\/tenants\/([^/]+)\/news-tags$/,
    resolve: (m) => meta('tenant.news_tags_list_read', 'tenant', m[1]),
  },
  {
    methods: null,
    pattern: /^\/tenants\/([^/]+)\/matches$/,
    resolve: (m) => meta('tenant.matches_list_read', 'tenant', m[1]),
  },
  {
    methods: null,
    pattern: /^\/tenants\/([^/]+)\/standalone-matches$/,
    resolve: (m) => meta('tenant.standalone_matches_list_read', 'tenant', m[1]),
  },
];

function normalizePath(raw: string): string {
  return raw.split('?')[0] ?? raw;
}

export function isAuditableAdminApiPath(path: string): boolean {
  const p = normalizePath(path);
  return p.startsWith('/tournaments') || p.startsWith('/tenants/');
}

export function resolveAdminAuditMeta(
  method: string,
  rawPath: string,
): AdminAuditMeta | null {
  const path = normalizePath(rawPath);
  if (!isAuditableAdminApiPath(path)) {
    return null;
  }
  const m = method.toUpperCase();
  for (const row of MATCHERS) {
    if (row.methods !== null && !row.methods.includes(m)) {
      continue;
    }
    const match = path.match(row.pattern);
    if (match) {
      return row.resolve(match);
    }
  }
  return meta(`http.${m.toLowerCase()}`, 'admin_api', null);
}

/** Только успешные мутации (после хендлера). */
export function resolveAdminAuditMutation(
  method: string,
  rawPath: string,
): AdminAuditMeta | null {
  const m = method.toUpperCase();
  if (!MUTATION_METHODS.has(m)) {
    return null;
  }
  return resolveAdminAuditMeta(m, rawPath);
}

/**
 * ID сущности из ответа (например созданный турнир), иначе из запроса.
 */
export function mergeAuditResourceId(
  meta: AdminAuditMeta,
  responseBody: unknown,
): string | null {
  if (
    responseBody &&
    typeof responseBody === 'object' &&
    'id' in responseBody &&
    typeof (responseBody as { id: unknown }).id === 'string'
  ) {
    return (responseBody as { id: string }).id;
  }
  return meta.resourceId;
}

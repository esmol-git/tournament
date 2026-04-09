export type AuditHumanActionLang = 'ru' | 'en';

const ACTION_LABELS: Record<AuditHumanActionLang, Record<string, string>> = {
  ru: {
    'tournament.gallery_reorder': 'Переупорядочена галерея турнира',
    'tournament.gallery_update': 'Изменено изображение галереи',
    'tournament.gallery_delete': 'Удалено изображение галереи',
    'tournament.gallery_create': 'Добавлено изображение в галерею турнира',
    'tournament.news_update': 'Изменена новость',
    'tournament.news_delete': 'Удалена новость',
    'tournament.news_create': 'Создана новость турнира',
    'tenant.news_update': 'Изменена новость организации',
    'tenant.news_delete': 'Удалена новость организации',
    'tenant.news_create': 'Создана новость организации',
    'tenant.news_tag_update': 'Изменён тег новостей',
    'tenant.news_tag_delete': 'Удалён тег новостей',
    'tenant.news_tag_create': 'Создан тег новостей',
    'tenant.match_schedule_reason_update':
      'Изменена причина переноса или отмены матча',
    'tenant.match_schedule_reason_delete':
      'Удалена причина переноса или отмены матча',
    'tenant.match_schedule_reason_create':
      'Создана причина переноса или отмены матча',
    'tournament.round_reorder': 'Переупорядочены раунды турнира',
    'tournament.matches_bulk_update': 'Массовое изменение матчей турнира',
    'tournament.match_protocol_update': 'Обновлён протокол матча',
    'tournament.match_update': 'Изменён матч',
    'tournament.match_delete': 'Удалён матч',
    'tournament.match_create': 'Создан матч турнира',
    'standalone.match_protocol_update': 'Обновлён протокол матча',
    'standalone.match_update': 'Изменён матч',
    'standalone.match_delete': 'Удалён матч',
    'standalone.match_attach_tournament': 'Матч привязан к турниру',
    'tournament.match_detach': 'Матч отвязан от турнира',
    'standalone.match_create': 'Создан матч',
    'tournament.teams_group_layout_sync':
      'Синхронизирована раскладка групп турнира',
    'tournament.team_set_group': 'Задана группа команде',
    'tournament.team_set_rating': 'Обновлён рейтинг команде',
    'tournament.team_add': 'Команда добавлена в турнир',
    'tournament.team_remove': 'Команда удалена из турнира',
    'tournament.calendar_generate': 'Сгенерирован календарь',
    'tournament.calendar_clear': 'Очищен календарь турнира',
    'tournament.playoff_generate': 'Сгенерирован плей-офф турнира',
    'tournament.create': 'Создан турнир',
    'tournament.update': 'Изменён турнир',
    'tournament.delete': 'Удалён турнир',
    'tournament.table_read': 'Просмотр таблицы турнира',
    'tournament.news_list_read': 'Просмотр списка новостей турнира',
    'tournament.read': 'Просмотр турнира',
    'tenant.tournament_list_read': 'Просмотр списка турниров',
    'tenant.news_list_read': 'Просмотр списка новостей',
    'tenant.news_tags_list_read': 'Просмотр тегов новостей',
    'tenant.matches_list_read': 'Просмотр матчей',
    'tenant.standalone_matches_list_read': 'Просмотр одиночных матчей',
  },
  en: {
    'tournament.gallery_reorder': 'Tournament gallery reordered',
    'tournament.gallery_update': 'Gallery image updated',
    'tournament.gallery_delete': 'Gallery image removed',
    'tournament.gallery_create': 'Image added to tournament gallery',
    'tournament.news_update': 'Tournament news updated',
    'tournament.news_delete': 'Tournament news deleted',
    'tournament.news_create': 'Tournament news created',
    'tenant.news_update': 'Organization news updated',
    'tenant.news_delete': 'Organization news deleted',
    'tenant.news_create': 'Organization news created',
    'tenant.news_tag_update': 'News tag updated',
    'tenant.news_tag_delete': 'News tag deleted',
    'tenant.news_tag_create': 'News tag created',
    'tenant.match_schedule_reason_update': 'Match schedule reason updated',
    'tenant.match_schedule_reason_delete': 'Match schedule reason deleted',
    'tenant.match_schedule_reason_create': 'Match schedule reason created',
    'tournament.round_reorder': 'Tournament rounds reordered',
    'tournament.matches_bulk_update': 'Bulk tournament matches update',
    'tournament.match_protocol_update': 'Match protocol updated',
    'tournament.match_update': 'Match updated',
    'tournament.match_delete': 'Match deleted',
    'tournament.match_create': 'Tournament match created',
    'standalone.match_protocol_update': 'Match protocol updated',
    'standalone.match_update': 'Match updated',
    'standalone.match_delete': 'Match deleted',
    'standalone.match_attach_tournament': 'Match linked to tournament',
    'tournament.match_detach': 'Match unlinked from tournament',
    'standalone.match_create': 'Match created',
    'tournament.teams_group_layout_sync': 'Tournament group layout synced',
    'tournament.team_set_group': 'Team group set',
    'tournament.team_set_rating': 'Team rating updated',
    'tournament.team_add': 'Team added to tournament',
    'tournament.team_remove': 'Team removed from tournament',
    'tournament.calendar_generate': 'Calendar generated',
    'tournament.calendar_clear': 'Tournament calendar cleared',
    'tournament.playoff_generate': 'Playoff bracket generated',
    'tournament.create': 'Tournament created',
    'tournament.update': 'Tournament updated',
    'tournament.delete': 'Tournament deleted',
    'tournament.table_read': 'Tournament table viewed',
    'tournament.news_list_read': 'Tournament news list viewed',
    'tournament.read': 'Tournament viewed',
    'tenant.tournament_list_read': 'Tournament list viewed',
    'tenant.news_list_read': 'News list viewed',
    'tenant.news_tags_list_read': 'News tags viewed',
    'tenant.matches_list_read': 'Matches viewed',
    'tenant.standalone_matches_list_read': 'Standalone matches viewed',
  },
};

export type AdminAuditHumanActionInput = {
  action: string;
  resourceId: string | null;
  path: string | null;
  method: string | null;
  /** Подпись сущности из БД (название турнира, тега и т.д.). */
  resourceLabel?: string | null;
};

export function shortAuditId(id: string): string {
  const s = id.trim();
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

/** Сокращает длинные cuid в пути API для подписи «осталось без семантики». */
export function humanizeAuditPath(path: string): string {
  return path.replace(/cm[a-z0-9]{20,}/gi, (m) => shortAuditId(m));
}

export type AdminAuditHumanActionParts = {
  /** Короткая подпись для таблицы (глагол / метод). */
  summary: string;
  /** Детали для тултипа: объект, путь, полный id и т.д. */
  detail: string | null;
};

/**
 * Разбор человекочитаемого действия на краткое и детальное (UI: одна строка + тултип).
 */
export function formatAdminAuditHumanActionParts(
  row: AdminAuditHumanActionInput,
  lang: AuditHumanActionLang = 'ru',
): AdminAuditHumanActionParts {
  const id = row.resourceId?.trim() ? row.resourceId.trim() : null;
  const title = row.resourceLabel?.trim() ? row.resourceLabel.trim() : null;
  const dict = ACTION_LABELS[lang];
  const verb = dict[row.action];
  if (verb) {
    if (title) return { summary: verb, detail: title };
    if (id) return { summary: verb, detail: id };
    return { summary: verb, detail: null };
  }
  if (row.action.startsWith('http.')) {
    const m = row.method?.trim().toUpperCase() || '—';
    const raw = row.path?.trim() || '—';
    const p = humanizeAuditPath(raw);
    return { summary: m, detail: p };
  }
  if (title) return { summary: row.action, detail: title };
  if (id) return { summary: row.action, detail: id };
  return { summary: row.action, detail: null };
}

export function formatAdminAuditHumanAction(
  row: AdminAuditHumanActionInput,
  lang: AuditHumanActionLang = 'ru',
): string {
  const parts = formatAdminAuditHumanActionParts(row, lang);
  if (!parts.detail) return parts.summary;
  if (row.action.startsWith('http.')) {
    const m = row.method?.trim().toUpperCase() || '—';
    return `${m} ${parts.detail}`;
  }
  const dict = ACTION_LABELS[lang];
  if (dict[row.action]) {
    const title = row.resourceLabel?.trim();
    const id = row.resourceId?.trim();
    if (title) {
      return lang === 'en'
        ? `${parts.summary}: ${parts.detail}`
        : `${parts.summary} «${parts.detail}»`;
    }
    if (id) return `${parts.summary} · ${shortAuditId(id)}`;
  }
  const title = row.resourceLabel?.trim();
  if (title) {
    return lang === 'en'
      ? `${row.action}: ${parts.detail}`
      : `${row.action} «${parts.detail}»`;
  }
  const id = row.resourceId?.trim();
  return id ? `${row.action} · ${shortAuditId(id)}` : row.action;
}

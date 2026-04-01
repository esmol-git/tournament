/** Один пункт-ссылка в меню (подписи через i18n: `labelKey`) */
export interface AdminNavLinkItem {
  to: string
  labelKey: string
  icon: string
  exact?: boolean
}

/** Группа с подпунктами */
export interface AdminNavSection {
  id: string
  labelKey: string
  icon: string
  items: AdminNavLinkItem[]
}

export type AdminNavEntry = AdminNavLinkItem | AdminNavSection

export function isNavSection(e: AdminNavEntry): e is AdminNavSection {
  return 'items' in e && Array.isArray((e as AdminNavSection).items)
}

/** Совпадение текущего пути с пунктом меню (exact или префикс с `/`). */
export function adminNavPathMatches(item: AdminNavLinkItem, path: string): boolean {
  if (item.exact) return path === item.to
  if (path === item.to) return true
  return path.startsWith(`${item.to}/`)
}

/** id группы, в которой есть активный подпункт, иначе null. */
export function findActiveAdminNavSectionId(path: string): string | null {
  for (const entry of ADMIN_NAV_ENTRIES) {
    if (!isNavSection(entry)) continue
    if (entry.items.some((item) => adminNavPathMatches(item, path))) {
      return entry.id
    }
  }
  return null
}

/**
 * Структура бокового меню: сначала корневые ссылки, затем группы с подпунктами.
 */
export const ADMIN_NAV_ENTRIES: AdminNavEntry[] = [
  { to: '/admin', labelKey: 'admin.nav.dashboard', icon: 'pi pi-home', exact: true },
  { to: '/admin/users', labelKey: 'admin.nav.users', icon: 'pi pi-user' },
  {
    id: 'people',
    labelKey: 'admin.nav.group_people',
    icon: 'pi pi-users',
    items: [
      { to: '/admin/teams', labelKey: 'admin.nav.teams', icon: 'pi pi-shield' },
      { to: '/admin/players', labelKey: 'admin.nav.players', icon: 'pi pi-id-card' },
    ],
  },
  {
    id: 'references',
    labelKey: 'admin.nav.group_references',
    icon: 'pi pi-book',
    items: [
      {
        to: '/admin/references/competitions',
        labelKey: 'admin.nav.ref_competitions',
        icon: 'pi pi-flag',
      },
      { to: '/admin/references/seasons', labelKey: 'admin.nav.seasons', icon: 'pi pi-calendar' },
      {
        to: '/admin/references/age-groups',
        labelKey: 'admin.nav.age_groups',
        icon: 'pi pi-chart-bar',
      },
      {
        to: '/admin/references/regions',
        labelKey: 'admin.nav.regions',
        icon: 'pi pi-map-marker',
      },
      { to: '/admin/references/documents', labelKey: 'admin.nav.documents', icon: 'pi pi-file' },
      { to: '/admin/references/referees', labelKey: 'admin.nav.referees', icon: 'pi pi-user' },
      {
        to: '/admin/references/referee-categories',
        labelKey: 'admin.nav.referee_categories',
        icon: 'pi pi-bookmark',
      },
      {
        to: '/admin/references/referee-positions',
        labelKey: 'admin.nav.referee_positions',
        icon: 'pi pi-briefcase',
      },
      { to: '/admin/references/stadiums', labelKey: 'admin.nav.stadiums', icon: 'pi pi-building' },
      {
        to: '/admin/references/management',
        labelKey: 'admin.nav.management',
        icon: 'pi pi-users',
      },
      {
        to: '/admin/references/protocol-event-types',
        labelKey: 'admin.nav.protocol_event_types',
        icon: 'pi pi-list',
      },
      {
        to: '/admin/references/match-schedule-reasons',
        labelKey: 'admin.nav.match_schedule_reasons',
        icon: 'pi pi-calendar-times',
      },
      {
        to: '/admin/references/news-tags',
        labelKey: 'admin.nav.news_tags',
        icon: 'pi pi-tags',
      },
    ],
  },
  {
    id: 'competitions',
    labelKey: 'admin.nav.group_tournaments',
    icon: 'pi pi-trophy',
    items: [
      { to: '/admin/tournaments', labelKey: 'admin.nav.tournaments', icon: 'pi pi-sitemap' },
      { to: '/admin/news', labelKey: 'admin.nav.news', icon: 'pi pi-megaphone' },
      { to: '/admin/gallery', labelKey: 'admin.nav.gallery', icon: 'pi pi-images' },
      { to: '/admin/matches', labelKey: 'admin.nav.matches', icon: 'pi pi-calendar' },
      { to: '/admin/calendar', labelKey: 'admin.nav.calendar', icon: 'pi pi-calendar-clock' },
    ],
  },
  { to: '/admin/profile', labelKey: 'admin.nav.profile', icon: 'pi pi-user-edit' },
  { to: '/admin/social-links', labelKey: 'admin.nav.social_links', icon: 'pi pi-share-alt' },
  { to: '/admin/settings', labelKey: 'admin.nav.settings', icon: 'pi pi-cog' },
]

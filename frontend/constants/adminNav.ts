import type { SubscriptionFeature } from '~/utils/subscriptionFeatures'
import { hasSubscriptionFeature } from '~/utils/subscriptionFeatures'

/** Роли, которым разрешены отдельные пункты меню (орг. уровень). */
export type TenantNavRole =
  | 'TENANT_ADMIN'
  | 'TOURNAMENT_ADMIN'
  | 'TEAM_ADMIN'
  | 'MODERATOR'

/** Один пункт-ссылка в меню (подписи через i18n: `labelKey`) */
export interface AdminNavLinkItem {
  to: string
  labelKey: string
  icon: string
  exact?: boolean
  /** Без доступа по тарифу: пункт виден, но неактивен (без перехода на экран «тариф»). */
  requiredFeature?: SubscriptionFeature
  /**
   * Если задано — пункт меню показывается только этим ролям (остальные роли пункт не видят).
   * Пример: пользователи и настройки организации — только `TENANT_ADMIN`.
   */
  requiredTenantRoles?: readonly TenantNavRole[]
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
export function findActiveAdminNavSectionId(
  path: string,
  entries: AdminNavEntry[] = ADMIN_NAV_ENTRIES,
): string | null {
  for (const entry of entries) {
    if (!isNavSection(entry)) continue
    if (entry.items.some((item) => adminNavPathMatches(item, path))) {
      return entry.id
    }
  }
  return null
}

/** Показывать пункт меню в сайдбаре для этой роли (если `requiredTenantRoles` не задан — всем staff). */
export function isAdminNavItemVisibleForRole(
  userRole: string | null | undefined,
  item: AdminNavLinkItem,
): boolean {
  const req = item.requiredTenantRoles
  if (!req?.length) return true
  if (!userRole) return false
  return (req as readonly string[]).includes(userRole)
}

/** Недоступно по тарифу (пункт остаётся в меню, но неактивен). */
export function isAdminNavItemSubscriptionLocked(
  plan: string | null | undefined,
  item: AdminNavLinkItem,
): boolean {
  const f = item.requiredFeature
  if (!f) return false
  return !hasSubscriptionFeature(plan, f)
}

/** Устаревшее имя: только блокировка по тарифу. */
export function isAdminNavItemLocked(
  plan: string | null | undefined,
  item: AdminNavLinkItem,
  _userRole?: string | null,
): boolean {
  return isAdminNavItemSubscriptionLocked(plan, item)
}

/** Ссылка ведёт на реальный маршрут; блокировка по тарифу — через `locked` + неактивный вид. */
export function adminNavItemResolvedTo(
  _plan: string | null | undefined,
  _userRole: string | null | undefined,
  item: AdminNavLinkItem,
): string {
  return item.to
}

/** Отфильтровать пункты меню: скрыть разделы, недоступные по роли; пустые группы убрать. */
export function filterAdminNavForRole(
  userRole: string | null | undefined,
  entries: AdminNavEntry[] = ADMIN_NAV_ENTRIES,
): AdminNavEntry[] {
  const out: AdminNavEntry[] = []
  for (const e of entries) {
    if (isNavSection(e)) {
      const items = e.items.filter((item) => isAdminNavItemVisibleForRole(userRole, item))
      if (items.length === 0) continue
      out.push({ ...e, items })
    } else if (isAdminNavItemVisibleForRole(userRole, e)) {
      out.push(e)
    }
  }
  return out
}

/**
 * Структура бокового меню: сначала корневые ссылки, затем группы с подпунктами.
 */
export const ADMIN_NAV_ENTRIES: AdminNavEntry[] = [
  { to: '/admin', labelKey: 'admin.nav.dashboard', icon: 'pi pi-home', exact: true },
  {
    to: '/admin/users',
    labelKey: 'admin.nav.users',
    icon: 'pi pi-user',
    requiredTenantRoles: ['TENANT_ADMIN'],
  },
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
        requiredFeature: 'reference_directory_standard',
      },
      {
        to: '/admin/references/seasons',
        labelKey: 'admin.nav.seasons',
        icon: 'pi pi-calendar',
        requiredFeature: 'reference_directory_basic',
      },
      {
        to: '/admin/references/age-groups',
        labelKey: 'admin.nav.age_groups',
        icon: 'pi pi-chart-bar',
        requiredFeature: 'reference_directory_basic',
      },
      {
        to: '/admin/references/team-categories',
        labelKey: 'admin.nav.team_categories',
        icon: 'pi pi-th-large',
        requiredFeature: 'reference_directory_basic',
      },
      {
        to: '/admin/references/regions',
        labelKey: 'admin.nav.regions',
        icon: 'pi pi-map-marker',
        requiredFeature: 'reference_directory_standard',
      },
      {
        to: '/admin/references/documents',
        labelKey: 'admin.nav.documents',
        icon: 'pi pi-file',
        requiredFeature: 'reference_directory_advanced',
      },
      {
        to: '/admin/references/referees',
        labelKey: 'admin.nav.referees',
        icon: 'pi pi-user',
        requiredFeature: 'reference_directory_standard',
      },
      {
        to: '/admin/references/referee-categories',
        labelKey: 'admin.nav.referee_categories',
        icon: 'pi pi-bookmark',
        requiredFeature: 'reference_directory_standard',
      },
      {
        to: '/admin/references/referee-positions',
        labelKey: 'admin.nav.referee_positions',
        icon: 'pi pi-briefcase',
        requiredFeature: 'reference_directory_standard',
      },
      {
        to: '/admin/references/stadiums',
        labelKey: 'admin.nav.stadiums',
        icon: 'pi pi-building',
        requiredFeature: 'reference_directory_standard',
      },
      {
        to: '/admin/references/management',
        labelKey: 'admin.nav.management',
        icon: 'pi pi-users',
        requiredFeature: 'reference_directory_standard',
      },
      {
        to: '/admin/references/protocol-event-types',
        labelKey: 'admin.nav.protocol_event_types',
        icon: 'pi pi-list',
        requiredFeature: 'reference_directory_advanced',
      },
      {
        to: '/admin/references/match-schedule-reasons',
        labelKey: 'admin.nav.match_schedule_reasons',
        icon: 'pi pi-calendar-times',
        requiredFeature: 'reference_directory_advanced',
      },
      {
        to: '/admin/references/news-tags',
        labelKey: 'admin.nav.news_tags',
        icon: 'pi pi-tags',
        requiredFeature: 'news_and_media',
      },
    ],
  },
  {
    id: 'competitions',
    labelKey: 'admin.nav.group_tournaments',
    icon: 'pi pi-trophy',
    items: [
      { to: '/admin/tournaments', labelKey: 'admin.nav.tournaments', icon: 'pi pi-sitemap' },
      {
        to: '/admin/news',
        labelKey: 'admin.nav.news',
        icon: 'pi pi-megaphone',
        requiredFeature: 'news_and_media',
      },
      {
        to: '/admin/gallery',
        labelKey: 'admin.nav.gallery',
        icon: 'pi pi-images',
        requiredFeature: 'news_and_media',
      },
      { to: '/admin/matches', labelKey: 'admin.nav.matches', icon: 'pi pi-calendar' },
      {
        to: '/admin/calendar',
        labelKey: 'admin.nav.calendar',
        icon: 'pi pi-calendar-clock',
        requiredFeature: 'org_wide_calendar',
      },
    ],
  },
  { to: '/admin/profile', labelKey: 'admin.nav.profile', icon: 'pi pi-user-edit' },
  {
    to: '/admin/social-links',
    labelKey: 'admin.nav.social_links',
    icon: 'pi pi-share-alt',
    requiredFeature: 'public_custom_branding',
    requiredTenantRoles: ['TENANT_ADMIN'],
  },
  {
    to: '/admin/settings',
    labelKey: 'admin.nav.settings',
    icon: 'pi pi-cog',
    requiredTenantRoles: ['TENANT_ADMIN'],
  },
]

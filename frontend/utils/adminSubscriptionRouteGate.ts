import type { SubscriptionFeature } from '~/utils/subscriptionFeatures'

function adminReferencesRequiredFeature(path: string): SubscriptionFeature | null {
  const m = path.match(/^\/admin\/references\/([^/]+)/)
  if (!m?.[1]) return null
  const seg = m[1]
  const basic = ['seasons', 'age-groups', 'team-categories']
  const standard = [
    'regions',
    'competitions',
    'stadiums',
    'management',
    'referees',
    'referee-categories',
    'referee-positions',
  ]
  const advanced = ['documents', 'protocol-event-types', 'match-schedule-reasons']
  if (basic.includes(seg)) return 'reference_directory_basic'
  if (standard.includes(seg)) return 'reference_directory_standard'
  if (advanced.includes(seg)) return 'reference_directory_advanced'
  return null
}

/**
 * Маршруты админки, для которых нужен тариф организации выше FREE.
 * Должно совпадать по смыслу с `requiredFeature` у пунктов меню в `adminNav.ts`.
 */
export function adminRouteRequiredFeature(path: string): SubscriptionFeature | null {
  if (/^\/admin\/audit-log(\/|$)/.test(path)) return 'admin_audit_log'
  if (/^\/admin\/social-links(\/|$)/.test(path)) return 'public_custom_branding'
  if (/^\/admin\/news(\/|$)/.test(path)) return 'news_and_media'
  if (/^\/admin\/gallery(\/|$)/.test(path)) return 'news_and_media'
  if (/^\/admin\/references\/news-tags(\/|$)/.test(path)) return 'news_and_media'
  if (/^\/admin\/tournaments\/[^/]+\/news(\/|$)/.test(path)) return 'news_and_media'
  if (/^\/admin\/tournaments\/[^/]+\/gallery(\/|$)/.test(path)) return 'news_and_media'
  if (/^\/admin\/calendar(\/|$)/.test(path)) return 'org_wide_calendar'
  if (/^\/admin\/references\/[^/]+(\/|$)/.test(path)) {
    if (/^\/admin\/references\/news-tags(\/|$)/.test(path)) return 'news_and_media'
    return adminReferencesRequiredFeature(path)
  }
  return null
}

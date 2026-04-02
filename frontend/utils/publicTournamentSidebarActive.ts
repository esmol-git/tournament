/** Активный пункт сайдбара турнира по URL (алиасы `/:tenant/...` и `/:tenant/tournaments/...`). */
export function resolvePublicSidebarActive(
  path: string,
  tenant: string,
): 'table' | 'calendar' | 'players' | 'documents' | 'none' {
  const t = tenant.replace(/\/+$/, '').trim()
  if (!t) return 'none'

  const base = `/${t}`

  /** Сначала длинные префиксы — иначе `/:tenant/tournaments` перехватывает `.../tournaments/media`. */
  const checks: Array<{ prefix: string; key: 'table' | 'calendar' | 'players' | 'documents' }> = [
    { prefix: `${base}/tournaments/calendar`, key: 'calendar' },
    { prefix: `${base}/calendar`, key: 'calendar' },
    { prefix: `${base}/tournaments/scorers`, key: 'players' },
    { prefix: `${base}/scorers`, key: 'players' },
    { prefix: `${base}/tournaments/documents`, key: 'documents' },
    { prefix: `${base}/documents`, key: 'documents' },
    { prefix: `${base}/tournaments/table`, key: 'table' },
    { prefix: `${base}/table`, key: 'table' },
  ]

  for (const { prefix, key } of checks) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return key
  }

  if (path === `${base}/tournaments` || path === `${base}/tournaments/`) {
    return 'table'
  }

  return 'none'
}

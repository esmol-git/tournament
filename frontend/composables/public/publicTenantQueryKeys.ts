/**
 * Ключи TanStack Query для публичного API `/public/tenants/:slug/...` (без JWT).
 * Stale чуть короче минуты — чаще согласуются счёт/таблица после протокола с мобилки;
 * вместе с refetchOnWindowFocus для ключей `['public', …]` не нужен ручной сброс кэша.
 */
export const PUBLIC_STALE_SHORT_MS = 45_000
export const PUBLIC_STALE_MEDIUM_MS = 75_000
export const PUBLIC_STALE_LONG_MS = 5 * 60_000

export function stableSerializePublicQuery(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return `[${value.map((v) => stableSerializePublicQuery(v)).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${k}:${stableSerializePublicQuery(obj[k])}`).join(',')}}`
}

export const publicTenantQueryKeys = {
  tournamentsAll: (slug: string) => ['public', 'tenant', slug, 'tournaments', 'all'] as const,
  tournamentDetail: (slug: string, tournamentId: string, queryKey: string) =>
    ['public', 'tenant', slug, 'tournament', tournamentId, 'detail', queryKey] as const,
  tournamentTable: (slug: string, tournamentId: string, groupId: string) =>
    ['public', 'tenant', slug, 'tournament', tournamentId, 'table', 'full', groupId] as const,
  tournamentTablePage: (
    slug: string,
    tournamentId: string,
    groupId: string,
    offset: number,
    limit: number,
  ) => ['public', 'tenant', slug, 'tournament', tournamentId, 'table', 'page', groupId, offset, limit] as const,
  tournamentRoster: (slug: string, tournamentId: string) =>
    ['public', 'tenant', slug, 'tournament', tournamentId, 'roster'] as const,
  tenantMeta: (slug: string) => ['public', 'tenant', slug, 'meta'] as const,
  tournamentNews: (slug: string, tournamentId: string) =>
    ['public', 'tenant', slug, 'tournament', tournamentId, 'news'] as const,
  tournamentGallery: (slug: string, tournamentId: string) =>
    ['public', 'tenant', slug, 'tournament', tournamentId, 'gallery'] as const,
  tournamentDocuments: (slug: string, tournamentId: string) =>
    ['public', 'tenant', slug, 'tournament', tournamentId, 'documents'] as const,
  tenantManagement: (slug: string) => ['public', 'tenant', slug, 'management'] as const,
  orgTeams: (slug: string) => ['public', 'tenant', slug, 'participants', 'teams'] as const,
  orgPlayers: (slug: string) => ['public', 'tenant', slug, 'participants', 'players'] as const,
  tenantGalleryFeed: (slug: string, limit: number) =>
    ['public', 'tenant', slug, 'media', 'gallery', limit] as const,
  tenantVideoFeed: (slug: string, limit: number) =>
    ['public', 'tenant', slug, 'media', 'video', limit] as const,
  mediaFeed: (slug: string) => ['public', 'tenant', slug, 'media', 'feed'] as const,
}

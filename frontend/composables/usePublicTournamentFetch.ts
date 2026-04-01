import type { TournamentListResponse, TournamentRow } from '~/types/admin/tournaments-index'
import type { TableRow, TournamentDetails } from '~/types/tournament-admin'
import { useApiUrl } from '~/composables/useApiUrl'

type CacheEntry = { expiresAt: number; data: unknown }
const PUBLIC_FETCH_CACHE = new Map<string, CacheEntry>()
const PUBLIC_FETCH_INFLIGHT = new Map<string, Promise<unknown>>()

function getCached<T>(key: string): T | null {
  const entry = PUBLIC_FETCH_CACHE.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    PUBLIC_FETCH_CACHE.delete(key)
    return null
  }
  return entry.data as T
}

async function cachedFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = getCached<T>(key)
  if (cached !== null) return cached

  const inFlight = PUBLIC_FETCH_INFLIGHT.get(key)
  if (inFlight) return inFlight as Promise<T>

  const promise = fetcher()
    .then((result) => {
      PUBLIC_FETCH_CACHE.set(key, { data: result, expiresAt: Date.now() + ttlMs })
      return result
    })
    .finally(() => {
      PUBLIC_FETCH_INFLIGHT.delete(key)
    })

  PUBLIC_FETCH_INFLIGHT.set(key, promise)
  return promise
}

export type PublicRosterTeam = {
  teamId: string
  teamName: string
  logoUrl: string | null
  category: string | null
  description: string | null
  coachName: string | null
  groupId: string | null
  groupName: string | null
  players: Array<{
    id: string
    firstName: string
    lastName: string
    birthDate: string | null
    jerseyNumber: number | null
    position: string | null
    photoUrl: string | null
  }>
}

export type PublicTournamentNewsItem = {
  id: string
  tournamentId: string
  title: string
  slug: string
  section: 'ANNOUNCEMENT' | 'REPORT' | 'INTERVIEW' | 'OFFICIAL' | 'MEDIA'
  excerpt?: string | null
  content?: string | null
  coverImageUrl?: string | null
  publishedAt?: string | null
  createdAt: string
  newsTags?: Array<{
    tag: { id: string; name: string; slug: string; active: boolean }
  }>
}

export type PublicTenantMeta = {
  name: string
  slug: string
  socialLinks?: {
    websiteUrl?: string | null
    showWebsiteLink?: boolean
    socialYoutubeUrl?: string | null
    showSocialYoutubeLink?: boolean
    socialInstagramUrl?: string | null
    showSocialInstagramLink?: boolean
    socialTelegramUrl?: string | null
    showSocialTelegramLink?: boolean
    socialMaxUrl?: string | null
    showSocialMaxLink?: boolean
  }
}

export type PublicGalleryImageItem = {
  id: string
  imageUrl: string
  caption?: string | null
  sortOrder: number
}

export type PublicTenantGalleryFeedItem = PublicGalleryImageItem & {
  tournamentId: string
  tournamentName: string
  createdAt: string
}

export type PublicTenantVideoFeedItem = {
  id: string
  tournamentId: string | null
  tournamentName: string | null
  title: string
  section: 'ANNOUNCEMENT' | 'REPORT' | 'INTERVIEW' | 'OFFICIAL' | 'MEDIA'
  excerpt?: string | null
  content?: string | null
  coverImageUrl?: string | null
  publishedAt?: string | null
  createdAt: string
}

export type PublicReferenceDocumentItem = {
  id: string
  title: string
  code?: string | null
  url?: string | null
  note?: string | null
  sortOrder: number
  tournamentId?: string | null
}

export type PublicManagementMemberItem = {
  id: string
  lastName: string
  firstName: string
  title: string
  phone?: string | null
  email?: string | null
  note?: string | null
  sortOrder: number
}

/**
 * Read-only запросы для страниц `/{tenant}/…` без JWT.
 * Бэкенд: `/public/tenants/:tenantSlug/...` (tenantSlug из URL).
 */
export function usePublicTournamentFetch() {
  const { apiUrl } = useApiUrl()
  const TTL_SHORT = 10_000
  const TTL_MEDIUM = 90_000
  const TTL_LONG = 5 * 60_000

  function base(slug: string) {
    return apiUrl(`/public/tenants/${encodeURIComponent(slug)}`)
  }

  async function loadAllTournaments(tenantSlug: string): Promise<TournamentRow[]> {
    const cacheKey = `public:tournaments:${tenantSlug}`
    return cachedFetch(cacheKey, TTL_MEDIUM, async () => {
      const loaded: TournamentRow[] = []
      let page = 1
      let total = 0
      do {
        const res = await $fetch<TournamentListResponse>(`${base(tenantSlug)}/tournaments`, {
          params: { page, pageSize: 100 },
        })
        const items = res.items ?? []
        total = res.total ?? items.length
        loaded.push(...items)
        page += 1
        if (!items.length) break
      } while (loaded.length < total)
      return loaded
    })
  }

  async function fetchTournamentDetail(
    tenantSlug: string,
    tournamentId: string,
    query?: Record<string, string>,
  ) {
    const queryKey = query ? JSON.stringify(query) : ''
    const cacheKey = `public:tournament-detail:${tenantSlug}:${tournamentId}:${queryKey}`
    return cachedFetch(cacheKey, TTL_SHORT, async () => {
      return await $fetch<TournamentDetails>(`${base(tenantSlug)}/tournaments/${tournamentId}`, {
        query,
      })
    })
  }

  async function fetchTable(tenantSlug: string, tournamentId: string, groupId?: string) {
    const cacheKey = `public:tournament-table:${tenantSlug}:${tournamentId}:${groupId ?? ''}`
    return cachedFetch(cacheKey, TTL_SHORT, async () => {
      return await $fetch<TableRow[]>(`${base(tenantSlug)}/tournaments/${tournamentId}/table`, {
        params: groupId ? { groupId } : undefined,
      })
    })
  }

  async function fetchRoster(tenantSlug: string, tournamentId: string) {
    const cacheKey = `public:tournament-roster:${tenantSlug}:${tournamentId}`
    return cachedFetch(cacheKey, TTL_SHORT, async () => {
      return await $fetch<PublicRosterTeam[]>(
        `${base(tenantSlug)}/tournaments/${tournamentId}/roster`,
      )
    })
  }

  async function fetchMediaFeed(tenantSlug: string) {
    return await $fetch<{ items: unknown[] }>(`${base(tenantSlug)}/media`)
  }

  async function fetchTenantMeta(tenantSlug: string) {
    const cacheKey = `public:tenant-meta:${tenantSlug}`
    return cachedFetch(cacheKey, TTL_LONG, async () => {
      return await $fetch<PublicTenantMeta>(`${base(tenantSlug)}`)
    })
  }

  async function fetchTournamentNews(tenantSlug: string, tournamentId: string) {
    const cacheKey = `public:tournament-news:${tenantSlug}:${tournamentId}`
    return cachedFetch(cacheKey, TTL_SHORT, async () => {
      return await $fetch<PublicTournamentNewsItem[]>(
        `${base(tenantSlug)}/tournaments/${tournamentId}/news`,
      )
    })
  }

  async function fetchTournamentGallery(tenantSlug: string, tournamentId: string) {
    const cacheKey = `public:tournament-gallery:${tenantSlug}:${tournamentId}`
    return cachedFetch(cacheKey, TTL_SHORT, async () => {
      return await $fetch<PublicGalleryImageItem[]>(
        `${base(tenantSlug)}/tournaments/${tournamentId}/gallery`,
      )
    })
  }

  async function fetchTournamentDocuments(tenantSlug: string, tournamentId: string) {
    const cacheKey = `public:tournament-documents:${tenantSlug}:${tournamentId}`
    return cachedFetch(cacheKey, TTL_SHORT, async () => {
      return await $fetch<PublicReferenceDocumentItem[]>(
        `${base(tenantSlug)}/tournaments/${tournamentId}/documents`,
      )
    })
  }

  async function fetchTenantManagement(tenantSlug: string) {
    const cacheKey = `public:tenant-management:${tenantSlug}`
    return cachedFetch(cacheKey, TTL_MEDIUM, async () => {
      return await $fetch<PublicManagementMemberItem[]>(`${base(tenantSlug)}/management`)
    })
  }

  async function fetchTenantGalleryFeed(tenantSlug: string, limit = 120) {
    const safeLimit = Math.max(1, Math.min(300, Number(limit) || 120))
    const cacheKey = `public:tenant-gallery-feed:${tenantSlug}:${safeLimit}`
    return cachedFetch(cacheKey, TTL_SHORT, async () => {
      return await $fetch<PublicTenantGalleryFeedItem[]>(
        `${base(tenantSlug)}/media/gallery`,
        { params: { limit: safeLimit } },
      )
    })
  }

  async function fetchTenantVideoFeed(tenantSlug: string, limit = 120) {
    const safeLimit = Math.max(1, Math.min(300, Number(limit) || 120))
    const cacheKey = `public:tenant-video-feed:${tenantSlug}:${safeLimit}`
    return cachedFetch(cacheKey, TTL_SHORT, async () => {
      return await $fetch<PublicTenantVideoFeedItem[]>(
        `${base(tenantSlug)}/media/video`,
        { params: { limit: safeLimit } },
      )
    })
  }

  return {
    base,
    loadAllTournaments,
    fetchTournamentDetail,
    fetchTable,
    fetchRoster,
    fetchMediaFeed,
    fetchTenantMeta,
    fetchTournamentNews,
    fetchTournamentGallery,
    fetchTournamentDocuments,
    fetchTenantManagement,
    fetchTenantGalleryFeed,
    fetchTenantVideoFeed,
  }
}

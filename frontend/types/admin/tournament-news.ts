export interface TournamentNewsRow {
  id: string
  tenantId: string
  tournamentId: string | null
  title: string
  slug: string
  excerpt?: string | null
  content?: string | null
  coverImageUrl?: string | null
  section: 'ANNOUNCEMENT' | 'REPORT' | 'INTERVIEW' | 'OFFICIAL' | 'MEDIA'
  published: boolean
  publishedAt?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  tournament?: { id: string; name: string } | null
  newsTags?: Array<{
    tag: { id: string; name: string; slug: string; active: boolean }
  }>
}

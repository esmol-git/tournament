export interface TournamentGalleryImageRow {
  id: string
  tenantId: string
  tournamentId: string
  imageUrl: string
  caption?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

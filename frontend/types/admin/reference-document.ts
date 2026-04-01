export interface ReferenceDocumentRow {
  id: string
  tournamentId?: string | null
  tournament?: { id: string; name: string } | null
  title: string
  code: string | null
  url: string | null
  note: string | null
  sortOrder: number
  active: boolean
}

export interface ProtocolEventTypeRow {
  id: string
  name: string
  mapsToType: string
  note?: string | null
  sortOrder: number
  active: boolean
}

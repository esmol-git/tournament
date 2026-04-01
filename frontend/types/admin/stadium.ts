export interface StadiumRow {
  id: string
  name: string
  address: string | null
  city: string | null
  regionId?: string | null
  region?: { id: string; name: string; code?: string | null } | null
  note: string | null
}

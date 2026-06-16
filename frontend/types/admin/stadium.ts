export interface StadiumRow {
  id: string
  name: string
  address: string | null
  city: string | null
  regionId?: string | null
  region?: { id: string; name: string; code?: string | null } | null
  surfaceType?: import('~/utils/stadiumSurfaceType').StadiumSurfaceType | null
  surface: string | null
  pitchCount: number | null
  capacity: number | null
  note: string | null
}

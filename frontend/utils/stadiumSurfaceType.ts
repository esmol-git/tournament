export type StadiumSurfaceType =
  | 'NATURAL_GRASS'
  | 'ARTIFICIAL_TURF'
  | 'PARQUET'
  | 'INDOOR'
  | 'OTHER'

export const STADIUM_SURFACE_TYPE_VALUES: StadiumSurfaceType[] = [
  'NATURAL_GRASS',
  'ARTIFICIAL_TURF',
  'PARQUET',
  'INDOOR',
  'OTHER',
]

export function stadiumSurfaceTypeLabel(
  type: StadiumSurfaceType | null | undefined,
  note?: string | null,
  t?: (key: string) => string,
): string {
  if (!type) return note?.trim() || '—'
  const key = `admin.stadiums.surface_types.${type}`
  const label = t ? t(key) : type
  const base = label === key ? type : label
  if (type === 'OTHER' && note?.trim()) return `${base}: ${note.trim()}`
  if (note?.trim()) return `${base} (${note.trim()})`
  return base
}

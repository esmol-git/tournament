export interface AgeGroupRow {
  id: string
  name: string
  shortLabel: string | null
  code: string | null
  minBirthYear: number | null
  maxBirthYear: number | null
  note: string | null
  sortOrder: number
  active: boolean
}

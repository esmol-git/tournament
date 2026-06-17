export type TeamCategoryRow = {
  id: string
  tenantId: string
  name: string
  slug: string | null
  ageGroupId: string | null
  ageGroup?: { id: string; name: string } | null
  minBirthYear: number | null
  maxBirthYear: number | null
  requireBirthDate: boolean
  allowedGenders: Array<'MALE' | 'FEMALE'>
  createdAt: string
  updatedAt: string
}

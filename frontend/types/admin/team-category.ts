export type TeamCategoryRow = {
  id: string
  tenantId: string
  name: string
  slug: string | null
  minBirthYear: number | null
  maxBirthYear: number | null
  requireBirthDate: boolean
  allowedGenders: Array<'MALE' | 'FEMALE'>
  createdAt: string
  updatedAt: string
}

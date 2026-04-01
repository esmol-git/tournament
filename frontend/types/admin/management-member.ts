export interface ManagementMemberRow {
  id: string
  lastName: string
  firstName: string
  title: string
  phone: string | null
  email: string | null
  note: string | null
  sortOrder: number
  active: boolean
}

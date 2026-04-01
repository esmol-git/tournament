export interface RefereeCategoryLite {
  id: string
  name: string
  code: string | null
  active: boolean
}

export interface RefereePositionLite {
  id: string
  name: string
  code: string | null
  active: boolean
}

export interface RefereeRow {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  note: string | null
  refereeCategoryId: string | null
  refereePositionId: string | null
  refereeCategory: RefereeCategoryLite | null
  refereePosition: RefereePositionLite | null
}

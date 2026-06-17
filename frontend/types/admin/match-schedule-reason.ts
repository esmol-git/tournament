export type MatchScheduleReasonScope = 'POSTPONE' | 'CANCEL' | 'BOTH' | 'TECHNICAL'

export interface MatchScheduleReasonRow {
  id: string
  name: string
  code?: string | null
  note?: string | null
  scope: MatchScheduleReasonScope
  sortOrder: number
  active: boolean
}

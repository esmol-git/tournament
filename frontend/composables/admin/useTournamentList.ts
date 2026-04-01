import type { TournamentStatus } from '~/types/admin/tournaments-index'

type ParamsInput = {
  page: number
  pageSize: number
  statusFilter: 'all' | TournamentStatus
  search: string
  seasonId: string
  competitionId: string
  ageGroupId: string
}

export function buildTournamentListParams(input: ParamsInput): Record<string, string | number> {
  return {
    page: input.page,
    pageSize: input.pageSize,
    ...(input.statusFilter !== 'all' ? { status: input.statusFilter } : {}),
    ...(input.search.trim() ? { q: input.search.trim() } : {}),
    ...(input.seasonId.trim() ? { seasonId: input.seasonId.trim() } : {}),
    ...(input.competitionId.trim() ? { competitionId: input.competitionId.trim() } : {}),
    ...(input.ageGroupId.trim() ? { ageGroupId: input.ageGroupId.trim() } : {}),
  }
}

export function appendUniqueById<T extends { id: string }>(base: T[], next: T[]): T[] {
  const seen = new Set(base.map((x) => x.id))
  const merged = [...base]
  for (const item of next) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    merged.push(item)
  }
  return merged
}

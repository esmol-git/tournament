export const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'

export function resolveTeamLogoUrl(url: string | null | undefined): string {
  const trimmed = String(url ?? '').trim()
  return trimmed || TEAM_PLACEHOLDER_SRC
}

export type TournamentMatchOfficialsProfile =
  | 'MAIN_ONLY'
  | 'CREW_OF_3'
  | 'CREW_OF_3_WITH_VAR'

export type MatchOfficialRole = 'MAIN' | 'ASSISTANT_1' | 'ASSISTANT_2' | 'VAR'

export function rolesForOfficialsProfile(
  profile: TournamentMatchOfficialsProfile | null | undefined,
): MatchOfficialRole[] {
  switch (profile) {
    case 'MAIN_ONLY':
      return ['MAIN']
    case 'CREW_OF_3_WITH_VAR':
      return ['MAIN', 'ASSISTANT_1', 'ASSISTANT_2', 'VAR']
    case 'CREW_OF_3':
    default:
      return ['MAIN', 'ASSISTANT_1', 'ASSISTANT_2']
  }
}

export function matchOfficialRoleLabel(
  role: MatchOfficialRole,
  t: (key: string) => string,
): string {
  switch (role) {
    case 'MAIN':
      return t('admin.match_officials.role_main')
    case 'ASSISTANT_1':
      return t('admin.match_officials.role_assistant_1')
    case 'ASSISTANT_2':
      return t('admin.match_officials.role_assistant_2')
    case 'VAR':
      return t('admin.match_officials.role_var')
    default:
      return role
  }
}

export function minRefereesRequiredForParallelSlots(
  profile: TournamentMatchOfficialsProfile | null | undefined,
  simultaneousMatches: number,
): number {
  const parallel = Math.max(1, simultaneousMatches)
  return rolesForOfficialsProfile(profile).length * parallel
}

export function buildRefereeAssignmentsFromForm(form: {
  mainRefereeId: string
  assistant1RefereeId: string
  assistant2RefereeId: string
  varRefereeId: string
}, roles: MatchOfficialRole[]): Array<{ refereeId: string; role: MatchOfficialRole }> {
  const rows: Array<{ refereeId: string; role: MatchOfficialRole }> = []
  if (roles.includes('MAIN') && form.mainRefereeId.trim()) {
    rows.push({ refereeId: form.mainRefereeId.trim(), role: 'MAIN' })
  }
  if (roles.includes('ASSISTANT_1') && form.assistant1RefereeId.trim()) {
    rows.push({ refereeId: form.assistant1RefereeId.trim(), role: 'ASSISTANT_1' })
  }
  if (roles.includes('ASSISTANT_2') && form.assistant2RefereeId.trim()) {
    rows.push({ refereeId: form.assistant2RefereeId.trim(), role: 'ASSISTANT_2' })
  }
  if (roles.includes('VAR') && form.varRefereeId.trim()) {
    rows.push({ refereeId: form.varRefereeId.trim(), role: 'VAR' })
  }
  return rows
}

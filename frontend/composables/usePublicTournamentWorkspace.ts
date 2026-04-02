import { inject } from 'vue'
import { publicTournamentWorkspaceKey, type PublicTournamentWorkspaceInject } from '~/constants/publicTournamentWorkspace'

export function usePublicTournamentWorkspace(): PublicTournamentWorkspaceInject {
  const ctx = inject(publicTournamentWorkspaceKey)
  if (!ctx) {
    throw new Error('usePublicTournamentWorkspace: используйте layout public-tournament')
  }
  return ctx
}

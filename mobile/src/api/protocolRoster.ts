import { getPublicTournamentRoster, shouldUsePublicTournamentApi } from './tournamentsApi'
import { listTeamPlayers, type TeamPlayerListItem } from './teamsApi'
import type { UserRole } from '../types/user'

export type ProtocolRosterPlayer = {
  playerId: string
  label: string
}

export type ProtocolRoster = {
  home: ProtocolRosterPlayer[]
  away: ProtocolRosterPlayer[]
}

function labelFromNames(firstName: string, lastName: string) {
  const a = lastName?.trim() || ''
  const b = firstName?.trim() || ''
  return [a, b].filter(Boolean).join(' ') || 'Игрок'
}

function mapTenantItems(items: TeamPlayerListItem[]): ProtocolRosterPlayer[] {
  return items.map((tp) => ({
    playerId: tp.playerId,
    label: labelFromNames(tp.player.firstName, tp.player.lastName),
  }))
}

/**
 * Составы хозяев и гостей для протокола.
 * Staff — `/tenants/.../teams/.../players`; судья (REFEREE) — публичный roster опубликованного турнира.
 */
export async function loadProtocolRoster(params: {
  tenantId: string
  tenantSlug: string
  role: UserRole
  tournamentId: string
  homeTeamId: string | null | undefined
  awayTeamId: string | null | undefined
  tournamentPublished?: boolean
}): Promise<{ roster: ProtocolRoster | null; error: string | null }> {
  const homeId = params.homeTeamId
  const awayId = params.awayTeamId
  if (!homeId || !awayId) {
    return { roster: { home: [], away: [] }, error: null }
  }

  if (!shouldUsePublicTournamentApi(params.role)) {
    try {
      const [homeRes, awayRes] = await Promise.all([
        listTeamPlayers({ tenantId: params.tenantId, teamId: homeId, pageSize: 200, activeOnly: true }),
        listTeamPlayers({ tenantId: params.tenantId, teamId: awayId, pageSize: 200, activeOnly: true }),
      ])
      return {
        roster: {
          home: mapTenantItems(homeRes.items),
          away: mapTenantItems(awayRes.items),
        },
        error: null,
      }
    } catch {
      return { roster: null, error: 'Не удалось загрузить составы команд (проверьте права доступа).' }
    }
  }

  if (params.tournamentPublished === false) {
    return {
      roster: null,
      error:
        'Турнир не опубликован на сайте: состав для судьи недоступен. Опубликуйте турнир или используйте веб-интерфейс.',
    }
  }

  try {
    const rows = await getPublicTournamentRoster({
      tenantSlug: params.tenantSlug,
      tournamentId: params.tournamentId,
    })
    const homeRow = rows.find((r) => r.teamId === homeId)
    const awayRow = rows.find((r) => r.teamId === awayId)
    return {
      roster: {
        home: (homeRow?.players ?? []).map((p) => ({
          playerId: p.id,
          label: labelFromNames(p.firstName, p.lastName),
        })),
        away: (awayRow?.players ?? []).map((p) => ({
          playerId: p.id,
          label: labelFromNames(p.firstName, p.lastName),
        })),
      },
      error: null,
    }
  } catch {
    return {
      roster: null,
      error: 'Не удалось загрузить состав (нужен опубликованный турнир для роли судьи).',
    }
  }
}

import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getErrorMessage, getTournamentDetail } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { canEditMatchProtocol } from '../../auth/roleLabels'
import type { TournamentsStackParamList } from '../../navigation/types'
import type { TournamentDetailResponse, TournamentMatchRow } from '../../types/tournament'
import { AppNotice } from '../../components/ui/AppNotice'
import { formatDateTime, formatDateOnly } from '../../utils/formatDate'
import { matchStatusLabel, tournamentStatusLabel } from '../../utils/tournamentLabels'
import { colors } from '../../theme/colors'

type Props = NativeStackScreenProps<TournamentsStackParamList, 'TournamentDetail'>

export function TournamentDetailScreen({ route, navigation }: Props) {
  const { tournamentId, tournamentName } = route.params
  const { user, tenant } = useAuth()
  const [name, setName] = useState(tournamentName ?? '')
  const [status, setStatus] = useState('')
  const [startsAt, setStartsAt] = useState<string | null>(null)
  const [endsAt, setEndsAt] = useState<string | null>(null)
  const [matches, setMatches] = useState<TournamentMatchRow[]>([])
  const [matchesTotal, setMatchesTotal] = useState<number | null>(null)
  const [summary, setSummary] = useState<TournamentDetailResponse['summary']>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user || !tenant) return
    setError(null)
    setLoading(true)
    try {
      const d = await getTournamentDetail({
        tournamentId,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        role: user.role,
        matchesLimit: 200,
      })
      setName(d.name)
      setStatus(d.status)
      setStartsAt(d.startsAt ?? null)
      setEndsAt(d.endsAt ?? null)
      setMatches(Array.isArray(d.matches) ? d.matches : [])
      setMatchesTotal(
        typeof d.matchesTotal === 'number' ? d.matchesTotal : (d.matches?.length ?? 0),
      )
      setSummary(d.summary)
    } catch (e) {
      setError(getErrorMessage(e))
      setMatches([])
    } finally {
      setLoading(false)
    }
  }, [user, tenant, tournamentId])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  useLayoutEffect(() => {
    navigation.setOptions({ title: name.trim() || 'Турнир' })
  }, [navigation, name])

  const header = (
    <View style={styles.header}>
      <Text style={styles.statusLine}>{tournamentStatusLabel(status)}</Text>
      <Text style={styles.dates}>
        {formatDateOnly(startsAt)} — {formatDateOnly(endsAt)}
      </Text>
      {summary ? (
        <View style={styles.summary}>
          {typeof summary.teamsRegisteredTotal === 'number' ? (
            <Text style={styles.summaryText}>Команд: {summary.teamsRegisteredTotal}</Text>
          ) : null}
          {typeof summary.matchesTotal === 'number' ? (
            <Text style={styles.summaryText}>Матчей: {summary.matchesTotal}</Text>
          ) : null}
          {typeof summary.matchesPlayedTotal === 'number' ? (
            <Text style={styles.summaryText}>Сыграно: {summary.matchesPlayedTotal}</Text>
          ) : null}
          {summary.championTeamName ? (
            <Text style={styles.champion}>Победитель: {summary.championTeamName}</Text>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.sectionTitle}>Матчи</Text>
      {matchesTotal !== null && matches.length < matchesTotal ? (
        <Text style={styles.pageHint}>
          Показано {matches.length} из {matchesTotal} (лимит загрузки с API)
        </Text>
      ) : null}
    </View>
  )

  if (!user || !tenant) return null

  if (loading && matches.length === 0 && !error) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {error ? (
        <AppNotice variant="error" style={styles.topNotice} onDismiss={() => setError(null)}>
          {error}
        </AppNotice>
      ) : null}
      <FlatList
        data={matches}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>Матчей пока нет</Text> : null
        }
        renderItem={({ item }) => {
          const canProtocol = !!(user && canEditMatchProtocol(user.role))
          return (
            <Pressable
              disabled={!canProtocol}
              style={({ pressed }) => [
                styles.matchCard,
                canProtocol && pressed && styles.matchCardPressed,
              ]}
              onPress={() =>
                navigation.navigate('MatchProtocol', {
                  tournamentId,
                  matchId: item.id,
                })
              }
            >
              <Text style={styles.matchTime}>{formatDateTime(item.startTime)}</Text>
              <Text style={styles.matchTeams}>
                {item.homeTeam?.name ?? '—'} — {item.awayTeam?.name ?? '—'}
              </Text>
              <Text style={styles.matchScore}>
                {item.homeScore != null && item.awayScore != null
                  ? `${item.homeScore} : ${item.awayScore}`
                  : 'Счёт не внесён'}
              </Text>
              <Text style={styles.matchStatus}>{matchStatusLabel(item.status)}</Text>
              {canProtocol ? (
                <Text style={styles.tapHint}>Нажмите, чтобы открыть протокол</Text>
              ) : null}
            </Pressable>
          )
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topNotice: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  statusLine: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  dates: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
  summary: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryText: {
    fontSize: 13,
    color: colors.text,
    marginBottom: 4,
  },
  champion: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 20,
    marginBottom: 8,
  },
  pageHint: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 8,
  },
  empty: {
    textAlign: 'center',
    color: colors.muted,
    paddingVertical: 24,
    fontSize: 15,
  },
  matchCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: colors.background,
  },
  matchTime: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
  },
  matchTeams: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  matchScore: {
    fontSize: 15,
    color: colors.primary,
    marginTop: 6,
  },
  matchStatus: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
  },
  matchCardPressed: {
    backgroundColor: colors.surface,
  },
  tapHint: {
    fontSize: 11,
    color: colors.accent,
    marginTop: 8,
    fontWeight: '600',
  },
})

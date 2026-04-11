import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  getErrorMessage,
  getTournamentDetail,
  getTournamentTable,
  isTransientApiError,
  TRANSIENT_ERROR_DETAIL,
} from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { canEditMatchProtocol } from '../../auth/roleLabels'
import type { TournamentsStackParamList } from '../../navigation/types'
import type {
  TournamentDetailResponse,
  TournamentGroupRow,
  TournamentMatchRow,
  TournamentTableRow,
} from '../../types/tournament'
import { AppNotice } from '../../components/ui/AppNotice'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateTime, formatDateOnly } from '../../utils/formatDate'
import { matchStatusLabel, tournamentStatusLabel } from '../../utils/tournamentLabels'
import { useTheme } from '../../theme/ThemeContext'

type Props = NativeStackScreenProps<TournamentsStackParamList, 'TournamentDetail'>

type DetailTab = 'matches' | 'table'

export function TournamentDetailScreen({ route, navigation }: Props) {
  const { tournamentId, tournamentName } = route.params
  const { colors } = useTheme()
  const { user, tenant } = useAuth()
  const [name, setName] = useState(tournamentName ?? '')
  const [status, setStatus] = useState('')
  const [startsAt, setStartsAt] = useState<string | null>(null)
  const [endsAt, setEndsAt] = useState<string | null>(null)
  const [matches, setMatches] = useState<TournamentMatchRow[]>([])
  const [matchesTotal, setMatchesTotal] = useState<number | null>(null)
  const [groups, setGroups] = useState<TournamentGroupRow[]>([])
  const [summary, setSummary] = useState<TournamentDetailResponse['summary']>(undefined)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorTransient, setErrorTransient] = useState(false)

  const [detailTab, setDetailTab] = useState<DetailTab>('matches')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [tableRows, setTableRows] = useState<TournamentTableRow[]>([])
  const [tableLoading, setTableLoading] = useState(false)
  const [tableError, setTableError] = useState<string | null>(null)

  const hasMultipleGroups = groups.length > 1
  const tableTabLabel = hasMultipleGroups ? 'Таблицы' : 'Таблица'

  const load = useCallback(
    async (opts?: { refresh?: boolean }) => {
      const isRefresh = opts?.refresh === true
      if (!user || !tenant) return
      setError(null)
      setErrorTransient(false)
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
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
        const g = Array.isArray(d.groups) ? d.groups : []
        setGroups(g)
        if (g.length > 1) {
          setSelectedGroupId((prev) => {
            if (prev && g.some((x) => x.id === prev)) return prev
            return g[0]?.id ?? null
          })
        } else if (g.length === 1) {
          setSelectedGroupId(g[0].id)
        } else {
          setSelectedGroupId(null)
        }
        setSummary(d.summary)
      } catch (e) {
        setErrorTransient(isTransientApiError(e))
        setError(getErrorMessage(e))
        setMatches([])
        setGroups([])
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [user, tenant, tournamentId],
  )

  const loadTable = useCallback(async () => {
    if (!user || !tenant) return
    setTableLoading(true)
    setTableError(null)
    try {
      const groupId =
        hasMultipleGroups ? (selectedGroupId ?? groups[0]?.id) : groups.length === 1 ? groups[0].id : undefined
      const rows = await getTournamentTable({
        tournamentId,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        role: user.role,
        ...(groupId ? { groupId } : {}),
      })
      setTableRows(Array.isArray(rows) ? rows : [])
    } catch (e) {
      setTableError(getErrorMessage(e))
      setTableRows([])
    } finally {
      setTableLoading(false)
    }
  }, [user, tenant, tournamentId, hasMultipleGroups, selectedGroupId, groups])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  useEffect(() => {
    if (detailTab !== 'table' || !user || !tenant) return
    void loadTable()
  }, [detailTab, loadTable, user, tenant])

  useLayoutEffect(() => {
    navigation.setOptions({ title: name.trim() || 'Турнир' })
  }, [navigation, name])

  const styles = useMemo(
    () =>
      StyleSheet.create({
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
          flexGrow: 1,
        },
        header: {
          paddingTop: 8,
          paddingBottom: 8,
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
        tabBar: {
          flexDirection: 'row',
          marginTop: 16,
          marginBottom: 12,
          padding: 4,
          borderRadius: 14,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        tab: {
          flex: 1,
          paddingVertical: 11,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 10,
        },
        tabActive: {
          backgroundColor: colors.background,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.12,
          shadowRadius: 3,
          elevation: 2,
        },
        tabText: { fontSize: 15, fontWeight: '600', color: colors.muted },
        tabTextActive: { color: colors.accent },
        groupScroll: { marginBottom: 12, maxHeight: 44 },
        groupScrollContent: { flexDirection: 'row', gap: 8, alignItems: 'center' },
        groupChip: {
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
        groupChipActive: {
          borderColor: colors.accent,
          backgroundColor: colors.background,
        },
        groupChipText: { fontSize: 13, fontWeight: '600', color: colors.muted },
        groupChipTextActive: { color: colors.accent },
        sectionTitle: {
          fontSize: 18,
          fontWeight: '700',
          color: colors.primary,
          marginTop: 4,
          marginBottom: 8,
        },
        pageHint: {
          fontSize: 12,
          color: colors.muted,
          marginBottom: 8,
        },
        protocolHint: {
          fontSize: 12,
          lineHeight: 17,
          color: colors.muted,
          marginBottom: 10,
        },
        matchCard: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
          backgroundColor: colors.surface,
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
          backgroundColor: colors.background,
        },
        tapHint: {
          fontSize: 11,
          color: colors.accent,
          marginTop: 8,
          fontWeight: '600',
        },
        tableHint: {
          fontSize: 12,
          color: colors.muted,
          marginBottom: 10,
          lineHeight: 17,
        },
        tableLegend: {
          fontSize: 11,
          color: colors.muted,
          marginBottom: 8,
        },
        tableRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 12,
          marginBottom: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
        tablePos: {
          width: 28,
          fontSize: 16,
          fontWeight: '800',
          color: colors.accent,
        },
        tableMid: { flex: 1, minWidth: 0, paddingRight: 8 },
        tableTeam: { fontSize: 15, fontWeight: '600', color: colors.text },
        tableSub: {
          fontSize: 11,
          color: colors.muted,
          marginTop: 4,
        },
        tablePts: {
          fontSize: 16,
          fontWeight: '800',
          color: colors.primary,
          minWidth: 36,
          textAlign: 'right',
        },
        tableLoadingBox: { paddingVertical: 24, alignItems: 'center' },
      }),
    [colors],
  )

  const header = useMemo(
    () => (
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

        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tab, detailTab === 'matches' && styles.tabActive]}
            onPress={() => setDetailTab('matches')}
          >
            <Text style={[styles.tabText, detailTab === 'matches' && styles.tabTextActive]}>Матчи</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, detailTab === 'table' && styles.tabActive]}
            onPress={() => setDetailTab('table')}
          >
            <Text style={[styles.tabText, detailTab === 'table' && styles.tabTextActive]}>{tableTabLabel}</Text>
          </Pressable>
        </View>

        {detailTab === 'matches' ? (
          <>
            <Text style={styles.sectionTitle}>Матчи</Text>
            {user && !canEditMatchProtocol(user.role) && matches.length > 0 ? (
              <Text style={styles.protocolHint}>
                Протокол в приложении открывают администраторы организации и турнира, модераторы турнира и
                судьи. Остальные роли видят расписание без перехода в протокол.
              </Text>
            ) : null}
            {matchesTotal !== null && matches.length < matchesTotal ? (
              <Text style={styles.pageHint}>
                Показано {matches.length} из {matchesTotal} (лимит загрузки с API)
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>{tableTabLabel}</Text>
            <Text style={styles.tableHint}>
              {hasMultipleGroups
                ? 'Выберите группу. Таблица считается по сыгранным матчам группового этапа.'
                : 'Очки и статистика по сыгранным матчам турнира.'}
            </Text>
            {hasMultipleGroups ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.groupScroll}
                contentContainerStyle={styles.groupScrollContent}
              >
                {groups.map((g) => {
                  const active = selectedGroupId === g.id
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => setSelectedGroupId(g.id)}
                      style={[styles.groupChip, active && styles.groupChipActive]}
                    >
                      <Text style={[styles.groupChipText, active && styles.groupChipTextActive]}>{g.name}</Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
            ) : null}
            <Text style={styles.tableLegend}>М — матчи, В-Н-П, голы, р, о — очки</Text>
          </>
        )}
      </View>
    ),
    [
      styles,
      status,
      startsAt,
      endsAt,
      summary,
      detailTab,
      tableTabLabel,
      hasMultipleGroups,
      groups,
      selectedGroupId,
      matches.length,
      matchesTotal,
      user,
    ],
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
        <AppNotice
          variant="error"
          style={styles.topNotice}
          onDismiss={() => {
            setError(null)
            setErrorTransient(false)
          }}
          detail={errorTransient ? TRANSIENT_ERROR_DETAIL : undefined}
        >
          {error}
        </AppNotice>
      ) : null}

      {detailTab === 'matches' ? (
        <FlatList
          data={matches}
          keyExtractor={(m) => m.id}
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load({ refresh: true })}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="calendar-outline"
                title="Матчей пока нет"
                description="Расписание может появиться позже. Потяните вниз для обновления."
                actionLabel="Обновить"
                onAction={() => void load({ refresh: true })}
              />
            ) : null
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
      ) : (
        <FlatList
          data={tableRows}
          keyExtractor={(r) => r.teamId}
          ListHeaderComponent={
            <View>
              {header}
              {tableError ? (
                <AppNotice variant="error" style={{ marginBottom: 12 }} onDismiss={() => setTableError(null)}>
                  {tableError}
                </AppNotice>
              ) : null}
              {tableLoading && tableRows.length === 0 ? (
                <View style={styles.tableLoadingBox}>
                  <ActivityIndicator size="large" color={colors.accent} />
                </View>
              ) : null}
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing || (tableLoading && tableRows.length > 0)}
              onRefresh={() => {
                void load({ refresh: true })
                void loadTable()
              }}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            !tableLoading && !tableError ? (
              <EmptyState
                icon="stats-chart-outline"
                title="Таблица пуста"
                description="Нет данных для выбранной группы или матчи ещё не сыграны."
                actionLabel="Обновить"
                onAction={() => void loadTable()}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.tableRow}>
              <Text style={styles.tablePos}>{item.position}</Text>
              <View style={styles.tableMid}>
                <Text style={styles.tableTeam} numberOfLines={2}>
                  {item.teamName}
                </Text>
                <Text style={styles.tableSub}>
                  {item.played} · {item.wins}-{item.draws}-{item.losses} · {item.goalsFor}:{item.goalsAgainst} · р{' '}
                  {item.goalDiff >= 0 ? '+' : ''}
                  {item.goalDiff}
                </Text>
              </View>
              <Text style={styles.tablePts}>{item.points}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  )
}

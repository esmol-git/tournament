import { LegendList } from '@legendapp/list'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  getErrorMessage,
  isTransientApiError,
  listOrganizationTournaments,
  listTenantMatches,
  TRANSIENT_ERROR_DETAIL,
} from '../../api'
import { useAuth } from '../../auth/AuthContext'
import type { MatchesStackParamList } from '../../navigation/types'
import type { TenantMatchListItem } from '../../types/matches'
import type { TournamentListItem } from '../../types/tournament'
import { AppNotice } from '../../components/ui/AppNotice'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateTime } from '../../utils/formatDate'
import { matchStatusLabel } from '../../utils/tournamentLabels'
import { useTheme } from '../../theme/ThemeContext'

type Props = NativeStackScreenProps<MatchesStackParamList, 'MatchResults'>

type StatusFilterKey =
  | 'all'
  | 'upcoming'
  | 'SCHEDULED'
  | 'LIVE'
  | 'PLAYED'
  | 'FINISHED'
  | 'CANCELED'

const STATUS_OPTIONS: { key: StatusFilterKey; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'upcoming', label: 'Не завершены' },
  { key: 'SCHEDULED', label: 'Запланирован' },
  { key: 'LIVE', label: 'В игре' },
  { key: 'PLAYED', label: 'Сыгран' },
  { key: 'FINISHED', label: 'Итог' },
  { key: 'CANCELED', label: 'Отменён' },
]

function filterToQuery(status: StatusFilterKey): {
  status?: 'SCHEDULED' | 'LIVE' | 'PLAYED' | 'FINISHED' | 'CANCELED'
  includeLocked: boolean
} {
  if (status === 'all') return { includeLocked: true }
  if (status === 'upcoming') return { includeLocked: false }
  return { status, includeLocked: true }
}

export function MatchResultsScreen({ navigation }: Props) {
  const { colors } = useTheme()
  const { user, tenant } = useAuth()
  const [items, setItems] = useState<TenantMatchListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorTransient, setErrorTransient] = useState(false)

  const [tournaments, setTournaments] = useState<TournamentListItem[]>([])
  const [tournamentsLoading, setTournamentsLoading] = useState(false)
  const [tournamentModalOpen, setTournamentModalOpen] = useState(false)
  const [tournamentId, setTournamentId] = useState<string | null>(null)
  const [tournamentName, setTournamentName] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const loadTournaments = useCallback(async () => {
    if (!user || !tenant) return
    setTournamentsLoading(true)
    try {
      const res = await listOrganizationTournaments({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        role: user.role,
        page: 1,
        pageSize: 100,
      })
      setTournaments(res.items)
    } catch {
      setTournaments([])
    } finally {
      setTournamentsLoading(false)
    }
  }, [user, tenant])

  const loadPage = useCallback(
    async (nextPage: number, append: boolean) => {
      if (!user || !tenant) {
        setLoading(false)
        return
      }
      setError(null)
      setErrorTransient(false)
      if (append) setLoadingMore(true)
      else setLoading(true)
      try {
        const q = filterToQuery(statusFilter)
        const res = await listTenantMatches({
          tenantId: tenant.id,
          tournamentId: tournamentId ?? undefined,
          status: q.status,
          includeLocked: q.includeLocked,
          page: nextPage,
          pageSize: 40,
          dateFrom: /^\d{4}-\d{2}-\d{2}$/.test(dateFrom.trim()) ? dateFrom.trim() : undefined,
          dateTo: /^\d{4}-\d{2}-\d{2}$/.test(dateTo.trim()) ? dateTo.trim() : undefined,
        })
        setTotal(res.total)
        setPage(nextPage)
        setItems((prev) => (append ? [...prev, ...res.items] : res.items))
      } catch (e) {
        setErrorTransient(isTransientApiError(e))
        setError(getErrorMessage(e))
        if (!append) setItems([])
        setTotal(0)
      } finally {
        setLoading(false)
        setLoadingMore(false)
        setRefreshing(false)
      }
    },
    [user, tenant, tournamentId, statusFilter, dateFrom, dateTo],
  )

  useEffect(() => {
    void loadTournaments()
  }, [loadTournaments])

  useEffect(() => {
    if (!user || !tenant) return
    void loadPage(1, false)
  }, [user, tenant, tournamentId, statusFilter, dateFrom, dateTo, loadPage])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    void loadPage(1, false)
  }, [loadPage])

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return
    if (items.length >= total) return
    void loadPage(page + 1, true)
  }, [loading, loadingMore, items.length, total, page, loadPage])

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        headerBlock: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
        sectionLabel: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.primary,
          marginBottom: 6,
          marginTop: 8,
        },
        selectBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 12,
          backgroundColor: colors.surface,
        },
        selectBtnText: { flex: 1, fontSize: 15, color: colors.text, marginRight: 8 },
        selectChevron: { fontSize: 12, color: colors.muted },
        chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        chip: {
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
        chipActive: {
          borderColor: colors.accent,
          backgroundColor: colors.surface,
        },
        chipText: { fontSize: 12, color: colors.muted },
        chipTextActive: { color: colors.accent, fontWeight: '600' },
        dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        dateInput: {
          flex: 1,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 10,
          fontSize: 14,
          color: colors.text,
        },
        dateDash: { color: colors.muted },
        hint: { fontSize: 12, color: colors.muted, marginTop: 8 },
        filterError: { marginTop: 10 },
        listContent: { paddingBottom: 32, flexGrow: 1 },
        centered: { paddingVertical: 40 },
        footerLoad: { paddingVertical: 16 },
        card: {
          marginHorizontal: 16,
          marginBottom: 10,
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
        cardPressed: { backgroundColor: colors.surface },
        tournamentName: { fontSize: 12, color: colors.muted, marginBottom: 4 },
        teams: { fontSize: 16, fontWeight: '700', color: colors.primary, marginBottom: 6 },
        meta: { fontSize: 13, color: colors.muted },
        score: { fontSize: 14, color: colors.text, marginTop: 6, fontWeight: '600' },
        modalBackdrop: {
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          justifyContent: 'flex-end',
        },
        modalCard: {
          backgroundColor: colors.background,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: 16,
          maxHeight: '75%',
        },
        modalTitle: { fontSize: 18, fontWeight: '700', color: colors.primary, marginBottom: 12 },
        modalRow: {
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        modalRowText: { fontSize: 16, color: colors.text },
        modalClose: { paddingVertical: 16, alignItems: 'center' },
        modalCloseText: { fontSize: 16, color: colors.accent, fontWeight: '600' },
      }),
    [colors],
  )

  const tournamentTitle = tournamentName?.trim() || 'Все турниры'

  const header = useMemo(
    () => (
      <View style={styles.headerBlock}>
        <Text style={styles.sectionLabel}>Турнир</Text>
        <Pressable style={styles.selectBtn} onPress={() => setTournamentModalOpen(true)}>
          <Text style={styles.selectBtnText} numberOfLines={1}>
            {tournamentsLoading ? 'Загрузка…' : tournamentTitle}
          </Text>
          <Text style={styles.selectChevron}>▼</Text>
        </Pressable>

        <Text style={styles.sectionLabel}>Статус матча</Text>
        <View style={styles.chips}>
          {STATUS_OPTIONS.map((o) => (
            <Pressable
              key={o.key}
              onPress={() => setStatusFilter(o.key)}
              style={[styles.chip, statusFilter === o.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, statusFilter === o.key && styles.chipTextActive]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Дата начала (опционально)</Text>
        <View style={styles.dateRow}>
          <TextInput
            style={styles.dateInput}
            placeholder="От YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            value={dateFrom}
            onChangeText={setDateFrom}
            autoCapitalize="none"
          />
          <Text style={styles.dateDash}>—</Text>
          <TextInput
            style={styles.dateInput}
            placeholder="До YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            value={dateTo}
            onChangeText={setDateTo}
            autoCapitalize="none"
          />
        </View>
        <Text style={styles.hint}>Всего по фильтру: {total}</Text>
        {error ? (
          <AppNotice
            variant="error"
            style={styles.filterError}
            onDismiss={() => {
              setError(null)
              setErrorTransient(false)
            }}
            detail={errorTransient ? TRANSIENT_ERROR_DETAIL : undefined}
          >
            {error}
          </AppNotice>
        ) : null}
      </View>
    ),
    [
      styles,
      colors.muted,
      tournamentTitle,
      tournamentsLoading,
      statusFilter,
      dateFrom,
      dateTo,
      total,
      error,
      errorTransient,
    ],
  )

  if (!user || !tenant) return null

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <LegendList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        refreshing={refreshing}
        onRefresh={onRefresh}
        progressViewOffset={48}
        contentContainerStyle={styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.35}
        estimatedItemSize={132}
        recycleItems
        maintainVisibleContentPosition
        drawDistance={400}
        ListEmptyComponent={
          loading && items.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : (
            <EmptyState
              icon="football-outline"
              title="Матчи не найдены"
              description="Измените турнир, статус или диапазон дат и обновите список."
              actionLabel="Обновить"
              onAction={() => void loadPage(1, false)}
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoad}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() =>
              navigation.navigate('MatchProtocol', {
                tournamentId: item.tournament.id,
                matchId: item.id,
              })
            }
          >
            <Text style={styles.tournamentName} numberOfLines={1}>
              {item.tournament.name}
            </Text>
            <Text style={styles.teams}>
              {item.homeTeam.name} — {item.awayTeam.name}
            </Text>
            <Text style={styles.meta}>
              {formatDateTime(item.startTime)} · {matchStatusLabel(item.status)}
            </Text>
            {item.homeScore != null && item.awayScore != null ? (
              <Text style={styles.score}>
                Счёт: {item.homeScore} : {item.awayScore}
              </Text>
            ) : null}
          </Pressable>
        )}
      />

      <Modal visible={tournamentModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Турнир</Text>
            <Pressable
              style={styles.modalRow}
              onPress={() => {
                setTournamentId(null)
                setTournamentName(null)
                setTournamentModalOpen(false)
              }}
            >
              <Text style={styles.modalRowText}>Все турниры</Text>
            </Pressable>
            <FlatList
              data={tournaments}
              keyExtractor={(t) => t.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setTournamentId(item.id)
                    setTournamentName(item.name)
                    setTournamentModalOpen(false)
                  }}
                >
                  <Text style={styles.modalRowText}>{item.name}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <EmptyState
                  icon="trophy-outline"
                  title="Нет турниров"
                  description="Список турниров пуст или не удалось загрузить. Закройте окно и обновите экран матчей."
                />
              }
            />
            <Pressable style={styles.modalClose} onPress={() => setTournamentModalOpen(false)}>
              <Text style={styles.modalCloseText}>Закрыть</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

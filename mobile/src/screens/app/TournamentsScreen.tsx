import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getErrorMessage, listOrganizationTournaments, shouldUsePublicTournamentApi } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import type { TournamentsStackParamList } from '../../navigation/types'
import type { TournamentListItem } from '../../types/tournament'
import { AppNotice } from '../../components/ui/AppNotice'
import { formatDateOnly } from '../../utils/formatDate'
import { tournamentStatusLabel } from '../../utils/tournamentLabels'
import { colors } from '../../theme/colors'

type Props = NativeStackScreenProps<TournamentsStackParamList, 'Tournaments'>

export function TournamentsScreen({ navigation }: Props) {
  const { user, tenant } = useAuth()
  const [items, setItems] = useState<TournamentListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user || !tenant) return
    setError(null)
    try {
      const res = await listOrganizationTournaments({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        role: user.role,
        page: 1,
        pageSize: 80,
      })
      setItems(res.items)
    } catch (e) {
      setError(getErrorMessage(e))
      setItems([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user, tenant])

  useEffect(() => {
    void load()
  }, [load])

  function onRefresh() {
    setRefreshing(true)
    void load()
  }

  if (!user || !tenant) return null

  const publicMode = shouldUsePublicTournamentApi(user.role)

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {publicMode ? (
        <AppNotice variant="info" compact style={styles.publicBanner}>
          Показаны опубликованные турниры (как на сайте). Черновики недоступны для этой роли.
        </AppNotice>
      ) : null}
      {loading && items.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : null}
      {error ? (
        <AppNotice variant="error" style={styles.listNotice} onDismiss={() => setError(null)}>
          {error}
        </AppNotice>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>Турниры не найдены</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() =>
              navigation.navigate('TournamentDetail', {
                tournamentId: item.id,
                tournamentName: item.name,
              })
            }
          >
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardMeta}>
              {tournamentStatusLabel(item.status)}
              {item.published === false ? ' · не опубликован' : ''}
            </Text>
            <Text style={styles.cardMeta}>
              {formatDateOnly(item.startsAt ?? null)} — {formatDateOnly(item.endsAt ?? null)}
            </Text>
            {typeof item.teamsCount === 'number' ? (
              <Text style={styles.cardHint}>Команд: {item.teamsCount}</Text>
            ) : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  publicBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
  },
  centered: {
    paddingVertical: 24,
  },
  listNotice: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  empty: {
    textAlign: 'center',
    color: colors.muted,
    marginTop: 24,
    fontSize: 15,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: colors.background,
  },
  cardPressed: {
    opacity: 0.92,
    backgroundColor: colors.surface,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primary,
  },
  cardMeta: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
  cardHint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
  },
})
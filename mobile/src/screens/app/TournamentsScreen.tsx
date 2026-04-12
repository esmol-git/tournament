import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import {
  getErrorMessage,
  isTransientApiError,
  listOrganizationTournaments,
  shouldUsePublicTournamentApi,
  TRANSIENT_ERROR_DETAIL,
} from '../../api'
import { useAuth } from '../../auth/AuthContext'
import type { TournamentsStackParamList } from '../../navigation/types'
import type { TournamentListItem } from '../../types/tournament'
import { AppNotice } from '../../components/ui/AppNotice'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateOnly } from '../../utils/formatDate'
import { tournamentStatusLabel } from '../../utils/tournamentLabels'
import { tournamentCardTone } from '../../utils/tournamentCardTone'
import { useTheme } from '../../theme/ThemeContext'

type Props = NativeStackScreenProps<TournamentsStackParamList, 'Tournaments'>

export function TournamentsScreen({ navigation }: Props) {
  const { colors, isDark } = useTheme()
  const { user, tenant } = useAuth()
  const [items, setItems] = useState<TournamentListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorTransient, setErrorTransient] = useState(false)

  const load = useCallback(async () => {
    if (!user || !tenant) return
    setError(null)
    setErrorTransient(false)
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
      setErrorTransient(isTransientApiError(e))
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

  const styles = useMemo(
    () =>
      StyleSheet.create({
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
        card: {
          borderWidth: 1,
          borderRadius: 12,
          padding: 14,
          marginBottom: 12,
        },
        cardPressed: {
          opacity: 0.9,
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
      }),
    [colors],
  )

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
        <AppNotice
          variant="error"
          style={styles.listNotice}
          onDismiss={() => {
            setError(null)
            setErrorTransient(false)
          }}
          detail={errorTransient ? TRANSIENT_ERROR_DETAIL : undefined}
        >
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
            <EmptyState
              icon="trophy-outline"
              title="Турниры не найдены"
              description={
                publicMode
                  ? 'Для вашей роли видны только опубликованные турниры. Если список пуст — возможно, ещё ничего не опубликовано.'
                  : 'Пока нет турниров в организации или они недоступны с вашей ролью.'
              }
              actionLabel="Обновить"
              onAction={onRefresh}
            />
          ) : null
        }
        renderItem={({ item }) => {
          const tone = tournamentCardTone(item.status, isDark, colors)
          return (
          <Pressable
            style={({ pressed }) => [styles.card, tone, pressed && styles.cardPressed]}
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
          )
        }}
      />
    </SafeAreaView>
  )
}
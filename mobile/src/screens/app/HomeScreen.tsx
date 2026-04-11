import type { CompositeScreenProps } from '@react-navigation/native'
import { useFocusEffect } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  getErrorMessage,
  isTransientApiError,
  listOrganizationTournaments,
  shouldUsePublicTournamentApi,
} from '../../api'
import { AppLogo } from '../../components/brand/AppLogo'
import { useAuth } from '../../auth/AuthContext'
import {
  canAccessMatchResultsFlow,
  getMobileRoleCapabilityLines,
  ROLE_LABELS,
} from '../../auth/roleLabels'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { StatsSkeleton } from '../../components/ui/StatsSkeleton'
import type { HomeStackParamList, MainTabParamList } from '../../navigation/types'
import { useTheme } from '../../theme/ThemeContext'
import { tournamentStatusLabel } from '../../utils/tournamentLabels'

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'Home'>,
  BottomTabScreenProps<MainTabParamList>
>

type DashboardStats = {
  total: number
  active: number
  draft: number
  completed: number
}

function emptyStats(): DashboardStats {
  return { total: 0, active: 0, draft: 0, completed: 0 }
}

export function HomeScreen({ navigation }: Props) {
  const { colors } = useTheme()
  const { user, tenant, logout } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [statsErrorTransient, setStatsErrorTransient] = useState(false)

  const loadStats = useCallback(async () => {
    if (!user || !tenant) return
    setStatsError(null)
    setStatsErrorTransient(false)
    setStatsLoading(true)
    try {
      const res = await listOrganizationTournaments({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        role: user.role,
        page: 1,
        pageSize: 100,
      })
      const items = res.items
      const active = items.filter((t) => t.status === 'ACTIVE').length
      const draft = items.filter((t) => t.status === 'DRAFT').length
      const completed = items.filter((t) => t.status === 'COMPLETED' || t.status === 'ARCHIVED').length
      setStats({
        total: res.total,
        active,
        draft,
        completed,
      })
    } catch (e) {
      setStatsErrorTransient(isTransientApiError(e))
      setStatsError(getErrorMessage(e))
      setStats(emptyStats())
    } finally {
      setStatsLoading(false)
    }
  }, [user, tenant])

  useFocusEffect(
    useCallback(() => {
      void loadStats()
    }, [loadStats]),
  )

  if (!user || !tenant) return null

  const staff = canAccessMatchResultsFlow(user.role)
  const publicMode = shouldUsePublicTournamentApi(user.role)
  const roleLines = getMobileRoleCapabilityLines(user.role)

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <AppLogo size={48} style={styles.headerLogo} />
        <View style={styles.headerText}>
          <Text style={[styles.org, { color: colors.primary }]}>{tenant.name}</Text>
        </View>
      </View>
      <Text style={[styles.slug, { color: colors.muted }]}>@{tenant.slug}</Text>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.primary }]}>Сводка по турнирам</Text>
        {publicMode ? (
          <Text style={[styles.publicNote, { color: colors.muted }]}>
            Для вашей роли считаются только опубликованные турниры.
          </Text>
        ) : null}
        {statsLoading ? (
          <StatsSkeleton colors={colors} />
        ) : (
          <>
            {statsError ? (
              <Pressable onPress={() => void loadStats()}>
                <Text style={[styles.statsError, { color: colors.error }]}>{statsError}</Text>
                <Text style={[styles.retry, { color: colors.accent }]}>Нажмите, чтобы повторить</Text>
                {statsErrorTransient ? (
                  <Text style={[styles.transientHint, { color: colors.muted }]}>
                    Похоже на временный сбой сети или сервера — можно повторить позже.
                  </Text>
                ) : null}
              </Pressable>
            ) : (
              <View style={styles.statsGrid}>
                <View style={[styles.statCell, { borderColor: colors.border }]}>
                  <Text style={[styles.statValue, { color: colors.text }]}>{stats?.total ?? 0}</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>всего</Text>
                </View>
                <View style={[styles.statCell, { borderColor: colors.border }]}>
                  <Text style={[styles.statValue, { color: colors.accent }]}>{stats?.active ?? 0}</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>
                    {tournamentStatusLabel('ACTIVE').toLowerCase()}
                  </Text>
                </View>
                <View style={[styles.statCell, { borderColor: colors.border }]}>
                  <Text style={[styles.statValue, { color: colors.text }]}>{stats?.draft ?? 0}</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>
                    {tournamentStatusLabel('DRAFT').toLowerCase()}
                  </Text>
                </View>
                <View style={[styles.statCell, { borderColor: colors.border }]}>
                  <Text style={[styles.statValue, { color: colors.text }]}>{stats?.completed ?? 0}</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>завершено / архив</Text>
                </View>
              </View>
            )}
          </>
        )}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.label, { color: colors.muted }]}>Пользователь</Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {user.name} {user.lastName}
        </Text>
        <Text style={[styles.muted, { color: colors.muted }]}>@{user.username}</Text>
        <Text style={[styles.label, { color: colors.muted }]}>Роль</Text>
        <Text style={[styles.value, { color: colors.text }]}>{ROLE_LABELS[user.role]}</Text>
      </View>

      <PrimaryButton
        label="Турниры"
        onPress={() => navigation.navigate('TournamentsTab', { screen: 'Tournaments' })}
      />
      {staff ? (
        <View style={styles.gap}>
          <PrimaryButton
            label="Матчи и результаты"
            variant="outline"
            onPress={() => navigation.navigate('MatchesTab', { screen: 'MatchResults' })}
          />
        </View>
      ) : (
        <View style={styles.roleHintBlock}>
          {roleLines.map((line, i) => (
            <Text key={i} style={[styles.hint, { color: colors.muted }]}>
              {line}
            </Text>
          ))}
        </View>
      )}
      <View style={styles.spacer} />
      <PrimaryButton label="Выйти" variant="outline" onPress={() => void logout()} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerLogo: {
    marginRight: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  org: {
    fontSize: 20,
    fontWeight: '700',
  },
  slug: {
    fontSize: 14,
    marginBottom: 16,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  publicNote: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  statCell: {
    width: '50%',
    padding: 6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  statsError: {
    fontSize: 13,
  },
  retry: {
    fontSize: 13,
    marginTop: 6,
    fontWeight: '600',
  },
  transientHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
  },
  muted: {
    fontSize: 14,
    marginTop: 2,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  roleHintBlock: {
    marginBottom: 16,
  },
  gap: {
    marginTop: 12,
  },
  spacer: {
    flex: 1,
    minHeight: 16,
  },
})

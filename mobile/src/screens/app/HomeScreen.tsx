import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../../auth/AuthContext'
import { canAccessMatchResultsFlow, ROLE_LABELS } from '../../auth/roleLabels'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import type { HomeStackParamList, MainTabParamList } from '../../navigation/types'
import { colors } from '../../theme/colors'

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'Home'>,
  BottomTabScreenProps<MainTabParamList>
>

export function HomeScreen({ navigation }: Props) {
  const { user, tenant, logout } = useAuth()
  if (!user || !tenant) return null

  const staff = canAccessMatchResultsFlow(user.role)

  return (
    <View style={styles.container}>
      <Text style={styles.org}>{tenant.name}</Text>
      <Text style={styles.slug}>@{tenant.slug}</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Пользователь</Text>
        <Text style={styles.value}>
          {user.name} {user.lastName}
        </Text>
        <Text style={styles.muted}>@{user.username}</Text>
        <Text style={styles.label}>Роль</Text>
        <Text style={styles.value}>{ROLE_LABELS[user.role]}</Text>
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
        <Text style={styles.hint}>Для вашей роли отдельные рабочие экраны появятся позже.</Text>
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
    backgroundColor: colors.background,
  },
  org: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  slug: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginTop: 8,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  muted: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 2,
  },
  hint: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
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

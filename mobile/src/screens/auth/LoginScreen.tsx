import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { AppLogo } from '../../components/brand/AppLogo'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ApiError, getErrorMessage } from '../../api/errors'
import { useAuth } from '../../auth/AuthContext'
import { ROLE_LABELS } from '../../auth/roleLabels'
import { AppNotice } from '../../components/ui/AppNotice'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { TextField } from '../../components/ui/TextField'
import type { RootStackParamList } from '../../navigation/types'
import { colors } from '../../theme/colors'
import { API_BASE_URL } from '../../config/appConfig'

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>

export function LoginScreen(_props: Props) {
  const { login, isLoggingIn } = useAuth()
  const [tenantSlug, setTenantSlug] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit() {
    setError(null)
    try {
      await login({ tenantSlug, username, password })
    } catch (e) {
      setError(getErrorMessage(e))
      if (e instanceof ApiError && e.status === 401) {
        setError('Неверный логин или пароль, либо организация не найдена.')
      }
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <View style={styles.logoWrap}>
            <AppLogo size={88} />
          </View>
          <Text style={styles.title}>Вход</Text>
          <Text style={styles.subtitle}>
            Регистрации в приложении нет — используйте учётную запись организации. Роль (админ, модератор,
            судья и т.д.) определяется на сервере после входа.
          </Text>
          <View style={styles.roles}>
            <Text style={styles.rolesTitle}>Типы доступа (справочно):</Text>
            {(['TENANT_ADMIN', 'MODERATOR', 'REFEREE', 'TOURNAMENT_ADMIN'] as const).map((r) => (
              <Text key={r} style={styles.roleLine}>
                • {ROLE_LABELS[r]}
              </Text>
            ))}
          </View>
          <TextField label="Организация (slug)" value={tenantSlug} onChangeText={setTenantSlug} placeholder="например, default" />
          <TextField label="Логин" value={username} onChangeText={setUsername} placeholder="username" />
          <TextField label="Пароль" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
          {error ? (
            <AppNotice variant="error" style={styles.notice} onDismiss={() => setError(null)}>
              {error}
            </AppNotice>
          ) : null}
          <PrimaryButton label="Войти" onPress={() => void onSubmit()} loading={isLoggingIn} />
          <Text style={styles.apiHint}>API: {API_BASE_URL}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginBottom: 16,
  },
  roles: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 20,
  },
  rolesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 6,
  },
  roleLine: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
  notice: { marginBottom: 12 },
  apiHint: {
    marginTop: 20,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
})

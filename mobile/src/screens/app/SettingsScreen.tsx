import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import * as Updates from 'expo-updates'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getErrorMessage } from '../../api'
import {
  canAccessMatchResultsFlow,
  getMobileRoleCapabilityLines,
  ROLE_LABELS,
} from '../../auth/roleLabels'
import { useAuth } from '../../auth/AuthContext'
import { API_BASE_URL, getUniversalLinkOrigin } from '../../config/appConfig'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { ACCENT_PRESET_IDS, ACCENT_PRESETS } from '../../theme/palette'
import { useTheme } from '../../theme/ThemeContext'
import type { MainTabParamList, SettingsStackParamList } from '../../navigation/types'

type Props = CompositeScreenProps<
  NativeStackScreenProps<SettingsStackParamList, 'Settings'>,
  BottomTabScreenProps<MainTabParamList>
>

const appVersion =
  Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '—'
const appDisplayName = Constants.expoConfig?.name ?? 'Tournament Platform'

function getBuildSummary(): string | null {
  const ios =
    Constants.platform?.ios?.buildNumber ??
    (typeof Constants.expoConfig?.ios === 'object' && Constants.expoConfig?.ios != null
      ? (Constants.expoConfig.ios as { buildNumber?: string }).buildNumber
      : undefined)
  if (ios) return `${ios} · iOS`
  const vc =
    Constants.platform?.android?.versionCode ??
    (typeof Constants.expoConfig?.android === 'object' && Constants.expoConfig?.android != null
      ? (Constants.expoConfig.android as { versionCode?: number }).versionCode
      : undefined)
  if (vc != null && Number.isFinite(Number(vc))) return `${vc} · Android`
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return 'Expo Go'
  }
  if (__DEV__) return 'Metro / dev'
  return null
}

export function SettingsScreen(_props: Props) {
  const {
    colors,
    accentPreset,
    themePreference,
    setThemePreference,
    setAccentPreset,
    isDark,
  } = useTheme()
  const { user } = useAuth()
  const capabilityLines = user ? getMobileRoleCapabilityLines(user.role) : []
  const staff = user ? canAccessMatchResultsFlow(user.role) : false
  const buildSummary = getBuildSummary()
  const universalOrigin = getUniversalLinkOrigin()
  const deepLinkCustom = [
    'tournamentplatform://tournaments',
    'tournamentplatform://tournaments/<id_турнира>',
    'tournamentplatform://tournaments/<id_турнира>/match/<id_матча>',
  ] as const
  const deepLinkHttps = universalOrigin
    ? ([
        `${universalOrigin}/mobile/tournaments`,
        `${universalOrigin}/mobile/tournaments/<id_турнира>`,
        `${universalOrigin}/mobile/tournaments/<id_турнира>/match/<id_матча>`,
      ] as const)
    : null
  const [otaLoading, setOtaLoading] = useState(false)
  const [otaHint, setOtaHint] = useState<string | null>(null)
  const otaEnabled = Updates.isEnabled

  async function checkOtaUpdate() {
    setOtaHint(null)
    setOtaLoading(true)
    try {
      const check = await Updates.checkForUpdateAsync()
      if (!check.isAvailable) {
        setOtaHint('Доступных обновлений нет — у вас актуальная сборка.')
        return
      }
      await Updates.fetchUpdateAsync()
      await Updates.reloadAsync()
    } catch (e) {
      setOtaHint(getErrorMessage(e))
    } finally {
      setOtaLoading(false)
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {user ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Учётная запись</Text>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  paddingBottom: 10,
                },
              ]}
            >
              <Text style={[styles.capRole, { color: colors.text }]}>{ROLE_LABELS[user.role]}</Text>
              <Text style={[styles.capHint, { color: colors.muted }]}>@{user.username}</Text>
              <Text style={[styles.capSectionLabel, { color: colors.primary }]}>
                Что доступно в приложении
              </Text>
              {capabilityLines.map((line, i) => (
                <Text key={i} style={[styles.capBullet, { color: colors.muted }]}>
                  • {line}
                </Text>
              ))}
            </View>
          </>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: user ? 24 : 0 }]}>
          Тема
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Как в системе</Text>
              <Text style={[styles.rowHint, { color: colors.muted }]}>
                Следовать светлой/тёмной теме устройства
              </Text>
            </View>
            <Switch
              value={themePreference === 'system'}
              onValueChange={(followSystem) => {
                if (followSystem) {
                  setThemePreference('system')
                } else {
                  setThemePreference(isDark ? 'dark' : 'light')
                }
              }}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>
          {themePreference === 'system' ? null : (
            <View style={[styles.row, styles.rowDivider, { borderTopColor: colors.border }]}>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Тёмная тема</Text>
                <Text style={[styles.rowHint, { color: colors.muted }]}>
                  Принудительно тёмное оформление
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={(v) => setThemePreference(v ? 'dark' : 'light')}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: 24 }]}>
          Акцентный цвет
        </Text>
        <Text style={[styles.sectionHint, { color: colors.muted }]}>
          Кнопки и активные элементы нижнего меню
        </Text>
        <View style={styles.presetsRow}>
          {ACCENT_PRESET_IDS.map((id) => {
            const { label, hex } = ACCENT_PRESETS[id]
            const selected = accentPreset === id
            return (
              <Pressable
                key={id}
                onPress={() => setAccentPreset(id)}
                style={[
                  styles.presetChip,
                  {
                    borderColor: selected ? colors.accent : colors.border,
                    backgroundColor: selected ? colors.surface : colors.background,
                  },
                ]}
              >
                <View style={[styles.presetDot, { backgroundColor: hex }]} />
                <Text
                  style={[styles.presetLabel, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: 24 }]}>
          О приложении
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 12 },
          ]}
        >
          <Text style={[styles.aboutName, { color: colors.text }]}>{appDisplayName}</Text>
          <Text style={[styles.aboutMeta, { color: colors.muted }]}>Версия {appVersion}</Text>
          {buildSummary ? (
            <Text style={[styles.aboutBuild, { color: colors.muted }]}>Сборка / среда: {buildSummary}</Text>
          ) : null}

          <Text style={[styles.aboutStaffLabel, { color: colors.primary }]}>Обновления (OTA)</Text>
          {otaEnabled ? (
            <>
              <Text style={[styles.aboutStaffHint, { color: colors.muted }]}>
                Runtime: {String(Updates.runtimeVersion ?? '—')}
                {Updates.channel ? ` · канал ${Updates.channel}` : ''}
                {Updates.updateId
                  ? ` · пакет …${Updates.updateId.slice(-8)}`
                  : ''}
              </Text>
              <View style={styles.otaBtn}>
                <PrimaryButton
                  label="Проверить и установить обновление"
                  variant="outline"
                  loading={otaLoading}
                  onPress={() => void checkOtaUpdate()}
                />
              </View>
              {otaHint ? (
                <Text style={[styles.otaHintText, { color: colors.muted }]}>{otaHint}</Text>
              ) : null}
            </>
          ) : (
            <Text style={[styles.aboutStaffHint, { color: colors.muted }]}>
              В Expo Go и при работе через Metro обновления по воздуху отключены. В релизной сборке EAS
              сюда подставляются канал и проверка OTA.
            </Text>
          )}

          {staff ? (
            <>
              <Text style={[styles.aboutStaffLabel, { color: colors.primary }]}>API (для проверки)</Text>
              <Text style={[styles.aboutStaffHint, { color: colors.muted }]}>
                Адрес, с которого идут запросы приложения. Можно скопировать при обращении в поддержку.
              </Text>
              <Text
                selectable
                style={[styles.aboutApiUrl, { color: colors.accent }]}
                accessibilityLabel="Базовый адрес API"
              >
                {API_BASE_URL}
              </Text>
              <Text style={[styles.aboutStaffLabel, { color: colors.primary }]}>Примеры deep link</Text>
              <Text style={[styles.aboutStaffHint, { color: colors.muted }]}>
                Подставьте свои UUID турнира и матча. Работают после входа. HTTPS — после настройки
                apple-app-site-association и assetlinks на домене.
              </Text>
              {deepLinkCustom.map((line) => (
                <Text key={line} selectable style={[styles.aboutApiUrl, { color: colors.accent }]}>
                  {line}
                </Text>
              ))}
              {deepLinkHttps
                ? deepLinkHttps.map((line) => (
                    <Text key={line} selectable style={[styles.aboutApiUrl, { color: colors.accent }]}>
                      {line}
                    </Text>
                  ))
                : null}
            </>
          ) : null}
        </View>

        <Text style={[styles.footer, { color: colors.muted }]}>
          Настройки сохраняются на устройстве.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    padding: 20,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowHint: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: '45%',
    flexGrow: 1,
  },
  presetDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: 8,
  },
  presetLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  footer: {
    marginTop: 28,
    fontSize: 12,
    textAlign: 'center',
  },
  capRole: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  capHint: {
    fontSize: 13,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  capSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
    paddingHorizontal: 12,
  },
  capBullet: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 12,
    marginBottom: 6,
    paddingRight: 4,
  },
  aboutName: {
    fontSize: 15,
    fontWeight: '600',
  },
  aboutMeta: {
    fontSize: 13,
    marginTop: 6,
  },
  aboutBuild: {
    fontSize: 12,
    marginTop: 6,
    lineHeight: 17,
  },
  aboutStaffLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 14,
  },
  aboutStaffHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  aboutApiUrl: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    fontFamily: 'Menlo',
  },
  otaBtn: {
    marginTop: 10,
  },
  otaHintText: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
})

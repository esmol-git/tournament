import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNetworkOffline } from '../../hooks/useNetworkOffline'
import { useTheme } from '../../theme/ThemeContext'

export function OfflineBanner() {
  const offline = useNetworkOffline()
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()

  if (!offline) return null

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: Math.max(insets.top, 8),
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
      accessibilityRole="alert"
    >
      <Ionicons name="cloud-offline-outline" size={18} color={colors.error} style={styles.icon} />
      <Text style={[styles.text, { color: colors.text }]}>Нет сети — данные могут быть недоступны</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  icon: { marginTop: 1 },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
})

import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'

type Props = {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'outline'
}

export function PrimaryButton({ label, onPress, disabled, loading, variant = 'primary' }: Props) {
  const { colors } = useTheme()
  const isPrimary = variant === 'primary'
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary
          ? { backgroundColor: colors.accent }
          : { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onAccent : colors.primary} />
      ) : (
        <Text
          style={[
            styles.label,
            isPrimary ? { color: colors.onAccent } : { color: colors.primary },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.88,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
})

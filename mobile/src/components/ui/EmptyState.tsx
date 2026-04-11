import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { PrimaryButton } from './PrimaryButton'
import { useTheme } from '../../theme/ThemeContext'

type IonName = ComponentProps<typeof Ionicons>['name']

type Props = {
  icon: IonName
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: Props) {
  const { colors } = useTheme()
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name={icon} size={36} color={colors.muted} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.desc, { color: colors.muted }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.btn}>
          <PrimaryButton label={actionLabel} variant="outline" onPress={onAction} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  desc: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  btn: {
    marginTop: 20,
    alignSelf: 'stretch',
    maxWidth: 280,
  },
})

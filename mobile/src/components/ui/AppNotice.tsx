import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps, ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { notice, type NoticeVariant } from '../../theme/notice'

type IonName = ComponentProps<typeof Ionicons>['name']

const ICONS: Record<NoticeVariant, IonName> = {
  error: 'alert-circle-outline',
  warning: 'warning-outline',
  info: 'information-circle-outline',
  success: 'checkmark-circle-outline',
}

type Props = {
  variant: NoticeVariant
  /** Короткий заголовок (необязательно). */
  title?: string
  children: ReactNode
  onDismiss?: () => void
  style?: StyleProp<ViewStyle>
  /** Уменьшенные отступы для плотных форм (модалки). */
  compact?: boolean
}

export function AppNotice({ variant, title, children, onDismiss, style, compact }: Props) {
  const t = notice[variant]
  const content =
    typeof children === 'string' ? (
      <Text style={[styles.text, { color: t.text }]}>{children}</Text>
    ) : (
      children
    )

  return (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        { backgroundColor: t.bg, borderColor: t.border },
        style,
      ]}
      accessibilityRole="alert"
    >
      <Ionicons name={ICONS[variant]} size={compact ? 18 : 20} color={t.icon} style={styles.icon} />
      <View style={styles.body}>
        {title ? (
          <Text style={[styles.title, { color: t.text }]} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {content}
      </View>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Скрыть сообщение"
          style={styles.dismissHit}
        >
          <Ionicons name="close" size={20} color={t.icon} />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  wrapCompact: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  icon: { marginTop: 1 },
  body: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    lineHeight: 19,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  dismissHit: { padding: 2, marginTop: -2, marginRight: -2 },
})

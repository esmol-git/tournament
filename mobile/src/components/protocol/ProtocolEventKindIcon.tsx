import { View } from 'react-native'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import type { ProtocolEventIconKind } from '../../utils/protocolPlayerNames'

type Props = {
  kind: ProtocolEventIconKind
  /** Основной цвет иконок (тема). */
  accent: string
  muted: string
}

const CARD_W = 18
const CARD_H = 24
const R_YELLOW = '#EAB308'
const R_YELLOW_BORDER = '#CA8A04'
const R_RED = '#DC2626'
const R_RED_BORDER = '#B91C1C'

/**
 * Иконка типа события протокола: мяч, замена, жёлтая / вторая жёлтая (жёлтая + красная), красная.
 */
export function ProtocolEventKindIcon({ kind, accent, muted }: Props) {
  const size = 24
  switch (kind) {
    case 'goal':
      return (
        <MaterialCommunityIcons name="soccer" size={size} color={accent} accessibilityLabel="Гол" />
      )
    case 'substitution':
      return (
        <Ionicons name="swap-horizontal" size={size} color={accent} accessibilityLabel="Замена" />
      )
    case 'card_yellow_first':
      return (
        <View
          accessibilityLabel="Жёлтая карточка"
          style={{
            width: CARD_W,
            height: CARD_H,
            borderRadius: 3,
            backgroundColor: R_YELLOW,
            borderWidth: 1,
            borderColor: R_YELLOW_BORDER,
          }}
        />
      )
    case 'card_red':
      return (
        <View
          accessibilityLabel="Красная карточка"
          style={{
            width: CARD_W,
            height: CARD_H,
            borderRadius: 3,
            backgroundColor: R_RED,
            borderWidth: 1,
            borderColor: R_RED_BORDER,
          }}
        />
      )
    case 'card_yellow_second':
      return (
        <View
          accessibilityLabel="Вторая жёлтая, удаление"
          style={{ width: 34, height: CARD_H + 4, position: 'relative' }}
        >
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 4,
              width: CARD_W,
              height: CARD_H,
              borderRadius: 3,
              backgroundColor: R_YELLOW,
              borderWidth: 1,
              borderColor: R_YELLOW_BORDER,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 12,
              top: 0,
              width: CARD_W,
              height: CARD_H,
              borderRadius: 3,
              backgroundColor: R_RED,
              borderWidth: 1,
              borderColor: R_RED_BORDER,
            }}
          />
        </View>
      )
    default:
      return (
        <Ionicons name="document-text-outline" size={size} color={muted} accessibilityLabel="Заметка" />
      )
  }
}

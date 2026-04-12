import { StyleSheet, View } from 'react-native'
import type { ThemeColors } from '../../theme/palette'

type Props = {
  colors: ThemeColors
}

/** Карточка-заглушка под список матчей турнира. */
export function MatchCardSkeleton({ colors }: Props) {
  const bar = { backgroundColor: colors.border }
  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={[styles.lineSm, bar]} />
      <View style={[styles.lineMd, bar]} />
      <View style={[styles.lineLg, bar]} />
      <View style={[styles.lineSm, { ...bar, marginTop: 8, width: '40%' }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  lineSm: {
    height: 10,
    borderRadius: 4,
    opacity: 0.4,
    width: '35%',
    marginBottom: 8,
  },
  lineMd: {
    height: 14,
    borderRadius: 4,
    opacity: 0.45,
    width: '55%',
    marginBottom: 10,
  },
  lineLg: {
    height: 18,
    borderRadius: 4,
    opacity: 0.5,
    width: '85%',
  },
})

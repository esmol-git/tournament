import { StyleSheet, View } from 'react-native'
import type { ThemeColors } from '../../theme/palette'

type Props = {
  colors: ThemeColors
}

/** Четыре ячейки-заглушки под сетку сводки на главной. */
export function StatsSkeleton({ colors }: Props) {
  return (
    <View style={styles.grid}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.cell, { borderColor: colors.border }]}>
          <View style={[styles.barWide, { backgroundColor: colors.border }]} />
          <View style={[styles.barNarrow, { backgroundColor: colors.border }]} />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  cell: {
    width: '50%',
    padding: 6,
    minHeight: 64,
    justifyContent: 'center',
    gap: 8,
  },
  barWide: {
    height: 18,
    borderRadius: 4,
    opacity: 0.45,
    width: '70%',
  },
  barNarrow: {
    height: 12,
    borderRadius: 4,
    opacity: 0.35,
    width: '45%',
  },
})

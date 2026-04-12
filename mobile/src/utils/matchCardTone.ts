import type { ThemeColors } from '../theme/palette'

/** Спокойная подсветка карточки матча по статусу (списки турнира / матчей). */
export function matchCardTone(
  status: string | undefined,
  isDark: boolean,
  colors: ThemeColors,
): { backgroundColor: string; borderColor: string } {
  switch (status) {
    case 'LIVE':
      return isDark
        ? { backgroundColor: 'rgba(245, 158, 11, 0.14)', borderColor: '#d97706' }
        : { backgroundColor: '#fffbeb', borderColor: '#fcd34d' }
    case 'FINISHED':
    case 'PLAYED':
      return isDark
        ? { backgroundColor: 'rgba(16, 185, 129, 0.14)', borderColor: '#059669' }
        : { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' }
    case 'CANCELED':
      return isDark
        ? { backgroundColor: 'rgba(248, 113, 113, 0.12)', borderColor: '#b91c1c' }
        : { backgroundColor: '#fef2f2', borderColor: '#fca5a5' }
    case 'SCHEDULED':
    default:
      return {
        backgroundColor: colors.surface,
        borderColor: colors.border,
      }
  }
}

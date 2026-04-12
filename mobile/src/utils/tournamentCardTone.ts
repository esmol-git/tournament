import type { ThemeColors } from '../theme/palette'

/** Карточки турнира в списке — по статусу жизненного цикла. */
export function tournamentCardTone(
  status: string | undefined,
  isDark: boolean,
  colors: ThemeColors,
): { backgroundColor: string; borderColor: string } {
  switch (status) {
    case 'DRAFT':
      return isDark
        ? { backgroundColor: 'rgba(245, 158, 11, 0.12)', borderColor: '#d97706' }
        : { backgroundColor: '#fffbeb', borderColor: '#fcd34d' }
    case 'ACTIVE':
      return isDark
        ? { backgroundColor: 'rgba(59, 130, 246, 0.14)', borderColor: '#2563eb' }
        : { backgroundColor: '#eff6ff', borderColor: '#93c5fd' }
    case 'COMPLETED':
      return isDark
        ? { backgroundColor: 'rgba(16, 185, 129, 0.14)', borderColor: '#059669' }
        : { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' }
    case 'ARCHIVED':
      return isDark
        ? { backgroundColor: 'rgba(148, 163, 184, 0.1)', borderColor: '#64748b' }
        : { backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }
    default:
      return {
        backgroundColor: colors.surface,
        borderColor: colors.border,
      }
  }
}

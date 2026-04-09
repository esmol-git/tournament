/** Стили баннеров ошибок / предупреждений / подсказок (единый вид в приложении). */
export const notice = {
  error: {
    bg: '#fef2f2',
    border: '#fecaca',
    text: '#991b1b',
    icon: '#b91c1c',
  },
  warning: {
    bg: '#fffbeb',
    border: '#fde68a',
    text: '#92400e',
    icon: '#d97706',
  },
  info: {
    bg: '#eff6ff',
    border: '#bfdbfe',
    text: '#1e40af',
    icon: '#2563eb',
  },
  success: {
    bg: '#f0fdf4',
    border: '#bbf7d0',
    text: '#166534',
    icon: '#16a34a',
  },
} as const

export type NoticeVariant = keyof typeof notice

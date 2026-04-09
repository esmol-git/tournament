import type { ToastMessageOptions } from 'primevue/toast'

/** Ответ API после создания/обновления матча — предупреждения о пересечениях в расписании. */
export function toastScheduleWarnings(
  toast: { add: (message: ToastMessageOptions) => void },
  res: { scheduleWarnings?: string[] | null },
) {
  const lines = res?.scheduleWarnings?.filter(Boolean) ?? []
  if (!lines.length) return
  toast.add({
    severity: 'warn',
    summary: 'Возможный конфликт расписания',
    detail: lines.join('\n'),
    life: 14000,
  })
}

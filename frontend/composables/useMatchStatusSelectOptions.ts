import { computed } from 'vue'

/** Значения для селектов/фильтров админки. `PLAYED` в БД остаётся, в UI не показываем — дублирует «Завершён». */
const MATCH_STATUS_VALUES = ['SCHEDULED', 'LIVE', 'FINISHED', 'CANCELED'] as const

export type MatchStatusFilterOption = {
  value: (typeof MATCH_STATUS_VALUES)[number]
  label: string
}

/** Для формы протокола / фильтров: legacy `PLAYED` отображаем и сохраняем как `FINISHED`. */
export function normalizeMatchStatusForSelect(raw?: string | null): string {
  if (raw === 'PLAYED') return 'FINISHED'
  if (
    raw === 'SCHEDULED' ||
    raw === 'LIVE' ||
    raw === 'FINISHED' ||
    raw === 'CANCELED'
  ) {
    return raw
  }
  return 'SCHEDULED'
}

/**
 * Подписи статусов матча для селектов (зависят от локали).
 */
export function useMatchStatusSelectOptions() {
  const { t, locale } = useI18n()

  return computed((): MatchStatusFilterOption[] => {
    void locale.value
    return MATCH_STATUS_VALUES.map((value) => ({
      value,
      label: t(`admin.tournament_page.status_${value.toLowerCase()}`),
    }))
  })
}

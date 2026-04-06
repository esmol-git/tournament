import { computed } from 'vue'

const MATCH_STATUS_VALUES = [
  'SCHEDULED',
  'LIVE',
  'PLAYED',
  'FINISHED',
  'CANCELED',
] as const

export type MatchStatusFilterOption = {
  value: (typeof MATCH_STATUS_VALUES)[number]
  label: string
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

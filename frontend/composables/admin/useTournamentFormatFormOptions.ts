import type { TournamentFormat } from '~/types/admin/tournaments-index'
import type { ComputedRef, Ref } from 'vue'
import { computed } from 'vue'

const FORMAT_ORDER: TournamentFormat[] = [
  'SINGLE_GROUP',
  'PLAYOFF',
  'GROUPS_PLUS_PLAYOFF',
  'MANUAL',
]

/**
 * Подписи форматов турнира для формы создания/редактирования (список турниров и др.).
 * Учитывает флаг автоматизации тарифа и режим редактирования (нельзя «спрятать» текущий не-MANUAL формат).
 */
export function useTournamentFormatFormOptions(params: {
  canTournamentAutomation: ComputedRef<boolean>
  isEdit: ComputedRef<boolean>
  formFormat: Ref<TournamentFormat>
}) {
  const { t } = useI18n()
  const { canTournamentAutomation, isEdit, formFormat } = params

  const allFormatOptions = computed((): { value: TournamentFormat; label: string }[] =>
    FORMAT_ORDER.map((value) => ({
      value,
      label: t(`admin.tournaments_list.formats.${value}`),
    })),
  )

  const formatOptionsForForm = computed(() => {
    const opts = allFormatOptions.value
    if (canTournamentAutomation.value) return opts
    const manualOnly = opts.filter((o) => o.value === 'MANUAL')
    if (isEdit.value) {
      const cur = opts.find((o) => o.value === formFormat.value)
      if (cur && cur.value !== 'MANUAL') {
        return [cur, ...manualOnly]
      }
    }
    return manualOnly
  })

  return { formatOptionsForForm, allFormatOptions }
}

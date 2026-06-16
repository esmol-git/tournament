import type { TournamentFormModel } from '~/composables/admin/useTournamentForm'
import type { ComputedRef, Ref } from 'vue'
import { computed, ref } from 'vue'

export const CREATE_WIZARD_STEP_IDS = ['about', 'format', 'enrollment', 'review'] as const
export type CreateWizardStepId = (typeof CREATE_WIZARD_STEP_IDS)[number]

export function useAdminTournamentCreateWizard(options: {
  isEdit: ComputedRef<boolean>
  form: TournamentFormModel
  tournamentFormErrors: ComputedRef<{ firstError: string; nameError: string; teamsError: string; formatError: string }>
}) {
  const { t } = useI18n()
  const step = ref(0)

  const stepLabels = computed(() => [
    t('admin.tournament_wizard.step_about'),
    t('admin.tournament_wizard.step_format'),
    t('admin.tournament_wizard.step_enrollment'),
    t('admin.tournament_wizard.step_review'),
  ])

  const activeStepId = computed(
    () => CREATE_WIZARD_STEP_IDS[step.value] ?? CREATE_WIZARD_STEP_IDS[0],
  )
  const isWizard = computed(() => !options.isEdit.value)
  const isFirst = computed(() => step.value <= 0)
  const isLast = computed(() => step.value >= CREATE_WIZARD_STEP_IDS.length - 1)

  function reset() {
    step.value = 0
  }

  function stepBlockingError(stepId: CreateWizardStepId): string {
    const err = options.tournamentFormErrors.value
    if (stepId === 'about') return err.nameError
    if (stepId === 'format') return err.formatError
    if (stepId === 'enrollment') return err.teamsError
    return err.firstError
  }

  const canGoNext = computed(() => !stepBlockingError(activeStepId.value))

  function next() {
    if (!canGoNext.value || isLast.value) return
    step.value += 1
  }

  function prev() {
    if (isFirst.value) return
    step.value -= 1
  }

  function isStepVisible(stepId: CreateWizardStepId) {
    if (!isWizard.value) return true
    return activeStepId.value === stepId
  }

  return {
    step,
    stepLabels,
    activeStepId,
    isWizard,
    isFirst,
    isLast,
    canGoNext,
    reset,
    next,
    prev,
    isStepVisible,
    stepBlockingError,
  }
}

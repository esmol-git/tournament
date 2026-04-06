import type { TournamentFormModel } from '~/composables/admin/useTournamentForm'
import type { AdminTournamentListFormBodyBindings } from '~/types/admin/tournament-list-form-body'
import type { ComputedRef, Ref } from 'vue'
import { computed } from 'vue'

type LogoInputHolder = { input: Ref<HTMLInputElement | null> }

/**
 * Собирает объект `bindings` для `AdminTournamentListFormBody` из ref/computed страницы списка турниров.
 */
export function useAdminTournamentListFormBodyBindings(deps: {
  form: TournamentFormModel
  tournamentsTotal: Ref<number>
  isEdit: ComputedRef<boolean>
  templateSelectOptions: ComputedRef<AdminTournamentListFormBodyBindings['templateSelectOptions']>
  tournamentTemplatesLoading: Ref<boolean>
  logoFileInputHolder: LogoInputHolder
  logoUploading: Ref<boolean>
  logoRemoving: Ref<boolean>
  tournamentSlugGenerated: ComputedRef<string>
  showNameError: ComputedRef<boolean>
  tournamentFormErrors: ComputedRef<{ nameError: string; teamsError: string }>
  onCreateTemplatePick: (v: string | null | undefined) => void | Promise<void>
  triggerLogoPick: () => void
  removeTournamentLogo: (e?: MouseEvent) => void | Promise<void>
  onLogoFileChange: (e: Event) => void | Promise<void>
  canTournamentAutomation: ComputedRef<boolean>
  formatOptionsForForm: ComputedRef<AdminTournamentListFormBodyBindings['formatOptionsForForm']>
  tournamentCalendarColorPresets: AdminTournamentListFormBodyBindings['tournamentCalendarColorPresets']
  tournamentCalendarColorTrimmed: () => string
  clearTournamentCalendarColor: () => void
  formatFieldHintText: ComputedRef<string>
  groupCountHintText: ComputedRef<string>
  playoffQualifiersHintText: ComputedRef<string>
  minTeamsHintText: ComputedRef<string>
  groupCountMin: ComputedRef<number>
  groupCountMax: ComputedRef<number>
  impliedGroupCount: ComputedRef<number | null>
  showGroupCountField: ComputedRef<boolean>
  minTeamsGridClass: ComputedRef<string>
  isPlayoffFormat: ComputedRef<boolean>
  isGroupsPlusPlayoffFormat: ComputedRef<boolean>
  minTeamsMinValue: ComputedRef<number>
  showPlayoffQualifiersField: ComputedRef<boolean>
  formatCalendarHint: ComputedRef<AdminTournamentListFormBodyBindings['formatCalendarHint']>
  syncNumericField: AdminTournamentListFormBodyBindings['syncNumericField']
  seasonSelectOptions: ComputedRef<AdminTournamentListFormBodyBindings['seasonSelectOptions']>
  seasonsLoading: Ref<boolean>
  competitionSelectOptions: ComputedRef<AdminTournamentListFormBodyBindings['competitionSelectOptions']>
  competitionsLoading: Ref<boolean>
  ageGroupSelectOptions: ComputedRef<AdminTournamentListFormBodyBindings['ageGroupSelectOptions']>
  ageGroupsLoading: Ref<boolean>
  stadiumMultiOptions: ComputedRef<AdminTournamentListFormBodyBindings['stadiumMultiOptions']>
  stadiumsLoading: Ref<boolean>
  refereeMultiOptions: ComputedRef<AdminTournamentListFormBodyBindings['refereeMultiOptions']>
  refereesLoading: Ref<boolean>
  canAccessReferenceBasic: ComputedRef<boolean>
  canAccessReferenceStandard: ComputedRef<boolean>
  adminsLoading: Ref<boolean>
  moderatorSelectOptions: ComputedRef<AdminTournamentListFormBodyBindings['moderatorSelectOptions']>
  teamsLoading: Ref<boolean>
  teams: Ref<AdminTournamentListFormBodyBindings['teams']>
  showTeamsError: ComputedRef<boolean>
}) {
  const { t } = useI18n()

  return computed((): AdminTournamentListFormBodyBindings => {
    const d = deps
    return {
      form: d.form,
      tournamentsTotal: d.tournamentsTotal.value,
      isEdit: d.isEdit.value,
      templateSelectOptions: d.templateSelectOptions.value,
      tournamentTemplatesLoading: d.tournamentTemplatesLoading.value,
      logoFileInput: d.logoFileInputHolder.input,
      logoUploading: d.logoUploading.value,
      logoRemoving: d.logoRemoving.value,
      tournamentSlugGenerated: d.tournamentSlugGenerated.value,
      showNameError: d.showNameError.value,
      nameErrorMessage: d.tournamentFormErrors.value.nameError,
      onTemplatePick: d.onCreateTemplatePick,
      onLogoPick: d.triggerLogoPick,
      onRemoveLogo: d.removeTournamentLogo,
      onLogoFileChange: d.onLogoFileChange,
      canTournamentAutomation: d.canTournamentAutomation.value,
      formatOptionsForForm: d.formatOptionsForForm.value,
      tournamentCalendarColorPresets: d.tournamentCalendarColorPresets,
      tournamentCalendarColorTrimmed: d.tournamentCalendarColorTrimmed,
      clearTournamentCalendarColor: d.clearTournamentCalendarColor,
      formatFieldHintText: d.formatFieldHintText.value,
      groupCountHintText: d.groupCountHintText.value,
      playoffQualifiersHintText: d.playoffQualifiersHintText.value,
      minTeamsHintText: d.minTeamsHintText.value,
      groupCountMin: d.groupCountMin.value,
      groupCountMax: d.groupCountMax.value,
      impliedGroupCount: d.impliedGroupCount.value,
      showGroupCountField: d.showGroupCountField.value,
      minTeamsGridClass: d.minTeamsGridClass.value,
      isPlayoffFormat: d.isPlayoffFormat.value,
      isGroupsPlusPlayoffFormat: d.isGroupsPlusPlayoffFormat.value,
      minTeamsMinValue: d.minTeamsMinValue.value,
      showPlayoffQualifiersField: d.showPlayoffQualifiersField.value,
      formatCalendarHint: d.formatCalendarHint.value,
      syncNumericField: d.syncNumericField,
      seasonSelectOptions: d.seasonSelectOptions.value,
      seasonsLoading: d.seasonsLoading.value,
      competitionSelectOptions: d.competitionSelectOptions.value,
      competitionsLoading: d.competitionsLoading.value,
      ageGroupSelectOptions: d.ageGroupSelectOptions.value,
      ageGroupsLoading: d.ageGroupsLoading.value,
      stadiumMultiOptions: d.stadiumMultiOptions.value,
      stadiumsLoading: d.stadiumsLoading.value,
      refereeMultiOptions: d.refereeMultiOptions.value,
      refereesLoading: d.refereesLoading.value,
      canAccessReferenceBasic: d.canAccessReferenceBasic.value,
      canAccessReferenceStandard: d.canAccessReferenceStandard.value,
      adminsLoading: d.adminsLoading.value,
      moderatorSelectOptions: d.moderatorSelectOptions.value,
      teamsLoading: d.teamsLoading.value,
      teams: d.teams.value,
      teamsEmptyMessage: d.form.ageGroupId.trim()
        ? t('admin.tournaments_list.form_teams_empty_filtered')
        : t('admin.tournaments_list.form_teams_empty'),
      showTeamsError: d.showTeamsError.value,
      teamsErrorMessage: d.tournamentFormErrors.value.teamsError,
    }
  })
}

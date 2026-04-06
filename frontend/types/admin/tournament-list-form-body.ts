import type { TournamentFormModel } from '~/composables/admin/useTournamentForm'
import type { TournamentFormNumericFieldKey } from '~/composables/admin/useAdminTournamentListFormUi'
import type { TournamentFormat } from '~/types/admin/tournaments-index'
import type { TeamLite } from '~/types/tournament-admin'
import type { Ref } from 'vue'

export type AdminTournamentListTemplateOption = { label: string; value: string }
export type AdminTournamentListLabelValue = { label: string; value: string }
export type AdminTournamentListModeratorOption = { id: string; label: string }

/**
 * Пропсы тела формы турнира (список), без v-model: createTemplateId / manualPlayoffEnabled / calendarPicker.
 */
export type AdminTournamentListFormBodyBindings = {
  form: TournamentFormModel
  tournamentsTotal: number
  isEdit: boolean
  templateSelectOptions: AdminTournamentListTemplateOption[]
  tournamentTemplatesLoading: boolean
  logoFileInput: Ref<HTMLInputElement | null>
  logoUploading: boolean
  logoRemoving: boolean
  tournamentSlugGenerated: string
  showNameError: boolean
  nameErrorMessage: string
  onTemplatePick: (v: string | null | undefined) => void | Promise<void>
  onLogoPick: () => void
  onRemoveLogo: (e?: MouseEvent) => void | Promise<void>
  onLogoFileChange: (e: Event) => void | Promise<void>
  canTournamentAutomation: boolean
  formatOptionsForForm: { label: string; value: TournamentFormat }[]
  tournamentCalendarColorPresets: readonly string[]
  tournamentCalendarColorTrimmed: () => string
  clearTournamentCalendarColor: () => void
  formatFieldHintText: string
  groupCountHintText: string
  playoffQualifiersHintText: string
  minTeamsHintText: string
  groupCountMin: number
  groupCountMax: number
  impliedGroupCount: number | null
  showGroupCountField: boolean
  minTeamsGridClass: string
  isPlayoffFormat: boolean
  isGroupsPlusPlayoffFormat: boolean
  minTeamsMinValue: number
  showPlayoffQualifiersField: boolean
  formatCalendarHint: { valid: boolean; text: string } | null
  syncNumericField: (key: TournamentFormNumericFieldKey, value: unknown) => void
  seasonSelectOptions: AdminTournamentListLabelValue[]
  seasonsLoading: boolean
  competitionSelectOptions: AdminTournamentListLabelValue[]
  competitionsLoading: boolean
  ageGroupSelectOptions: AdminTournamentListLabelValue[]
  ageGroupsLoading: boolean
  stadiumMultiOptions: AdminTournamentListLabelValue[]
  stadiumsLoading: boolean
  refereeMultiOptions: AdminTournamentListLabelValue[]
  refereesLoading: boolean
  canAccessReferenceBasic: boolean
  canAccessReferenceStandard: boolean
  adminsLoading: boolean
  moderatorSelectOptions: AdminTournamentListModeratorOption[]
  teamsLoading: boolean
  teams: TeamLite[]
  teamsEmptyMessage: string
  showTeamsError: boolean
  teamsErrorMessage: string
}

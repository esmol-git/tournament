<script setup lang="ts">
import type { AdminTournamentListFormBodyBindings } from '~/types/admin/tournament-list-form-body'
import AdminTenantTournamentLimits from '~/app/components/admin/tournaments/AdminTenantTournamentLimits.vue'
import AdminTournamentListFormContextSection from '~/app/components/admin/tournaments/AdminTournamentListFormContextSection.vue'
import AdminTournamentListFormMainSection from '~/app/components/admin/tournaments/AdminTournamentListFormMainSection.vue'
import AdminTournamentListFormDescriptionSection from '~/app/components/admin/tournaments/AdminTournamentListFormDescriptionSection.vue'
import AdminTournamentListFormFormatCalendarSection from '~/app/components/admin/tournaments/AdminTournamentListFormFormatCalendarSection.vue'
import AdminTournamentListFormVenueRefereesSection from '~/app/components/admin/tournaments/AdminTournamentListFormVenueRefereesSection.vue'
import AdminTournamentListFormParticipantsSection from '~/app/components/admin/tournaments/AdminTournamentListFormParticipantsSection.vue'
import AdminTournamentListFormEnrollmentSection from '~/app/components/admin/tournaments/AdminTournamentListFormEnrollmentSection.vue'
import AdminTournamentListFormPointsSection from '~/app/components/admin/tournaments/AdminTournamentListFormPointsSection.vue'
import AdminTournamentCreateWizardReview from '~/app/components/admin/tournaments/AdminTournamentCreateWizardReview.vue'

const createTemplateId = defineModel<string>('createTemplateId', { required: true })
const manualPlayoffEnabled = defineModel<boolean>('manualPlayoffEnabled', { required: true })
const calendarPicker = defineModel<string>('calendarPicker', { required: true })

const props = defineProps<{
  bindings: AdminTournamentListFormBodyBindings
  isStepVisible?: (stepId: 'context' | 'about' | 'format' | 'enrollment' | 'review') => boolean
}>()

const show = (stepId: 'context' | 'about' | 'format' | 'enrollment' | 'review') =>
  !props.isStepVisible || props.isStepVisible(stepId)
</script>

<template>
  <div class="flex flex-col gap-4">
    <AdminTournamentListFormContextSection
      v-if="show('context')"
      :form="bindings.form"
      :is-edit="bindings.isEdit"
      :season-select-options="bindings.seasonSelectOptions"
      :seasons-loading="bindings.seasonsLoading"
      :competition-select-options="bindings.competitionSelectOptions"
      :competitions-loading="bindings.competitionsLoading"
      :age-group-select-options="bindings.ageGroupSelectOptions"
      :age-groups-loading="bindings.ageGroupsLoading"
      :edition-select-options="bindings.editionSelectOptions"
      :editions-loading="bindings.editionsLoading"
      :editions-list="bindings.editionsList"
      :can-access-reference-basic="bindings.canAccessReferenceBasic"
      :can-access-reference-standard="bindings.canAccessReferenceStandard"
    />

    <AdminTenantTournamentLimits
      v-if="!bindings.isEdit && show('about')"
      variant="inline"
      :tournaments-count="bindings.tournamentsTotal"
    />

    <template v-if="show('about')">
      <AdminTournamentListFormMainSection
        v-model:create-template-id="createTemplateId"
        :form="bindings.form"
        :is-edit="bindings.isEdit"
        :template-select-options="bindings.templateSelectOptions"
        :tournament-templates-loading="bindings.tournamentTemplatesLoading"
        :logo-file-input="bindings.logoFileInput"
        :logo-uploading="bindings.logoUploading"
        :logo-removing="bindings.logoRemoving"
        :tournament-slug-generated="bindings.tournamentSlugGenerated"
        :show-name-error="bindings.showNameError"
        :name-error-message="bindings.nameErrorMessage"
        @template-pick="bindings.onTemplatePick"
        @logo-pick="bindings.onLogoPick"
        @remove-logo="bindings.onRemoveLogo"
        @logo-file-change="bindings.onLogoFileChange"
      />
      <AdminTournamentListFormDescriptionSection :form="bindings.form" />
    </template>

    <template v-if="show('format')">
      <AdminTournamentListFormFormatCalendarSection
        v-model:manual-playoff-enabled="manualPlayoffEnabled"
        v-model:calendar-picker="calendarPicker"
        :form="bindings.form"
        :is-edit="bindings.isEdit"
        :can-tournament-automation="bindings.canTournamentAutomation"
        :format-options-for-form="bindings.formatOptionsForForm"
        :tournament-calendar-color-presets="bindings.tournamentCalendarColorPresets"
        :tournament-calendar-color-trimmed="bindings.tournamentCalendarColorTrimmed"
        :clear-tournament-calendar-color="bindings.clearTournamentCalendarColor"
        :format-field-hint-text="bindings.formatFieldHintText"
        :group-count-hint-text="bindings.groupCountHintText"
        :playoff-qualifiers-hint-text="bindings.playoffQualifiersHintText"
        :min-teams-hint-text="bindings.minTeamsHintText"
        :group-count-min="bindings.groupCountMin"
        :group-count-max="bindings.groupCountMax"
        :implied-group-count="bindings.impliedGroupCount"
        :show-group-count-field="bindings.showGroupCountField"
        :min-teams-grid-class="bindings.minTeamsGridClass"
        :is-playoff-format="bindings.isPlayoffFormat"
        :is-groups-plus-playoff-format="bindings.isGroupsPlusPlayoffFormat"
        :min-teams-min-value="bindings.minTeamsMinValue"
        :show-playoff-qualifiers-field="bindings.showPlayoffQualifiersField"
        :format-calendar-hint="bindings.formatCalendarHint"
        :sync-numeric-field="bindings.syncNumericField"
      />
      <AdminTournamentListFormVenueRefereesSection
        :form="bindings.form"
        :hide-reference-fields="!!props.isStepVisible"
        :season-select-options="bindings.seasonSelectOptions"
        :seasons-loading="bindings.seasonsLoading"
        :competition-select-options="bindings.competitionSelectOptions"
        :competitions-loading="bindings.competitionsLoading"
        :age-group-select-options="bindings.ageGroupSelectOptions"
        :age-groups-loading="bindings.ageGroupsLoading"
        :edition-select-options="bindings.editionSelectOptions"
        :editions-loading="bindings.editionsLoading"
        :editions-list="bindings.editionsList"
        :stadium-multi-options="bindings.stadiumMultiOptions"
        :stadiums-loading="bindings.stadiumsLoading"
        :referee-multi-options="bindings.refereeMultiOptions"
        :referees-loading="bindings.refereesLoading"
        :can-access-reference-basic="bindings.canAccessReferenceBasic"
        :can-access-reference-standard="bindings.canAccessReferenceStandard"
      />
      <AdminTournamentListFormPointsSection v-if="!bindings.isPlayoffFormat" :form="bindings.form" />
    </template>

    <template v-if="show('enrollment')">
      <AdminTournamentListFormEnrollmentSection
        :form="bindings.form"
        :is-edit="bindings.isEdit"
        :hide-context-fields="!!props.isStepVisible"
      />
      <AdminTournamentListFormParticipantsSection
        :form="bindings.form"
        :admins-loading="bindings.adminsLoading"
        :moderator-select-options="bindings.moderatorSelectOptions"
        :teams-loading="bindings.teamsLoading"
        :teams="bindings.teams"
        :teams-empty-message="bindings.teamsEmptyMessage"
        :show-teams-error="bindings.showTeamsError"
        :teams-error-message="bindings.teamsErrorMessage"
      />
    </template>

    <AdminTournamentCreateWizardReview v-if="show('review')" :form="bindings.form" />
  </div>
</template>

<style scoped>
:deep(.p-floatlabel label.has-tooltip) {
  pointer-events: auto;
}
</style>

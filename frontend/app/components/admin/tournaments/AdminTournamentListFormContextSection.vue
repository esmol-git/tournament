<script setup lang="ts">
/* eslint-disable vue/no-mutating-props -- родитель передаёт общий reactive(form) */
import type { TournamentFormModel } from '~/composables/admin/useTournamentForm'
import { computed, watch } from 'vue'
import { TOURNAMENT_GAME_FORMAT_VALUES } from '~/utils/tournamentGameFormat'

const props = defineProps<{
  form: TournamentFormModel
  isEdit: boolean
  seasonSelectOptions: { label: string; value: string }[]
  seasonsLoading: boolean
  competitionSelectOptions: { label: string; value: string }[]
  competitionsLoading: boolean
  ageGroupSelectOptions: { label: string; value: string }[]
  ageGroupsLoading: boolean
  editionSelectOptions: { label: string; value: string }[]
  editionsLoading: boolean
  editionsList: Array<{ id: string; season: { id: string }; competition: { id: string } }>
  canAccessReferenceBasic: boolean
  canAccessReferenceStandard: boolean
}>()

const { t } = useI18n()

const profileOptions = computed(() => [
  { label: t('admin.tournament_form.profile_youth'), value: 'YOUTH' as const },
  { label: t('admin.tournament_form.profile_standard'), value: 'STANDARD' as const },
])

const gameFormatOptions = computed(() =>
  TOURNAMENT_GAME_FORMAT_VALUES.map((value) => ({
    label: t(`admin.tournament_form.game_formats.${value}`),
    value,
  })),
)

const isCustomGameFormat = computed(() => props.form.gameFormat === 'CUSTOM')

watch(
  () => props.form.eligibilityProfile,
  (profile) => {
    if (profile === 'YOUTH' && !props.isEdit) {
      if (props.form.rosterMinPlayers == null) props.form.rosterMinPlayers = 8
      if (props.form.rosterMaxPlayers == null) props.form.rosterMaxPlayers = 12
      if (!props.form.gameFormat) props.form.gameFormat = 'FIVE_PLUS_ONE'
    }
  },
)

watch(
  () => props.form.gameFormat,
  (format) => {
    if (format !== 'CUSTOM') props.form.gameFormatNote = ''
  },
)

watch(
  () => props.form.editionId,
  (editionId) => {
    if (!editionId) return
    const edition = props.editionsList.find((e) => e.id === editionId)
    if (!edition) return
    props.form.seasonId = edition.season.id
    props.form.competitionId = edition.competition.id
  },
)
</script>

<template>
  <section
    class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
  >
    <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-color">
      {{ t('admin.tournament_wizard.step_context') }}
    </h3>
    <p class="mb-4 text-xs leading-relaxed text-muted-color">
      {{ t('admin.tournament_wizard.context_lead') }}
    </p>

    <Message
      v-if="!canAccessReferenceBasic"
      severity="secondary"
      :closable="false"
      class="mb-3 w-full text-xs"
    >
      {{ t('admin.tournament_page.reference_fields_plan_basic_locked') }}
    </Message>
    <Message
      v-if="!canAccessReferenceStandard"
      severity="secondary"
      :closable="false"
      class="mb-3 w-full text-xs"
    >
      {{ t('admin.tournament_page.reference_fields_plan_standard_locked') }}
    </Message>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FloatLabel variant="on" class="block w-full min-w-0 md:col-span-2">
        <Select
          input-id="t_ctx_editionId"
          v-model="form.editionId"
          :options="editionSelectOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          show-clear
          :loading="editionsLoading"
          :disabled="!canAccessReferenceStandard"
        />
        <label for="t_ctx_editionId">{{ t('admin.tournament_form.field_edition') }}</label>
      </FloatLabel>
    </div>

    <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <FloatLabel variant="on" class="block w-full min-w-0">
        <Select
          input-id="t_ctx_seasonId"
          v-model="form.seasonId"
          :options="seasonSelectOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          :loading="seasonsLoading"
          :disabled="!canAccessReferenceBasic"
        />
        <label for="t_ctx_seasonId">{{ t('admin.tournament_form.field_season') }}</label>
      </FloatLabel>
      <FloatLabel variant="on" class="block w-full min-w-0">
        <Select
          input-id="t_ctx_competitionId"
          v-model="form.competitionId"
          :options="competitionSelectOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          :loading="competitionsLoading"
          :disabled="!canAccessReferenceStandard"
        />
        <label for="t_ctx_competitionId">{{ t('admin.tournament_form.field_competition') }}</label>
      </FloatLabel>
      <FloatLabel variant="on" class="block w-full min-w-0">
        <Select
          input-id="t_ctx_ageGroupId"
          v-model="form.ageGroupId"
          :options="ageGroupSelectOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          :loading="ageGroupsLoading"
          :disabled="!canAccessReferenceBasic"
        />
        <label for="t_ctx_ageGroupId">{{ t('admin.tournament_form.field_age_group') }}</label>
      </FloatLabel>
    </div>

    <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
      <FloatLabel variant="on" class="block w-full min-w-0">
        <Select
          input-id="t_ctx_eligibilityProfile"
          v-model="form.eligibilityProfile"
          :options="profileOptions"
          option-label="label"
          option-value="value"
          class="w-full"
        />
        <label for="t_ctx_eligibilityProfile">{{ t('admin.tournament_form.label_eligibility_profile') }}</label>
      </FloatLabel>
      <FloatLabel variant="on" class="block w-full min-w-0">
        <Select
          input-id="t_ctx_gameFormat"
          v-model="form.gameFormat"
          :options="gameFormatOptions"
          option-label="label"
          option-value="value"
          show-clear
          class="w-full"
        />
        <label for="t_ctx_gameFormat">{{ t('admin.tournament_form.label_game_format') }}</label>
      </FloatLabel>
      <div v-if="isCustomGameFormat" class="flex flex-col gap-1 md:col-span-2">
        <label class="text-xs text-muted-color">{{ t('admin.tournament_form.label_game_format_note') }}</label>
        <InputText
          v-model="form.gameFormatNote"
          class="w-full"
          :placeholder="t('admin.tournament_form.game_format_note_placeholder')"
        />
      </div>
    </div>

    <p v-if="form.editionId" class="mt-4 text-xs text-muted-color">
      {{ t('admin.tournament_wizard.context_edition_inherit_hint') }}
    </p>
  </section>
</template>

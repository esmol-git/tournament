<script setup lang="ts">
/* eslint-disable vue/no-mutating-props -- родитель передаёт общий reactive(form); поля синхронизируются по ссылке */
import type { TournamentFormModel } from '~/composables/admin/useTournamentForm'
import { adminTooltip } from '~/utils/adminTooltip'

type LabelValue = { label: string; value: string }

defineProps<{
  form: TournamentFormModel
  seasonSelectOptions: LabelValue[]
  seasonsLoading: boolean
  competitionSelectOptions: LabelValue[]
  competitionsLoading: boolean
  ageGroupSelectOptions: LabelValue[]
  ageGroupsLoading: boolean
  stadiumMultiOptions: LabelValue[]
  stadiumsLoading: boolean
  refereeMultiOptions: LabelValue[]
  refereesLoading: boolean
  canAccessReferenceBasic: boolean
  canAccessReferenceStandard: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <section
    class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
  >
    <div class="mb-4 flex items-center gap-1.5">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-color">
        {{ t('admin.tournament_form.section_venue_referees_title') }}
      </h3>
      <button
        type="button"
        class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
        :aria-label="t('admin.tournament_form.section_venue_referees_tooltip')"
        v-tooltip.top="adminTooltip(t('admin.tournament_form.section_venue_referees_tooltip'))"
        @click.prevent
      >
        <i class="pi pi-info-circle text-sm" aria-hidden="true" />
      </button>
    </div>
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
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <FloatLabel variant="on" class="block min-w-0">
        <Select
          inputId="t_seasonId"
          v-model="form.seasonId"
          :options="seasonSelectOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          :loading="seasonsLoading"
          :disabled="!canAccessReferenceBasic"
        />
        <label for="t_seasonId">{{ t('admin.tournament_form.field_season') }}</label>
      </FloatLabel>
      <FloatLabel variant="on" class="block min-w-0">
        <Select
          inputId="t_competitionId"
          v-model="form.competitionId"
          :options="competitionSelectOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          :loading="competitionsLoading"
          :disabled="!canAccessReferenceStandard"
        />
        <label for="t_competitionId">{{ t('admin.tournament_form.field_competition') }}</label>
      </FloatLabel>
      <FloatLabel variant="on" class="block min-w-0">
        <Select
          inputId="t_ageGroupId"
          v-model="form.ageGroupId"
          :options="ageGroupSelectOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          :loading="ageGroupsLoading"
          :disabled="!canAccessReferenceBasic"
        />
        <label for="t_ageGroupId">{{ t('admin.tournament_form.field_age_group') }}</label>
      </FloatLabel>
    </div>
    <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
      <FloatLabel variant="on" class="block min-w-0">
        <MultiSelect
          inputId="t_stadiumIds"
          v-model="form.stadiumIds"
          :options="stadiumMultiOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          :loading="stadiumsLoading"
          filter
          :maxSelectedLabels="0"
          :selectedItemsLabel="t('admin.tournament_form.venues_selected_count', { count: '{0}' })"
          :placeholder="t('admin.tournament_form.placeholder_stadiums')"
          :disabled="!canAccessReferenceStandard"
        />
        <label for="t_stadiumIds" class="has-tooltip flex items-center gap-1.5">
          <span>{{ t('admin.tournament_form.label_stadiums') }}</span>
          <button
            type="button"
            class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            :aria-label="t('admin.tournament_form.stadium_ids_tooltip')"
            v-tooltip.top="adminTooltip(t('admin.tournament_form.stadium_ids_tooltip'))"
            @click.prevent
          >
            <i class="pi pi-info-circle text-sm" aria-hidden="true" />
          </button>
        </label>
      </FloatLabel>
      <FloatLabel variant="on" class="block min-w-0">
        <MultiSelect
          inputId="t_refereeIds"
          v-model="form.refereeIds"
          :options="refereeMultiOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          :loading="refereesLoading"
          :placeholder="t('admin.tournament_form.placeholder_referees')"
          filter
          :maxSelectedLabels="0"
          :selectedItemsLabel="t('admin.tournament_page.selected_count', { count: '{0}' })"
          :disabled="!canAccessReferenceStandard"
        />
        <label for="t_refereeIds">{{ t('admin.tournament_form.label_referees') }}</label>
      </FloatLabel>
    </div>
  </section>
</template>

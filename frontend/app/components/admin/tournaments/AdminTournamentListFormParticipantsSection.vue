<script setup lang="ts">
/* eslint-disable vue/no-mutating-props -- родитель передаёт общий reactive(form); поля синхронизируются по ссылке */
import type { TournamentFormModel } from '~/composables/admin/useTournamentForm'
import type { TeamLite } from '~/types/tournament-admin'
import { adminTooltip } from '~/utils/adminTooltip'

type ModeratorOption = { id: string; label: string }

defineProps<{
  form: TournamentFormModel
  adminsLoading: boolean
  moderatorSelectOptions: ModeratorOption[]
  teamsLoading: boolean
  teams: TeamLite[]
  teamsEmptyMessage: string
  showTeamsError: boolean
  teamsErrorMessage: string
}>()

const { t } = useI18n()
</script>

<template>
  <section
    class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
  >
    <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
      {{ t('admin.tournament_form.list_section_participants') }}
    </h3>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
      <FloatLabel variant="on" class="block min-w-0">
        <MultiSelect
          inputId="t_moderatorIds"
          v-model="form.moderatorIds"
          :loading="adminsLoading"
          :options="moderatorSelectOptions"
          option-label="label"
          option-value="id"
          class="w-full"
          :placeholder="t('admin.tournament_form.placeholder_moderators')"
          filter
          :maxSelectedLabels="0"
          :selectedItemsLabel="t('admin.tournament_page.selected_count', { count: '{0}' })"
        />
        <label for="t_moderatorIds" class="has-tooltip flex items-center gap-1.5">
          <span>{{ t('admin.tournament_form.label_moderators') }}</span>
          <button
            type="button"
            class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            :aria-label="t('admin.tournament_form.moderators_field_tooltip')"
            v-tooltip.top="adminTooltip(t('admin.tournament_form.moderators_field_tooltip'))"
            @click.prevent
          >
            <i class="pi pi-info-circle text-sm" aria-hidden="true" />
          </button>
        </label>
      </FloatLabel>

      <FloatLabel variant="on" class="block min-w-0">
        <MultiSelect
          inputId="t_teamIds"
          v-model="form.teamIds"
          :loading="teamsLoading"
          :options="teams"
          option-label="name"
          option-value="id"
          class="w-full"
          :placeholder="t('admin.tournament_form.placeholder_teams')"
          :emptyMessage="teamsEmptyMessage"
          filter
          :maxSelectedLabels="0"
          :selectedItemsLabel="t('admin.tournament_page.selected_count', { count: '{0}' })"
          :invalid="showTeamsError"
        />
        <label for="t_teamIds">{{ t('admin.tournament_form.label_teams') }}</label>
      </FloatLabel>
      <p
        v-if="showTeamsError"
        class="mt-0 text-[11px] leading-4 text-red-500 md:col-span-2"
      >
        {{ teamsErrorMessage }}
      </p>
    </div>
  </section>
</template>

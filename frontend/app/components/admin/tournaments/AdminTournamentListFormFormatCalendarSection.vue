<script setup lang="ts">
/* eslint-disable vue/no-mutating-props -- родитель передаёт общий reactive(form); поля синхронизируются по ссылке */
import type { TournamentFormModel } from '~/composables/admin/useTournamentForm'
import type { TournamentFormNumericFieldKey } from '~/composables/admin/useAdminTournamentListFormUi'
import type { TournamentFormat } from '~/types/admin/tournaments-index'
import { adminTooltip } from '~/utils/adminTooltip'
import { playoffTeamCountOptions } from '~/utils/tournamentAdminFormShared'

defineProps<{
  form: TournamentFormModel
  isEdit: boolean
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
}>()

const manualPlayoffEnabled = defineModel<boolean>('manualPlayoffEnabled', { required: true })
const calendarPicker = defineModel<string>('calendarPicker', { required: true })

const { t } = useI18n()
</script>

<template>
  <section
    class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
  >
    <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
      {{ t('admin.tournament_templates.section_format') }}
    </h3>
    <div class="mb-4 flex flex-col gap-2">
      <div class="flex items-center gap-1.5">
        <label class="text-sm font-medium text-surface-900 dark:text-surface-0">
          {{ t('admin.tournament_form.calendar_color_label') }}
        </label>
        <button
          type="button"
          class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
          :aria-label="t('admin.tournament_form.calendar_color_hint')"
          v-tooltip.top="adminTooltip(t('admin.tournament_form.calendar_color_hint'))"
          @click.prevent
        >
          <i class="pi pi-info-circle text-sm" aria-hidden="true" />
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="c in tournamentCalendarColorPresets"
          :key="c"
          type="button"
          class="h-8 w-8 shrink-0 rounded-full border-2 border-surface-300 shadow-sm transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-surface-600"
          :class="
            tournamentCalendarColorTrimmed().toLowerCase() === c
              ? 'ring-2 ring-primary ring-offset-2 dark:ring-offset-surface-900'
              : ''
          "
          :style="{ backgroundColor: c }"
          :title="c"
          :aria-label="c"
          @click="form.calendarColor = c"
        />
        <input
          v-model="calendarPicker"
          type="color"
          class="h-9 w-14 cursor-pointer rounded border border-surface-300 bg-surface-0 p-0.5 dark:border-surface-600"
          :aria-label="t('admin.tournament_form.calendar_color_label')"
        />
        <Button
          v-if="tournamentCalendarColorTrimmed()"
          type="button"
          :label="t('admin.tournament_form.calendar_color_reset')"
          text
          severity="secondary"
          size="small"
          @click="clearTournamentCalendarColor"
        />
      </div>
    </div>
    <Message
      v-if="!canTournamentAutomation"
      severity="info"
      :closable="false"
      class="mb-4 w-full text-sm"
    >
      {{ t('admin.tournament_form.manual_only_tariff') }}
    </Message>
    <Message
      v-if="isEdit && !canTournamentAutomation && form.format !== 'MANUAL'"
      severity="warn"
      :closable="false"
      class="mb-4 w-full text-sm"
    >
      {{ t('admin.tournament_form.legacy_format_need_manual_or_plan') }}
    </Message>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FloatLabel variant="on" class="block">
        <Select
          inputId="t_format"
          v-model="form.format"
          :options="formatOptionsForForm"
          option-label="label"
          option-value="value"
          class="w-full"
        />
        <label for="t_format" class="has-tooltip flex items-center gap-1.5">
          <span>{{ t('admin.tournament_form.field_format') }}</span>
          <button
            type="button"
            class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            :aria-label="t('admin.tournament_form.hint_format_aria')"
            v-tooltip.top="adminTooltip(formatFieldHintText)"
            @click.prevent
          >
            <i class="pi pi-info-circle text-sm" aria-hidden="true" />
          </button>
        </label>
      </FloatLabel>

      <div
        v-if="form.format === 'MANUAL'"
        class="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800/60 md:col-start-2 md:row-start-1"
      >
        <label for="manual_playoff_enabled" class="inline-flex cursor-pointer items-center gap-2">
          <Checkbox
            inputId="manual_playoff_enabled"
            v-model="manualPlayoffEnabled"
            binary
          />
          <span>{{ t('admin.tournament_form.manual_playoff_label') }}</span>
        </label>
      </div>

      <div
        v-if="showGroupCountField"
        :class="form.format === 'MANUAL' ? 'md:col-start-1 md:row-start-2' : ''"
      >
        <FloatLabel variant="on" class="block">
          <InputNumber
            inputId="t_groupCount"
            v-model="form.groupCount"
            class="w-full"
            :min="groupCountMin"
            :max="groupCountMax"
            :readonly="impliedGroupCount !== null"
            @input="(e) => syncNumericField('groupCount', e?.value)"
          />
          <label for="t_groupCount" class="has-tooltip flex items-center gap-1.5">
            <span>{{ t('admin.tournament_form.field_group_count') }}</span>
            <button
              type="button"
              class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
              :aria-label="t('admin.tournament_form.hint_group_count_aria')"
              v-tooltip.top="adminTooltip(groupCountHintText)"
              @click.prevent
            >
              <i class="pi pi-info-circle text-sm" aria-hidden="true" />
            </button>
          </label>
        </FloatLabel>
      </div>

      <div :class="minTeamsGridClass">
        <FloatLabel v-if="isPlayoffFormat" variant="on" class="block">
          <Select
            inputId="t_minTeams"
            v-model="form.minTeams"
            :options="[...playoffTeamCountOptions]"
            class="w-full"
          />
          <label for="t_minTeams" class="has-tooltip flex items-center gap-1.5">
            <span>{{ t('admin.tournament_form.field_team_count') }}</span>
            <button
              type="button"
              class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
              :aria-label="t('admin.tournament_form.hint_team_count_aria')"
              v-tooltip.top="adminTooltip(minTeamsHintText)"
              @click.prevent
            >
              <i class="pi pi-info-circle text-sm" aria-hidden="true" />
            </button>
          </label>
        </FloatLabel>

        <FloatLabel v-else-if="isGroupsPlusPlayoffFormat" variant="on" class="block">
          <InputNumber
            inputId="t_minTeams"
            v-model="form.minTeams"
            class="w-full"
            :min="2"
            @input="(e) => syncNumericField('minTeams', e?.value)"
          />
          <label for="t_minTeams" class="has-tooltip flex items-center gap-1.5">
            <span>{{ t('admin.tournament_form.field_team_count') }}</span>
            <button
              type="button"
              class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
              :aria-label="t('admin.tournament_form.hint_team_count_aria')"
              v-tooltip.top="adminTooltip(minTeamsHintText)"
              @click.prevent
            >
              <i class="pi pi-info-circle text-sm" aria-hidden="true" />
            </button>
          </label>
        </FloatLabel>

        <FloatLabel v-else variant="on" class="block">
          <InputNumber
            inputId="t_minTeams"
            v-model="form.minTeams"
            class="w-full"
            :min="minTeamsMinValue"
            @input="(e) => syncNumericField('minTeams', e?.value)"
          />
          <label for="t_minTeams" class="has-tooltip flex items-center gap-1.5">
            <span>{{ t('admin.tournament_form.field_team_count') }}</span>
            <button
              type="button"
              class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
              :aria-label="t('admin.tournament_form.hint_min_teams_aria')"
              v-tooltip.top="adminTooltip(minTeamsHintText)"
              @click.prevent
            >
              <i class="pi pi-info-circle text-sm" aria-hidden="true" />
            </button>
          </label>
        </FloatLabel>
      </div>

      <div
        v-if="showPlayoffQualifiersField"
        :class="form.format === 'MANUAL' ? 'md:col-start-1 md:row-start-3' : 'md:col-start-2 md:row-start-2'"
      >
        <FloatLabel variant="on" class="block">
          <InputNumber
            inputId="t_playoffQualifiersPerGroup"
            v-model="form.playoffQualifiersPerGroup"
            class="w-full"
            :min="1"
            :max="8"
            @input="(e) => syncNumericField('playoffQualifiersPerGroup', e?.value)"
          />
          <label for="t_playoffQualifiersPerGroup" class="has-tooltip flex items-center gap-1.5">
            <span>{{ t('admin.tournament_form.field_playoff_qualifiers') }}</span>
            <button
              type="button"
              class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
              :aria-label="t('admin.tournament_form.hint_playoff_qualifiers_aria')"
              v-tooltip.top="adminTooltip(playoffQualifiersHintText)"
              @click.prevent
            >
              <i class="pi pi-info-circle text-sm" aria-hidden="true" />
            </button>
          </label>
        </FloatLabel>
      </div>

      <div
        v-if="formatCalendarHint"
        class="rounded-lg border px-3 py-2 text-xs md:col-span-2"
        :class="
          formatCalendarHint.valid
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-amber-200 bg-amber-50 text-amber-900'
        "
      >
        {{ formatCalendarHint.text }}
      </div>
    </div>
  </section>
</template>

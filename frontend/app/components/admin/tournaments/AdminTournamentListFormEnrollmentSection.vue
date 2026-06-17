<script setup lang="ts">
/* eslint-disable vue/no-mutating-props -- родитель передаёт общий reactive(form) */
import type { TournamentFormModel } from '~/composables/admin/useTournamentForm'
import { computed, watch } from 'vue'
import { TOURNAMENT_GAME_FORMAT_VALUES } from '~/utils/tournamentGameFormat'

const props = defineProps<{
  form: TournamentFormModel
  isEdit: boolean
  hideContextFields?: boolean
}>()

const { t } = useI18n()

const isApplicationsMode = computed(() => props.form.enrollmentMode === 'APPLICATIONS')
const isCustomGameFormat = computed(() => props.form.gameFormat === 'CUSTOM')

const enrollmentOptions = computed(() => [
  { label: t('admin.tournament_form.enrollment_manual'), value: 'MANUAL' as const },
  { label: t('admin.tournament_form.enrollment_applications'), value: 'APPLICATIONS' as const },
])

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

watch(
  () => props.form.enrollmentMode,
  (mode) => {
    if (mode === 'APPLICATIONS') {
      props.form.registrationEnabled = true
      if (!props.isEdit) {
        props.form.teamIds = []
      }
    }
  },
)

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
</script>

<template>
  <section
    class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
  >
    <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-color">
      {{ t('admin.tournament_form.list_section_enrollment') }}
    </h3>
    <p class="mb-4 text-xs leading-relaxed text-muted-color">
      {{ t('admin.tournament_form.enrollment_section_lead') }}
    </p>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FloatLabel variant="on" class="block min-w-0">
        <Select
          input-id="t_enrollmentMode"
          v-model="form.enrollmentMode"
          :options="enrollmentOptions"
          option-label="label"
          option-value="value"
          class="w-full"
        />
        <label for="t_enrollmentMode">{{ t('admin.tournament_form.label_enrollment_mode') }}</label>
      </FloatLabel>

      <FloatLabel v-if="!hideContextFields" variant="on" class="block min-w-0">
        <Select
          input-id="t_eligibilityProfile"
          v-model="form.eligibilityProfile"
          :options="profileOptions"
          option-label="label"
          option-value="value"
          class="w-full"
        />
        <label for="t_eligibilityProfile">{{ t('admin.tournament_form.label_eligibility_profile') }}</label>
      </FloatLabel>

      <FloatLabel v-if="!hideContextFields" variant="on" class="block min-w-0">
        <Select
          input-id="t_gameFormat"
          v-model="form.gameFormat"
          :options="gameFormatOptions"
          option-label="label"
          option-value="value"
          show-clear
          class="w-full"
        />
        <label for="t_gameFormat">{{ t('admin.tournament_form.label_game_format') }}</label>
      </FloatLabel>

      <div v-if="!hideContextFields && isCustomGameFormat" class="flex flex-col gap-1 md:col-span-2">
        <label class="text-xs text-muted-color">{{ t('admin.tournament_form.label_game_format_note') }}</label>
        <InputText
          v-model="form.gameFormatNote"
          class="w-full"
          :placeholder="t('admin.tournament_form.game_format_note_placeholder')"
        />
      </div>

      <template v-if="isApplicationsMode">
        <div class="flex flex-col gap-1 md:col-span-2">
          <Message severity="info" :closable="false" class="text-sm">
            {{ t('admin.tournament_form.enrollment_applications_hint') }}
          </Message>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-color">{{ t('admin.tournament_registrations.opens_at') }}</label>
          <DatePicker v-model="form.registrationOpensAt" show-time hour-format="24" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-color">{{ t('admin.tournament_registrations.closes_at') }}</label>
          <DatePicker v-model="form.registrationClosesAt" show-time hour-format="24" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-color">{{ t('admin.tournament_registrations.max_teams') }}</label>
          <InputNumber v-model="form.maxTeams" :min="2" :max="512" class="w-full" show-buttons />
        </div>
      </template>

      <div class="flex flex-col gap-1">
        <label class="text-xs text-muted-color">{{ t('admin.tournament_form.label_roster_min') }}</label>
        <InputNumber v-model="form.rosterMinPlayers" :min="1" :max="99" class="w-full" show-buttons />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-muted-color">{{ t('admin.tournament_form.label_roster_max') }}</label>
        <InputNumber v-model="form.rosterMaxPlayers" :min="1" :max="99" class="w-full" show-buttons />
      </div>
      <div class="flex flex-col gap-1 md:col-span-2">
        <label class="text-xs text-muted-color">{{ t('admin.tournament_form.label_roster_deadline') }}</label>
        <DatePicker v-model="form.rosterDeadlineAt" show-time hour-format="24" class="w-full" />
      </div>

      <div class="md:col-span-2 rounded-lg border border-surface-200 dark:border-surface-700 p-3 space-y-3">
        <label class="flex items-center justify-between gap-3">
          <span class="text-sm">{{ t('admin.tournament_form.label_card_auto_ban') }}</span>
          <ToggleSwitch v-model="form.cardAutoBanEnabled" />
        </label>
        <p class="text-[11px] leading-snug text-muted-color">
          {{ t('admin.tournament_form.card_auto_ban_hint') }}
        </p>
        <div v-if="form.cardAutoBanEnabled" class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-color">{{ t('admin.tournament_form.label_red_card_ban') }}</label>
            <InputNumber v-model="form.redCardBanMatches" :min="1" :max="10" class="w-full" show-buttons />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-color">{{ t('admin.tournament_form.label_yellow_threshold') }}</label>
            <InputNumber v-model="form.yellowAccumulationThreshold" :min="1" :max="10" class="w-full" show-buttons />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-color">{{ t('admin.tournament_form.label_yellow_ban') }}</label>
            <InputNumber v-model="form.yellowAccumulationBanMatches" :min="1" :max="10" class="w-full" show-buttons />
          </div>
        </div>
      </div>

      <div class="md:col-span-2 rounded-lg border border-surface-200 dark:border-surface-700 p-3 space-y-3">
        <p class="text-sm font-medium">{{ t('admin.tournament_form.technical_result_section') }}</p>
        <p class="text-[11px] leading-snug text-muted-color">
          {{ t('admin.tournament_form.technical_result_hint') }}
        </p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-color">{{ t('admin.tournament_form.label_technical_win_goals') }}</label>
            <InputNumber v-model="form.technicalWinGoalsFor" :min="0" :max="99" class="w-full" show-buttons />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-color">{{ t('admin.tournament_form.label_technical_lose_goals') }}</label>
            <InputNumber v-model="form.technicalWinGoalsAgainst" :min="0" :max="99" class="w-full" show-buttons />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

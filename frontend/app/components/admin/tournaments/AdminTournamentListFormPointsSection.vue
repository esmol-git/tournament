<script setup lang="ts">
/* eslint-disable vue/no-mutating-props -- родитель передаёт общий reactive(form); поля синхронизируются по ссылке */
import type { TournamentFormModel } from '~/composables/admin/useTournamentForm'

defineProps<{
  form: TournamentFormModel
}>()

const { t } = useI18n()
</script>

<template>
  <section
    class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
  >
    <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
      {{ t('admin.tournament_form.standings_points_title') }}
    </h3>
    <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
      <FloatLabel variant="on" class="w-full flex flex-col">
        <InputNumber
          inputId="t_pointsWin"
          v-model="form.pointsWin"
          class="w-full !flex"
          :min="0"
          inputClass="w-full"
        />
        <label for="t_pointsWin">{{ t('admin.tournament_form.points_win') }}</label>
      </FloatLabel>

      <FloatLabel variant="on" class="w-full flex flex-col">
        <InputNumber
          inputId="t_pointsDraw"
          v-model="form.pointsDraw"
          class="w-full !flex"
          :min="0"
          inputClass="w-full"
        />
        <label for="t_pointsDraw">{{ t('admin.tournament_form.points_draw') }}</label>
      </FloatLabel>

      <FloatLabel variant="on" class="w-full flex flex-col">
        <InputNumber
          inputId="t_pointsLoss"
          v-model="form.pointsLoss"
          class="w-full !flex"
          :min="0"
          inputClass="w-full"
        />
        <label for="t_pointsLoss">{{ t('admin.tournament_form.points_loss') }}</label>
      </FloatLabel>
    </div>
  </section>
</template>

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
      {{ t('admin.tournament_form.list_section_description') }}
    </h3>
    <div>
      <label for="t_desc" class="mb-1 block text-sm">{{
        t('admin.tournament_form.list_description_label')
      }}</label>
      <AdminMarkdownEditor input-id="t_desc" v-model="form.description" :rows="3" />
    </div>
  </section>
</template>

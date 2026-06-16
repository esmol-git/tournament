<script setup lang="ts">
import type { TournamentFormModel } from '~/composables/admin/useTournamentForm'
import { computed } from 'vue'
import { tournamentFormatLabel } from '~/utils/tournamentAdminUi'

const props = defineProps<{
  form: TournamentFormModel
}>()

const { t } = useI18n()

const enrollmentLabel = computed(() =>
  props.form.enrollmentMode === 'APPLICATIONS'
    ? t('admin.tournament_form.enrollment_applications')
    : t('admin.tournament_form.enrollment_manual'),
)

const profileLabel = computed(() =>
  props.form.eligibilityProfile === 'YOUTH'
    ? t('admin.tournament_form.profile_youth')
    : t('admin.tournament_form.profile_standard'),
)

const rosterLimits = computed(() => {
  const min = props.form.rosterMinPlayers
  const max = props.form.rosterMaxPlayers
  if (min != null && max != null) return `${min}–${max}`
  if (min != null) return `≥ ${min}`
  if (max != null) return `≤ ${max}`
  return t('admin.tournament_wizard.review_roster_unlimited')
})

const teamsSummary = computed(() => {
  if (props.form.enrollmentMode === 'APPLICATIONS') {
    return t('admin.tournament_wizard.review_teams_applications')
  }
  return t('admin.tournament_wizard.review_teams_manual', {
    count: props.form.teamIds.length,
    expected: props.form.minTeams,
  })
})
</script>

<template>
  <section
    class="rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-700 dark:bg-surface-900/60"
  >
    <h3 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
      {{ t('admin.tournament_wizard.review_title') }}
    </h3>
    <p class="mt-1 text-xs text-muted-color">
      {{ t('admin.tournament_wizard.review_lead') }}
    </p>

    <dl class="mt-4 grid gap-3 text-sm">
      <div class="grid gap-0.5">
        <dt class="text-xs text-muted-color">{{ t('admin.tournament_form.field_name') }}</dt>
        <dd class="font-medium">{{ form.name.trim() || '—' }}</dd>
      </div>
      <div class="grid gap-0.5">
        <dt class="text-xs text-muted-color">{{ t('admin.tournament_form.field_format') }}</dt>
        <dd>{{ tournamentFormatLabel(form.format) }} · {{ form.minTeams }} {{ t('admin.tournament_wizard.review_teams_word') }}</dd>
      </div>
      <div class="grid gap-0.5">
        <dt class="text-xs text-muted-color">{{ t('admin.tournament_form.label_enrollment_mode') }}</dt>
        <dd>{{ enrollmentLabel }}</dd>
      </div>
      <div class="grid gap-0.5">
        <dt class="text-xs text-muted-color">{{ t('admin.tournament_form.label_eligibility_profile') }}</dt>
        <dd>{{ profileLabel }} · {{ rosterLimits }}</dd>
      </div>
      <div class="grid gap-0.5">
        <dt class="text-xs text-muted-color">{{ t('admin.tournament_wizard.review_teams_label') }}</dt>
        <dd>{{ teamsSummary }}</dd>
      </div>
    </dl>
  </section>
</template>

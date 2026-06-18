<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { getApiErrorMessage } from '~/utils/apiError'
import { displayTeamNameForUi } from '~/utils/teamDisplayName'
import AdminTournamentTeamLogo from '~/app/components/admin/tournaments/AdminTournamentTeamLogo.vue'
import type { TeamLite } from '~/types/tournament-admin'

export type TournamentTeamRow = {
  teamId: string
  team: { id: string; name: string; logoUrl?: string | null }
  group?: { id: string; name: string } | null
  rating?: number | null
}

const props = defineProps<{
  tournamentId: string
  teams: TournamentTeamRow[]
  catalogTeams: TeamLite[]
  minTeams: number
  maxTeams?: number | null
  canEditComposition: boolean
  canReplaceTeam: boolean
  canEditRatings: boolean
  ratingSaving?: boolean
  showTeamList?: boolean
}>()

const emit = defineEmits<{
  updated: []
  replace: [teamId: string]
  'remove-request': [teamId: string]
  'update-rating': [teamId: string, rating: number]
}>()

const { token, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()
const { t } = useI18n()

const addDialogOpen = ref(false)
const addTeamId = ref<string | null>(null)
const addSaving = ref(false)

const ratingOptions = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))
const seedStrengthSelectPt = {
  root: { class: 'w-[5.25rem] min-w-[5.25rem] shrink-0' },
  label: {
    class: '!flex-none overflow-visible [text-overflow:clip] text-center tabular-nums',
  },
}

const logoByTeamId = computed(() => {
  const map = new Map<string, string | null>()
  for (const row of props.catalogTeams) {
    map.set(row.id, row.logoUrl ?? null)
  }
  for (const tt of props.teams) {
    if (tt.team.logoUrl != null) map.set(tt.teamId, tt.team.logoUrl)
  }
  return map
})

const teamLogoUrl = (teamId: string) => logoByTeamId.value.get(teamId) ?? null

const availableTeams = computed(() =>
  props.catalogTeams.filter((team) => !props.teams.some((tt) => tt.teamId === team.id)),
)

const atMinTeams = computed(() => props.teams.length <= Math.max(0, props.minTeams))

function openAddDialog() {
  addTeamId.value = null
  addDialogOpen.value = true
}

async function confirmAddTeam() {
  if (!token.value || !addTeamId.value) return
  addSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${props.tournamentId}/teams/${addTeamId.value}`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    addDialogOpen.value = false
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_page.team_added_summary'),
      life: 2500,
    })
    emit('updated')
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.team_add_error_summary'),
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 6000,
    })
  } finally {
    addSaving.value = false
  }
}
</script>

<template>
  <div class="rounded-xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
            {{ t('admin.tournament_page.tournament_teams_title') }}
          </h2>
          <span
            class="inline-flex items-center rounded-full bg-surface-100 px-2 py-0.5 text-xs font-medium tabular-nums text-surface-700 dark:bg-surface-800 dark:text-surface-200"
          >
            {{ teams.length }} / {{ minTeams }}
          </span>
        </div>
        <p class="mt-1.5 text-xs leading-relaxed text-muted-color">
          {{ t('admin.tournament_page.teams_tab_participants_lead') }}
        </p>
      </div>
      <Button
        v-if="canEditComposition && availableTeams.length > 0"
        :label="t('admin.tournament_page.add_team_action')"
        icon="pi pi-plus"
        size="small"
        @click="openAddDialog"
      />
    </div>

    <slot name="alerts" />

    <div v-if="showTeamList !== false" class="mt-4 space-y-2">
      <div
        v-if="!teams.length"
        class="rounded-lg border border-dashed border-surface-300 px-4 py-8 text-center dark:border-surface-600"
      >
        <i class="pi pi-users mb-2 text-2xl text-muted-color" />
        <p class="text-sm text-muted-color">{{ t('admin.tournament_page.teams_empty_in_tournament') }}</p>
        <Button
          v-if="canEditComposition && availableTeams.length > 0"
          class="mt-3"
          :label="t('admin.tournament_page.add_team_action')"
          icon="pi pi-plus"
          size="small"
          @click="openAddDialog"
        />
      </div>

      <div
        v-for="tt in teams"
        :key="tt.teamId"
        class="flex flex-wrap items-center gap-3 rounded-xl border border-surface-200 bg-surface-50/80 px-3 py-2.5 transition-colors hover:border-surface-300 dark:border-surface-700 dark:bg-surface-900/50 dark:hover:border-surface-600"
      >
        <AdminTournamentTeamLogo :logo-url="teamLogoUrl(tt.teamId)" :name="tt.team.name" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium text-surface-900 dark:text-surface-0">
            {{ displayTeamNameForUi(tt.team.name) }}
          </div>
          <div v-if="tt.group?.name" class="mt-0.5 text-[11px] text-muted-color">
            {{ tt.group.name }}
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] uppercase tracking-wide text-muted-color whitespace-nowrap">
              {{ t('admin.tournament_page.teams_tab_seed_label') }}
            </span>
            <Select
              :model-value="tt.rating ?? 3"
              :options="ratingOptions"
              option-label="label"
              option-value="value"
              :pt="seedStrengthSelectPt"
              :disabled="!canEditRatings || ratingSaving"
              @update:model-value="(v) => emit('update-rating', tt.teamId, Number(v))"
            />
          </div>

          <Button
            v-if="canReplaceTeam"
            v-tooltip.top="t('admin.tournament_page.replace_team_action')"
            icon="pi pi-sync"
            size="small"
            text
            rounded
            severity="secondary"
            :aria-label="t('admin.tournament_page.replace_team_action')"
            @click="emit('replace', tt.teamId)"
          />
          <Button
            v-if="canEditComposition"
            v-tooltip.top="
              atMinTeams
                ? t('admin.tournament_page.remove_team_min_blocked', { min: minTeams })
                : t('admin.tournament_page.remove_team_action')
            "
            icon="pi pi-trash"
            size="small"
            text
            rounded
            severity="danger"
            :disabled="atMinTeams"
            :aria-label="t('admin.tournament_page.remove_team_action')"
            @click="emit('remove-request', tt.teamId)"
          />
        </div>
      </div>
    </div>

    <Dialog
      v-model:visible="addDialogOpen"
      modal
      :header="t('admin.tournament_page.add_team_dialog_title')"
      :style="{ width: '28rem', maxWidth: '95vw' }"
    >
      <p class="text-sm text-muted-color">{{ t('admin.tournament_page.add_team_dialog_lead') }}</p>
      <Select
        v-model="addTeamId"
        :options="availableTeams"
        option-label="name"
        option-value="id"
        class="mt-3 w-full"
        filter
        :placeholder="t('admin.tournament_page.add_team_placeholder')"
      >
        <template #option="{ option }">
          <div class="flex items-center gap-2 py-0.5">
            <AdminTournamentTeamLogo :logo-url="option.logoUrl" :name="option.name" size="sm" />
            <span>{{ displayTeamNameForUi(option.name) }}</span>
          </div>
        </template>
        <template #value="{ value }">
          <div v-if="value" class="flex items-center gap-2">
            <AdminTournamentTeamLogo
              :logo-url="logoByTeamId.get(value) ?? null"
              size="sm"
            />
            <span>{{
              displayTeamNameForUi(catalogTeams.find((x) => x.id === value)?.name ?? '')
            }}</span>
          </div>
        </template>
      </Select>
      <template #footer>
        <Button
          :label="t('admin.tournament_registrations.cancel')"
          text
          :disabled="addSaving"
          @click="addDialogOpen = false"
        />
        <Button
          :label="t('admin.tournament_page.add_team_confirm')"
          icon="pi pi-plus"
          :loading="addSaving"
          :disabled="!addTeamId || addSaving"
          @click="confirmAddTeam"
        />
      </template>
    </Dialog>
  </div>
</template>

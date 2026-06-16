<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { getApiErrorMessage } from '~/utils/apiError'
import type { TournamentDetails } from '~/types/tournament-admin'

type RosterCandidate = {
  playerId: string
  eligible: boolean
  reason?: string
  jerseyNumber: number | null
  player: {
    id: string
    firstName: string
    lastName: string
    birthDate?: string | null
    position?: string | null
  }
}

type RosterRow = {
  playerId: string
  jerseyNumber: number | null
  status: string
  player: RosterCandidate['player']
}

const props = defineProps<{
  tournamentId: string
  tournament: TournamentDetails
  teams: Array<{ teamId: string; team: { id: string; name: string } }>
  canManage: boolean
}>()

const { token, authFetch, authFetchBlob } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()
const { t } = useI18n()

const selectedTeamId = ref<string | null>(null)
const loading = ref(false)
const saving = ref(false)
const submitting = ref(false)
const templateDownloading = ref(false)
const csvImporting = ref(false)
const createMissingPlayers = ref(true)
const csvFile = ref<File | null>(null)
const importErrors = ref<Array<{ row: number; message: string }>>([])
const candidates = ref<RosterCandidate[]>([])
const rosterItems = ref<RosterRow[]>([])
const selectedPlayerIds = ref<string[]>([])
const limits = ref<{
  minPlayers: number | null
  maxPlayers: number | null
  deadlineAt: string | null
} | null>(null)
const loadError = ref<string | null>(null)

const teamOptions = computed(() =>
  props.teams.map((tt) => ({
    label: tt.team.name,
    value: tt.teamId,
  })),
)

const selectedCount = computed(() => selectedPlayerIds.value.length)

const countLabel = computed(() => {
  const min = limits.value?.minPlayers
  const max = limits.value?.maxPlayers
  if (min != null && max != null) {
    return t('admin.tournament_roster.count_range', {
      selected: selectedCount.value,
      min,
      max,
    })
  }
  if (min != null) {
    return t('admin.tournament_roster.count_min', {
      selected: selectedCount.value,
      min,
    })
  }
  if (max != null) {
    return t('admin.tournament_roster.count_max', {
      selected: selectedCount.value,
      max,
    })
  }
  return t('admin.tournament_roster.count_plain', { selected: selectedCount.value })
})

const rosterStatus = computed(() => rosterItems.value[0]?.status ?? 'DRAFT')

watch(
  () => props.teams,
  (list) => {
    if (!selectedTeamId.value && list.length) {
      selectedTeamId.value = list[0]!.teamId
    }
  },
  { immediate: true },
)

watch(selectedTeamId, () => {
  void loadRosterData()
})

function playerLabel(p: RosterCandidate['player']) {
  return `${p.lastName} ${p.firstName}`.trim()
}

function birthYear(birthDate?: string | null) {
  if (!birthDate) return '—'
  const y = new Date(birthDate).getUTCFullYear()
  return Number.isFinite(y) ? String(y) : '—'
}

async function loadRosterData() {
  if (!token.value || !selectedTeamId.value) return
  loading.value = true
  loadError.value = null
  try {
    const [candRes, rosterRes] = await Promise.all([
      authFetch<{ items: RosterCandidate[] }>(
        apiUrl(
          `/tournaments/${props.tournamentId}/teams/${selectedTeamId.value}/roster/candidates`,
        ),
        { headers: { Authorization: `Bearer ${token.value}` } },
      ),
      authFetch<{
        items: RosterRow[]
        limits: {
          minPlayers: number | null
          maxPlayers: number | null
          deadlineAt: string | null
        }
      }>(
        apiUrl(`/tournaments/${props.tournamentId}/teams/${selectedTeamId.value}/roster`),
        { headers: { Authorization: `Bearer ${token.value}` } },
      ),
    ])
    candidates.value = candRes.items ?? []
    rosterItems.value = rosterRes.items ?? []
    limits.value = rosterRes.limits ?? null
    selectedPlayerIds.value = rosterItems.value.map((r) => r.playerId)
  } catch (e: unknown) {
    loadError.value = getApiErrorMessage(e, t('admin.tournament_roster.load_error'))
    candidates.value = []
    rosterItems.value = []
    selectedPlayerIds.value = []
  } finally {
    loading.value = false
  }
}

function togglePlayer(playerId: string, eligible: boolean) {
  if (!props.canManage || !eligible) return
  const set = new Set(selectedPlayerIds.value)
  if (set.has(playerId)) set.delete(playerId)
  else set.add(playerId)
  selectedPlayerIds.value = [...set]
}

async function saveRoster() {
  if (!token.value || !selectedTeamId.value || !props.canManage) return
  saving.value = true
  try {
    const jerseyByPlayer = new Map(
      rosterItems.value.map((r) => [r.playerId, r.jerseyNumber] as const),
    )
  const players = selectedPlayerIds.value.map((playerId) => {
      const fromCand = candidates.value.find((c) => c.playerId === playerId)
      const jerseyNumber = jerseyByPlayer.get(playerId) ?? fromCand?.jerseyNumber ?? undefined
      return {
        playerId,
        ...(jerseyNumber != null ? { jerseyNumber } : {}),
      }
    })
    const res = await authFetch<{
      items: RosterRow[]
      limits: {
        minPlayers: number | null
        maxPlayers: number | null
        deadlineAt: string | null
      }
    }>(apiUrl(`/tournaments/${props.tournamentId}/teams/${selectedTeamId.value}/roster`), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { players },
    })
    rosterItems.value = res.items ?? []
    limits.value = res.limits ?? null
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_roster.saved'),
      life: 3000,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_roster.save_error'),
      detail: getApiErrorMessage(e),
      life: 6500,
    })
  } finally {
    saving.value = false
  }
}

async function submitRoster() {
  if (!token.value || !selectedTeamId.value || !props.canManage) return
  submitting.value = true
  try {
    await saveRoster()
    const res = await authFetch<{
      items: RosterRow[]
      limits: {
        minPlayers: number | null
        maxPlayers: number | null
        deadlineAt: string | null
      }
    }>(
      apiUrl(
        `/tournaments/${props.tournamentId}/teams/${selectedTeamId.value}/roster/submit`,
      ),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
      },
    )
    rosterItems.value = res.items ?? []
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_roster.submitted'),
      life: 3000,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_roster.submit_error'),
      detail: getApiErrorMessage(e),
      life: 6500,
    })
  } finally {
    submitting.value = false
  }
}

function onCsvFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  csvFile.value = input.files?.[0] ?? null
  importErrors.value = []
  input.value = ''
}

async function downloadTemplate() {
  if (!token.value || !selectedTeamId.value || !props.canManage) return
  templateDownloading.value = true
  try {
    const blob = await authFetchBlob(
      apiUrl(
        `/tournaments/${props.tournamentId}/teams/${selectedTeamId.value}/roster/template.csv`,
      ),
    )
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = 'tournament-roster-template.csv'
    a.click()
    URL.revokeObjectURL(href)
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_roster.template_download_error'),
      detail: getApiErrorMessage(e),
      life: 6500,
    })
  } finally {
    templateDownloading.value = false
  }
}

async function importCsv() {
  if (!token.value || !selectedTeamId.value || !props.canManage || !csvFile.value) return
  csvImporting.value = true
  importErrors.value = []
  try {
    const csvText = await csvFile.value.text()
    const res = await authFetch<{
      imported: number
      skipped: number
      errors: Array<{ row: number; message: string }>
      roster: {
        items: RosterRow[]
        limits: {
          minPlayers: number | null
          maxPlayers: number | null
          deadlineAt: string | null
        }
      }
    }>(
      apiUrl(
        `/tournaments/${props.tournamentId}/teams/${selectedTeamId.value}/roster/import-csv`,
      ),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { csvText, createMissingPlayers: createMissingPlayers.value },
      },
    )
    rosterItems.value = res.roster?.items ?? []
    limits.value = res.roster?.limits ?? null
    selectedPlayerIds.value = rosterItems.value.map((r) => r.playerId)
    importErrors.value = res.errors ?? []
    csvFile.value = null
    const summary =
      res.skipped > 0
        ? t('admin.tournament_roster.import_partial', {
            imported: res.imported,
            skipped: res.skipped,
          })
        : t('admin.tournament_roster.import_success', { count: res.imported })
    toast.add({
      severity: res.skipped > 0 ? 'warn' : 'success',
      summary,
      life: 6000,
    })
    await loadRosterData()
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_roster.import_error'),
      detail: getApiErrorMessage(e),
      life: 6500,
    })
  } finally {
    csvImporting.value = false
  }
}

onMounted(() => {
  if (selectedTeamId.value) void loadRosterData()
})
</script>

<template>
  <div
    class="rounded-xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
          {{ t('admin.tournament_roster.title') }}
        </h2>
        <p class="mt-1 text-xs leading-relaxed text-muted-color">
          {{ t('admin.tournament_roster.lead') }}
        </p>
      </div>
      <Tag
        v-if="rosterStatus === 'SUBMITTED'"
        severity="success"
        :value="t('admin.tournament_roster.status_submitted')"
      />
    </div>

    <div v-if="!teams.length" class="mt-4 text-sm text-muted-color">
      {{ t('admin.tournament_roster.no_teams') }}
    </div>

    <template v-else>
      <div class="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-color">{{ t('admin.tournament_roster.pick_team') }}</label>
          <Select
            v-model="selectedTeamId"
            :options="teamOptions"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </div>
        <div class="text-sm font-medium tabular-nums text-surface-900 dark:text-surface-0">
          {{ countLabel }}
        </div>
      </div>

      <div
        v-if="canManage && selectedTeamId"
        class="mt-3 flex flex-col gap-3 rounded-lg border border-dashed border-surface-300 p-3 dark:border-surface-600"
      >
        <div class="flex flex-wrap gap-2">
          <Button
            :label="t('admin.tournament_roster.download_template')"
            icon="pi pi-download"
            size="small"
            outlined
            :loading="templateDownloading"
            @click="downloadTemplate"
          />
          <label class="inline-flex cursor-pointer items-center gap-2">
            <input
              type="file"
              accept=".csv,text/csv"
              class="hidden"
              @change="onCsvFileChange"
            />
            <Button
              as="span"
              :label="csvFile?.name ?? t('admin.tournament_roster.pick_csv_file')"
              icon="pi pi-file"
              size="small"
              outlined
              severity="secondary"
            />
          </label>
          <Button
            :label="t('admin.tournament_roster.import_csv')"
            icon="pi pi-upload"
            size="small"
            :loading="csvImporting"
            :disabled="!csvFile"
            @click="importCsv"
          />
        </div>
        <div class="flex items-center gap-2">
          <Checkbox v-model="createMissingPlayers" input-id="roster-create-missing" binary />
          <label for="roster-create-missing" class="text-xs text-muted-color">
            {{ t('admin.tournament_roster.import_create_missing') }}
          </label>
        </div>
        <Message v-if="importErrors.length" severity="warn" :closable="false" class="text-xs">
          <ul class="list-inside list-disc">
            <li v-for="err in importErrors.slice(0, 8)" :key="`${err.row}-${err.message}`">
              {{ err.row }}: {{ err.message }}
            </li>
          </ul>
        </Message>
      </div>

      <Message v-if="loadError" severity="error" class="mt-3" :closable="false">
        {{ loadError }}
      </Message>

      <div v-else class="mt-3 overflow-x-auto">
        <DataTable
          :value="candidates"
          :loading="loading"
          data-key="playerId"
          striped-rows
          :empty-message="t('admin.tournament_roster.empty_candidates')"
        >
          <Column style="width: 3rem">
            <template #body="{ data }">
              <Checkbox
                :model-value="selectedPlayerIds.includes(data.playerId)"
                :binary="true"
                :disabled="!canManage || !data.eligible"
                @update:model-value="() => togglePlayer(data.playerId, data.eligible)"
              />
            </template>
          </Column>
          <Column :header="t('admin.tournament_roster.col_player')">
            <template #body="{ data }">
              <span :class="data.eligible ? '' : 'text-muted-color line-through'">
                {{ playerLabel(data.player) }}
              </span>
            </template>
          </Column>
          <Column :header="t('admin.tournament_roster.col_birth_year')" style="width: 6rem">
            <template #body="{ data }">
              {{ birthYear(data.player.birthDate) }}
            </template>
          </Column>
          <Column :header="t('admin.tournament_roster.col_number')" style="width: 5rem">
            <template #body="{ data }">
              {{ data.jerseyNumber ?? '—' }}
            </template>
          </Column>
          <Column :header="t('admin.tournament_roster.col_eligibility')">
            <template #body="{ data }">
              <Tag
                v-if="data.eligible"
                severity="success"
                :value="t('admin.tournament_roster.eligible')"
              />
              <span v-else class="text-xs text-red-500">{{ data.reason }}</span>
            </template>
          </Column>
        </DataTable>
      </div>

      <div v-if="canManage && candidates.length" class="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          :label="t('admin.tournament_roster.save')"
          icon="pi pi-save"
          outlined
          :loading="saving"
          @click="saveRoster"
        />
        <Button
          :label="t('admin.tournament_roster.submit')"
          icon="pi pi-check"
          :loading="submitting"
          @click="submitRoster"
        />
      </div>
    </template>
  </div>
</template>

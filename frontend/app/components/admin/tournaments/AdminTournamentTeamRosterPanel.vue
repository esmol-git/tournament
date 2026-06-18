<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { getApiErrorMessage } from '~/utils/apiError'
import { displayTeamNameForUi } from '~/utils/teamDisplayName'
import AdminTournamentTeamLogo from '~/app/components/admin/tournaments/AdminTournamentTeamLogo.vue'
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
    photoUrl?: string | null
  }
}

type RosterRow = {
  playerId: string
  jerseyNumber: number | null
  status: string
  sanctionNote?: string | null
  sanctionedAt?: string | null
  suspendedMatchesRemaining?: number
  yellowCardsAccumulated?: number
  player: RosterCandidate['player']
}

const props = defineProps<{
  tournamentId: string
  tournament: TournamentDetails
  teams: Array<{ teamId: string; team: { id: string; name: string; logoUrl?: string | null } }>
  canManage: boolean
}>()

const emit = defineEmits<{
  updated: []
}>()

const { token, authFetch, authFetchBlob } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()
const { t } = useI18n()

const selectedTeamId = ref<string | null>(null)
const loading = ref(false)
const saving = ref(false)
const submitting = ref(false)
const confirmingAll = ref(false)
const templateDownloading = ref(false)
const csvImporting = ref(false)
const xlsxImporting = ref(false)
const sanctioningPlayerId = ref<string | null>(null)
const createMissingPlayers = ref(true)
const csvFile = ref<File | null>(null)
const xlsxFile = ref<File | null>(null)
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

type RosterSummaryItem = {
  teamId: string
  teamName: string
  playerCount: number
  status: string
  ok: boolean
  reason?: string
}

const rosterSummary = ref<{
  items: RosterSummaryItem[]
  allConfirmed: boolean
  requiresRoster: boolean
} | null>(null)

const eligibleCandidates = computed(() => candidates.value.filter((c) => c.eligible))

const eligibleSelectedCount = computed(
  () => eligibleCandidates.value.filter((c) => selectedPlayerIds.value.includes(c.playerId)).length,
)

const allEligibleSelected = computed(() => {
  if (!eligibleCandidates.value.length) return false
  const max = limits.value?.maxPlayers
  const limit = max != null ? Math.min(max, eligibleCandidates.value.length) : eligibleCandidates.value.length
  return eligibleSelectedCount.value >= limit
})

const selectAllIndeterminate = computed(() => {
  const n = eligibleSelectedCount.value
  const max = limits.value?.maxPlayers
  const target = max != null ? Math.min(max, eligibleCandidates.value.length) : eligibleCandidates.value.length
  return n > 0 && n < target
})

const unconfirmedTeamsCount = computed(
  () => rosterSummary.value?.items.filter((i) => !i.ok).length ?? 0,
)

const teamOptions = computed(() =>
  props.teams.map((tt) => ({
    label: tt.team.name,
    value: tt.teamId,
    logoUrl: tt.team.logoUrl ?? null,
  })),
)

const selectedTeamOption = computed(() =>
  teamOptions.value.find((o) => o.value === selectedTeamId.value) ?? null,
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

const rosterStatusByPlayer = computed(() => {
  const map = new Map<
    string,
    {
      status: string
      sanctionNote?: string | null
      suspendedMatchesRemaining?: number
      yellowCardsAccumulated?: number
    }
  >()
  for (const row of rosterItems.value) {
    map.set(row.playerId, {
      status: row.status,
      sanctionNote: row.sanctionNote,
      suspendedMatchesRemaining: row.suspendedMatchesRemaining,
      yellowCardsAccumulated: row.yellowCardsAccumulated,
    })
  }
  return map
})

const showSanctionActions = computed(() =>
  rosterItems.value.some(
    (r) => r.status === 'SUBMITTED' || r.status === 'DISQUALIFIED' || r.status === 'APPROVED',
  ),
)

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

watch(
  () => props.teams,
  () => {
    void loadRosterSummary()
  },
  { deep: true },
)

function toggleSelectAllEligible() {
  if (!props.canManage) return
  const eligibleIds = eligibleCandidates.value.map((c) => c.playerId)
  const max = limits.value?.maxPlayers
  const targetIds =
    max != null ? eligibleIds.slice(0, max) : eligibleIds

  if (allEligibleSelected.value) {
    const remove = new Set(targetIds)
    selectedPlayerIds.value = selectedPlayerIds.value.filter((id) => !remove.has(id))
    return
  }

  selectedPlayerIds.value = [...new Set([...selectedPlayerIds.value, ...targetIds])]
}

function playerLabel(p: RosterCandidate['player']) {
  return `${p.lastName} ${p.firstName}`.trim()
}

function birthYear(birthDate?: string | null) {
  if (!birthDate) return '—'
  const y = new Date(birthDate).getUTCFullYear()
  return Number.isFinite(y) ? String(y) : '—'
}

async function loadRosterSummary() {
  if (!token.value || !props.teams.length) {
    rosterSummary.value = null
    return
  }
  try {
    rosterSummary.value = await authFetch<{
      items: RosterSummaryItem[]
      allConfirmed: boolean
      requiresRoster: boolean
    }>(apiUrl(`/tournaments/${props.tournamentId}/roster/summary`), {
      headers: { Authorization: `Bearer ${token.value}` },
    })
  } catch {
    rosterSummary.value = null
  }
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
  void loadRosterSummary()
}

function togglePlayer(playerId: string, eligible: boolean) {
  if (!props.canManage || !eligible) return
  if (rosterStatusByPlayer.value.get(playerId)?.status === 'DISQUALIFIED') return
  const set = new Set(selectedPlayerIds.value)
  if (set.has(playerId)) set.delete(playerId)
  else set.add(playerId)
  selectedPlayerIds.value = [...set]
}

function isPlayerDisqualified(playerId: string) {
  return rosterStatusByPlayer.value.get(playerId)?.status === 'DISQUALIFIED'
}

function canDisqualifyPlayer(playerId: string) {
  const status = rosterStatusByPlayer.value.get(playerId)?.status
  return status === 'SUBMITTED' || status === 'APPROVED'
}

async function setPlayerSanction(playerId: string, disqualified: boolean) {
  if (!token.value || !selectedTeamId.value || !props.canManage) return
  let note: string | undefined
  if (disqualified) {
    const promptNote = window.prompt(t('admin.tournament_roster.sanction_note_prompt'))
    if (promptNote === null) return
    note = promptNote.trim() || undefined
  }
  sanctioningPlayerId.value = playerId
  try {
    const updated = await authFetch<RosterRow>(
      apiUrl(
        `/tournaments/${props.tournamentId}/teams/${selectedTeamId.value}/roster/players/${playerId}/sanction`,
      ),
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { disqualified, note },
      },
    )
    const idx = rosterItems.value.findIndex((r) => r.playerId === playerId)
    if (idx >= 0) rosterItems.value[idx] = { ...rosterItems.value[idx]!, ...updated }
    toast.add({
      severity: 'success',
      summary: disqualified
        ? t('admin.tournament_roster.sanction_disqualified')
        : t('admin.tournament_roster.sanction_reinstated'),
      life: 3000,
    })
    emit('updated')
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_roster.sanction_error'),
      detail: getApiErrorMessage(e),
      life: 6500,
    })
  } finally {
    sanctioningPlayerId.value = null
  }
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
    emit('updated')
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
    emit('updated')
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
  xlsxFile.value = null
  importErrors.value = []
  input.value = ''
}

function onXlsxFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  xlsxFile.value = input.files?.[0] ?? null
  csvFile.value = null
  importErrors.value = []
  input.value = ''
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
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

function importToastSummary(imported: number, skipped: number) {
  if (imported === 0 && skipped > 0) {
    return t('admin.tournament_roster.import_all_duplicates')
  }
  if (skipped > 0) {
    return t('admin.tournament_roster.import_partial', { imported, skipped })
  }
  return t('admin.tournament_roster.import_success', { count: imported })
}

function importToastSeverity(imported: number, skipped: number) {
  if (imported === 0 && skipped > 0) return 'info' as const
  if (skipped > 0) return 'warn' as const
  return 'success' as const
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
    const summary = importToastSummary(res.imported, res.skipped)
    toast.add({
      severity: importToastSeverity(res.imported, res.skipped),
      summary,
      life: 6000,
    })
    await loadRosterData()
    emit('updated')
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

async function importXlsx() {
  if (!token.value || !selectedTeamId.value || !props.canManage || !xlsxFile.value) return
  xlsxImporting.value = true
  importErrors.value = []
  try {
    const fileBase64 = await fileToBase64(xlsxFile.value)
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
        `/tournaments/${props.tournamentId}/teams/${selectedTeamId.value}/roster/import-xlsx`,
      ),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { fileBase64, createMissingPlayers: createMissingPlayers.value },
      },
    )
    rosterItems.value = res.roster?.items ?? []
    limits.value = res.roster?.limits ?? null
    selectedPlayerIds.value = rosterItems.value.map((r) => r.playerId)
    importErrors.value = res.errors ?? []
    xlsxFile.value = null
    const summary = importToastSummary(res.imported, res.skipped)
    toast.add({
      severity: importToastSeverity(res.imported, res.skipped),
      summary,
      life: 6000,
    })
    await loadRosterData()
    emit('updated')
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_roster.import_xlsx_error'),
      detail: getApiErrorMessage(e),
      life: 6500,
    })
  } finally {
    xlsxImporting.value = false
  }
}

async function confirmAllRosters() {
  if (!token.value || !props.canManage) return
  confirmingAll.value = true
  try {
    const res = await authFetch<{
      confirmed: number
      failed: number
      results: Array<{ teamName: string; ok: boolean; message?: string }>
      summary: {
        items: RosterSummaryItem[]
        allConfirmed: boolean
        requiresRoster: boolean
      }
    }>(apiUrl(`/tournaments/${props.tournamentId}/roster/confirm-all`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    rosterSummary.value = res.summary ?? rosterSummary.value
    if (selectedTeamId.value) await loadRosterData()
    else void loadRosterSummary()
    const errPreview = res.results
      .filter((r) => !r.ok)
      .slice(0, 3)
      .map((r) => `${r.teamName}: ${r.message ?? '—'}`)
      .join('; ')
    toast.add({
      severity: res.failed > 0 ? 'warn' : 'success',
      summary: t('admin.tournament_roster.confirm_all_done', {
        confirmed: res.confirmed,
        failed: res.failed,
      }),
      detail: errPreview || undefined,
      life: 8000,
    })
    emit('updated')
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_roster.confirm_all_error'),
      detail: getApiErrorMessage(e),
      life: 6500,
    })
  } finally {
    confirmingAll.value = false
  }
}

onMounted(() => {
  if (selectedTeamId.value) void loadRosterData()
  else void loadRosterSummary()
})
</script>

<template>
  <div
    class="rounded-xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
            {{ t('admin.tournament_roster.title') }}
          </h2>
          <span
            v-if="rosterSummary?.items?.length"
            class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
            :class="
              rosterSummary.allConfirmed
                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
            "
          >
            {{
              t(
                rosterSummary.allConfirmed
                  ? 'admin.tournament_roster.rosters_confirmed_badge'
                  : 'admin.tournament_roster.rosters_pending_badge',
                {
                  confirmed: rosterSummary.items.filter((i) => i.ok).length,
                  total: rosterSummary.items.length,
                },
              )
            }}
          </span>
        </div>
        <p class="mt-1.5 text-xs leading-relaxed text-muted-color">
          {{ t('admin.tournament_roster.lead') }}
        </p>
      </div>
      <Button
        v-if="canManage && teams.length > 1 && rosterSummary?.requiresRoster"
        :label="t('admin.tournament_roster.confirm_all')"
        icon="pi pi-check-circle"
        size="small"
        :loading="confirmingAll"
        :disabled="rosterSummary.allConfirmed"
        @click="confirmAllRosters"
      />
    </div>

    <div v-if="!teams.length" class="mt-4 rounded-lg border border-dashed border-surface-300 px-4 py-8 text-center dark:border-surface-600">
      <i class="pi pi-users mb-2 text-2xl text-muted-color" />
      <p class="text-sm text-muted-color">{{ t('admin.tournament_roster.no_teams') }}</p>
    </div>

    <template v-else>
      <div class="mt-4 flex flex-col gap-1">
        <label class="text-[10px] font-medium uppercase tracking-wide text-muted-color">
          {{ t('admin.tournament_roster.pick_team') }}
        </label>
        <Select
          v-model="selectedTeamId"
          :options="teamOptions"
          option-label="label"
          option-value="value"
          class="w-full"
        >
          <template #option="{ option }">
            <div class="flex items-center gap-2 py-0.5">
              <AdminTournamentTeamLogo :logo-url="option.logoUrl" :name="option.label" size="sm" />
              <span>{{ displayTeamNameForUi(option.label) }}</span>
            </div>
          </template>
          <template #value="{ value }">
            <div v-if="value" class="flex items-center gap-2">
              <AdminTournamentTeamLogo
                :logo-url="teamOptions.find((o) => o.value === value)?.logoUrl"
                size="sm"
              />
              <span>{{
                displayTeamNameForUi(teamOptions.find((o) => o.value === value)?.label ?? '')
              }}</span>
            </div>
          </template>
        </Select>
      </div>

      <div
        v-if="selectedTeamOption"
        class="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-surface-200 bg-surface-50/80 px-3 py-3 dark:border-surface-700 dark:bg-surface-900/50"
      >
        <AdminTournamentTeamLogo
          :logo-url="selectedTeamOption.logoUrl"
          :name="selectedTeamOption.label"
          size="md"
        />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-semibold text-surface-900 dark:text-surface-0">
            {{ displayTeamNameForUi(selectedTeamOption.label) }}
          </div>
          <div class="mt-0.5 text-xs tabular-nums text-muted-color">{{ countLabel }}</div>
        </div>
        <Tag
          v-if="rosterStatus === 'SUBMITTED'"
          severity="success"
          :value="t('admin.tournament_roster.status_submitted')"
        />
        <Tag
          v-else
          severity="secondary"
          :value="t('admin.tournament_roster.status_draft')"
        />
      </div>

      <div
        v-if="canManage && selectedTeamId"
        class="mt-3 rounded-xl border border-surface-200 bg-surface-50/60 p-3 dark:border-surface-700 dark:bg-surface-900/40"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 class="text-xs font-semibold text-surface-900 dark:text-surface-0">
              {{ t('admin.tournament_roster.import_section_title') }}
            </h3>
            <p class="mt-1 max-w-prose text-[11px] leading-relaxed text-muted-color">
              {{ t('admin.tournament_roster.import_section_lead') }}
            </p>
          </div>
          <Button
            :label="t('admin.tournament_roster.download_template')"
            icon="pi pi-download"
            size="small"
            text
            :loading="templateDownloading"
            @click="downloadTemplate"
          />
        </div>

        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <div class="flex flex-wrap items-center gap-2 rounded-lg border border-surface-200 bg-surface-0 px-2.5 py-2 dark:border-surface-600 dark:bg-surface-900">
            <label class="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <input type="file" accept=".csv,text/csv" class="hidden" @change="onCsvFileChange" />
              <Button
                as="span"
                :label="csvFile?.name ?? t('admin.tournament_roster.pick_csv_file')"
                icon="pi pi-file"
                size="small"
                outlined
                severity="secondary"
                class="max-w-full truncate"
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
          <div class="flex flex-wrap items-center gap-2 rounded-lg border border-surface-200 bg-surface-0 px-2.5 py-2 dark:border-surface-600 dark:bg-surface-900">
            <label class="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                class="hidden"
                @change="onXlsxFileChange"
              />
              <Button
                as="span"
                :label="xlsxFile?.name ?? t('admin.tournament_roster.pick_xlsx_file')"
                icon="pi pi-file-excel"
                size="small"
                outlined
                severity="secondary"
                class="max-w-full truncate"
              />
            </label>
            <Button
              :label="t('admin.tournament_roster.import_xlsx')"
              icon="pi pi-upload"
              size="small"
              :loading="xlsxImporting"
              :disabled="!xlsxFile"
              @click="importXlsx"
            />
          </div>
        </div>

        <div class="mt-2.5 flex items-start gap-2">
          <Checkbox v-model="createMissingPlayers" input-id="roster-create-missing" binary />
          <label for="roster-create-missing" class="text-[11px] leading-relaxed text-muted-color">
            {{ t('admin.tournament_roster.import_create_missing') }}
          </label>
        </div>

        <Message v-if="importErrors.length" severity="warn" :closable="false" class="mt-2 text-xs">
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

      <div v-else class="mt-3">
        <div
          v-if="loading"
          class="flex items-center justify-center rounded-xl border border-surface-200 py-12 dark:border-surface-700"
        >
          <ProgressSpinner style="width: 2rem; height: 2rem" stroke-width="4" />
        </div>

        <div
          v-else-if="!candidates.length"
          class="rounded-lg border border-dashed border-surface-300 px-4 py-8 text-center dark:border-surface-600"
        >
          <i class="pi pi-user mb-2 text-2xl text-muted-color" />
          <p class="text-sm text-muted-color">{{ t('admin.tournament_roster.empty_candidates') }}</p>
        </div>

        <div v-else class="space-y-1.5">
          <div
            v-if="canManage && eligibleCandidates.length"
            class="flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-50/50 px-3 py-2 dark:border-surface-700 dark:bg-surface-900/30"
          >
            <Checkbox
              :model-value="allEligibleSelected"
              :indeterminate="selectAllIndeterminate"
              :binary="true"
              :disabled="!eligibleCandidates.length"
              :aria-label="t('admin.tournament_roster.select_all_eligible')"
              @update:model-value="toggleSelectAllEligible"
            />
            <span class="text-xs text-muted-color">
              {{ t('admin.tournament_roster.select_all_eligible') }}
            </span>
          </div>

          <div
            v-for="data in candidates"
            :key="data.playerId"
            class="flex flex-wrap items-center gap-3 rounded-xl border border-surface-200 bg-surface-0 px-3 py-2.5 transition-colors hover:border-surface-300 dark:border-surface-700 dark:bg-surface-900/30 dark:hover:border-surface-600"
            :class="
              selectedPlayerIds.includes(data.playerId) && data.eligible && !isPlayerDisqualified(data.playerId)
                ? 'border-primary-200 bg-primary-50/30 dark:border-primary-800/50 dark:bg-primary-900/10'
                : ''
            "
          >
            <Checkbox
              :model-value="selectedPlayerIds.includes(data.playerId)"
              :binary="true"
              :disabled="!canManage || !data.eligible || isPlayerDisqualified(data.playerId)"
              @update:model-value="() => togglePlayer(data.playerId, data.eligible)"
            />

            <RemoteImage
              :src="data.player.photoUrl"
              :alt="playerLabel(data.player)"
              placeholder-icon="user"
              class="h-10 w-10 shrink-0 rounded-lg"
              fit="cover"
            />

            <div class="min-w-0 flex-1">
              <div
                class="truncate text-sm font-medium"
                :class="
                  data.eligible && !isPlayerDisqualified(data.playerId)
                    ? 'text-surface-900 dark:text-surface-0'
                    : 'text-muted-color line-through'
                "
              >
                {{ playerLabel(data.player) }}
              </div>
              <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-color">
                <span>{{ t('admin.tournament_roster.col_birth_year') }}: {{ birthYear(data.player.birthDate) }}</span>
                <span>{{ t('admin.tournament_roster.col_number') }}: {{ data.jerseyNumber ?? '—' }}</span>
              </div>
              <span
                v-if="rosterStatusByPlayer.get(data.playerId)?.sanctionNote"
                class="mt-0.5 block text-xs text-red-500"
              >
                {{ rosterStatusByPlayer.get(data.playerId)?.sanctionNote }}
              </span>
              <span
                v-if="(rosterStatusByPlayer.get(data.playerId)?.suspendedMatchesRemaining ?? 0) > 0"
                class="mt-0.5 block text-xs text-amber-600 dark:text-amber-400"
              >
                {{
                  t('admin.tournament_roster.card_suspension_badge', {
                    count: rosterStatusByPlayer.get(data.playerId)?.suspendedMatchesRemaining ?? 0,
                  })
                }}
              </span>
              <span
                v-if="
                  props.tournament.cardAutoBanEnabled &&
                  (rosterStatusByPlayer.get(data.playerId)?.yellowCardsAccumulated ?? 0) > 0
                "
                class="mt-0.5 block text-[11px] text-muted-color"
              >
                {{
                  t('admin.tournament_roster.yellow_accumulated', {
                    count: rosterStatusByPlayer.get(data.playerId)?.yellowCardsAccumulated ?? 0,
                  })
                }}
              </span>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <Tag
                v-if="isPlayerDisqualified(data.playerId)"
                severity="danger"
                :value="t('admin.tournament_roster.status_disqualified')"
              />
              <Tag
                v-else-if="data.eligible"
                severity="success"
                :value="t('admin.tournament_roster.eligible')"
              />
              <span v-else class="max-w-[10rem] text-right text-xs text-red-500">{{ data.reason }}</span>

              <div
                v-if="canManage && showSanctionActions && selectedPlayerIds.includes(data.playerId)"
                class="flex gap-1"
              >
                <Button
                  v-if="canDisqualifyPlayer(data.playerId)"
                  icon="pi pi-ban"
                  severity="danger"
                  text
                  rounded
                  size="small"
                  :loading="sanctioningPlayerId === data.playerId"
                  :aria-label="t('admin.tournament_roster.disqualify')"
                  @click="setPlayerSanction(data.playerId, true)"
                />
                <Button
                  v-else-if="isPlayerDisqualified(data.playerId)"
                  icon="pi pi-undo"
                  severity="success"
                  text
                  rounded
                  size="small"
                  :loading="sanctioningPlayerId === data.playerId"
                  :aria-label="t('admin.tournament_roster.reinstate')"
                  @click="setPlayerSanction(data.playerId, false)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="canManage && candidates.length"
        class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-surface-200 pt-4 dark:border-surface-700"
      >
        <span v-if="rosterSummary?.allConfirmed" class="text-xs text-muted-color">
          {{ t('admin.tournament_roster.all_confirmed') }}
        </span>
        <span v-else-if="unconfirmedTeamsCount > 0" class="text-xs text-muted-color">
          {{ t('admin.tournament_roster.unconfirmed_teams', { count: unconfirmedTeamsCount }) }}
        </span>
        <span v-else />
        <div class="flex flex-wrap justify-end gap-2">
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
      </div>
    </template>
  </div>
</template>

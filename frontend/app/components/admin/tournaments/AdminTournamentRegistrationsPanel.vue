<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useAdminTenantTeamsAllQuery } from '~/composables/admin/useAdminTenantListQueries'
import { getApiErrorMessage } from '~/utils/apiError'
import { formatUserListLabel } from '~/utils/userDisplayName'
import { displayTeamNameForUi } from '~/utils/teamDisplayName'
import AdminTournamentTeamLogo from '~/app/components/admin/tournaments/AdminTournamentTeamLogo.vue'
import type { TournamentDetails } from '~/types/tournament-admin'

export type TournamentRegistrationRow = {
  id: string
  tournamentId: string
  teamId: string
  status: string
  message?: string | null
  adminNote?: string | null
  attachmentUrl?: string | null
  attachmentFileName?: string | null
  submittedAt?: string | null
  reviewedAt?: string | null
  team: { id: string; name: string; slug?: string | null; logoUrl?: string | null }
  submittedBy?: {
    id: string
    name: string
    lastName?: string | null
    username?: string
  } | null
  reviewedBy?: {
    id: string
    name: string
    lastName?: string | null
    username?: string
  } | null
}

const props = defineProps<{
  tournamentId: string
  tournament: TournamentDetails
  canManage: boolean
}>()

const emit = defineEmits<{
  updated: []
  'settings-saved': []
}>()

const { token, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const { teams: catalogTeams } = useAdminTenantTeamsAllQuery()
const toast = useToast()
const { t } = useI18n()

const loading = ref(false)
const savingSettings = ref(false)
const creatingRegistration = ref(false)
const addDialogVisible = ref(false)
const newTeamId = ref<string | null>(null)
const newMessage = ref('')
const newAttachmentFile = ref<File | null>(null)
const attachmentUploading = ref(false)
const items = ref<TournamentRegistrationRow[]>([])
const loadError = ref<string | null>(null)

const registrationEnabled = ref(false)
const registrationOpensAt = ref<Date | null>(null)
const registrationClosesAt = ref<Date | null>(null)
const maxTeams = ref<number | null>(null)

watch(
  () => props.tournament,
  (tRow) => {
    if (!tRow) return
    registrationEnabled.value = !!tRow.registrationEnabled
    registrationOpensAt.value = tRow.registrationOpensAt
      ? new Date(tRow.registrationOpensAt)
      : null
    registrationClosesAt.value = tRow.registrationClosesAt
      ? new Date(tRow.registrationClosesAt)
      : null
    maxTeams.value =
      typeof tRow.maxTeams === 'number' && tRow.maxTeams > 0 ? tRow.maxTeams : null
  },
  { immediate: true },
)

const statusLabel = (status: string) => {
  const key = `admin.tournament_registrations.status_${status.toLowerCase()}`
  const translated = t(key)
  return translated === key ? status : translated
}

const statusSeverity = (status: string) => {
  switch (status) {
    case 'APPROVED':
      return 'success'
    case 'SUBMITTED':
      return 'info'
    case 'WAITLIST':
      return 'warn'
    case 'REJECTED':
      return 'danger'
    case 'WITHDRAWN':
      return 'secondary'
    default:
      return 'contrast'
  }
}

const pendingCount = computed(
  () => items.value.filter((r) => r.status === 'SUBMITTED').length,
)

const registeredTeamIds = computed(() => {
  const blocked = new Set<string>()
  for (const row of items.value) {
    if (
      row.status === 'SUBMITTED' ||
      row.status === 'WAITLIST' ||
      row.status === 'APPROVED' ||
      row.status === 'DRAFT'
    ) {
      blocked.add(row.teamId)
    }
  }
  for (const tt of props.tournament.tournamentTeams ?? []) {
    blocked.add(tt.teamId)
  }
  return blocked
})

const availableTeamOptions = computed(() =>
  catalogTeams.value
    .filter((team) => !registeredTeamIds.value.has(team.id))
    .map((team) => ({
      label: team.name,
      value: team.id,
      logoUrl: team.logoUrl ?? null,
    })),
)

function openAddDialog() {
  newTeamId.value = availableTeamOptions.value[0]?.value ?? null
  newMessage.value = ''
  newAttachmentFile.value = null
  addDialogVisible.value = true
}

function onAttachmentFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  newAttachmentFile.value = input.files?.[0] ?? null
  input.value = ''
}

async function uploadRegistrationAttachment(file: File) {
  const body = new FormData()
  body.append('file', file)
  const res = await authFetch<{ key: string; url: string }>(
    apiUrl('/upload?folder=registrations'),
    { method: 'POST', body },
  )
  return { url: res.url, fileName: file.name }
}

async function createRegistration() {
  if (!token.value || !props.canManage || !newTeamId.value) return
  creatingRegistration.value = true
  try {
    let attachmentUrl: string | undefined
    let attachmentFileName: string | undefined
    if (newAttachmentFile.value) {
      attachmentUploading.value = true
      try {
        const uploaded = await uploadRegistrationAttachment(newAttachmentFile.value)
        attachmentUrl = uploaded.url
        attachmentFileName = uploaded.fileName
      } finally {
        attachmentUploading.value = false
      }
    }
    await authFetch(apiUrl(`/tournaments/${props.tournamentId}/registrations`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
      body: {
        teamId: newTeamId.value,
        ...(newMessage.value.trim() ? { message: newMessage.value.trim() } : {}),
        ...(attachmentUrl ? { attachmentUrl, attachmentFileName } : {}),
      },
    })
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_registrations.add_registration_success'),
      life: 3000,
    })
    addDialogVisible.value = false
    await fetchRegistrations()
    emit('updated')
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_registrations.add_registration_error'),
      detail: getApiErrorMessage(e),
      life: 6500,
    })
  } finally {
    creatingRegistration.value = false
  }
}

async function fetchRegistrations() {
  if (!token.value) return
  loading.value = true
  loadError.value = null
  try {
    const res = await authFetch<{ items: TournamentRegistrationRow[] }>(
      apiUrl(`/tournaments/${props.tournamentId}/registrations`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
    items.value = res.items ?? []
  } catch (e: unknown) {
    loadError.value = getApiErrorMessage(e, t('admin.tournament_registrations.load_error'))
    items.value = []
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  if (!token.value || !props.canManage) return
  savingSettings.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${props.tournamentId}`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: {
        registrationEnabled: registrationEnabled.value,
        registrationOpensAt: registrationOpensAt.value?.toISOString() ?? null,
        registrationClosesAt: registrationClosesAt.value?.toISOString() ?? null,
        maxTeams: maxTeams.value,
      },
    })
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_registrations.settings_saved'),
      life: 3000,
    })
    emit('settings-saved')
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_registrations.settings_error'),
      detail: getApiErrorMessage(e),
      life: 6500,
    })
  } finally {
    savingSettings.value = false
  }
}

async function reviewRegistration(
  row: TournamentRegistrationRow,
  status: 'APPROVED' | 'REJECTED' | 'WAITLIST',
) {
  if (!token.value || !props.canManage) return
  let adminNote: string | undefined
  if (status === 'REJECTED') {
    const note = window.prompt(t('admin.tournament_registrations.reject_prompt'))
    if (note === null) return
    adminNote = note.trim() || undefined
  }
  try {
    await authFetch(
      apiUrl(`/tournaments/${props.tournamentId}/registrations/${row.id}/review`),
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { status, adminNote },
      },
    )
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_registrations.review_success'),
      life: 3000,
    })
    await fetchRegistrations()
    emit('updated')
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_registrations.review_error'),
      detail: getApiErrorMessage(e),
      life: 6500,
    })
  }
}

onMounted(() => {
  void fetchRegistrations()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="canManage"
      class="rounded-xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
            {{ t('admin.tournament_registrations.settings_title') }}
          </h2>
          <p class="mt-1 text-xs text-muted-color">
            {{ t('admin.tournament_registrations.settings_lead') }}
          </p>
        </div>
        <Tag
          v-if="pendingCount > 0"
          severity="warn"
          :value="t('admin.tournament_registrations.pending_badge', { count: pendingCount })"
        />
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <div class="flex items-center gap-2 md:col-span-2">
          <Checkbox v-model="registrationEnabled" input-id="reg-enabled" binary />
          <label for="reg-enabled" class="text-sm">
            {{ t('admin.tournament_registrations.enabled') }}
          </label>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-color">{{ t('admin.tournament_registrations.opens_at') }}</label>
          <DatePicker v-model="registrationOpensAt" show-time hour-format="24" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-color">{{ t('admin.tournament_registrations.closes_at') }}</label>
          <DatePicker v-model="registrationClosesAt" show-time hour-format="24" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-color">{{ t('admin.tournament_registrations.max_teams') }}</label>
          <InputNumber v-model="maxTeams" :min="2" :max="512" class="w-full" show-buttons />
        </div>
      </div>

      <div class="mt-4 flex justify-end">
        <Button
          :label="t('admin.tournament_registrations.save_settings')"
          icon="pi pi-save"
          :loading="savingSettings"
          @click="saveSettings"
        />
      </div>
    </div>

    <div class="rounded-xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
          {{ t('admin.tournament_registrations.list_title') }}
        </h2>
        <Button
          v-if="canManage"
          :label="t('admin.tournament_registrations.add_registration')"
          icon="pi pi-plus"
          size="small"
          :disabled="!availableTeamOptions.length"
          @click="openAddDialog"
        />
      </div>

      <Message v-if="loadError" severity="error" class="mt-3" :closable="false">
        {{ loadError }}
      </Message>

      <DataTable
        v-else
        :value="items"
        :loading="loading"
        data-key="id"
        class="mt-3"
        striped-rows
        :empty-message="t('admin.tournament_registrations.empty')"
      >
        <Column :header="t('admin.tournament_registrations.col_team')">
          <template #body="{ data }">
            <div class="flex items-center gap-2">
              <AdminTournamentTeamLogo
                :logo-url="data.team?.logoUrl"
                :name="data.team?.name"
                size="sm"
              />
              <span>{{ displayTeamNameForUi(data.team?.name ?? '') }}</span>
            </div>
          </template>
        </Column>
        <Column :header="t('admin.tournament_registrations.col_status')" style="width: 9rem">
          <template #body="{ data }">
            <Tag :severity="statusSeverity(data.status)" :value="statusLabel(data.status)" />
          </template>
        </Column>
        <Column :header="t('admin.tournament_registrations.col_message')">
          <template #body="{ data }">
            <span class="text-sm text-muted-color">{{ data.message || '—' }}</span>
          </template>
        </Column>
        <Column :header="t('admin.tournament_registrations.col_attachment')" style="width: 10rem">
          <template #body="{ data }">
            <a
              v-if="data.attachmentUrl"
              :href="data.attachmentUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <i class="pi pi-paperclip" aria-hidden="true" />
              {{ data.attachmentFileName || t('admin.tournament_registrations.attachment_link') }}
            </a>
            <span v-else class="text-muted-color">—</span>
          </template>
        </Column>
        <Column :header="t('admin.tournament_registrations.col_submitted')" style="width: 10rem">
          <template #body="{ data }">
            <span class="text-xs text-muted-color">
              {{
                data.submittedAt
                  ? new Date(data.submittedAt).toLocaleString()
                  : '—'
              }}
            </span>
          </template>
        </Column>
        <Column v-if="canManage" :header="t('admin.tournament_registrations.col_actions')" style="width: 14rem">
          <template #body="{ data }">
            <div v-if="data.status === 'SUBMITTED' || data.status === 'WAITLIST'" class="flex flex-wrap gap-1">
              <Button
                icon="pi pi-check"
                severity="success"
                text
                rounded
                :aria-label="t('admin.tournament_registrations.approve')"
                @click="reviewRegistration(data, 'APPROVED')"
              />
              <Button
                icon="pi pi-clock"
                severity="warn"
                text
                rounded
                :aria-label="t('admin.tournament_registrations.waitlist')"
                @click="reviewRegistration(data, 'WAITLIST')"
              />
              <Button
                icon="pi pi-times"
                severity="danger"
                text
                rounded
                :aria-label="t('admin.tournament_registrations.reject')"
                @click="reviewRegistration(data, 'REJECTED')"
              />
            </div>
            <span v-else-if="data.reviewedBy" class="text-xs text-muted-color">
              {{ formatUserListLabel(data.reviewedBy) }}
            </span>
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog
      v-model:visible="addDialogVisible"
      modal
      :header="t('admin.tournament_registrations.add_registration_title')"
      class="w-full max-w-md"
    >
      <p class="text-sm text-muted-color">
        {{ t('admin.tournament_registrations.add_registration_lead') }}
      </p>
      <div v-if="!availableTeamOptions.length" class="mt-4 text-sm text-muted-color">
        {{ t('admin.tournament_registrations.no_teams_available') }}
      </div>
      <div v-else class="mt-4 flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-color">
            {{ t('admin.tournament_registrations.pick_team') }}
          </label>
          <Select
            v-model="newTeamId"
            :options="availableTeamOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            filter
          >
            <template #option="{ option }">
              <div class="flex items-center gap-2 py-0.5">
                <AdminTournamentTeamLogo :logo-url="option.logoUrl" :name="option.label" size="sm" />
                <span>{{ displayTeamNameForUi(option.label) }}</span>
              </div>
            </template>
          </Select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-color">
            {{ t('admin.tournament_registrations.col_message') }}
          </label>
          <Textarea
            v-model="newMessage"
            rows="3"
            class="w-full"
            :placeholder="t('admin.tournament_registrations.message_placeholder')"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-color">
            {{ t('admin.tournament_registrations.attachment_label') }}
          </label>
          <label class="inline-flex cursor-pointer items-center gap-2">
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              class="hidden"
              @change="onAttachmentFileChange"
            />
            <Button
              as="span"
              :label="newAttachmentFile?.name ?? t('admin.tournament_registrations.pick_attachment')"
              icon="pi pi-paperclip"
              size="small"
              outlined
              severity="secondary"
            />
          </label>
          <p class="text-xs text-muted-color">
            {{ t('admin.tournament_registrations.attachment_hint') }}
          </p>
        </div>
      </div>
      <template #footer>
        <Button
          :label="t('admin.tournament_registrations.cancel')"
          text
          severity="secondary"
          @click="addDialogVisible = false"
        />
        <Button
          :label="t('admin.tournament_registrations.add_registration')"
          icon="pi pi-check"
          :loading="creatingRegistration || attachmentUploading"
          :disabled="!newTeamId"
          @click="createRegistration"
        />
      </template>
    </Dialog>
  </div>
</template>

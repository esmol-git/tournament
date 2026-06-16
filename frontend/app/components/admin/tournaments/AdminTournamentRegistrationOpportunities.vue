<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import { getApiErrorMessage } from '~/utils/apiError'

type OpportunityRow = {
  id: string
  name: string
  slug: string
  startsAt?: string | null
  endsAt?: string | null
  minTeams: number
  maxTeams?: number | null
  teamsCount: number
  ageGroup?: { id: string; name: string; shortLabel?: string | null } | null
  myRegistrations: Array<{
    id: string
    teamId: string
    status: string
    submittedAt?: string | null
  }>
  registrationOpen: boolean
}

const props = defineProps<{
  teamOptions: Array<{ id: string; name: string }>
}>()

const { token, authFetch, user } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()
const toast = useToast()
const { t } = useI18n()

const loading = ref(false)
const items = ref<OpportunityRow[]>([])
const selectedTeamByTournament = ref<Record<string, string>>({})
const messageByTournament = ref<Record<string, string>>({})
const actionLoadingId = ref<string | null>(null)

const isTeamAdmin = computed(() => user.value?.role === 'TEAM_ADMIN')

const statusLabel = (status: string) => {
  const key = `admin.tournament_registrations.status_${status.toLowerCase()}`
  const translated = t(key)
  return translated === key ? status : translated
}

async function fetchOpportunities() {
  if (!token.value || !isTeamAdmin.value) return
  loading.value = true
  try {
    const res = await authFetch<{ items: OpportunityRow[] }>(
      apiUrl(`/tenants/${tenantId.value}/tournaments/registration-opportunities`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
    items.value = res.items ?? []
    if (props.teamOptions.length === 1) {
      for (const row of items.value) {
        selectedTeamByTournament.value[row.id] = props.teamOptions[0]!.id
      }
    }
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_registrations.opportunities_load_error'),
      detail: getApiErrorMessage(e),
      life: 6500,
    })
  } finally {
    loading.value = false
  }
}

function myRegistration(row: OpportunityRow) {
  return row.myRegistrations[0] ?? null
}

async function applyToTournament(row: OpportunityRow, submit: boolean) {
  const teamId = selectedTeamByTournament.value[row.id]?.trim()
  if (!teamId) {
    toast.add({
      severity: 'warn',
      summary: t('admin.tournament_registrations.pick_team'),
      life: 4000,
    })
    return
  }
  if (!token.value) return
  actionLoadingId.value = row.id
  try {
    const existing = myRegistration(row)
    let regId = existing?.id
    if (!existing || existing.status === 'WITHDRAWN' || existing.status === 'REJECTED') {
      const created = await authFetch<{ id: string }>(
        apiUrl(`/tournaments/${row.id}/registrations`),
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token.value}` },
          body: {
            teamId,
            message: messageByTournament.value[row.id]?.trim() || undefined,
          },
        },
      )
      regId = created.id
    }
    if (submit && regId) {
      await authFetch(apiUrl(`/tournaments/${row.id}/registrations/${regId}/submit`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
      })
    }
    toast.add({
      severity: 'success',
      summary: submit
        ? t('admin.tournament_registrations.submitted')
        : t('admin.tournament_registrations.draft_saved'),
      life: 3000,
    })
    await fetchOpportunities()
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_registrations.apply_error'),
      detail: getApiErrorMessage(e),
      life: 6500,
    })
  } finally {
    actionLoadingId.value = null
  }
}

onMounted(() => {
  void fetchOpportunities()
})
</script>

<template>
  <section
    v-if="isTeamAdmin"
    class="mb-6 rounded-xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900"
  >
    <h2 class="text-base font-semibold text-surface-900 dark:text-surface-0">
      {{ t('admin.tournament_registrations.opportunities_title') }}
    </h2>
    <p class="mt-1 text-sm text-muted-color">
      {{ t('admin.tournament_registrations.opportunities_lead') }}
    </p>

    <DataTable
      :value="items"
      :loading="loading"
      data-key="id"
      class="mt-4"
      striped-rows
      :empty-message="t('admin.tournament_registrations.opportunities_empty')"
    >
      <Column :header="t('admin.tournament_registrations.col_tournament')">
        <template #body="{ data }">
          <div>
            <p class="font-medium">{{ data.name }}</p>
            <p v-if="data.ageGroup" class="text-xs text-muted-color">
              {{ data.ageGroup.shortLabel || data.ageGroup.name }}
            </p>
          </div>
        </template>
      </Column>
      <Column :header="t('admin.tournament_registrations.col_slots')" style="width: 7rem">
        <template #body="{ data }">
          {{ data.teamsCount }} / {{ data.maxTeams ?? '∞' }}
        </template>
      </Column>
      <Column :header="t('admin.tournament_registrations.col_my_status')" style="width: 9rem">
        <template #body="{ data }">
          <Tag
            v-if="myRegistration(data)"
            :value="statusLabel(myRegistration(data)!.status)"
            severity="info"
          />
          <span v-else class="text-xs text-muted-color">—</span>
        </template>
      </Column>
      <Column :header="t('admin.tournament_registrations.col_apply')">
        <template #body="{ data }">
          <div
            v-if="data.registrationOpen && (!myRegistration(data) || ['DRAFT', 'WITHDRAWN', 'REJECTED'].includes(myRegistration(data)!.status))"
            class="flex flex-col gap-2 md:flex-row md:items-center"
          >
            <Select
              v-model="selectedTeamByTournament[data.id]"
              :options="teamOptions"
              option-label="name"
              option-value="id"
              class="w-full md:max-w-xs"
              :placeholder="t('admin.tournament_registrations.pick_team')"
            />
            <InputText
              v-model="messageByTournament[data.id]"
              class="w-full md:max-w-sm"
              :placeholder="t('admin.tournament_registrations.message_placeholder')"
            />
            <div class="flex gap-2">
              <Button
                :label="t('admin.tournament_registrations.submit')"
                icon="pi pi-send"
                size="small"
                :loading="actionLoadingId === data.id"
                @click="applyToTournament(data, true)"
              />
            </div>
          </div>
          <span v-else-if="!data.registrationOpen" class="text-xs text-muted-color">
            {{ t('admin.tournament_registrations.closed') }}
          </span>
        </template>
      </Column>
    </DataTable>
  </section>
</template>

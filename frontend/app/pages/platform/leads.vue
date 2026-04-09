<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { getApiErrorMessage } from '~/utils/apiError'

definePageMeta({ layout: 'platform' })

type LeadStatus = 'NEW' | 'IN_PROGRESS' | 'CLOSED'
interface DemoLeadRow {
  id: string
  name: string
  contact: string
  league: string
  message: string
  source: string
  status: LeadStatus
  note: string | null
  ip: string | null
  createdAt: string
  processedAt: string | null
}

const statusOptions = [
  { label: 'Новые', value: 'NEW' },
  { label: 'В работе', value: 'IN_PROGRESS' },
  { label: 'Закрытые', value: 'CLOSED' },
]
const statusLabels: Record<LeadStatus, string> = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  CLOSED: 'Закрыта',
}

const { authFetch, syncWithStorage } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()
const loading = ref(false)
const listError = ref<string | null>(null)
const leads = ref<DemoLeadRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const search = ref('')
const status = ref<LeadStatus | undefined>()
const first = computed(() => (page.value - 1) * pageSize.value)

const editDialogVisible = ref(false)
const editRow = ref<DemoLeadRow | null>(null)
const editStatus = ref<LeadStatus>('NEW')
const editNote = ref('')

function formatDate(v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleString()
}

function statusSeverity(v: LeadStatus) {
  if (v === 'NEW') return 'info'
  if (v === 'IN_PROGRESS') return 'warn'
  return 'success'
}

async function fetchLeads() {
  loading.value = true
  listError.value = null
  try {
    const res = await authFetch<{
      items: DemoLeadRow[]
      total: number
      page: number
      pageSize: number
    }>(apiUrl('/platform/demo-leads'), {
      params: {
        page: page.value,
        pageSize: pageSize.value,
        q: search.value.trim() || undefined,
        status: status.value,
      },
    })
    leads.value = res.items
    total.value = res.total
  } catch (e: unknown) {
    listError.value = getApiErrorMessage(e, 'Не удалось загрузить лиды')
  } finally {
    loading.value = false
  }
}

function openEdit(row: DemoLeadRow) {
  editRow.value = row
  editStatus.value = row.status
  editNote.value = row.note ?? ''
  editDialogVisible.value = true
}

async function saveLead() {
  if (!editRow.value) return
  try {
    await authFetch(apiUrl(`/platform/demo-leads/${editRow.value.id}`), {
      method: 'PATCH',
      body: { status: editStatus.value, note: editNote.value },
    })
    editDialogVisible.value = false
    toast.add({ severity: 'success', summary: 'Лид обновлён', life: 2500 })
    await fetchLeads()
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить',
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  }
}

function onPage(event: { first?: number; rows?: number }) {
  const rows = Number(event.rows ?? pageSize.value) || pageSize.value
  const start = Number(event.first ?? 0)
  pageSize.value = rows > 0 ? rows : pageSize.value
  page.value = Math.floor(start / pageSize.value) + 1
  void fetchLeads()
}

onMounted(async () => {
  syncWithStorage()
  await fetchLeads()
})
</script>

<template>
  <section class="space-y-6">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">Лиды с лендинга</h1>
      <p class="text-sm text-muted-color">Без привязки к организации</p>
    </header>

    <div class="flex flex-wrap items-center gap-2">
      <IconField class="min-w-[16rem] flex-1">
        <InputIcon class="pi pi-search" />
        <InputText v-model="search" class="w-full" placeholder="Поиск по имени, контакту, лиге, сообщению" @keyup.enter="fetchLeads" />
      </IconField>
      <Select
        v-model="status"
        :options="[{ label: 'Все статусы', value: undefined }, ...statusOptions]"
        option-label="label"
        option-value="value"
        class="min-w-[14rem]"
      />
      <Button label="Найти" icon="pi pi-search" :loading="loading" @click="fetchLeads" />
    </div>

    <Message v-if="listError" severity="error" :closable="false">{{ listError }}</Message>

    <DataTable
      :value="leads"
      :loading="loading"
      data-key="id"
      paginator
      lazy
      :rows="pageSize"
      :first="first"
      :total-records="total"
      :rows-per-page-options="[10, 20, 50]"
      class="text-sm"
      @page="onPage"
    >
      <Column field="name" header="Имя" style="min-width: 9rem" />
      <Column field="contact" header="Контакт" style="min-width: 10rem" />
      <Column field="league" header="Лига" style="min-width: 10rem" />
      <Column header="Сообщение" style="min-width: 16rem">
        <template #body="{ data }">
          <span class="line-clamp-2">{{ data.message }}</span>
        </template>
      </Column>
      <Column header="Статус" style="width: 7rem">
        <template #body="{ data }">
          <Tag :severity="statusSeverity(data.status)" :value="statusLabels[data.status]" />
        </template>
      </Column>
      <Column header="Создан" style="min-width: 9rem">
        <template #body="{ data }">{{ formatDate(data.createdAt) }}</template>
      </Column>
      <Column header="Обработан" style="min-width: 9rem">
        <template #body="{ data }">{{ formatDate(data.processedAt) }}</template>
      </Column>
      <Column header="" style="width: 3.25rem">
        <template #body="{ data }">
          <Button icon="pi pi-pencil" text rounded size="small" @click="openEdit(data)" />
        </template>
      </Column>
    </DataTable>

    <Dialog
      v-model:visible="editDialogVisible"
      modal
      block-scroll
      :style="{ width: '34rem', maxWidth: '95vw' }"
      header="Карточка лида"
    >
      <div v-if="editRow" class="space-y-3">
        <p class="text-sm"><strong>{{ editRow.name }}</strong> — {{ editRow.contact }}</p>
        <p class="text-sm text-muted-color">Лига: {{ editRow.league }}</p>
        <p class="rounded bg-surface-100 p-2 text-sm dark:bg-surface-800">{{ editRow.message }}</p>
        <div>
          <label class="mb-1 block text-sm font-medium">Статус</label>
          <Select v-model="editStatus" :options="statusOptions" option-label="label" option-value="value" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium">Комментарий</label>
          <Textarea v-model="editNote" rows="4" class="w-full" auto-resize />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <Button label="Отмена" severity="secondary" @click="editDialogVisible = false" />
          <Button label="Сохранить" icon="pi pi-check" @click="saveLead" />
        </div>
      </div>
    </Dialog>
  </section>
</template>

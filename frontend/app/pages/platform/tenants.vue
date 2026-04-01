<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { helpers } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { getApiErrorMessage } from '~/utils/apiError'
import {
  SUBSCRIPTION_PLAN_LABELS_RU,
  SUBSCRIPTION_STATUS_LABELS_RU,
  formatSubscriptionPlanLabel,
  formatSubscriptionStatusLabel,
} from '~/utils/subscriptionPlanLabels'

definePageMeta({
  layout: 'platform',
})

interface PlatformTenantRow {
  id: string
  name: string
  slug: string
  blocked: boolean
  createdAt: string
  subscriptionPlan: string
  subscriptionStatus: string
  subscriptionEndsAt: string | null
  usersCount: number
  tournamentsCount: number
  teamsCount: number
  superAdminsCount: number
  protectedFromRemoval: boolean
}

interface PlatformTenantUserRow {
  id: string
  username: string
  email: string
  name: string
  lastName: string
  role: string
  blocked: boolean
  createdAt: string
}

const { token, authFetch, syncWithStorage } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()
const { t } = useI18n()
const loading = ref(false)
const search = ref('')
const tenants = ref<PlatformTenantRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const usersDialogVisible = ref(false)
const usersLoading = ref(false)
const selectedTenant = ref<PlatformTenantRow | null>(null)
const tenantUsers = ref<PlatformTenantUserRow[]>([])

const subscriptionDialogVisible = ref(false)
const subscriptionRow = ref<PlatformTenantRow | null>(null)
const editPlan = ref('FREE')
const editStatus = ref('NONE')
const editEndsAt = ref<Date | null>(null)
const editNoEndsAt = ref(true)
const subscriptionSubmitAttempted = ref(false)

const first = computed(() => (page.value - 1) * pageSize.value)

const planSelectOptions = computed(() =>
  Object.entries(SUBSCRIPTION_PLAN_LABELS_RU).map(([value, label]) => ({ value, label })),
)
const statusSelectOptions = computed(() =>
  Object.entries(SUBSCRIPTION_STATUS_LABELS_RU).map(([value, label]) => ({ value, label })),
)
const subscriptionRules = computed(() => ({
  editEndsAt: {
    requiredWhenHasEndDate: helpers.withMessage(
      'end date required',
      (v: unknown) => editNoEndsAt.value || v instanceof Date,
    ),
  },
}))
const subscriptionV$ = useVuelidate(subscriptionRules, { editEndsAt }, { $autoDirty: true })
const subscriptionErrors = computed(() => ({
  editEndsAt:
    editNoEndsAt.value || editEndsAt.value
      ? ''
      : t('admin.validation.required_end_date'),
}))
const canSaveSubscription = computed(
  () => !subscriptionV$.value.$invalid && !subscriptionErrors.value.editEndsAt,
)
const showSubscriptionEndDateError = computed(
  () =>
    (subscriptionSubmitAttempted.value || subscriptionV$.value.editEndsAt.$dirty) &&
    !!subscriptionErrors.value.editEndsAt,
)

async function fetchTenants() {
  if (!token.value) return
  loading.value = true
  try {
    const res = await authFetch<{
      items: PlatformTenantRow[]
      total: number
      page: number
      pageSize: number
    }>(apiUrl('/platform/tenants'), {
      params: {
        q: search.value.trim() || undefined,
        page: page.value,
        pageSize: pageSize.value,
      },
    })
    tenants.value = res.items
    total.value = res.total
  } finally {
    loading.value = false
  }
}

async function toggleBlocked(row: PlatformTenantRow) {
  if (row.protectedFromRemoval) return
  await authFetch(apiUrl(`/platform/tenants/${row.id}/block`), {
    method: 'PATCH',
    body: { blocked: !row.blocked },
  })
  await fetchTenants()
}

const deleteTenantConfirmOpen = ref(false)
const tenantToDelete = ref<PlatformTenantRow | null>(null)
const deleteTenantMessage = computed(() => {
  const row = tenantToDelete.value
  if (!row) return ''
  return `Удалить организацию «${row.name}» (${row.slug})? Все данные tenant-а будут удалены без восстановления.`
})

function requestDeleteTenant(row: PlatformTenantRow) {
  if (row.protectedFromRemoval) return
  tenantToDelete.value = row
  deleteTenantConfirmOpen.value = true
}

async function confirmDeleteTenant() {
  const row = tenantToDelete.value
  if (!token.value || !row || row.protectedFromRemoval) return
  try {
    await authFetch(apiUrl(`/platform/tenants/${row.id}`), { method: 'DELETE' })
    await fetchTenants()
    toast.add({ severity: 'success', summary: 'Организация удалена', life: 3000 })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось удалить',
      detail: getApiErrorMessage(err),
      life: 7000,
    })
  } finally {
    tenantToDelete.value = null
  }
}

function formatSubscriptionEnds(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function buildTenantLoginUrl(tenantSlug: string): string {
  if (!process.client) {
    return `/${tenantSlug}/admin/login`
  }
  const { protocol, hostname, port } = window.location
  const p = port ? `:${port}` : ''
  const parts = hostname.split('.')
  if (hostname === 'localhost' || hostname === '127.0.0.1' || parts.length < 2) {
    return `${protocol}//localhost${p}/admin/login`
  }
  const isSubdomain = parts.length >= 3
  const baseDomain = isSubdomain ? parts.slice(1).join('.') : hostname
  return `${protocol}//${tenantSlug}.${baseDomain}${p}/admin/login`
}

function openSubscriptionDialog(row: PlatformTenantRow) {
  subscriptionSubmitAttempted.value = false
  subscriptionRow.value = row
  editPlan.value = row.subscriptionPlan
  editStatus.value = row.subscriptionStatus
  editNoEndsAt.value = !row.subscriptionEndsAt
  editEndsAt.value = row.subscriptionEndsAt ? new Date(row.subscriptionEndsAt) : null
  subscriptionV$.value.$reset()
  subscriptionDialogVisible.value = true
}

async function saveSubscription() {
  const row = subscriptionRow.value
  if (!token.value || !row) return
  subscriptionSubmitAttempted.value = true
  subscriptionV$.value.$touch()
  if (!canSaveSubscription.value) return
  try {
    await authFetch(apiUrl(`/platform/tenants/${row.id}/subscription`), {
      method: 'PATCH',
      body: {
        subscriptionPlan: editPlan.value,
        subscriptionStatus: editStatus.value,
        subscriptionEndsAt: editNoEndsAt.value ? null : editEndsAt.value?.toISOString() ?? null,
      },
    })
    subscriptionDialogVisible.value = false
    subscriptionRow.value = null
    toast.add({ severity: 'success', summary: 'Подписка обновлена', life: 3000 })
    await fetchTenants()
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить',
      detail: getApiErrorMessage(err),
      life: 7000,
    })
  }
}

async function openTenantUsers(row: PlatformTenantRow) {
  selectedTenant.value = row
  usersDialogVisible.value = true
  usersLoading.value = true
  try {
    const res = await authFetch<{
      tenant: { id: string; name: string; slug: string }
      items: PlatformTenantUserRow[]
    }>(apiUrl(`/platform/tenants/${row.id}/users`))
    tenantUsers.value = res.items
  } finally {
    usersLoading.value = false
  }
}

function onPage(event: { first?: number; rows?: number }) {
  const rows = Number(event.rows ?? pageSize.value) || pageSize.value
  const start = Number(event.first ?? 0)
  pageSize.value = rows > 0 ? rows : pageSize.value
  page.value = Math.floor(start / pageSize.value) + 1
  void fetchTenants()
}

onMounted(async () => {
  syncWithStorage()
  await fetchTenants()
})
</script>

<template>
  <section class="space-y-4">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">Организации платформы</h1>
        <p class="text-sm text-muted-color">Глобальное управление tenant-ами</p>
      </div>
    </header>

    <div class="flex items-center gap-3">
      <IconField class="w-full max-w-lg">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="search"
          class="w-full"
          placeholder="Поиск по названию или slug"
          @keyup.enter="fetchTenants"
        />
      </IconField>
      <Button label="Найти" icon="pi pi-search" @click="fetchTenants" />
    </div>

    <DataTable
      :value="tenants"
      :loading="loading"
      data-key="id"
      :paginator="true"
      :rows="pageSize"
      :first="first"
      :total-records="total"
      :rows-per-page-options="[10, 20, 50]"
      @page="onPage"
    >
      <Column field="name" header="Организация" />
      <Column field="slug" header="Slug" />
      <Column header="Тариф">
        <template #body="{ data }">{{ formatSubscriptionPlanLabel(data.subscriptionPlan) }}</template>
      </Column>
      <Column header="Подписка">
        <template #body="{ data }">{{ formatSubscriptionStatusLabel(data.subscriptionStatus) }}</template>
      </Column>
      <Column header="Оплачено до">
        <template #body="{ data }">{{ formatSubscriptionEnds(data.subscriptionEndsAt) }}</template>
      </Column>
      <Column header="Пользователи">
        <template #body="{ data }">{{ data.usersCount }}</template>
      </Column>
      <Column header="Турниры">
        <template #body="{ data }">{{ data.tournamentsCount }}</template>
      </Column>
      <Column header="Команды">
        <template #body="{ data }">{{ data.teamsCount }}</template>
      </Column>
      <Column header="Статус">
        <template #body="{ data }">
          <Tag :severity="data.blocked ? 'danger' : 'success'" :value="data.blocked ? 'Blocked' : 'Active'" />
        </template>
      </Column>
      <Column header="SUPER_ADMIN">
        <template #body="{ data }">
          {{ data.superAdminsCount }}
        </template>
      </Column>
      <Column header="Действия" style="width: 12rem">
        <template #body="{ data }">
          <div class="flex justify-end gap-1 flex-wrap">
            <Button
              icon="pi pi-credit-card"
              text
              rounded
              severity="secondary"
              title="Подписка и тариф"
              @click="openSubscriptionDialog(data)"
            />
            <Button
              icon="pi pi-users"
              text
              rounded
              severity="info"
              title="Пользователи tenant-а"
              @click="openTenantUsers(data)"
            />
            <Button
              :icon="data.blocked ? 'pi pi-lock-open' : 'pi pi-lock'"
              text
              rounded
              :disabled="data.protectedFromRemoval"
              :severity="data.blocked ? 'warn' : 'secondary'"
              :title="data.protectedFromRemoval ? 'Нельзя блокировать tenant с SUPER_ADMIN' : ''"
              @click="toggleBlocked(data)"
            />
            <Button
              icon="pi pi-trash"
              text
              rounded
              severity="danger"
              :disabled="data.protectedFromRemoval"
              :title="data.protectedFromRemoval ? 'Нельзя удалять tenant с SUPER_ADMIN' : ''"
              @click="requestDeleteTenant(data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <AdminConfirmDialog
      v-model="deleteTenantConfirmOpen"
      title="Удалить организацию?"
      :message="deleteTenantMessage"
      @confirm="confirmDeleteTenant"
    />

    <Dialog
      v-model:visible="subscriptionDialogVisible"
      modal
      :style="{ width: '28rem', maxWidth: '95vw' }"
      header="Подписка организации"
    >
      <div v-if="subscriptionRow" class="flex flex-col gap-4">
        <p class="text-sm text-muted-color">
          {{ subscriptionRow.name }} ({{ subscriptionRow.slug }})
        </p>
        <div>
          <label class="block text-sm font-medium mb-1">Тариф</label>
          <Select
            v-model="editPlan"
            :options="planSelectOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            placeholder="Тариф"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Статус подписки</label>
          <Select
            v-model="editStatus"
            :options="statusSelectOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            placeholder="Статус"
          />
        </div>
        <div class="flex items-center gap-2">
          <Checkbox v-model="editNoEndsAt" binary input-id="sub-no-end" />
          <label for="sub-no-end" class="text-sm">Без даты окончания</label>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Оплачено до</label>
          <DatePicker
            v-model="editEndsAt"
            show-time
            hour-format="24"
            date-format="dd.mm.yy"
            :disabled="editNoEndsAt"
            :invalid="showSubscriptionEndDateError"
            class="w-full"
          />
          <p
            v-if="showSubscriptionEndDateError"
            class="mt-0 text-[11px] leading-3 text-red-500"
          >
            {{ subscriptionErrors.editEndsAt }}
          </p>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <Button label="Отмена" severity="secondary" @click="subscriptionDialogVisible = false" />
          <Button
            label="Сохранить"
            icon="pi pi-check"
            :disabled="subscriptionSubmitAttempted && !canSaveSubscription"
            @click="saveSubscription"
          />
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="usersDialogVisible"
      modal
      :style="{ width: '52rem', maxWidth: '95vw' }"
      :header="selectedTenant ? `Пользователи: ${selectedTenant.name} (${selectedTenant.slug})` : 'Пользователи tenant-а'"
    >
      <div class="mb-3 rounded border border-surface-200 p-3 text-sm text-surface-700">
        <div v-if="selectedTenant">
          <div><strong>URL входа:</strong> {{ buildTenantLoginUrl(selectedTenant.slug) }}</div>
          <div><strong>Параметры входа:</strong> логин (`username`) + пароль пользователя tenant-а.</div>
          <div class="text-xs text-muted-color mt-1">Пароли в системе хранятся только в виде хеша и не отображаются.</div>
        </div>
      </div>
      <DataTable
        :value="tenantUsers"
        :loading="usersLoading"
        data-key="id"
        size="small"
        striped-rows
      >
        <Column field="username" header="Логин" />
        <Column field="email" header="Email" />
        <Column header="Имя">
          <template #body="{ data }">
            {{ [data.name, data.lastName].filter(Boolean).join(' ') }}
          </template>
        </Column>
        <Column field="role" header="Роль" />
        <Column header="Статус">
          <template #body="{ data }">
            <Tag :severity="data.blocked ? 'danger' : 'success'" :value="data.blocked ? 'Blocked' : 'Active'" />
          </template>
        </Column>
        <Column header="Создан">
          <template #body="{ data }">
            {{ new Date(data.createdAt).toLocaleDateString() }}
          </template>
        </Column>
      </DataTable>
    </Dialog>
  </section>
</template>

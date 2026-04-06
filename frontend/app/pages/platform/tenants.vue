<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { MenuItem } from 'primevue/menuitem'
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
import { userRoleLabelRu } from '~/constants/userRoles'

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
/** Сразу true: при первом рендере и после F5 показываем скелетон, а не пустую таблицу до onMounted. */
const loading = ref(true)
const listError = ref<string | null>(null)
const firstFetchDone = ref(false)
const search = ref('')
const tenants = ref<PlatformTenantRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const usersDialogVisible = ref(false)
const usersLoading = ref(false)
const selectedTenant = ref<PlatformTenantRow | null>(null)
const tenantUsers = ref<PlatformTenantUserRow[]>([])
const renameDialogVisible = ref(false)
const renameRow = ref<PlatformTenantRow | null>(null)
const editTenantName = ref('')

const subscriptionDialogVisible = ref(false)
const subscriptionRow = ref<PlatformTenantRow | null>(null)
const editPlan = ref('FREE')
const editStatus = ref('NONE')
const editEndsAt = ref<Date | null>(null)
const editNoEndsAt = ref(true)
const subscriptionSubmitAttempted = ref(false)

const tenantActionsMenuRef = ref<{ toggle: (e: Event) => void } | null>(null)
const tenantActionsMenuRow = ref<PlatformTenantRow | null>(null)

const tenantActionsMenuItems = computed((): MenuItem[] => {
  const row = tenantActionsMenuRow.value
  if (!row) return []
  const locked = row.protectedFromRemoval
  return [
    {
      label: 'Переименовать',
      icon: 'pi pi-pencil',
      command: () => openRenameTenantDialog(row),
    },
    {
      label: 'Подписка и тариф',
      icon: 'pi pi-credit-card',
      command: () => openSubscriptionDialog(row),
    },
    {
      label: 'Пользователи',
      icon: 'pi pi-users',
      command: () => void openTenantUsers(row),
    },
    { separator: true },
    {
      label: row.blocked ? 'Разблокировать' : 'Заблокировать',
      icon: row.blocked ? 'pi pi-lock-open' : 'pi pi-lock',
      disabled: locked,
      command: () => {
        if (!locked) void toggleBlocked(row)
      },
    },
    {
      label: 'Удалить',
      icon: 'pi pi-trash',
      disabled: locked,
      class: 'text-red-600 dark:text-red-400',
      command: () => {
        if (!locked) requestDeleteTenant(row)
      },
    },
  ]
})

async function openTenantActionsMenu(event: Event, row: PlatformTenantRow) {
  tenantActionsMenuRow.value = row
  await nextTick()
  tenantActionsMenuRef.value?.toggle(event)
}

const first = computed(() => (page.value - 1) * pageSize.value)

const TENANTS_SKELETON_ROWS = 8
const skeletonRows = Array.from({ length: TENANTS_SKELETON_ROWS }, (_, i) => ({ id: `sk-${i}` }))

const tenantsEmptyTitle = computed(() =>
  search.value.trim() ? 'Ничего не найдено' : 'Нет организаций',
)
const tenantsEmptyDescription = computed(() =>
  search.value.trim()
    ? 'Измените запрос поиска или сбросьте фильтр.'
    : 'Когда появятся зарегистрированные организации, они отобразятся в этой таблице.',
)

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
  if (!token.value) {
    firstFetchDone.value = true
    tenants.value = []
    total.value = 0
    loading.value = false
    return
  }
  loading.value = true
  listError.value = null
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
  } catch (err: unknown) {
    listError.value = getApiErrorMessage(err, 'Не удалось загрузить список организаций')
  } finally {
    loading.value = false
    firstFetchDone.value = true
  }
}

function retryFetchTenants() {
  listError.value = null
  void fetchTenants()
}

function clearSearchAndFetch() {
  search.value = ''
  page.value = 1
  void fetchTenants()
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

function openRenameTenantDialog(row: PlatformTenantRow) {
  renameRow.value = row
  editTenantName.value = row.name
  renameDialogVisible.value = true
}

const canSaveTenantName = computed(() => editTenantName.value.trim().length > 0)

async function saveTenantName() {
  const row = renameRow.value
  if (!token.value || !row || !canSaveTenantName.value) return
  try {
    await authFetch(apiUrl(`/platform/tenants/${row.id}`), {
      method: 'PATCH',
      body: { name: editTenantName.value.trim() },
    })
    renameDialogVisible.value = false
    renameRow.value = null
    toast.add({ severity: 'success', summary: 'Название обновлено', life: 3000 })
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
  tenantUsers.value = []
  try {
    const res = await authFetch<{
      tenant: { id: string; name: string; slug: string }
      items: PlatformTenantUserRow[]
    }>(apiUrl(`/platform/tenants/${row.id}/users`))
    tenantUsers.value = res.items
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось загрузить пользователей',
      detail: getApiErrorMessage(err),
      life: 7000,
    })
    usersDialogVisible.value = false
    selectedTenant.value = null
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
  <section class="space-y-6">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
        Организации платформы
      </h1>
      <p class="text-sm text-muted-color">Глобальное управление tenant-ами</p>
    </header>

    <div
      class="flex flex-col gap-3 rounded-xl border border-surface-200 bg-surface-0/80 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900/50 sm:flex-row sm:items-center"
    >
      <IconField class="w-full min-w-0 sm:max-w-lg">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="search"
          class="w-full"
          placeholder="Поиск по названию или slug"
          @keyup.enter="fetchTenants"
        />
      </IconField>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <Button label="Найти" icon="pi pi-search" :disabled="loading" @click="fetchTenants" />
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="loading"
          @click="fetchTenants"
        />
        <Button
          v-if="search.trim()"
          label="Сбросить"
          icon="pi pi-times"
          severity="secondary"
          outlined
          :disabled="loading"
          @click="clearSearchAndFetch"
        />
      </div>
    </div>

    <AdminDataState
      :loading="loading"
      :error="listError"
      :empty="firstFetchDone && !loading && !listError && tenants.length === 0"
      empty-icon="pi pi-building-columns"
      :empty-title="tenantsEmptyTitle"
      :empty-description="tenantsEmptyDescription"
      @retry="retryFetchTenants"
    >
      <template #loading>
        <div
          class="platform-tenants-table-wrap rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900"
        >
          <DataTable
            :value="skeletonRows"
            data-key="id"
            size="small"
            class="min-h-[22rem] platform-tenants-datatable text-sm"
            aria-busy="true"
            :pt="{
              table: { class: 'min-w-[64rem]' },
            }"
          >
            <Column header="Организация" style="min-width: 10rem">
              <template #body>
                <Skeleton width="85%" height="0.85rem" class="rounded-md" />
              </template>
            </Column>
            <Column header="Slug" style="min-width: 7rem">
              <template #body>
                <Skeleton width="70%" height="0.85rem" class="rounded-md" />
              </template>
            </Column>
            <Column header="Тариф" style="width: 6rem">
              <template #body>
                <Skeleton width="3.5rem" height="0.85rem" class="rounded-md" />
              </template>
            </Column>
            <Column header="Подписка" style="width: 7rem">
              <template #body>
                <Skeleton width="4rem" height="0.85rem" class="rounded-md" />
              </template>
            </Column>
            <Column header="Оплачено до" style="min-width: 8rem">
              <template #body>
                <Skeleton width="90%" height="0.85rem" class="rounded-md" />
              </template>
            </Column>
            <Column header="Польз." style="width: 4.5rem">
              <template #body>
                <Skeleton width="1.75rem" height="0.85rem" class="rounded-md" />
              </template>
            </Column>
            <Column header="Турн." style="width: 4rem">
              <template #body>
                <Skeleton width="1.5rem" height="0.85rem" class="rounded-md" />
              </template>
            </Column>
            <Column header="Ком." style="width: 4rem">
              <template #body>
                <Skeleton width="1.5rem" height="0.85rem" class="rounded-md" />
              </template>
            </Column>
            <Column header="Статус" style="width: 6.5rem">
              <template #body>
                <Skeleton width="4.5rem" height="1.35rem" class="rounded-md" />
              </template>
            </Column>
            <Column header="Супер-адм." style="width: 5rem">
              <template #body>
                <Skeleton width="1.25rem" height="0.85rem" class="rounded-md" />
              </template>
            </Column>
            <Column header=" " style="width: 3.25rem">
              <template #body>
                <div class="flex justify-end">
                  <Skeleton shape="circle" width="2rem" height="2rem" />
                </div>
              </template>
            </Column>
          </DataTable>
        </div>
      </template>

      <template #empty-actions>
        <Button label="Обновить" icon="pi pi-refresh" severity="secondary" outlined @click="fetchTenants" />
      </template>

      <DataTable
        :value="tenants"
        data-key="id"
        lazy
        size="small"
        striped-rows
        show-gridlines
        paginator
        :rows="pageSize"
        :first="first"
        :total-records="total"
        :rows-per-page-options="[10, 20, 50]"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
        current-page-report-template="{first}–{last} из {totalRecords}"
        class="platform-tenants-datatable text-sm"
        :pt="{
          table: { class: 'min-w-[64rem]' },
        }"
        @page="onPage"
      >
        <template #empty>
          <span class="sr-only">Пусто</span>
        </template>
        <Column field="name" header="Организация" style="min-width: 10rem">
          <template #body="{ data }">
            <span class="font-medium text-surface-900 dark:text-surface-0">{{ data.name }}</span>
          </template>
        </Column>
        <Column field="slug" header="Slug" style="min-width: 7rem">
          <template #body="{ data }">
            <code
              class="rounded bg-surface-100 px-1.5 py-0.5 text-xs text-surface-700 dark:bg-surface-800 dark:text-surface-200"
              >{{ data.slug }}</code
            >
          </template>
        </Column>
        <Column header="Тариф" style="width: 7rem">
          <template #body="{ data }">{{ formatSubscriptionPlanLabel(data.subscriptionPlan) }}</template>
        </Column>
        <Column header="Подписка" style="min-width: 7rem">
          <template #body="{ data }">{{ formatSubscriptionStatusLabel(data.subscriptionStatus) }}</template>
        </Column>
        <Column header="Оплачено до" style="min-width: 9rem">
          <template #body="{ data }">
            <span class="text-muted-color tabular-nums text-xs sm:text-sm">{{
              formatSubscriptionEnds(data.subscriptionEndsAt)
            }}</span>
          </template>
        </Column>
        <Column header="Польз." style="width: 4.75rem">
          <template #body="{ data }">
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left font-medium text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
              title="Показать пользователей организации"
              @click="openTenantUsers(data)"
            >
              <span class="pi pi-users text-xs opacity-80" aria-hidden="true" />
              <span class="tabular-nums">{{ data.usersCount }}</span>
            </button>
          </template>
        </Column>
        <Column header="Турн." style="width: 4rem">
          <template #body="{ data }">
            <span class="tabular-nums text-surface-800 dark:text-surface-200">{{ data.tournamentsCount }}</span>
          </template>
        </Column>
        <Column header="Ком." style="width: 4rem">
          <template #body="{ data }">
            <span class="tabular-nums text-surface-800 dark:text-surface-200">{{ data.teamsCount }}</span>
          </template>
        </Column>
        <Column header="Статус" style="width: 7rem">
          <template #body="{ data }">
            <Tag
              :severity="data.blocked ? 'danger' : 'success'"
              :value="data.blocked ? 'Заблокирована' : 'Активна'"
            />
          </template>
        </Column>
        <Column header="Супер-адм." style="width: 5rem">
          <template #body="{ data }">
            <span class="tabular-nums text-surface-800 dark:text-surface-200">{{ data.superAdminsCount }}</span>
          </template>
        </Column>
        <Column header="Действия" style="width: 3.25rem">
          <template #body="{ data }">
            <div class="flex justify-end">
              <Button
                type="button"
                icon="pi pi-ellipsis-v"
                text
                rounded
                size="small"
                class="!h-8 !w-8 !min-w-8"
                :aria-label="`Действия: ${data.name}`"
                aria-haspopup="true"
                @click="openTenantActionsMenu($event, data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>

      <Menu
        ref="tenantActionsMenuRef"
        :model="tenantActionsMenuItems"
        :popup="true"
        append-to="body"
      />
    </AdminDataState>

    <AdminConfirmDialog
      v-model="deleteTenantConfirmOpen"
      title="Удалить организацию?"
      :message="deleteTenantMessage"
      @confirm="confirmDeleteTenant"
    />

    <Dialog
      v-model:visible="renameDialogVisible"
      modal
      block-scroll
      :style="{ width: '32rem', maxWidth: '95vw' }"
      header="Переименовать организацию"
    >
      <div v-if="renameRow" class="flex flex-col gap-4">
        <p class="text-sm text-muted-color">
          Slug останется прежним: <strong>{{ renameRow.slug }}</strong>
        </p>
        <div>
          <label class="mb-1 block text-sm font-medium">Название</label>
          <InputText v-model="editTenantName" class="w-full" maxlength="120" />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" label="Отмена" severity="secondary" @click="renameDialogVisible = false" />
          <Button
            type="button"
            label="Сохранить"
            icon="pi pi-check"
            :disabled="!canSaveTenantName"
            @click="saveTenantName"
          />
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="subscriptionDialogVisible"
      modal
      block-scroll
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
          <Button type="button" label="Отмена" severity="secondary" @click="subscriptionDialogVisible = false" />
          <Button
            type="button"
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
      block-scroll
      :style="{ width: '52rem', maxWidth: '95vw' }"
      :header="selectedTenant ? `Пользователи: ${selectedTenant.name} (${selectedTenant.slug})` : 'Пользователи tenant-а'"
    >
      <div
        class="mb-3 rounded-lg border border-surface-200 bg-surface-50 p-3 text-sm text-surface-700 dark:border-surface-600 dark:bg-surface-800/60 dark:text-surface-200"
      >
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
        <template #empty>
          <span v-if="!usersLoading" class="text-sm text-muted-color">В этой организации пока нет пользователей.</span>
        </template>
        <Column field="username" header="Логин" />
        <Column field="email" header="Email" />
        <Column header="Имя">
          <template #body="{ data }">
            {{ [data.name, data.lastName].filter(Boolean).join(' ') }}
          </template>
        </Column>
        <Column header="Роль">
          <template #body="{ data }">{{ userRoleLabelRu(String(data.role ?? '')) }}</template>
        </Column>
        <Column header="Статус">
          <template #body="{ data }">
            <Tag
              :severity="data.blocked ? 'danger' : 'success'"
              :value="data.blocked ? 'Заблокирован' : 'Активен'"
            />
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

<style scoped>
.platform-tenants-datatable :deep(.p-datatable-tbody > tr) {
  transition: background-color 0.12s ease;
}
.platform-tenants-datatable :deep(.p-datatable-tbody > tr:hover) {
  background: var(--p-content-hover-background);
}
</style>

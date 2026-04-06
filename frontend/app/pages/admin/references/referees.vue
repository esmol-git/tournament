<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { RefereeCategoryRow } from '~/types/admin/referee-category'
import type { RefereePositionRow } from '~/types/admin/referee-position'
import type { RefereeRow } from '~/types/admin/referee'
import { getApiErrorMessage } from '~/utils/apiError'
import { MIN_SKELETON_DISPLAY_MS } from '~/utils/minimumLoadingDelay'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const SKELETON_ROW_COUNT = 6
const skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => ({ id: `ref-sk-${i}` }))

const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const tenantId = useTenantId()

const { items, loading, error, isEmpty, run, retry } = useAdminAsyncListState<RefereeRow>({
  initialLoading: true,
  minLoadingMs: MIN_SKELETON_DISPLAY_MS,
  clearItemsOnError: true,
})
const saving = ref(false)
const categories = ref<RefereeCategoryRow[]>([])
const positions = ref<RefereePositionRow[]>([])

const categorySelectOptions = computed(() => [
  { label: 'Без категории', value: '' },
  ...categories.value.map((c) => ({
    label: c.active ? c.name : `${c.name} (неактивна)`,
    value: c.id,
  })),
])

const positionSelectOptions = computed(() => [
  { label: 'Без позиции', value: '' },
  ...positions.value.map((p) => ({
    label: p.active ? p.name : `${p.name} (неактивна)`,
    value: p.id,
  })),
])
const showForm = ref(false)
const editing = ref<RefereeRow | null>(null)
const isEdit = computed(() => !!editing.value)

const form = reactive({
  firstName: '',
  lastName: '',
  phone: '',
  note: '',
  refereeCategoryId: '' as string,
  refereePositionId: '' as string,
})
const submitAttempted = ref(false)
const rules = computed(() => ({
  firstName: { required },
  lastName: { required },
}))
const v$ = useVuelidate(rules, form, { $autoDirty: true })
const formErrors = computed(() => ({
  firstName: form.firstName.trim() ? '' : t('admin.validation.required_first_name'),
  lastName: form.lastName.trim() ? '' : t('admin.validation.required_last_name'),
}))
const canSave = computed(() => !v$.value.$invalid && !formErrors.value.firstName && !formErrors.value.lastName)
const showFirstNameError = computed(
  () => (submitAttempted.value || v$.value.firstName.$dirty) && !!formErrors.value.firstName,
)
const showLastNameError = computed(
  () => (submitAttempted.value || v$.value.lastName.$dirty) && !!formErrors.value.lastName,
)

const fetchCategories = async () => {
  if (!token.value) return
  try {
    categories.value = await authFetch<RefereeCategoryRow[]>(
      apiUrl(`/tenants/${tenantId.value}/referee-categories`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  } catch {
    categories.value = []
  }
}

const fetchPositions = async () => {
  if (!token.value) return
  try {
    positions.value = await authFetch<RefereePositionRow[]>(
      apiUrl(`/tenants/${tenantId.value}/referee-positions`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  } catch {
    positions.value = []
  }
}

const fetchItems = async () => {
  if (!token.value) {
    loading.value = false
    return
  }
  await run(async () => {
    await Promise.all([fetchCategories(), fetchPositions()])
    items.value = await authFetch<RefereeRow[]>(
      apiUrl(`/tenants/${tenantId.value}/referees`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  })
}

const openCreate = () => {
  submitAttempted.value = false
  editing.value = null
  form.firstName = ''
  form.lastName = ''
  form.phone = ''
  form.note = ''
  form.refereeCategoryId = ''
  form.refereePositionId = ''
  v$.value.$reset()
  showForm.value = true
}

const openEdit = (row: RefereeRow) => {
  submitAttempted.value = false
  editing.value = row
  form.firstName = row.firstName
  form.lastName = row.lastName
  form.phone = row.phone ?? ''
  form.note = row.note ?? ''
  form.refereeCategoryId = row.refereeCategoryId ?? ''
  form.refereePositionId = row.refereePositionId ?? ''
  v$.value.$reset()
  showForm.value = true
}

const save = async () => {
  if (!token.value) return
  submitAttempted.value = true
  v$.value.$touch()
  if (!canSave.value) {
    return
  }
  saving.value = true
  try {
    const body: {
      firstName: string
      lastName: string
      phone?: string
      note?: string
      refereeCategoryId?: string | null
      refereePositionId?: string | null
    } = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim() || undefined,
      note: form.note.trim() || undefined,
    }
    if (isEdit.value) {
      body.refereeCategoryId = form.refereeCategoryId.trim() || null
      body.refereePositionId = form.refereePositionId.trim() || null
      await authFetch(apiUrl(`/tenants/${tenantId.value}/referees/${editing.value!.id}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
    } else {
      if (form.refereeCategoryId.trim()) {
        body.refereeCategoryId = form.refereeCategoryId.trim()
      }
      if (form.refereePositionId.trim()) {
        body.refereePositionId = form.refereePositionId.trim()
      }
      await authFetch(apiUrl(`/tenants/${tenantId.value}/referees`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
    }
    showForm.value = false
    await fetchItems()
    toast.add({ severity: 'success', summary: 'Сохранено', life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    saving.value = false
  }
}

const deleteDialogVisible = ref(false)
const deleteTarget = ref<RefereeRow | null>(null)
const deleteSaving = ref(false)

const openDeleteDialog = (row: RefereeRow) => {
  deleteTarget.value = row
  deleteDialogVisible.value = true
}

const confirmDelete = async () => {
  if (!token.value || !deleteTarget.value) return
  const row = deleteTarget.value
  deleteSaving.value = true
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/referees/${row.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    deleteDialogVisible.value = false
    deleteTarget.value = null
    await fetchItems()
    toast.add({ severity: 'success', summary: 'Удалено', life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось удалить',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    deleteSaving.value = false
  }
}

const onDeleteDialogHide = () => {
  deleteTarget.value = null
}

onMounted(() => {
  if (process.client) {
    syncWithStorage()
    if (!loggedIn.value) {
      loading.value = false
      router.push('/admin/login')
      return
    }
  }
  void fetchItems()
})
</script>

<template>
  <section class="admin-page">
    <header class="admin-toolbar-responsive flex flex-wrap items-center justify-between gap-2 sm:gap-3">
      <div>
        <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-0 sm:text-xl">Судьи</h1>
        <p class="mt-1 max-w-2xl text-xs leading-relaxed text-muted-color sm:text-sm">
          Контакты и атрибуты судей тенанта. В разделе «Турниры» судьи из этого списка назначаются на
          конкретный турнир; категория и позиция задаются в соседних справочниках и подставляются в
          карточку судьи.
        </p>
      </div>
      <Button label="Добавить" icon="pi pi-plus" @click="openCreate" />
    </header>

    <AdminDataState
      :loading="loading"
      :error="error"
      :empty="isEmpty"
      empty-title="Пока нет судей"
      empty-description="Добавьте записи в справочник — их можно будет назначать на турниры при создании или редактировании."
      empty-icon="pi pi-users"
      error-title="Не удалось загрузить судей"
      @retry="retry"
    >
      <template #loading>
        <div class="min-h-[22rem]">
          <div
            class="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,7rem)_minmax(0,7rem)_minmax(0,7rem)_minmax(0,1.2fr)_auto] gap-3 px-4 py-3 border-b border-surface-200 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-800/50"
          >
            <Skeleton height="0.75rem" width="6rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="5rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="5rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="4.5rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="5.5rem" class="rounded-md" />
            <div class="hidden sm:flex justify-end gap-1">
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </div>
          <div
            v-for="row in skeletonRows"
            :key="row.id"
            class="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,7rem)_minmax(0,7rem)_minmax(0,7rem)_minmax(0,1.2fr)_auto] gap-3 items-center px-4 py-3.5 border-b border-surface-100 dark:border-surface-800 last:border-0"
          >
            <Skeleton width="72%" height="1rem" class="rounded-md max-w-xs" />
            <Skeleton width="60%" height="0.875rem" class="rounded-md" />
            <Skeleton width="60%" height="0.875rem" class="rounded-md" />
            <Skeleton width="85%" height="0.875rem" class="rounded-md" />
            <Skeleton width="60%" height="0.875rem" class="rounded-md" />
            <div class="flex justify-end gap-1 sm:col-start-6">
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </div>
        </div>
      </template>
      <template #empty-actions>
        <Button label="Добавить судью" icon="pi pi-plus" @click="openCreate" />
      </template>
      <DataTable :value="items" data-key="id" striped-rows>
        <Column header="Фамилия имя">
          <template #body="{ data }">
            {{ data.lastName }} {{ data.firstName }}
          </template>
        </Column>
        <Column header="Категория" style="min-width: 7rem">
          <template #body="{ data }">
            <span v-if="data.refereeCategory" class="text-surface-900 dark:text-surface-100">
              {{ data.refereeCategory.name }}
            </span>
            <span v-else class="text-muted-color">—</span>
          </template>
        </Column>
        <Column header="Позиция" style="min-width: 7rem">
          <template #body="{ data }">
            <span v-if="data.refereePosition" class="text-surface-900 dark:text-surface-100">
              {{ data.refereePosition.name }}
            </span>
            <span v-else class="text-muted-color">—</span>
          </template>
        </Column>
        <Column field="phone" header="Телефон" />
        <Column field="note" header="Примечание" />
        <Column header="" style="width: 8rem" body-class="!text-end">
          <template #body="{ data }">
            <Button icon="pi pi-pencil" text rounded severity="secondary" @click="openEdit(data)" />
            <Button icon="pi pi-trash" text rounded severity="danger" @click="openDeleteDialog(data)" />
          </template>
        </Column>
      </DataTable>
    </AdminDataState>

    <Dialog
      v-model:visible="showForm"
      modal
      block-scroll
      :header="isEdit ? 'Редактировать судью' : 'Новый судья'"
      :style="{ width: '26rem' }"
    >
      <div class="flex flex-col gap-3">
        <div>
          <label class="text-sm block mb-1">Фамилия *</label>
          <InputText v-model="form.lastName" class="w-full" :invalid="showLastNameError" />
          <p v-if="showLastNameError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.lastName }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Имя *</label>
          <InputText v-model="form.firstName" class="w-full" :invalid="showFirstNameError" />
          <p v-if="showFirstNameError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.firstName }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Категория</label>
          <Select
            v-model="form.refereeCategoryId"
            :options="categorySelectOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            placeholder="Не выбрано"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Позиция</label>
          <Select
            v-model="form.refereePositionId"
            :options="positionSelectOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            placeholder="Не выбрано"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Телефон</label>
          <InputText v-model="form.phone" class="w-full" />
        </div>
        <div>
          <label class="text-sm block mb-1">Примечание</label>
          <Textarea
            v-model="form.note"
            class="w-full"
            rows="4"
            auto-resize
            placeholder="Произвольный текст"
          />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" label="Отмена" text @click="showForm = false" />
          <Button type="button" label="Сохранить" icon="pi pi-check" :loading="saving" :disabled="saving || (submitAttempted && !canSave)" @click="save" />
        </div>
      </div>
    </Dialog>

    <Dialog
      :visible="deleteDialogVisible"
      modal
      block-scroll
      header="Удалить судью?"
      :style="{ width: 'min(24rem, 100vw - 2rem)' }"
      :closable="!deleteSaving"
      @update:visible="(v) => (deleteDialogVisible = v)"
      @hide="onDeleteDialogHide"
    >
      <p v-if="deleteTarget" class="text-sm text-surface-700 dark:text-surface-200">
        Будет удалена карточка
        <span class="font-semibold text-surface-900 dark:text-surface-0">
          {{ deleteTarget.lastName }} {{ deleteTarget.firstName }}
        </span>
        . Если судья назначен на матчи, операция может быть отклонена сервером.
      </p>
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <Button type="button" label="Отмена" text :disabled="deleteSaving" @click="deleteDialogVisible = false" />
          <Button
            type="button"
            label="Удалить"
            icon="pi pi-trash"
            severity="danger"
            :loading="deleteSaving"
            @click="confirmDelete"
          />
        </div>
      </template>
    </Dialog>
  </section>
</template>

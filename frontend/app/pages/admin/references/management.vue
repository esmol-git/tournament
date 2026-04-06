<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { helpers, required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { ManagementMemberRow } from '~/types/admin/management-member'
import { getApiErrorMessage } from '~/utils/apiError'
import { MIN_SKELETON_DISPLAY_MS } from '~/utils/minimumLoadingDelay'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const SKELETON_ROW_COUNT = 6
const skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => ({
  id: `mgmt-sk-${i}`,
}))

const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const tenantId = useTenantId()

const { items, loading, error, isEmpty, run, retry } = useAdminAsyncListState<ManagementMemberRow>({
  initialLoading: true,
  minLoadingMs: MIN_SKELETON_DISPLAY_MS,
  clearItemsOnError: true,
})
const saving = ref(false)
const showForm = ref(false)
const editing = ref<ManagementMemberRow | null>(null)
const isEdit = computed(() => !!editing.value)

const form = reactive({
  lastName: '',
  firstName: '',
  title: '',
  phone: '',
  email: '',
  note: '',
  sortOrder: 0 as number,
  active: true,
})
const submitAttempted = ref(false)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const rules = computed(() => ({
  lastName: { required },
  firstName: { required },
  title: { required },
  email: {
    validEmailWhenFilled: helpers.withMessage(
      'email invalid',
      (v: unknown) => !String(v ?? '').trim() || EMAIL_RE.test(String(v ?? '').trim()),
    ),
  },
}))
const v$ = useVuelidate(rules, form, { $autoDirty: true })
const formErrors = computed(() => ({
  lastName: form.lastName.trim() ? '' : t('admin.validation.required_last_name'),
  firstName: form.firstName.trim() ? '' : t('admin.validation.required_first_name'),
  title: form.title.trim() ? '' : t('admin.validation.required'),
  email:
    !form.email.trim() || EMAIL_RE.test(form.email.trim()) ? '' : t('admin.validation.invalid_email'),
}))
const canSave = computed(
  () =>
    !v$.value.$invalid &&
    !formErrors.value.lastName &&
    !formErrors.value.firstName &&
    !formErrors.value.title &&
    !formErrors.value.email,
)
const showLastNameError = computed(
  () => (submitAttempted.value || v$.value.lastName.$dirty) && !!formErrors.value.lastName,
)
const showFirstNameError = computed(
  () => (submitAttempted.value || v$.value.firstName.$dirty) && !!formErrors.value.firstName,
)
const showTitleError = computed(
  () => (submitAttempted.value || v$.value.title.$dirty) && !!formErrors.value.title,
)
const showEmailError = computed(
  () => (submitAttempted.value || v$.value.email.$dirty) && !!formErrors.value.email,
)

const fetchItems = async () => {
  if (!token.value) {
    loading.value = false
    return
  }
  await run(async () => {
    items.value = await authFetch<ManagementMemberRow[]>(
      apiUrl(`/tenants/${tenantId.value}/management-members`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  })
}

const openCreate = () => {
  submitAttempted.value = false
  editing.value = null
  form.lastName = ''
  form.firstName = ''
  form.title = ''
  form.phone = ''
  form.email = ''
  form.note = ''
  form.sortOrder = 0
  form.active = true
  v$.value.$reset()
  showForm.value = true
}

const openEdit = (row: ManagementMemberRow) => {
  submitAttempted.value = false
  editing.value = row
  form.lastName = row.lastName
  form.firstName = row.firstName
  form.title = row.title
  form.phone = row.phone ?? ''
  form.email = row.email ?? ''
  form.note = row.note ?? ''
  form.sortOrder = row.sortOrder
  form.active = row.active
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
    const body = {
      lastName: form.lastName.trim(),
      firstName: form.firstName.trim(),
      title: form.title.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      note: form.note.trim() || undefined,
      sortOrder: form.sortOrder,
      active: form.active,
    }
    if (isEdit.value) {
      await authFetch(
        apiUrl(`/tenants/${tenantId.value}/management-members/${editing.value!.id}`),
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token.value}` },
          body,
        },
      )
    } else {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/management-members`), {
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
const deleteTarget = ref<ManagementMemberRow | null>(null)
const deleteSaving = ref(false)

const openDeleteDialog = (row: ManagementMemberRow) => {
  deleteTarget.value = row
  deleteDialogVisible.value = true
}

const confirmDelete = async () => {
  if (!token.value || !deleteTarget.value) return
  const row = deleteTarget.value
  deleteSaving.value = true
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/management-members/${row.id}`), {
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
        <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-0 sm:text-xl">
          Руководство
        </h1>
        <p class="mt-1 max-w-2xl text-xs leading-relaxed text-muted-color sm:text-sm">
          Руководство и официальные контакты федерации или лиги: ФИО, должность, связь. Не путать со
          справочником «Судьи» — это оргструктура, а не назначение на матчи. Вывод на публичный сайт
          можно подключить отдельно, сейчас раздел в основном для админки.
        </p>
      </div>
      <Button label="Добавить" icon="pi pi-plus" @click="openCreate" />
    </header>

    <AdminDataState
      :loading="loading"
      :error="error"
      :empty="isEmpty"
      empty-title="Пока никого не добавлено"
      empty-description="Заведите людей и должности — пригодится для отчётности и контактов внутри федерации."
      empty-icon="pi pi-users"
      error-title="Не удалось загрузить список"
      @retry="retry"
    >
      <template #loading>
        <div class="min-h-[22rem]">
          <div
            class="grid grid-cols-1 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,9rem)_minmax(0,9rem)_minmax(0,4rem)_minmax(0,4rem)_auto] gap-3 px-4 py-3 border-b border-surface-200 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-800/50"
          >
            <Skeleton height="0.75rem" width="5rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="6rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="4rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="4rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="3rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="4rem" class="rounded-md" />
            <div class="hidden sm:flex justify-end gap-1">
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </div>
          <div
            v-for="row in skeletonRows"
            :key="row.id"
            class="grid grid-cols-1 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,9rem)_minmax(0,9rem)_minmax(0,4rem)_minmax(0,4rem)_auto] gap-3 items-center px-4 py-3.5 border-b border-surface-100 dark:border-surface-800 last:border-0"
          >
            <Skeleton width="75%" height="1rem" class="rounded-md max-w-xs" />
            <Skeleton width="70%" height="0.875rem" class="rounded-md" />
            <Skeleton width="80%" height="0.875rem" class="rounded-md" />
            <Skeleton width="70%" height="0.875rem" class="rounded-md" />
            <Skeleton width="35%" height="0.875rem" class="rounded-md" />
            <Skeleton width="40%" height="0.875rem" class="rounded-md" />
            <div class="flex justify-end gap-1 sm:col-start-7">
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </div>
        </div>
      </template>
      <template #empty-actions>
        <Button label="Добавить" icon="pi pi-plus" @click="openCreate" />
      </template>
      <DataTable :value="items" data-key="id" striped-rows>
        <Column header="ФИО" style="min-width: 10rem">
          <template #body="{ data }">
            {{ data.lastName }} {{ data.firstName }}
          </template>
        </Column>
        <Column field="title" header="Должность" style="min-width: 9rem" />
        <Column field="email" header="Email" />
        <Column field="phone" header="Телефон" />
        <Column field="sortOrder" header="Порядок" style="width: 5rem" />
        <Column header="Активна" style="width: 6rem">
          <template #body="{ data }">
            <Tag :severity="data.active ? 'success' : 'secondary'" :value="data.active ? 'Да' : 'Нет'" />
          </template>
        </Column>
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
      :header="isEdit ? 'Редактировать' : 'Новая запись'"
      :style="{ width: 'min(28rem, calc(100vw - 2rem))' }"
    >
      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </div>
        <div>
          <label class="text-sm block mb-1">Должность *</label>
          <InputText
            v-model="form.title"
            :invalid="showTitleError"
            class="w-full"
            placeholder="Например, Председатель правления"
          />
          <p v-if="showTitleError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.title }}</p>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="text-sm block mb-1">Email</label>
            <InputText v-model="form.email" class="w-full" type="email" autocomplete="email" :invalid="showEmailError" />
            <p v-if="showEmailError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.email }}</p>
          </div>
          <div>
            <label class="text-sm block mb-1">Телефон</label>
            <InputText v-model="form.phone" class="w-full" type="tel" autocomplete="tel" />
          </div>
        </div>
        <div>
          <label class="text-sm block mb-1">Порядок в списке</label>
          <InputNumber
            v-model="form.sortOrder"
            class="w-full"
            :min="0"
            :use-grouping="false"
            input-id="mgmt_sort"
          />
        </div>
        <div class="flex items-center gap-2">
          <ToggleSwitch v-model="form.active" input-id="mgmt_active" />
          <label for="mgmt_active" class="text-sm cursor-pointer">Активна</label>
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
      header="Удалить запись руководства?"
      :style="{ width: 'min(24rem, 100vw - 2rem)' }"
      :closable="!deleteSaving"
      @update:visible="(v) => (deleteDialogVisible = v)"
      @hide="onDeleteDialogHide"
    >
      <p v-if="deleteTarget" class="text-sm text-surface-700 dark:text-surface-200">
        Будет удалена запись
        <span class="font-semibold text-surface-900 dark:text-surface-0">
          {{ deleteTarget.lastName }} {{ deleteTarget.firstName }}
        </span>
        .
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

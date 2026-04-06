<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { RefereePositionRow } from '~/types/admin/referee-position'
import { getApiErrorMessage } from '~/utils/apiError'
import { MIN_SKELETON_DISPLAY_MS } from '~/utils/minimumLoadingDelay'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const SKELETON_ROW_COUNT = 6
const skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => ({
  id: `rpos-sk-${i}`,
}))

const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const tenantId = useTenantId()

const { items, loading, error, isEmpty, run, retry } = useAdminAsyncListState<RefereePositionRow>({
  initialLoading: true,
  minLoadingMs: MIN_SKELETON_DISPLAY_MS,
  clearItemsOnError: true,
})
const saving = ref(false)
const showForm = ref(false)
const editing = ref<RefereePositionRow | null>(null)
const isEdit = computed(() => !!editing.value)

const form = reactive({
  name: '',
  code: '',
  sortOrder: 0 as number,
  active: true,
  note: '',
})
const submitAttempted = ref(false)
const rules = computed(() => ({ name: { required } }))
const v$ = useVuelidate(rules, form, { $autoDirty: true })
const formErrors = computed(() => ({ name: form.name.trim() ? '' : t('admin.validation.required_name') }))
const canSave = computed(() => !v$.value.$invalid && !formErrors.value.name)
const showNameError = computed(
  () => (submitAttempted.value || v$.value.name.$dirty) && !!formErrors.value.name,
)

const fetchItems = async () => {
  if (!token.value) {
    loading.value = false
    return
  }
  await run(async () => {
    items.value = await authFetch<RefereePositionRow[]>(
      apiUrl(`/tenants/${tenantId.value}/referee-positions`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  })
}

const openCreate = () => {
  submitAttempted.value = false
  editing.value = null
  form.name = ''
  form.code = ''
  form.sortOrder = 0
  form.active = true
  form.note = ''
  v$.value.$reset()
  showForm.value = true
}

const openEdit = (row: RefereePositionRow) => {
  submitAttempted.value = false
  editing.value = row
  form.name = row.name
  form.code = row.code ?? ''
  form.sortOrder = row.sortOrder
  form.active = row.active
  form.note = row.note ?? ''
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
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      sortOrder: form.sortOrder,
      active: form.active,
      note: form.note.trim() || undefined,
    }
    if (isEdit.value) {
      await authFetch(
        apiUrl(`/tenants/${tenantId.value}/referee-positions/${editing.value!.id}`),
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token.value}` },
          body,
        },
      )
    } else {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/referee-positions`), {
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
const deleteTarget = ref<RefereePositionRow | null>(null)
const deleteSaving = ref(false)

const openDeleteDialog = (row: RefereePositionRow) => {
  deleteTarget.value = row
  deleteDialogVisible.value = true
}

const confirmDelete = async () => {
  if (!token.value || !deleteTarget.value) return
  const row = deleteTarget.value
  deleteSaving.value = true
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/referee-positions/${row.id}`), {
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
          Позиции судей
        </h1>
        <p class="mt-1 max-w-2xl text-xs leading-relaxed text-muted-color sm:text-sm">
          Роль на матче: главный, линейный, инспектор и т.д. Позиция привязывается к судье в справочнике
          «Судьи» и показывается при назначении на турнир.
        </p>
      </div>
      <Button label="Добавить" icon="pi pi-plus" @click="openCreate" />
    </header>

    <AdminDataState
      :loading="loading"
      :error="error"
      :empty="isEmpty"
      empty-title="Пока нет позиций"
      empty-description="Добавьте роли (например, главный судья, линейный) и назначайте их судьям в справочнике."
      empty-icon="pi pi-briefcase"
      error-title="Не удалось загрузить позиции"
      @retry="retry"
    >
      <template #loading>
        <div class="min-h-[22rem]">
          <div
            class="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,5rem)_minmax(0,4rem)_minmax(0,5rem)_auto] gap-3 px-4 py-3 border-b border-surface-200 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-800/50"
          >
            <Skeleton height="0.75rem" width="6rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="3rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="4rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="4rem" class="rounded-md" />
            <div class="hidden sm:flex justify-end gap-1">
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </div>
          <div
            v-for="row in skeletonRows"
            :key="row.id"
            class="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,5rem)_minmax(0,4rem)_minmax(0,5rem)_auto] gap-3 items-center px-4 py-3.5 border-b border-surface-100 dark:border-surface-800 last:border-0"
          >
            <Skeleton width="70%" height="1rem" class="rounded-md max-w-xs" />
            <Skeleton width="50%" height="0.875rem" class="rounded-md" />
            <Skeleton width="40%" height="0.875rem" class="rounded-md" />
            <Skeleton width="55%" height="0.875rem" class="rounded-md" />
            <div class="flex justify-end gap-1 sm:col-start-5">
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </div>
        </div>
      </template>
      <template #empty-actions>
        <Button label="Добавить позицию" icon="pi pi-plus" @click="openCreate" />
      </template>
      <DataTable :value="items" data-key="id" striped-rows>
        <Column field="name" header="Название" />
        <Column field="code" header="Код" />
        <Column field="sortOrder" header="Порядок" style="width: 6rem" />
        <Column header="Активна" style="width: 7rem">
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
      :header="isEdit ? 'Редактировать позицию' : 'Новая позиция'"
      :style="{ width: '26rem' }"
    >
      <div class="flex flex-col gap-3">
        <div>
          <label class="text-sm block mb-1">Название *</label>
          <InputText v-model="form.name" class="w-full" :invalid="showNameError" placeholder="Например, Главный судья" />
          <p v-if="showNameError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.name }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Код</label>
          <InputText v-model="form.code" class="w-full" placeholder="MAIN, LINE…" />
        </div>
        <div>
          <label class="text-sm block mb-1">Порядок сортировки</label>
          <InputNumber
            v-model="form.sortOrder"
            class="w-full"
            :min="0"
            :use-grouping="false"
            input-id="rpos_sort"
          />
        </div>
        <div class="flex items-center gap-2">
          <ToggleSwitch v-model="form.active" input-id="rpos_active" />
          <label for="rpos_active" class="text-sm cursor-pointer">Активна</label>
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
      header="Удалить позицию судьи?"
      :style="{ width: 'min(24rem, 100vw - 2rem)' }"
      :closable="!deleteSaving"
      @update:visible="(v) => (deleteDialogVisible = v)"
      @hide="onDeleteDialogHide"
    >
      <p v-if="deleteTarget" class="text-sm text-surface-700 dark:text-surface-200">
        Позиция
        <span class="font-semibold text-surface-900 dark:text-surface-0">«{{ deleteTarget.name }}»</span>
        будет удалена. У судей, у которых она была выбрана, поле позиции очистится.
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

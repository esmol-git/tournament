<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { TeamCategoryRow } from '~/types/admin/team-category'
import { getApiErrorMessage } from '~/utils/apiError'
import { MIN_SKELETON_DISPLAY_MS } from '~/utils/minimumLoadingDelay'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const SKELETON_ROW_COUNT = 6
const skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => ({ id: `tc-sk-${i}` }))

const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const tenantId = useTenantId()

const { items, loading, error, isEmpty, run, retry } = useAdminAsyncListState<TeamCategoryRow>({
  initialLoading: true,
  minLoadingMs: MIN_SKELETON_DISPLAY_MS,
  clearItemsOnError: true,
})
const saving = ref(false)
const showForm = ref(false)
const editing = ref<TeamCategoryRow | null>(null)
const isEdit = computed(() => !!editing.value)

const form = reactive({
  name: '',
  slug: '',
  minBirthYear: null as number | null,
  maxBirthYear: null as number | null,
  requireBirthDate: false,
  allowedGenders: [] as Array<'MALE' | 'FEMALE'>,
})
const submitAttempted = ref(false)
const rules = computed(() => ({ name: { required } }))
const v$ = useVuelidate(rules, form, { $autoDirty: true })
const formErrors = computed(() => ({
  name: form.name.trim() ? '' : t('admin.validation.required_name'),
}))
const canSave = computed(() => !v$.value.$invalid && !formErrors.value.name)

const fetchItems = async () => {
  if (!token.value) {
    loading.value = false
    return
  }
  await run(async () => {
    items.value = await authFetch<TeamCategoryRow[]>(
      apiUrl(`/tenants/${tenantId.value}/team-categories`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  })
}

const openCreate = () => {
  submitAttempted.value = false
  editing.value = null
  form.name = ''
  form.slug = ''
  form.minBirthYear = null
  form.maxBirthYear = null
  form.requireBirthDate = false
  form.allowedGenders = []
  v$.value.$reset()
  showForm.value = true
}

const openEdit = (row: TeamCategoryRow) => {
  submitAttempted.value = false
  editing.value = row
  form.name = row.name
  form.slug = row.slug ?? ''
  form.minBirthYear = row.minBirthYear
  form.maxBirthYear = row.maxBirthYear
  form.requireBirthDate = row.requireBirthDate
  form.allowedGenders = [...(row.allowedGenders ?? [])]
  v$.value.$reset()
  showForm.value = true
}

const save = async () => {
  if (!token.value) return
  submitAttempted.value = true
  v$.value.$touch()
  if (!canSave.value) return
  saving.value = true
  try {
    const body = {
      name: form.name.trim(),
      slug: form.slug.trim() || null,
      minBirthYear: form.minBirthYear,
      maxBirthYear: form.maxBirthYear,
      requireBirthDate: form.requireBirthDate,
      allowedGenders: form.allowedGenders,
    }
    if (isEdit.value) {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/team-categories/${editing.value!.id}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
    } else {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/team-categories`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
    }
    showForm.value = false
    await fetchItems()
    toast.add({ severity: 'success', summary: 'Сохранено', life: 2500 })
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: getApiErrorMessage(e), life: 6000 })
  } finally {
    saving.value = false
  }
}

const deleteDialogVisible = ref(false)
const deleteTarget = ref<TeamCategoryRow | null>(null)
const deleteSaving = ref(false)

const openDeleteDialog = (row: TeamCategoryRow) => {
  deleteTarget.value = row
  deleteDialogVisible.value = true
}

const confirmDelete = async () => {
  if (!token.value || !deleteTarget.value) return
  const row = deleteTarget.value
  deleteSaving.value = true
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/team-categories/${row.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    deleteDialogVisible.value = false
    deleteTarget.value = null
    await fetchItems()
    toast.add({ severity: 'success', summary: 'Удалено', life: 2500 })
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: 'Не удалось удалить', detail: getApiErrorMessage(e), life: 6000 })
  } finally {
    deleteSaving.value = false
  }
}

const onDeleteDialogHide = () => {
  deleteTarget.value = null
}

onMounted(() => {
  if (typeof window !== 'undefined') {
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
        <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-0 sm:text-xl">Категории команд</h1>
        <p class="mt-1 max-w-2xl text-sm leading-relaxed text-muted-color">
          <span class="text-surface-700 dark:text-surface-200">Здесь задаются правила состава:</span>
          диапазон года рождения, нужна ли дата рождения у игрока, какой пол допустим. Категорию выбирают
          у <strong class="font-medium text-surface-800 dark:text-surface-100">команды</strong> — игрока,
          не подходящего под условия, в состав обычно не добавить.
          <span class="mt-1 block">
            Это <strong class="font-medium text-surface-800 dark:text-surface-100">не</strong> то же самое,
            что «Возрастные группы»: там только короткая метка (U-17 и т.д.) для контекста и фильтров,
            без автоматической проверки годов рождения по этой подписи.
          </span>
        </p>
      </div>
      <Button label="Добавить" icon="pi pi-plus" @click="openCreate" />
    </header>

    <AdminDataState
      :loading="loading"
      :error="error"
      :empty="isEmpty"
      empty-title="Пока нет категорий"
      empty-icon="pi pi-users"
      empty-description="Добавьте категорию с диапазоном года рождения (например, только 2008–2009) и при необходимости полом — затем выберите её в карточке команды. Подпись «U-12» без цифр в справочнике возрастных групп состав сама не ограничит."
      @retry="retry"
    >
      <template #loading>
        <div
          class="min-h-[22rem] overflow-hidden rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900"
          aria-busy="true"
        >
          <div
            class="grid grid-cols-1 gap-3 border-b border-surface-200 bg-surface-50/80 px-4 py-3 dark:border-surface-700 dark:bg-surface-800/50 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,4rem)_minmax(0,3.5rem)_minmax(0,3.5rem)_minmax(0,6.5rem)_minmax(0,4.5rem)_auto]"
          >
            <Skeleton height="0.75rem" width="6rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="3rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="3rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="3rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="5rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="4rem" class="rounded-md" />
            <div class="hidden justify-end gap-1 sm:flex">
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </div>
          <div
            v-for="row in skeletonRows"
            :key="row.id"
            class="grid grid-cols-1 items-center gap-3 border-b border-surface-100 px-4 py-3.5 last:border-0 dark:border-surface-800 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,4rem)_minmax(0,3.5rem)_minmax(0,3.5rem)_minmax(0,6.5rem)_minmax(0,4.5rem)_auto]"
          >
            <Skeleton width="70%" height="1rem" class="max-w-xs rounded-md" />
            <Skeleton width="55%" height="0.875rem" class="rounded-md" />
            <Skeleton width="50%" height="0.875rem" class="rounded-md" />
            <Skeleton width="50%" height="0.875rem" class="rounded-md" />
            <Skeleton width="65%" height="0.875rem" class="rounded-md" />
            <Skeleton width="60%" height="0.875rem" class="rounded-md" />
            <div class="flex justify-end gap-1 sm:col-start-7">
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </div>
        </div>
      </template>
      <template #empty-actions>
        <Button label="Добавить категорию" icon="pi pi-plus" @click="openCreate" />
      </template>
      <DataTable :value="items" data-key="id" striped-rows>
        <Column field="name" header="Название" />
        <Column field="slug" header="Slug" />
        <Column field="minBirthYear" header="Мин. год" />
        <Column field="maxBirthYear" header="Макс. год" />
        <Column header="Дата рождения" style="width: 9rem">
          <template #body="{ data }">
            <Tag
              :severity="data.requireBirthDate ? 'warning' : 'secondary'"
              :value="data.requireBirthDate ? 'Обязательна' : 'Необязательна'"
            />
          </template>
        </Column>
        <Column header="Пол">
          <template #body="{ data }">
            <span v-if="!data.allowedGenders?.length" class="text-muted-color">Любой</span>
            <span v-else>{{ data.allowedGenders.join(', ') }}</span>
          </template>
        </Column>
        <Column header="" style="width: 8rem" body-class="!text-end">
          <template #body="{ data }">
            <Button icon="pi pi-pencil" text rounded severity="secondary" @click="openEdit(data)" />
            <Button icon="pi pi-trash" text rounded severity="danger" @click="openDeleteDialog(data)" />
          </template>
        </Column>
      </DataTable>
    </AdminDataState>

    <Dialog :visible="showForm" @update:visible="(v) => (showForm = v)" modal block-scroll :header="isEdit ? 'Редактировать категорию' : 'Новая категория'" :style="{ width: '28rem' }">
      <div class="flex flex-col gap-3">
        <div>
          <label class="text-sm block mb-1">Название *</label>
          <InputText v-model="form.name" class="w-full" :invalid="submitAttempted && !!formErrors.name" />
          <p v-if="submitAttempted && formErrors.name" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.name }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Slug</label>
          <InputText v-model="form.slug" class="w-full" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm block mb-1">Мин. год</label>
            <InputNumber v-model="form.minBirthYear" class="w-full" :min="1900" :use-grouping="false" />
          </div>
          <div>
            <label class="text-sm block mb-1">Макс. год</label>
            <InputNumber v-model="form.maxBirthYear" class="w-full" :min="1900" :use-grouping="false" />
          </div>
        </div>
        <div class="flex items-center gap-2">
          <ToggleSwitch v-model="form.requireBirthDate" input-id="tc_birth_req" />
          <label for="tc_birth_req" class="text-sm cursor-pointer">Требовать дату рождения</label>
        </div>
        <div>
          <label class="text-sm block mb-1">Допустимый пол</label>
          <MultiSelect
            v-model="form.allowedGenders"
            :options="[{ value: 'MALE', label: 'Мужской' }, { value: 'FEMALE', label: 'Женский' }]"
            option-label="label"
            option-value="value"
            class="w-full"
            :maxSelectedLabels="0"
            selectedItemsLabel="Выбрано: {0}"
            placeholder="Любой"
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
      header="Удалить категорию команды?"
      :style="{ width: 'min(24rem, 100vw - 2rem)' }"
      :closable="!deleteSaving"
      @update:visible="(v) => (deleteDialogVisible = v)"
      @hide="onDeleteDialogHide"
    >
      <p v-if="deleteTarget" class="text-sm text-surface-700 dark:text-surface-200">
        Запись
        <span class="font-semibold text-surface-900 dark:text-surface-0">«{{ deleteTarget.name }}»</span>
        будет удалена. Команды с этой категорией потеряют привязку (поле очистится).
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

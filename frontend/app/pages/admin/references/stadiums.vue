<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { RegionRow } from '~/types/admin/region'
import type { StadiumRow } from '~/types/admin/stadium'
import { getApiErrorMessage } from '~/utils/apiError'
import { MIN_SKELETON_DISPLAY_MS } from '~/utils/minimumLoadingDelay'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const SKELETON_ROW_COUNT = 6
const skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => ({ id: `st-sk-${i}` }))

const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const tenantId = useTenantId()

const { items, loading, error, isEmpty, run, retry } = useAdminAsyncListState<StadiumRow>({
  initialLoading: true,
  minLoadingMs: MIN_SKELETON_DISPLAY_MS,
  clearItemsOnError: true,
})
const saving = ref(false)
const showForm = ref(false)
const editing = ref<StadiumRow | null>(null)
const isEdit = computed(() => !!editing.value)

const regionsList = ref<RegionRow[]>([])
const regionsLoading = ref(false)

const form = reactive({
  name: '',
  address: '',
  city: '',
  regionId: '',
  surface: '',
  pitchCount: null as number | null,
  capacity: null as number | null,
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

const regionSelectOptions = computed(() => [
  { label: 'Не указано', value: '' },
  ...regionsList.value
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'))
    .map((r) => ({
      label: r.active ? r.name : `${r.name} (неактивен)`,
      value: r.id,
    })),
])

async function fetchRegions() {
  if (!token.value) return
  regionsLoading.value = true
  try {
    regionsList.value = await authFetch<RegionRow[]>(
      apiUrl(`/tenants/${tenantId.value}/regions`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  } catch {
    regionsList.value = []
  } finally {
    regionsLoading.value = false
  }
}

const fetchItems = async () => {
  if (!token.value) {
    loading.value = false
    return
  }
  await run(async () => {
    items.value = await authFetch<StadiumRow[]>(
      apiUrl(`/tenants/${tenantId.value}/stadiums`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  })
}

const openCreate = () => {
  submitAttempted.value = false
  editing.value = null
  form.name = ''
  form.address = ''
  form.city = ''
  form.regionId = ''
  form.surface = ''
  form.pitchCount = null
  form.capacity = null
  form.note = ''
  v$.value.$reset()
  showForm.value = true
  void fetchRegions()
}

const openEdit = (row: StadiumRow) => {
  submitAttempted.value = false
  editing.value = row
  form.name = row.name
  form.address = row.address ?? ''
  form.city = row.city ?? ''
  form.regionId = row.regionId ?? ''
  form.surface = row.surface ?? ''
  form.pitchCount = row.pitchCount ?? null
  form.capacity = row.capacity ?? null
  form.note = row.note ?? ''
  v$.value.$reset()
  showForm.value = true
  void fetchRegions()
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
    const rid = form.regionId.trim()
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      note: form.note.trim() || undefined,
    }
    if (isEdit.value) {
      Object.assign(body, {
        regionId: rid || null,
        surface: form.surface.trim() || null,
        pitchCount: form.pitchCount ?? null,
        capacity: form.capacity ?? null,
      })
    } else {
      if (rid) body.regionId = rid
      if (form.surface.trim()) body.surface = form.surface.trim()
      if (form.pitchCount != null) body.pitchCount = form.pitchCount
      if (form.capacity != null) body.capacity = form.capacity
    }
    if (isEdit.value) {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/stadiums/${editing.value!.id}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
    } else {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/stadiums`), {
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
const deleteTarget = ref<StadiumRow | null>(null)
const deleteSaving = ref(false)

const openDeleteDialog = (row: StadiumRow) => {
  deleteTarget.value = row
  deleteDialogVisible.value = true
}

const confirmDelete = async () => {
  if (!token.value || !deleteTarget.value) return
  const row = deleteTarget.value
  deleteSaving.value = true
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/stadiums/${row.id}`), {
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
        <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-0 sm:text-xl">Стадионы</h1>
        <p class="mt-1 max-w-2xl text-xs leading-relaxed text-muted-color sm:text-sm">
          Площадки проведения игр: адрес, покрытие, число полей, вместимость. В карточке турнира
          выбирается основная арена — её можно показывать на публичной странице и использовать при
          планировании матчей.
        </p>
      </div>
      <Button label="Добавить" icon="pi pi-plus" @click="openCreate" />
    </header>

    <AdminDataState
      :loading="loading"
      :error="error"
      :empty="isEmpty"
      empty-title="Пока нет стадионов"
      empty-description="Создайте площадку — её можно будет выбрать при создании или редактировании турнира."
      empty-icon="pi pi-building"
      error-title="Не удалось загрузить стадионы"
      @retry="retry"
    >
      <template #loading>
        <div class="min-h-[22rem]">
          <div
            class="grid grid-cols-1 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,5.5rem)_minmax(0,3.25rem)_minmax(0,3.75rem)_minmax(0,5.5rem)_minmax(0,4.5rem)_minmax(0,7rem)_auto] gap-3 px-4 py-3 border-b border-surface-200 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-800/50"
          >
            <Skeleton height="0.75rem" width="5rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="4.5rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="2.5rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="3rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="4rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="3.5rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="4rem" class="rounded-md" />
            <div class="hidden sm:flex justify-end gap-1">
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </div>
          <div
            v-for="row in skeletonRows"
            :key="row.id"
            class="grid grid-cols-1 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,5.5rem)_minmax(0,3.25rem)_minmax(0,3.75rem)_minmax(0,5.5rem)_minmax(0,4.5rem)_minmax(0,7rem)_auto] gap-3 items-center px-4 py-3.5 border-b border-surface-100 dark:border-surface-800 last:border-0"
          >
            <Skeleton width="68%" height="1rem" class="rounded-md max-w-xs" />
            <Skeleton width="55%" height="0.875rem" class="rounded-md" />
            <Skeleton width="40%" height="0.875rem" class="rounded-md" />
            <Skeleton width="45%" height="0.875rem" class="rounded-md" />
            <Skeleton width="50%" height="0.875rem" class="rounded-md" />
            <Skeleton width="55%" height="0.875rem" class="rounded-md" />
            <Skeleton width="75%" height="0.875rem" class="rounded-md" />
            <div class="flex justify-end gap-1 sm:col-start-8">
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </div>
        </div>
      </template>
      <template #empty-actions>
        <Button label="Добавить стадион" icon="pi pi-plus" @click="openCreate" />
      </template>
      <DataTable :value="items" data-key="id" striped-rows>
        <Column field="name" header="Название" />
        <Column header="Покрытие" style="min-width: 6rem">
          <template #body="{ data }">
            <span v-if="data.surface">{{ data.surface }}</span>
            <span v-else class="text-muted-color">—</span>
          </template>
        </Column>
        <Column header="Полей" style="width: 4.5rem">
          <template #body="{ data }">
            <span v-if="data.pitchCount != null">{{ data.pitchCount }}</span>
            <span v-else class="text-muted-color">—</span>
          </template>
        </Column>
        <Column header="Вмест." style="width: 4.5rem">
          <template #body="{ data }">
            <span v-if="data.capacity != null">{{ data.capacity }}</span>
            <span v-else class="text-muted-color">—</span>
          </template>
        </Column>
        <Column header="Регион" style="min-width: 8rem">
          <template #body="{ data }">
            <span v-if="data.region?.name">{{ data.region.name }}</span>
            <span v-else class="text-muted-color">—</span>
          </template>
        </Column>
        <Column field="city" header="Город" />
        <Column field="address" header="Адрес" />
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
      :header="isEdit ? 'Редактировать стадион' : 'Новый стадион'"
      :style="{ width: 'min(30rem, 100vw - 2rem)' }"
    >
      <div class="flex flex-col gap-3">
        <div>
          <label class="text-sm block mb-1">Название *</label>
          <InputText v-model="form.name" class="w-full" :invalid="showNameError" />
          <p v-if="showNameError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.name }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Город</label>
          <InputText v-model="form.city" class="w-full" />
        </div>
        <FloatLabel variant="on" class="block">
          <Select
            inputId="stadium_region"
            v-model="form.regionId"
            :options="regionSelectOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            :loading="regionsLoading"
          />
          <label for="stadium_region">Регион (справочник)</label>
        </FloatLabel>
        <div>
          <label class="text-sm block mb-1">Адрес</label>
          <InputText v-model="form.address" class="w-full" />
        </div>
        <div>
          <label class="text-sm block mb-1">Покрытие</label>
          <InputText
            v-model="form.surface"
            class="w-full"
            placeholder="Например, натуральная трава, синтетика"
          />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="text-sm block mb-1">Число полей</label>
            <InputNumber
              v-model="form.pitchCount"
              class="w-full"
              :min="1"
              :use-grouping="false"
              input-id="stadium_pitch_count"
              placeholder="—"
            />
            <p class="mt-1 text-[11px] text-muted-color leading-snug">
              Игровых полей или кортов на объекте
            </p>
          </div>
          <div>
            <label class="text-sm block mb-1">Вместимость зрителей</label>
            <InputNumber
              v-model="form.capacity"
              class="w-full"
              :min="0"
              :use-grouping="false"
              input-id="stadium_capacity"
              placeholder="—"
            />
          </div>
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
      header="Удалить стадион?"
      :style="{ width: 'min(24rem, 100vw - 2rem)' }"
      :closable="!deleteSaving"
      @update:visible="(v) => (deleteDialogVisible = v)"
      @hide="onDeleteDialogHide"
    >
      <p v-if="deleteTarget" class="text-sm text-surface-700 dark:text-surface-200">
        Стадион
        <span class="font-semibold text-surface-900 dark:text-surface-0">«{{ deleteTarget.name }}»</span>
        будет удалён. Если площадка указана в матчах, операция может быть отклонена сервером.
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

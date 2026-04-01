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
import { MIN_SKELETON_DISPLAY_MS, sleepRemainingAfter } from '~/utils/minimumLoadingDelay'

definePageMeta({ layout: 'admin' })

const SKELETON_ROW_COUNT = 6
const skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => ({ id: `st-sk-${i}` }))

const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const tenantId = useTenantId()

const loading = ref(true)
const saving = ref(false)
const items = ref<StadiumRow[]>([])
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
  const loadStartedAt = Date.now()
  loading.value = true
  try {
    items.value = await authFetch<StadiumRow[]>(
      apiUrl(`/tenants/${tenantId.value}/stadiums`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  } catch {
    toast.add({ severity: 'error', summary: 'Не удалось загрузить стадионы', life: 5000 })
  } finally {
    await sleepRemainingAfter(MIN_SKELETON_DISPLAY_MS, loadStartedAt)
    loading.value = false
  }
}

const openCreate = () => {
  submitAttempted.value = false
  editing.value = null
  form.name = ''
  form.address = ''
  form.city = ''
  form.regionId = ''
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
    const body = {
      name: form.name.trim(),
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      note: form.note.trim() || undefined,
      ...(isEdit.value
        ? { regionId: rid || null }
        : rid
          ? { regionId: rid }
          : {}),
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

const remove = async (row: StadiumRow) => {
  if (!token.value) return
  if (!confirm(`Удалить стадион «${row.name}»?`)) return
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/stadiums/${row.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await fetchItems()
    toast.add({ severity: 'success', summary: 'Удалено', life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось удалить',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  }
}

onMounted(() => {
  if (process.client) {
    syncWithStorage()
    if (!loggedIn.value) {
      router.push('/admin/login')
      return
    }
  }
  void fetchItems()
})
</script>

<template>
  <section class="p-6 space-y-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-0">Стадионы</h1>
        <p class="mt-1 text-sm text-muted-color max-w-2xl">
          Площадки проведения игр (название, город, адрес). В карточке турнира выбирается основная
          арена — её можно показывать в публичной информации о турнире и использовать при планировании
          матчей.
        </p>
      </div>
      <Button label="Добавить" icon="pi pi-plus" @click="openCreate" />
    </header>

    <Transition name="st-dir-fade" mode="out-in">
      <div
        v-if="loading"
        key="sk"
        class="rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900 overflow-hidden min-h-[22rem]"
        aria-busy="true"
      >
        <div
          class="grid grid-cols-1 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,6rem)_minmax(0,7rem)_minmax(0,1.5fr)_auto] gap-3 px-4 py-3 border-b border-surface-200 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-800/50"
        >
          <Skeleton height="0.75rem" width="5rem" class="rounded-md" />
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
          class="grid grid-cols-1 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,6rem)_minmax(0,7rem)_minmax(0,1.5fr)_auto] gap-3 items-center px-4 py-3.5 border-b border-surface-100 dark:border-surface-800 last:border-0"
        >
          <Skeleton width="68%" height="1rem" class="rounded-md max-w-xs" />
          <Skeleton width="50%" height="0.875rem" class="rounded-md" />
          <Skeleton width="55%" height="0.875rem" class="rounded-md" />
          <Skeleton width="75%" height="0.875rem" class="rounded-md" />
          <div class="flex justify-end gap-1 sm:col-start-5">
            <Skeleton shape="circle" width="2rem" height="2rem" />
            <Skeleton shape="circle" width="2rem" height="2rem" />
          </div>
        </div>
      </div>

      <div
        v-else-if="!items.length"
        key="empty"
        class="rounded-xl border border-dashed border-surface-300 bg-surface-0/60 px-6 py-14 text-center dark:border-surface-600 dark:bg-surface-900/40"
      >
        <div
          class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner"
        >
          <i class="pi pi-building text-3xl" aria-hidden="true" />
        </div>
        <h2 class="mt-5 text-lg font-semibold text-surface-900 dark:text-surface-0">
          Пока нет стадионов
        </h2>
        <p class="mt-2 text-sm text-muted-color max-w-md mx-auto leading-relaxed">
          Создайте площадку — её можно будет выбрать при создании или редактировании турнира.
        </p>
        <Button
          class="mt-6"
          label="Добавить стадион"
          icon="pi pi-plus"
          @click="openCreate"
        />
      </div>

      <DataTable v-else key="dt" :value="items" data-key="id" striped-rows>
      <Column field="name" header="Название" />
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
          <Button icon="pi pi-trash" text rounded severity="danger" @click="remove(data)" />
        </template>
      </Column>
    </DataTable>
    </Transition>

    <Dialog
      v-model:visible="showForm"
      modal
      :header="isEdit ? 'Редактировать стадион' : 'Новый стадион'"
      :style="{ width: '26rem' }"
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
          <label class="text-sm block mb-1">Примечание</label>
          <AdminMarkdownEditor v-model="form.note" compact />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <Button label="Отмена" text @click="showForm = false" />
          <Button label="Сохранить" icon="pi pi-check" :loading="saving" :disabled="saving || (submitAttempted && !canSave)" @click="save" />
        </div>
      </div>
    </Dialog>
  </section>
</template>

<style scoped>
.st-dir-fade-enter-active,
.st-dir-fade-leave-active {
  transition: opacity 0.22s ease;
}
.st-dir-fade-enter-from,
.st-dir-fade-leave-to {
  opacity: 0;
}
</style>

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
import { MIN_SKELETON_DISPLAY_MS, sleepRemainingAfter } from '~/utils/minimumLoadingDelay'

definePageMeta({ layout: 'admin' })

const SKELETON_ROW_COUNT = 6
const skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => ({ id: `ref-sk-${i}` }))

const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const tenantId = useTenantId()

const loading = ref(true)
const saving = ref(false)
const categories = ref<RefereeCategoryRow[]>([])
const positions = ref<RefereePositionRow[]>([])
const items = ref<RefereeRow[]>([])

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
  const loadStartedAt = Date.now()
  loading.value = true
  try {
    await Promise.all([fetchCategories(), fetchPositions()])
    items.value = await authFetch<RefereeRow[]>(
      apiUrl(`/tenants/${tenantId.value}/referees`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  } catch {
    toast.add({ severity: 'error', summary: 'Не удалось загрузить судей', life: 5000 })
  } finally {
    await sleepRemainingAfter(MIN_SKELETON_DISPLAY_MS, loadStartedAt)
    loading.value = false
  }
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

const remove = async (row: RefereeRow) => {
  if (!token.value) return
  if (!confirm(`Удалить судью ${row.lastName} ${row.firstName}?`)) return
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/referees/${row.id}`), {
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
        <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-0">Судьи</h1>
        <p class="mt-1 text-sm text-muted-color max-w-2xl">
          Контакты и атрибуты судей тенанта. В разделе «Турниры» судьи из этого списка назначаются на
          конкретный турнир; категория и позиция задаются в соседних справочниках и подставляются в
          карточку судьи.
        </p>
      </div>
      <Button label="Добавить" icon="pi pi-plus" @click="openCreate" />
    </header>

    <Transition name="ref-dir-fade" mode="out-in">
      <div
        v-if="loading"
        key="sk"
        class="rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900 overflow-hidden min-h-[22rem]"
        aria-busy="true"
      >
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

      <div
        v-else-if="!items.length"
        key="empty"
        class="rounded-xl border border-dashed border-surface-300 bg-surface-0/60 px-6 py-14 text-center dark:border-surface-600 dark:bg-surface-900/40"
      >
        <div
          class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner"
        >
          <i class="pi pi-users text-3xl" aria-hidden="true" />
        </div>
        <h2 class="mt-5 text-lg font-semibold text-surface-900 dark:text-surface-0">
          Пока нет судей
        </h2>
        <p class="mt-2 text-sm text-muted-color max-w-md mx-auto leading-relaxed">
          Добавьте записи в справочник — их можно будет назначать на турниры при создании или
          редактировании.
        </p>
        <Button
          class="mt-6"
          label="Добавить судью"
          icon="pi pi-plus"
          @click="openCreate"
        />
      </div>

      <DataTable v-else key="dt" :value="items" data-key="id" striped-rows>
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
          <Button icon="pi pi-trash" text rounded severity="danger" @click="remove(data)" />
        </template>
      </Column>
    </DataTable>
    </Transition>

    <Dialog
      v-model:visible="showForm"
      modal
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
.ref-dir-fade-enter-active,
.ref-dir-fade-leave-active {
  transition: opacity 0.22s ease;
}
.ref-dir-fade-enter-from,
.ref-dir-fade-leave-to {
  opacity: 0;
}
</style>

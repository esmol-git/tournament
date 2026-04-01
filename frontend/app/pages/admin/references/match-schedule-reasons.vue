<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { MatchScheduleReasonRow } from '~/types/admin/match-schedule-reason'
import { getApiErrorMessage } from '~/utils/apiError'
import { MIN_SKELETON_DISPLAY_MS, sleepRemainingAfter } from '~/utils/minimumLoadingDelay'

definePageMeta({ layout: 'admin' })

const SCOPE_OPTIONS = [
  { value: 'BOTH', label: 'Перенос и отмена' },
  { value: 'POSTPONE', label: 'Только перенос' },
  { value: 'CANCEL', label: 'Только отмена' },
] as const

const SKELETON_ROW_COUNT = 6
const skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => ({ id: `msr-sk-${i}` }))

const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const tenantId = useTenantId()

const loading = ref(true)
const saving = ref(false)
const items = ref<MatchScheduleReasonRow[]>([])
const showForm = ref(false)
const editing = ref<MatchScheduleReasonRow | null>(null)
const isEdit = computed(() => !!editing.value)

const form = reactive({
  name: '',
  code: '',
  scope: 'BOTH' as MatchScheduleReasonRow['scope'],
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
  const loadStartedAt = Date.now()
  loading.value = true
  try {
    items.value = await authFetch<MatchScheduleReasonRow[]>(
      apiUrl(`/tenants/${tenantId.value}/match-schedule-reasons`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Не удалось загрузить причины',
      life: 5000,
    })
  } finally {
    await sleepRemainingAfter(MIN_SKELETON_DISPLAY_MS, loadStartedAt)
    loading.value = false
  }
}

const openCreate = () => {
  submitAttempted.value = false
  editing.value = null
  form.name = ''
  form.code = ''
  form.scope = 'BOTH'
  form.sortOrder = 0
  form.active = true
  form.note = ''
  v$.value.$reset()
  showForm.value = true
}

const openEdit = (row: MatchScheduleReasonRow) => {
  submitAttempted.value = false
  editing.value = row
  form.name = row.name
  form.code = row.code ?? ''
  form.scope = row.scope
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
      scope: form.scope,
      sortOrder: form.sortOrder,
      active: form.active,
      note: form.note.trim() || undefined,
    }
    if (isEdit.value) {
      await authFetch(
        apiUrl(`/tenants/${tenantId.value}/match-schedule-reasons/${editing.value!.id}`),
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token.value}` },
          body,
        },
      )
    } else {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/match-schedule-reasons`), {
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

const remove = async (row: MatchScheduleReasonRow) => {
  if (!token.value) return
  if (!confirm(`Удалить «${row.name}»?`)) return
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/match-schedule-reasons/${row.id}`), {
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

const scopeLabel = (s: string) => SCOPE_OPTIONS.find((o) => o.value === s)?.label ?? s

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
        <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-0">
          Причины переноса и отмены матча
        </h1>
        <p class="mt-1 text-sm text-muted-color max-w-2xl">
          Справочник для журналирования: при смене времени матча или переводе в статус «Отменён» в
          протоколе можно указать причину из списка (и комментарий).
        </p>
      </div>
      <Button label="Добавить" icon="pi pi-plus" @click="openCreate" />
    </header>

    <Transition name="msr-fade" mode="out-in">
      <div
        v-if="loading"
        key="sk"
        class="rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900 overflow-hidden min-h-[22rem]"
        aria-busy="true"
      >
        <div
          class="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,6rem)_minmax(0,4rem)_minmax(0,4rem)_auto] gap-3 px-4 py-3 border-b border-surface-200 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-800/50"
        >
          <Skeleton height="0.75rem" width="8rem" class="rounded-md" />
          <Skeleton height="0.75rem" width="6rem" class="rounded-md" />
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
          class="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,6rem)_minmax(0,4rem)_minmax(0,4rem)_auto] gap-3 items-center px-4 py-3.5 border-b border-surface-100 dark:border-surface-800 last:border-0"
        >
          <Skeleton width="65%" height="1rem" class="rounded-md max-w-xs" />
          <Skeleton width="70%" height="0.875rem" class="rounded-md" />
          <Skeleton width="40%" height="0.875rem" class="rounded-md" />
          <Skeleton width="55%" height="0.875rem" class="rounded-md" />
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
          <i class="pi pi-calendar-times text-3xl" aria-hidden="true" />
        </div>
        <h2 class="mt-5 text-lg font-semibold text-surface-900 dark:text-surface-0">
          Пока нет записей
        </h2>
        <p class="mt-2 text-sm text-muted-color max-w-md mx-auto leading-relaxed">
          Создайте причины для переносов и отмен матчей.
        </p>
        <Button class="mt-6" label="Добавить" icon="pi pi-plus" @click="openCreate" />
      </div>

      <DataTable v-else key="dt" :value="items" data-key="id" striped-rows>
        <Column field="name" header="Название" />
        <Column field="code" header="Код" />
        <Column header="Область">
          <template #body="{ data }">
            {{ scopeLabel(data.scope) }}
          </template>
        </Column>
        <Column field="sortOrder" header="Порядок" style="width: 6rem" />
        <Column header="Активен" style="width: 7rem">
          <template #body="{ data }">
            <Tag :severity="data.active ? 'success' : 'secondary'" :value="data.active ? 'Да' : 'Нет'" />
          </template>
        </Column>
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
      :header="isEdit ? 'Редактировать' : 'Новая запись'"
      :style="{ width: '26rem' }"
    >
      <div class="flex flex-col gap-3">
        <div>
          <label class="text-sm block mb-1">Название *</label>
          <InputText v-model="form.name" class="w-full" :invalid="showNameError" placeholder="Например, Погода" />
          <p v-if="showNameError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.name }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Код</label>
          <InputText v-model="form.code" class="w-full" placeholder="WEATHER" />
        </div>
        <div>
          <label class="text-sm block mb-1">Область применения *</label>
          <Select
            v-model="form.scope"
            :options="[...SCOPE_OPTIONS]"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Порядок сортировки</label>
          <InputNumber
            v-model="form.sortOrder"
            class="w-full"
            :min="0"
            :use-grouping="false"
            input-id="msr_sort"
          />
        </div>
        <div class="flex items-center gap-2">
          <ToggleSwitch v-model="form.active" input-id="msr_active" />
          <label for="msr_active" class="text-sm cursor-pointer">Активен</label>
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
.msr-fade-enter-active,
.msr-fade-leave-active {
  transition: opacity 0.22s ease;
}
.msr-fade-enter-from,
.msr-fade-leave-to {
  opacity: 0;
}
</style>

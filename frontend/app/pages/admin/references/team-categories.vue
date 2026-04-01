<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { TeamCategoryRow } from '~/types/admin/team-category'
import { getApiErrorMessage } from '~/utils/apiError'
import { MIN_SKELETON_DISPLAY_MS, sleepRemainingAfter } from '~/utils/minimumLoadingDelay'

definePageMeta({ layout: 'admin' })

const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const tenantId = useTenantId()

const loading = ref(true)
const saving = ref(false)
const items = ref<TeamCategoryRow[]>([])
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
  const started = Date.now()
  loading.value = true
  try {
    items.value = await authFetch<TeamCategoryRow[]>(
      apiUrl(`/tenants/${tenantId.value}/team-categories`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  } catch {
    toast.add({ severity: 'error', summary: 'Не удалось загрузить категории команд', life: 5000 })
  } finally {
    await sleepRemainingAfter(MIN_SKELETON_DISPLAY_MS, started)
    loading.value = false
  }
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

const remove = async (row: TeamCategoryRow) => {
  if (!token.value) return
  if (!confirm(`Удалить «${row.name}»?`)) return
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/team-categories/${row.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await fetchItems()
    toast.add({ severity: 'success', summary: 'Удалено', life: 2500 })
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: 'Не удалось удалить', detail: getApiErrorMessage(e), life: 6000 })
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
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
        <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-0">Категории команд</h1>
        <p class="mt-1 text-sm text-muted-color">Ограничения состава по возрасту и полу.</p>
      </div>
      <Button label="Добавить" icon="pi pi-plus" @click="openCreate" />
    </header>

    <DataTable :value="items" :loading="loading" data-key="id" striped-rows>
      <Column field="name" header="Название" />
      <Column field="slug" header="Slug" />
      <Column field="minBirthYear" header="Мин. год" />
      <Column field="maxBirthYear" header="Макс. год" />
      <Column header="Дата рождения" style="width: 9rem">
        <template #body="{ data }">
          <Tag :severity="data.requireBirthDate ? 'warning' : 'secondary'" :value="data.requireBirthDate ? 'Обязательна' : 'Необязательна'" />
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
          <Button icon="pi pi-trash" text rounded severity="danger" @click="remove(data)" />
        </template>
      </Column>
    </DataTable>

    <Dialog :visible="showForm" @update:visible="(v) => (showForm = v)" modal :header="isEdit ? 'Редактировать категорию' : 'Новая категория'" :style="{ width: '28rem' }">
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
          <Button label="Отмена" text @click="showForm = false" />
          <Button label="Сохранить" icon="pi pi-check" :loading="saving" :disabled="saving || (submitAttempted && !canSave)" @click="save" />
        </div>
      </div>
    </Dialog>
  </section>
</template>

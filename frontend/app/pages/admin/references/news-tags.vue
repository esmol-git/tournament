<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { NewsTagRow } from '~/types/admin/news-tag'
import { getApiErrorMessage } from '~/utils/apiError'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()
const tenantId = useTenantId()
const toast = useToast()

const { items, loading, error, isEmpty, run, retry } = useAdminAsyncListState<NewsTagRow>({
  initialLoading: true,
  clearItemsOnError: true,
})
const saving = ref(false)
const showForm = ref(false)
const editing = ref<NewsTagRow | null>(null)
const isEdit = computed(() => !!editing.value)

const form = reactive({
  name: '',
  slug: '',
  sortOrder: 0,
  active: true,
})
const submitAttempted = ref(false)
const rules = computed(() => ({
  name: { required },
  slug: { required },
}))
const v$ = useVuelidate(rules, form, { $autoDirty: true })
const canSave = computed(() => !v$.value.$invalid)

const fetchItems = async () => {
  if (!token.value) {
    loading.value = false
    return
  }
  await run(async () => {
    items.value = await authFetch<NewsTagRow[]>(apiUrl(`/tenants/${tenantId.value}/news-tags`), {
      headers: { Authorization: `Bearer ${token.value}` },
    })
  })
}

const openCreate = () => {
  submitAttempted.value = false
  editing.value = null
  form.name = ''
  form.slug = ''
  form.sortOrder = 0
  form.active = true
  v$.value.$reset()
  showForm.value = true
}

const openEdit = (row: NewsTagRow) => {
  submitAttempted.value = false
  editing.value = row
  form.name = row.name
  form.slug = row.slug
  form.sortOrder = row.sortOrder
  form.active = row.active
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
      slug: form.slug.trim(),
      sortOrder: form.sortOrder,
      active: form.active,
    }
    if (isEdit.value) {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/news-tags/${editing.value!.id}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
    } else {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/news-tags`), {
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
      summary: 'Не удалось сохранить',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    saving.value = false
  }
}

const deleteDialogVisible = ref(false)
const deleteTarget = ref<NewsTagRow | null>(null)
const deleteSaving = ref(false)

const openDeleteDialog = (row: NewsTagRow) => {
  deleteTarget.value = row
  deleteDialogVisible.value = true
}

const confirmDelete = async () => {
  if (!token.value || !deleteTarget.value) return
  const row = deleteTarget.value
  deleteSaving.value = true
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/news-tags/${row.id}`), {
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
        <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-0 sm:text-xl">Теги новостей</h1>
        <p class="mt-1 max-w-2xl text-xs leading-relaxed text-muted-color sm:text-sm">
          Каталог тематических меток для новостей: используется в фильтрах и для навигации на
          публичных страницах.
        </p>
      </div>
      <Button label="Добавить" icon="pi pi-plus" @click="openCreate" />
    </header>

    <AdminDataState
      :loading="loading"
      :error="error"
      :empty="isEmpty"
      empty-title="Пока нет тегов"
      empty-description="Создайте теги для фильтров новостей и навигации на публичных страницах."
      error-title="Не удалось загрузить теги новостей"
      @retry="retry"
    >
      <template #empty-actions>
        <Button label="Добавить" icon="pi pi-plus" @click="openCreate" />
      </template>
      <DataTable :value="items" data-key="id" striped-rows>
        <Column field="name" header="Название" />
        <Column field="slug" header="Slug" />
        <Column field="sortOrder" header="Порядок" style="width: 6rem" />
        <Column header="Активен" style="width: 7rem">
          <template #body="{ data }">
            <Tag :severity="data.active ? 'success' : 'secondary'" :value="data.active ? 'Да' : 'Нет'" />
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

    <Dialog
      v-model:visible="showForm"
      modal
      block-scroll
      :header="isEdit ? 'Редактировать тег' : 'Новый тег'"
      :style="{ width: '28rem' }"
    >
      <div class="space-y-3">
        <div>
          <label class="mb-1 block text-sm">Название *</label>
          <InputText v-model="form.name" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-sm">Slug *</label>
          <InputText v-model="form.slug" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-sm">Порядок</label>
          <InputNumber v-model="form.sortOrder" class="w-full" :min="0" />
        </div>
        <div class="flex items-center gap-2">
          <ToggleSwitch v-model="form.active" input-id="news_tag_active" />
          <label for="news_tag_active" class="cursor-pointer text-sm">Активен</label>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button type="button" label="Отмена" text @click="showForm = false" />
          <Button type="button" label="Сохранить" icon="pi pi-check" :loading="saving" :disabled="saving || (submitAttempted && !canSave)" @click="save" />
        </div>
      </template>
    </Dialog>

    <Dialog
      :visible="deleteDialogVisible"
      modal
      block-scroll
      header="Удалить тег новостей?"
      :style="{ width: 'min(24rem, 100vw - 2rem)' }"
      :closable="!deleteSaving"
      @update:visible="(v) => (deleteDialogVisible = v)"
      @hide="onDeleteDialogHide"
    >
      <p v-if="deleteTarget" class="text-sm text-surface-700 dark:text-surface-200">
        Тег
        <span class="font-semibold text-surface-900 dark:text-surface-0">«{{ deleteTarget.name }}»</span>
        будет удалён. Если он уже привязан к новостям, операция может быть отклонена сервером.
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

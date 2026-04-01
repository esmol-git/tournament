<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { helpers, required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { ReferenceDocumentRow } from '~/types/admin/reference-document'
import type { TournamentRow, TournamentListResponse } from '~/types/admin/tournaments-index'
import { getApiErrorMessage } from '~/utils/apiError'
import { MIN_SKELETON_DISPLAY_MS, sleepRemainingAfter } from '~/utils/minimumLoadingDelay'

definePageMeta({ layout: 'admin' })

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
const SKELETON_ROW_COUNT = 6
const skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => ({ id: `doc-sk-${i}` }))

const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const tenantId = useTenantId()

const loading = ref(true)
const saving = ref(false)
const items = ref<ReferenceDocumentRow[]>([])
const tournaments = ref<TournamentRow[]>([])
const tournamentsLoading = ref(false)
const showForm = ref(false)
const editing = ref<ReferenceDocumentRow | null>(null)
const isEdit = computed(() => !!editing.value)

const form = reactive({
  title: '',
  code: '',
  tournamentId: '',
  url: '',
  sortOrder: 0 as number,
  active: true,
  note: '',
})
const submitAttempted = ref(false)
const HTTP_URL_RE = /^https?:\/\/\S+$/i
const rules = computed(() => ({
  title: { required },
  url: {
    validUrlWhenFilled: helpers.withMessage(
      'url invalid',
      (v: unknown) => !String(v ?? '').trim() || HTTP_URL_RE.test(String(v ?? '').trim()),
    ),
  },
}))
const v$ = useVuelidate(rules, form, { $autoDirty: true })
const formErrors = computed(() => ({
  title: form.title.trim() ? '' : t('admin.validation.required_title'),
  url:
    !form.url.trim() || HTTP_URL_RE.test(form.url.trim())
      ? ''
      : t('admin.validation.invalid_url'),
}))
const canSave = computed(() => !v$.value.$invalid && !formErrors.value.title && !formErrors.value.url)
const showTitleError = computed(
  () => (submitAttempted.value || v$.value.title.$dirty) && !!formErrors.value.title,
)
const showUrlError = computed(
  () => (submitAttempted.value || v$.value.url.$dirty) && !!formErrors.value.url,
)

const docFileInput = ref<HTMLInputElement | null>(null)
const docUploading = ref(false)
const tournamentSelectOptions = computed(() => [
  { label: 'Общий документ (для всех турниров)', value: '' },
  ...tournaments.value.map((t) => ({ label: t.name, value: t.id })),
])

const fetchTournaments = async () => {
  if (!token.value) return
  tournamentsLoading.value = true
  try {
    const res = await authFetch<TournamentListResponse>(
      apiUrl(`/tenants/${tenantId.value}/tournaments`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
        params: { page: 1, pageSize: 300 },
      },
    )
    tournaments.value = (res.items ?? []).slice()
  } catch {
    tournaments.value = []
  } finally {
    tournamentsLoading.value = false
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
    items.value = await authFetch<ReferenceDocumentRow[]>(
      apiUrl(`/tenants/${tenantId.value}/reference-documents`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  } catch {
    toast.add({ severity: 'error', summary: 'Не удалось загрузить документы', life: 5000 })
  } finally {
    await sleepRemainingAfter(MIN_SKELETON_DISPLAY_MS, loadStartedAt)
    loading.value = false
  }
}

const openCreate = () => {
  submitAttempted.value = false
  editing.value = null
  form.title = ''
  form.code = ''
  form.tournamentId = ''
  form.url = ''
  form.sortOrder = 0
  form.active = true
  form.note = ''
  v$.value.$reset()
  showForm.value = true
}

const openEdit = (row: ReferenceDocumentRow) => {
  submitAttempted.value = false
  editing.value = row
  form.title = row.title
  form.code = row.code ?? ''
  form.tournamentId = row.tournamentId ?? ''
  form.url = row.url ?? ''
  form.sortOrder = row.sortOrder
  form.active = row.active
  form.note = row.note ?? ''
  v$.value.$reset()
  showForm.value = true
}

const triggerDocPick = () => {
  if (docUploading.value) return
  docFileInput.value?.click()
}

const onDocFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file || !token.value) return

  if (file.size > MAX_UPLOAD_BYTES) {
    toast.add({
      severity: 'warn',
      summary: 'Файл слишком большой',
      detail: 'Максимум 15 МБ.',
      life: 4000,
    })
    if (target) target.value = ''
    return
  }

  docUploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)

    const res = await authFetch<{ key: string; url: string }>(apiUrl('/upload?folder=docs'), {
      method: 'POST',
      body: fd,
    })

    form.url = res.url

    if (isEdit.value && editing.value?.id) {
      try {
        await authFetch(
          apiUrl(`/tenants/${tenantId.value}/reference-documents/${editing.value.id}`),
          {
            method: 'PATCH',
            body: { url: res.url },
            headers: { Authorization: `Bearer ${token.value}` },
          },
        )
        await fetchItems()
        toast.add({
          severity: 'success',
          summary: 'Файл загружен и ссылка сохранена',
          life: 3500,
        })
      } catch (patchErr: unknown) {
        toast.add({
          severity: 'warn',
          summary: 'Файл загружен',
          detail: `Но ссылка не записана. Нажмите «Сохранить». Ошибка: ${getApiErrorMessage(
            patchErr,
          )}`,
          life: 8000,
        })
      }
    } else {
      toast.add({
        severity: 'success',
        summary: 'Файл загружен',
        detail: 'Нажмите «Сохранить», чтобы создать документ.',
        life: 4500,
      })
    }
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось загрузить файл',
      detail: getApiErrorMessage(err),
      life: 6000,
    })
  } finally {
    docUploading.value = false
    if (target) target.value = ''
  }
}

const removeUploadedUrl = async () => {
  if (!token.value) return
  if (docUploading.value) return
  if (!form.url.trim()) return
  if (!confirm('Очистить ссылку на файл?')) return

  const prev = form.url
  form.url = ''

  if (isEdit.value && editing.value?.id) {
    try {
      await authFetch(
        apiUrl(`/tenants/${tenantId.value}/reference-documents/${editing.value.id}`),
        {
          method: 'PATCH',
          body: { url: null },
          headers: { Authorization: `Bearer ${token.value}` },
        },
      )
      await fetchItems()
      toast.add({ severity: 'success', summary: 'Ссылка очищена', life: 2500 })
    } catch (err: unknown) {
      form.url = prev
      toast.add({
        severity: 'error',
        summary: 'Не удалось очистить ссылку',
        detail: getApiErrorMessage(err),
        life: 6000,
      })
    }
  } else {
    toast.add({ severity: 'success', summary: 'Ссылка очищена', life: 2500 })
  }
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
      title: form.title.trim(),
      code: form.code.trim() || undefined,
      tournamentId: form.tournamentId.trim() || null,
      // Если пользователь очистил поле или не загрузил файл — сохраняем как `null`,
      // чтобы PATCH действительно убирал ссылку.
      url: form.url.trim() ? form.url.trim() : null,
      sortOrder: form.sortOrder,
      active: form.active,
      note: form.note.trim() || undefined,
    }
    if (isEdit.value) {
      await authFetch(
        apiUrl(`/tenants/${tenantId.value}/reference-documents/${editing.value!.id}`),
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token.value}` },
          body,
        },
      )
    } else {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/reference-documents`), {
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

const remove = async (row: ReferenceDocumentRow) => {
  if (!token.value) return
  if (!confirm(`Удалить «${row.title}»?`)) return
  try {
    await authFetch(
      apiUrl(`/tenants/${tenantId.value}/reference-documents/${row.id}`),
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token.value}` },
      },
    )
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
  void Promise.all([fetchTournaments(), fetchItems()])
})
</script>

<template>
  <section class="p-6 space-y-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-0">Документы</h1>
        <p class="mt-1 text-sm text-muted-color max-w-2xl">
          Регламенты, положения, шаблоны: файл в хранилище (PDF и т.д.) или внешняя ссылка и
          примечание. Это отдельный каталог от данных турниров и матчей — удобно хранить
          нормативные документы организации в одном месте.
        </p>
      </div>
      <Button label="Добавить" icon="pi pi-plus" @click="openCreate" />
    </header>

    <Transition name="doc-fade" mode="out-in">
      <div
        v-if="loading"
        key="sk"
        class="rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900 overflow-hidden min-h-[22rem]"
        aria-busy="true"
      >
        <div
          class="grid grid-cols-1 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,5rem)_minmax(0,1.2fr)_minmax(0,4rem)_minmax(0,5rem)_auto] gap-3 px-4 py-3 border-b border-surface-200 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-800/50"
        >
          <Skeleton height="0.75rem" width="6rem" class="rounded-md" />
          <Skeleton height="0.75rem" width="3rem" class="rounded-md" />
          <Skeleton height="0.75rem" width="5rem" class="rounded-md" />
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
          class="grid grid-cols-1 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,5rem)_minmax(0,1.2fr)_minmax(0,4rem)_minmax(0,5rem)_auto] gap-3 items-center px-4 py-3.5 border-b border-surface-100 dark:border-surface-800 last:border-0"
        >
          <Skeleton width="72%" height="1rem" class="rounded-md max-w-xs" />
          <Skeleton width="45%" height="0.875rem" class="rounded-md" />
          <Skeleton width="85%" height="0.875rem" class="rounded-md" />
          <Skeleton width="40%" height="0.875rem" class="rounded-md" />
          <Skeleton width="55%" height="0.875rem" class="rounded-md" />
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
          <i class="pi pi-file text-3xl" aria-hidden="true" />
        </div>
        <h2 class="mt-5 text-lg font-semibold text-surface-900 dark:text-surface-0">
          Пока нет документов
        </h2>
        <p class="mt-2 text-sm text-muted-color max-w-md mx-auto leading-relaxed">
          Добавьте ссылки на положения и регламенты (ссылка должна начинаться с https://).
        </p>
        <Button class="mt-6" label="Добавить документ" icon="pi pi-plus" @click="openCreate" />
      </div>

      <DataTable v-else key="dt" :value="items" data-key="id" striped-rows>
        <Column field="title" header="Название" style="min-width: 10rem" />
        <Column field="code" header="Код" />
        <Column header="Область" style="min-width: 10rem">
          <template #body="{ data }">
            <Tag
              v-if="data.tournamentId"
              severity="info"
              :value="data.tournament?.name || 'Турнир'"
            />
            <Tag v-else severity="secondary" value="Общий" />
          </template>
        </Column>
        <Column header="Ссылка" style="min-width: 12rem">
          <template #body="{ data }">
            <a
              v-if="data.url"
              :href="data.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary hover:underline text-sm break-all"
            >
              {{ data.url }}
            </a>
            <span v-else class="text-muted-color">—</span>
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
      :visible="showForm"
      @update:visible="(v) => (showForm = v)"
      modal
      :header="isEdit ? 'Редактировать документ' : 'Новый документ'"
      :style="{ width: 'min(28rem, calc(100vw - 2rem))' }"
    >
      <div class="flex flex-col gap-3">
        <div>
          <label class="text-sm block mb-1">Название *</label>
          <InputText v-model="form.title" class="w-full" :invalid="showTitleError" placeholder="Положение о соревнованиях" />
          <p v-if="showTitleError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.title }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Код</label>
          <InputText v-model="form.code" class="w-full" />
        </div>
        <div>
          <label class="text-sm block mb-1">Привязка к турниру</label>
          <Select
            v-model="form.tournamentId"
            :options="tournamentSelectOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            :loading="tournamentsLoading"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Загрузить файл</label>
          <div class="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              icon="pi pi-upload"
              :label="docUploading ? 'Загрузка…' : 'Выбрать файл'"
              :loading="docUploading"
              :disabled="docUploading"
              @click="triggerDocPick"
            />
            <Button
              v-if="form.url"
              type="button"
              icon="pi pi-trash"
              severity="danger"
              rounded
              text
              aria-label="Очистить ссылку"
              :disabled="docUploading"
              @click="removeUploadedUrl"
            />
            <input
              ref="docFileInput"
              type="file"
              class="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,image/*"
              @change="onDocFileChange"
            />
          </div>
          <div v-if="form.url" class="mt-2 text-xs text-muted-color break-all leading-relaxed">
            <a :href="form.url" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">
              Открыть загруженный файл
            </a>
          </div>
        </div>
        <div>
          <label class="text-sm block mb-1">Ссылка (https://…)</label>
          <InputText
            v-model="form.url"
            class="w-full"
            :invalid="showUrlError"
            type="url"
            placeholder="https://example.com/doc.pdf"
            autocomplete="off"
          />
          <p v-if="showUrlError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.url }}</p>
        </div>
        <div>
          <label class="text-sm block mb-1">Порядок сортировки</label>
          <InputNumber
            v-model="form.sortOrder"
            class="w-full"
            :min="0"
            :use-grouping="false"
            input-id="doc_sort"
          />
        </div>
        <div class="flex items-center gap-2">
          <ToggleSwitch v-model="form.active" input-id="doc_active" />
          <label for="doc_active" class="text-sm cursor-pointer">Активен</label>
        </div>
        <div>
          <label class="text-sm block mb-1">Примечание</label>
          <AdminMarkdownEditor v-model="form.note" compact />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <Button label="Отмена" text @click="showForm = false" />
          <Button label="Сохранить" icon="pi pi-check" :loading="saving" :disabled="saving || docUploading || (submitAttempted && !canSave)" @click="save" />
        </div>
      </div>
    </Dialog>
  </section>
</template>

<style scoped>
.doc-fade-enter-active,
.doc-fade-leave-active {
  transition: opacity 0.22s ease;
}
.doc-fade-enter-from,
.doc-fade-leave-to {
  opacity: 0;
}
</style>

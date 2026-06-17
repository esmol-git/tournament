<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { CompetitionEditionListRow, CompetitionAudience, EditionStatus, SanctionScope } from '~/types/admin/competition-edition'
import type { SeasonRow } from '~/types/admin/season'
import type { CompetitionRow } from '~/types/admin/competition'
import { getApiErrorMessage } from '~/utils/apiError'
import { MIN_SKELETON_DISPLAY_MS } from '~/utils/minimumLoadingDelay'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'
import { slugifyFromTitle } from '~/utils/slugify'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const tenantId = useTenantId()

const { items, loading, error, isEmpty, run, retry } = useAdminAsyncListState<CompetitionEditionListRow>({
  initialLoading: true,
  minLoadingMs: MIN_SKELETON_DISPLAY_MS,
  clearItemsOnError: true,
})

const SKELETON_ROW_COUNT = 6
const skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => ({ id: `edn-sk-${i}` }))

const seasons = ref<SeasonRow[]>([])
const competitions = ref<CompetitionRow[]>([])
const refsLoading = ref(false)
const saving = ref(false)
const showForm = ref(false)
const deleteDialogVisible = ref(false)
const deleteTarget = ref<CompetitionEditionListRow | null>(null)
const deleteSaving = ref(false)

const form = reactive({
  name: '',
  slug: '',
  description: '',
  seasonId: '',
  competitionId: '',
  audience: 'OPEN' as CompetitionAudience,
  sanctionScope: 'EDITION' as SanctionScope,
  status: 'DRAFT' as EditionStatus,
  published: false,
})

const submitAttempted = ref(false)
const rules = computed(() => ({
  name: { required },
  slug: { required },
  seasonId: { required },
  competitionId: { required },
}))
const v$ = useVuelidate(rules, form, { $autoDirty: true })
const canSave = computed(() => !v$.value.$invalid)

const audienceOptions = computed(() => [
  { label: t('admin.editions.audience_youth'), value: 'YOUTH' },
  { label: t('admin.editions.audience_adult_amateur'), value: 'ADULT_AMATEUR' },
  { label: t('admin.editions.audience_adult_competitive'), value: 'ADULT_COMPETITIVE' },
  { label: t('admin.editions.audience_open'), value: 'OPEN' },
])

const sanctionScopeOptions = computed(() => [
  { label: t('admin.editions.sanction_tournament'), value: 'TOURNAMENT' },
  { label: t('admin.editions.sanction_edition'), value: 'EDITION' },
])

const statusOptions = computed(() => [
  { label: t('admin.editions.status_draft'), value: 'DRAFT' },
  { label: t('admin.editions.status_active'), value: 'ACTIVE' },
  { label: t('admin.editions.status_archived'), value: 'ARCHIVED' },
])

function ensureUniqueSlug(base: string, reserved: Set<string>) {
  const trimmed = String(base ?? '').trim().toLowerCase().slice(0, 80)
  if (!trimmed) return ''
  if (!reserved.has(trimmed)) return trimmed
  for (let i = 2; i < 10_000; i++) {
    const next = `${trimmed}-${i}`.slice(0, 80)
    if (!reserved.has(next)) return next
  }
  return trimmed
}

const slugTouched = ref(false)
const existingSlugs = computed(() => new Set(items.value.map((x) => String(x.slug ?? '').toLowerCase())))

watch(
  () => form.name,
  (name) => {
    if (slugTouched.value) return
    if (form.slug.trim()) return
    const base = slugifyFromTitle(name, '')
    form.slug = ensureUniqueSlug(base, existingSlugs.value)
  },
)

const fetchItems = async () => {
  if (!token.value) {
    loading.value = false
    return
  }
  await run(async () => {
    items.value = await authFetch<CompetitionEditionListRow[]>(
      apiUrl(`/tenants/${tenantId.value}/editions`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  })
}

const fetchRefs = async () => {
  if (!token.value) return
  refsLoading.value = true
  try {
    const headers = { Authorization: `Bearer ${token.value}` }
    const [s, c] = await Promise.all([
      authFetch<SeasonRow[]>(apiUrl(`/tenants/${tenantId.value}/seasons`), { headers }),
      authFetch<CompetitionRow[]>(apiUrl(`/tenants/${tenantId.value}/competitions`), { headers }),
    ])
    seasons.value = s
    competitions.value = c
  } finally {
    refsLoading.value = false
  }
}

const openEdition = (row: CompetitionEditionListRow) => {
  router.push({
    path: `/admin/editions/${row.id}`,
    state: { editionPreview: { name: row.name, slug: row.slug } },
  })
}

const openCreate = () => {
  submitAttempted.value = false
  form.name = ''
  form.slug = ''
  slugTouched.value = false
  form.description = ''
  form.seasonId = seasons.value[0]?.id ?? ''
  form.competitionId = competitions.value[0]?.id ?? ''
  form.audience = 'OPEN'
  form.sanctionScope = 'EDITION'
  form.status = 'DRAFT'
  form.published = false
  v$.value.$reset()
  showForm.value = true
}

const openDeleteDialog = (row: CompetitionEditionListRow) => {
  deleteTarget.value = row
  deleteDialogVisible.value = true
}

const confirmDelete = async () => {
  if (!token.value || !deleteTarget.value) return
  const row = deleteTarget.value
  deleteSaving.value = true
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/editions/${row.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    toast.add({ severity: 'success', summary: 'Удалено', life: 2500 })
    deleteDialogVisible.value = false
    deleteTarget.value = null
    await fetchItems()
  } catch (e) {
    toast.add({ severity: 'error', summary: getApiErrorMessage(e), life: 5000 })
  } finally {
    deleteSaving.value = false
  }
}

const save = async () => {
  if (!token.value) return
  submitAttempted.value = true
  v$.value.$touch()
  if (!canSave.value) return
  saving.value = true
  try {
    const created = await authFetch<{ id: string }>(apiUrl(`/tenants/${tenantId.value}/editions`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
      body: {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || undefined,
        seasonId: form.seasonId,
        competitionId: form.competitionId,
        audience: form.audience,
        sanctionScope: form.sanctionScope,
        status: form.status,
        published: form.published,
      },
    })
    toast.add({ severity: 'success', summary: t('admin.editions.created'), life: 3000 })
    showForm.value = false
    await router.push({
      path: `/admin/editions/${created.id}`,
      state: { editionPreview: { name: form.name.trim(), slug: form.slug.trim() } },
    })
  } catch (e) {
    toast.add({ severity: 'error', summary: getApiErrorMessage(e), life: 5000 })
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  syncWithStorage()
  if (!loggedIn.value) return
  await Promise.all([fetchItems(), fetchRefs()])
})
</script>

<template>
  <section class="admin-page space-y-4 sm:space-y-6">
    <header class="admin-toolbar-responsive flex flex-wrap items-start justify-between gap-2 sm:gap-3">
      <div>
        <h1 class="text-xl font-bold text-surface-900 dark:text-surface-0 sm:text-2xl">
          {{ t('admin.editions.title') }}
        </h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-color">
          {{ t('admin.editions.subtitle') }}
        </p>
      </div>
      <Button :label="t('admin.editions.create')" icon="pi pi-plus" @click="openCreate" />
    </header>

    <AdminDataState
      :loading="loading"
      :error="error"
      :empty="isEmpty"
      empty-title="Пока нет серий"
      empty-description="Создайте серию, а затем привяжите к ней один или несколько турниров — сезон, тип соревнования и регламент будут общими."
      empty-icon="pi pi-sitemap"
      error-title="Не удалось загрузить серии"
      @retry="retry(fetchItems)"
    >
      <template #loading>
        <div class="min-h-[22rem]">
          <div
            class="grid grid-cols-[minmax(0,1fr)_8rem_10rem_5rem_7rem_3rem] items-center gap-3 border-b border-surface-200 bg-surface-50/80 px-4 py-3 text-xs uppercase tracking-wide text-muted-color dark:border-surface-700 dark:bg-surface-800/50"
          >
            <Skeleton height="0.75rem" width="6rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="4rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="6rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="3rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="4rem" class="rounded-md" />
            <div class="flex justify-end">
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </div>
          <div
            v-for="row in skeletonRows"
            :key="row.id"
            class="grid grid-cols-[minmax(0,1fr)_8rem_10rem_5rem_7rem_3rem] items-center gap-3 border-b border-surface-100 px-4 py-3.5 dark:border-surface-800 last:border-0"
          >
            <Skeleton width="70%" height="1rem" class="rounded-md max-w-xs" />
            <Skeleton width="55%" height="0.875rem" class="rounded-md" />
            <Skeleton width="75%" height="0.875rem" class="rounded-md" />
            <Skeleton width="35%" height="0.875rem" class="rounded-md" />
            <Skeleton width="55%" height="0.875rem" class="rounded-md" />
            <div class="flex justify-end">
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </div>
        </div>
      </template>
      <template #empty-actions>
        <Button :label="t('admin.editions.create')" icon="pi pi-plus" @click="openCreate" />
      </template>
      <div class="overflow-x-auto rounded-xl border border-surface-200 dark:border-surface-700">
        <table class="w-full min-w-[640px] table-fixed text-sm">
          <thead class="bg-surface-50 text-left text-xs uppercase tracking-wide text-muted-color dark:bg-surface-900">
            <tr>
              <th class="px-4 py-3">{{ t('admin.editions.col_name') }}</th>
              <th class="px-4 py-3 w-32">{{ t('admin.editions.col_season') }}</th>
              <th class="px-4 py-3 w-44">{{ t('admin.editions.col_competition') }}</th>
              <th class="px-4 py-3 w-20">{{ t('admin.editions.col_tournaments') }}</th>
              <th class="px-4 py-3 w-28">{{ t('admin.editions.col_status') }}</th>
              <th class="px-2 py-3 w-12 text-right"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in items"
              :key="row.id"
              class="cursor-pointer border-t border-surface-200 hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-900/60"
              @click="openEdition(row)"
            >
              <td class="px-4 py-3 font-medium text-surface-900 dark:text-surface-0 truncate">
                {{ row.name }}
                <span v-if="row.published" class="ml-2 text-xs text-primary-500">{{ t('admin.editions.published_badge') }}</span>
              </td>
              <td class="px-4 py-3 text-muted-color truncate">{{ row.season.name }}</td>
              <td class="px-4 py-3 text-muted-color truncate">{{ row.competition.name }}</td>
              <td class="px-4 py-3">{{ row._count.tournaments }}</td>
              <td class="px-4 py-3">
                <Tag :value="row.status" severity="secondary" />
              </td>
              <td class="px-2 py-3 text-right">
                <Button
                  icon="pi pi-trash"
                  text
                  rounded
                  severity="danger"
                  :disabled="row._count.tournaments > 0"
                  @click.stop="openDeleteDialog(row)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminDataState>

    <Dialog
      v-model:visible="showForm"
      modal
      :header="t('admin.editions.create')"
      :style="{ width: 'min(36rem, calc(100vw - 2rem))' }"
    >
      <div class="flex flex-col gap-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.field_name') }}</label>
          <InputText v-model="form.name" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-muted-color">Slug</label>
          <InputText v-model="form.slug" class="w-full" @input="slugTouched = true" />
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.field_season') }}</label>
            <Select v-model="form.seasonId" :options="seasons" option-label="name" option-value="id" :loading="refsLoading" class="w-full" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.field_competition') }}</label>
            <Select v-model="form.competitionId" :options="competitions" option-label="name" option-value="id" :loading="refsLoading" class="w-full" />
          </div>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.field_audience') }}</label>
            <Select v-model="form.audience" :options="audienceOptions" option-label="label" option-value="value" class="w-full" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.field_sanction_scope') }}</label>
            <Select v-model="form.sanctionScope" :options="sanctionScopeOptions" option-label="label" option-value="value" class="w-full" />
          </div>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.field_description') }}</label>
          <Textarea v-model="form.description" rows="3" class="w-full" auto-resize />
        </div>
      </div>
      <template #footer>
        <Button :label="t('admin.editions.cancel')" severity="secondary" text @click="showForm = false" />
        <Button :label="t('admin.editions.save')" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="deleteDialogVisible"
      modal
      header="Удалить серию"
      :style="{ width: 'min(28rem, calc(100vw - 2rem))' }"
    >
      <p class="m-0 text-sm text-muted-color">
        {{ deleteTarget?.name }}
      </p>
      <p class="mt-2 text-sm text-muted-color">
        Удаление возможно только если нет привязанных турниров.
      </p>
      <div class="mt-4 flex justify-end gap-2">
        <Button type="button" label="Отмена" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button
          type="button"
          label="Удалить"
          severity="danger"
          :loading="deleteSaving"
          :disabled="deleteSaving"
          @click="confirmDelete"
        />
      </div>
    </Dialog>
  </section>
</template>

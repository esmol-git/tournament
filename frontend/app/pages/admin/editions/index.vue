<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
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

const seasons = ref<SeasonRow[]>([])
const competitions = ref<CompetitionRow[]>([])
const refsLoading = ref(false)
const saving = ref(false)
const showForm = ref(false)

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

function slugifyName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

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

const openCreate = () => {
  submitAttempted.value = false
  form.name = ''
  form.slug = ''
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
    await router.push(`/admin/editions/${created.id}`)
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
  <div class="admin-page-stack">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-surface-900 dark:text-surface-0 sm:text-2xl">
          {{ t('admin.editions.title') }}
        </h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-color">
          {{ t('admin.editions.subtitle') }}
        </p>
      </div>
      <Button :label="t('admin.editions.create')" icon="pi pi-plus" @click="openCreate" />
    </div>

    <AdminDataState
      :loading="loading"
      :error="error"
      :is-empty="isEmpty"
      @retry="retry(fetchItems)"
    >
      <div class="overflow-x-auto rounded-xl border border-surface-200 dark:border-surface-700">
        <table class="w-full min-w-[720px] text-sm">
          <thead class="bg-surface-50 text-left text-xs uppercase tracking-wide text-muted-color dark:bg-surface-900">
            <tr>
              <th class="px-4 py-3">{{ t('admin.editions.col_name') }}</th>
              <th class="px-4 py-3">{{ t('admin.editions.col_season') }}</th>
              <th class="px-4 py-3">{{ t('admin.editions.col_competition') }}</th>
              <th class="px-4 py-3">{{ t('admin.editions.col_tournaments') }}</th>
              <th class="px-4 py-3">{{ t('admin.editions.col_status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in items"
              :key="row.id"
              class="cursor-pointer border-t border-surface-200 hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-900/60"
              @click="router.push(`/admin/editions/${row.id}`)"
            >
              <td class="px-4 py-3 font-medium text-surface-900 dark:text-surface-0">
                {{ row.name }}
                <span v-if="row.published" class="ml-2 text-xs text-primary-500">{{ t('admin.editions.published_badge') }}</span>
              </td>
              <td class="px-4 py-3 text-muted-color">{{ row.season.name }}</td>
              <td class="px-4 py-3 text-muted-color">{{ row.competition.name }}</td>
              <td class="px-4 py-3">{{ row._count.tournaments }}</td>
              <td class="px-4 py-3">
                <Tag :value="row.status" severity="secondary" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminDataState>

    <Dialog v-model:visible="showForm" modal :header="t('admin.editions.create')" :style="{ width: '36rem' }">
      <div class="flex flex-col gap-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.field_name') }}</label>
          <InputText v-model="form.name" class="w-full" @blur="form.slug = form.slug || slugifyName(form.name)" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-muted-color">Slug</label>
          <InputText v-model="form.slug" class="w-full" />
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { AgeGroupRow } from '~/types/admin/age-group'
import { getApiErrorMessage } from '~/utils/apiError'
import {
  buildAdultAgeGroupFields,
  buildOpenAgeGroupFields,
  buildYouthAgeGroupFields,
  buildYouthAgeGroupRange,
  detectAgeGroupConventionKind,
  parseAdultMinAgeFromCode,
  parseYouthBirthYearFromCode,
  type AgeGroupConventionKind,
} from '~/utils/ageGroupConvention'
import { MIN_SKELETON_DISPLAY_MS } from '~/utils/minimumLoadingDelay'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const SKELETON_ROW_COUNT = 6
const skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => ({ id: `ag-sk-${i}` }))

const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const tenantId = useTenantId()

const { items, loading, error, isEmpty, run, retry } = useAdminAsyncListState<AgeGroupRow>({
  initialLoading: true,
  minLoadingMs: MIN_SKELETON_DISPLAY_MS,
  clearItemsOnError: true,
})
const saving = ref(false)
const showForm = ref(false)
const editing = ref<AgeGroupRow | null>(null)
const isEdit = computed(() => !!editing.value)

const conventionKind = ref<AgeGroupConventionKind>('youth')
const youthBirthYear = ref<number | null>(new Date().getFullYear() - 8)
const adultMinAge = ref(35)
const adultReferenceYear = ref(new Date().getFullYear())

const showBulkDialog = ref(false)
const bulkFromYear = ref(2012)
const bulkToYear = ref(2020)
const bulkSaving = ref(false)

const form = reactive({
  name: '',
  shortLabel: '',
  code: '',
  minBirthYear: null as number | null,
  maxBirthYear: null as number | null,
  sortOrder: 0 as number,
  active: true,
  note: '',
})
const submitAttempted = ref(false)
const rules = computed(() => ({
  name: { required },
}))
const v$ = useVuelidate(rules, form, { $autoDirty: true })
const formErrors = computed(() => ({
  name: form.name.trim() ? '' : t('admin.validation.required_name'),
}))
const canSave = computed(() => !v$.value.$invalid && !formErrors.value.name)
const showNameError = computed(
  () => (submitAttempted.value || v$.value.name.$dirty) && !!formErrors.value.name,
)

const conventionKindOptions = computed(() => [
  { label: t('admin.references.age_groups.kind_youth'), value: 'youth' as const },
  { label: t('admin.references.age_groups.kind_adult'), value: 'adult' as const },
  { label: t('admin.references.age_groups.kind_open'), value: 'open' as const },
  { label: t('admin.references.age_groups.kind_custom'), value: 'custom' as const },
])

const existingCodes = computed(() => new Set(items.value.map((r) => (r.code ?? '').trim().toUpperCase())))

function applyConventionToForm() {
  if (conventionKind.value === 'custom') return

  let fields
  if (conventionKind.value === 'youth' && youthBirthYear.value != null) {
    fields = buildYouthAgeGroupFields(youthBirthYear.value)
  } else if (conventionKind.value === 'adult') {
    fields = buildAdultAgeGroupFields(adultMinAge.value, adultReferenceYear.value)
  } else if (conventionKind.value === 'open') {
    fields = buildOpenAgeGroupFields()
  } else {
    return
  }

  form.code = fields.code
  form.name = fields.name
  form.shortLabel = fields.shortLabel
  form.minBirthYear = fields.minBirthYear
  form.maxBirthYear = fields.maxBirthYear
  form.sortOrder = fields.sortOrder
  if (fields.note) form.note = fields.note
}

function syncConventionInputsFromForm() {
  const kind = detectAgeGroupConventionKind(form.code)
  conventionKind.value = kind
  if (kind === 'youth') {
    const y = parseYouthBirthYearFromCode(form.code)
    if (y != null) youthBirthYear.value = y
  } else if (kind === 'adult') {
    const a = parseAdultMinAgeFromCode(form.code)
    if (a != null) adultMinAge.value = a
  }
}

watch(conventionKind, (kind) => {
  if (kind !== 'custom') applyConventionToForm()
})

watch([youthBirthYear, adultMinAge, adultReferenceYear], () => {
  if (conventionKind.value === 'youth' || conventionKind.value === 'adult') {
    applyConventionToForm()
  }
})

const fetchItems = async () => {
  if (!token.value) {
    loading.value = false
    return
  }
  await run(async () => {
    items.value = await authFetch<AgeGroupRow[]>(
      apiUrl(`/tenants/${tenantId.value}/age-groups`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  })
}

const openCreate = () => {
  submitAttempted.value = false
  editing.value = null
  conventionKind.value = 'youth'
  youthBirthYear.value = new Date().getFullYear() - 8
  adultMinAge.value = 35
  adultReferenceYear.value = new Date().getFullYear()
  form.name = ''
  form.shortLabel = ''
  form.code = ''
  form.minBirthYear = null
  form.maxBirthYear = null
  form.sortOrder = 0
  form.active = true
  form.note = ''
  applyConventionToForm()
  v$.value.$reset()
  showForm.value = true
}

const openEdit = (row: AgeGroupRow) => {
  submitAttempted.value = false
  editing.value = row
  form.name = row.name
  form.shortLabel = row.shortLabel ?? ''
  form.code = row.code ?? ''
  form.minBirthYear = row.minBirthYear ?? null
  form.maxBirthYear = row.maxBirthYear ?? null
  form.sortOrder = row.sortOrder
  form.active = row.active
  form.note = row.note ?? ''
  syncConventionInputsFromForm()
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
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      shortLabel: form.shortLabel.trim() || undefined,
      code: form.code.trim() || undefined,
      sortOrder: form.sortOrder,
      active: form.active,
      note: form.note.trim() || undefined,
    }
    if (isEdit.value) {
      body.minBirthYear = form.minBirthYear
      body.maxBirthYear = form.maxBirthYear
    } else {
      if (form.minBirthYear != null) body.minBirthYear = form.minBirthYear
      if (form.maxBirthYear != null) body.maxBirthYear = form.maxBirthYear
    }
    if (isEdit.value) {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/age-groups/${editing.value!.id}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
    } else {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/age-groups`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
    }
    showForm.value = false
    await fetchItems()
    toast.add({ severity: 'success', summary: t('admin.references.age_groups.saved'), life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.references.age_groups.save_error'),
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    saving.value = false
  }
}

async function createBulkYouthRange() {
  if (!token.value) return
  bulkSaving.value = true
  try {
    const planned = buildYouthAgeGroupRange(bulkFromYear.value, bulkToYear.value)
    let created = 0
    let skipped = 0
    const headers = { Authorization: `Bearer ${token.value}` }

    for (const row of planned) {
      if (existingCodes.value.has(row.code.toUpperCase())) {
        skipped += 1
        continue
      }
      await authFetch(apiUrl(`/tenants/${tenantId.value}/age-groups`), {
        method: 'POST',
        headers,
        body: {
          name: row.name,
          shortLabel: row.shortLabel,
          code: row.code,
          minBirthYear: row.minBirthYear,
          maxBirthYear: row.maxBirthYear,
          sortOrder: row.sortOrder,
          active: true,
        },
      })
      created += 1
    }

    showBulkDialog.value = false
    await fetchItems()
    toast.add({
      severity: created ? 'success' : 'info',
      summary: t('admin.references.age_groups.bulk_done'),
      detail: t('admin.references.age_groups.bulk_result', { created, skipped }),
      life: 5000,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.references.age_groups.bulk_error'),
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    bulkSaving.value = false
  }
}

const deleteDialogVisible = ref(false)
const deleteTarget = ref<AgeGroupRow | null>(null)
const deleteSaving = ref(false)

const openDeleteDialog = (row: AgeGroupRow) => {
  deleteTarget.value = row
  deleteDialogVisible.value = true
}

const confirmDelete = async () => {
  if (!token.value || !deleteTarget.value) return
  const row = deleteTarget.value
  deleteSaving.value = true
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/age-groups/${row.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    deleteDialogVisible.value = false
    deleteTarget.value = null
    await fetchItems()
    toast.add({ severity: 'success', summary: t('admin.references.age_groups.deleted'), life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.references.age_groups.delete_error'),
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

function formatBirthYears(row: AgeGroupRow) {
  if (row.minBirthYear == null && row.maxBirthYear == null) return '—'
  if (row.minBirthYear != null && row.maxBirthYear != null && row.minBirthYear === row.maxBirthYear) {
    return String(row.minBirthYear)
  }
  const min = row.minBirthYear ?? '…'
  const max = row.maxBirthYear ?? '…'
  return `${min}–${max}`
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
        <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-0 sm:text-xl">
          {{ t('admin.references.age_groups.title') }}
        </h1>
        <p class="mt-1 max-w-3xl text-sm leading-relaxed text-muted-color">
          {{ t('admin.references.age_groups.lead') }}
        </p>
        <div class="mt-2 flex flex-wrap gap-2 text-xs">
          <Tag severity="info" :value="t('admin.references.age_groups.badge_youth')" />
          <Tag severity="secondary" :value="t('admin.references.age_groups.badge_adult')" />
          <Tag severity="contrast" :value="t('admin.references.age_groups.badge_open')" />
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button
          :label="t('admin.references.age_groups.bulk_btn')"
          icon="pi pi-list"
          severity="secondary"
          outlined
          @click="showBulkDialog = true"
        />
        <Button :label="t('admin.references.age_groups.add')" icon="pi pi-plus" @click="openCreate" />
      </div>
    </header>

    <AdminDataState
      :loading="loading"
      :error="error"
      :empty="isEmpty"
      :empty-title="t('admin.references.age_groups.empty_title')"
      :empty-description="t('admin.references.age_groups.empty_desc')"
      empty-icon="pi pi-chart-bar"
      :error-title="t('admin.references.age_groups.load_error')"
      @retry="retry"
    >
      <template #empty-actions>
        <Button :label="t('admin.references.age_groups.add')" icon="pi pi-plus" @click="openCreate" />
        <Button
          :label="t('admin.references.age_groups.bulk_btn')"
          icon="pi pi-list"
          severity="secondary"
          outlined
          @click="showBulkDialog = true"
        />
      </template>
      <DataTable :value="items" data-key="id" striped-rows>
        <Column field="code" :header="t('admin.references.age_groups.col_code')" style="width: 6rem" />
        <Column field="name" :header="t('admin.references.age_groups.col_name')" />
        <Column field="shortLabel" :header="t('admin.references.age_groups.col_short')" style="width: 5rem" />
        <Column :header="t('admin.references.age_groups.col_birth_years')" style="width: 7rem">
          <template #body="{ data }">
            <span class="tabular-nums">{{ formatBirthYears(data) }}</span>
          </template>
        </Column>
        <Column field="sortOrder" :header="t('admin.references.age_groups.col_sort')" style="width: 5rem" />
        <Column :header="t('admin.references.age_groups.col_active')" style="width: 6rem">
          <template #body="{ data }">
            <Tag
              :severity="data.active ? 'success' : 'secondary'"
              :value="data.active ? t('admin.references.age_groups.yes') : t('admin.references.age_groups.no')"
            />
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
      :header="isEdit ? t('admin.references.age_groups.edit_title') : t('admin.references.age_groups.create_title')"
      :style="{ width: 'min(32rem, 100vw - 2rem)' }"
    >
      <div class="flex flex-col gap-3">
        <Message severity="secondary" :closable="false" class="text-xs leading-relaxed">
          {{ t('admin.references.age_groups.convention_hint') }}
        </Message>

        <div>
          <label class="mb-1 block text-sm">{{ t('admin.references.age_groups.field_kind') }}</label>
          <Select
            v-model="conventionKind"
            :options="conventionKindOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            :disabled="isEdit"
          />
        </div>

        <div v-if="conventionKind === 'youth'" class="grid grid-cols-1 gap-3">
          <div>
            <label class="mb-1 block text-sm">{{ t('admin.references.age_groups.field_birth_year') }}</label>
            <InputNumber
              v-model="youthBirthYear"
              class="w-full"
              :min="1990"
              :max="2100"
              :use-grouping="false"
            />
            <p class="mt-1 text-[11px] text-muted-color">{{ t('admin.references.age_groups.youth_hint') }}</p>
          </div>
        </div>

        <div v-else-if="conventionKind === 'adult'" class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-sm">{{ t('admin.references.age_groups.field_min_age') }}</label>
            <InputNumber v-model="adultMinAge" class="w-full" :min="18" :max="80" :use-grouping="false" />
          </div>
          <div>
            <label class="mb-1 block text-sm">{{ t('admin.references.age_groups.field_ref_year') }}</label>
            <InputNumber
              v-model="adultReferenceYear"
              class="w-full"
              :min="2000"
              :max="2100"
              :use-grouping="false"
            />
          </div>
          <p class="col-span-2 text-[11px] text-muted-color">{{ t('admin.references.age_groups.adult_hint') }}</p>
        </div>

        <div v-else-if="conventionKind === 'open'">
          <p class="text-sm text-muted-color">{{ t('admin.references.age_groups.open_hint') }}</p>
        </div>

        <div class="rounded-lg border border-surface-200 p-3 dark:border-surface-700 space-y-3">
          <p class="text-xs font-medium text-muted-color">{{ t('admin.references.age_groups.preview_title') }}</p>
          <div>
            <label class="text-sm block mb-1">{{ t('admin.references.age_groups.col_code') }}</label>
            <InputText v-model="form.code" class="w-full font-mono text-sm" :readonly="conventionKind !== 'custom'" />
          </div>
          <div>
            <label class="text-sm block mb-1">{{ t('admin.references.age_groups.col_name') }} *</label>
            <InputText v-model="form.name" class="w-full" :invalid="showNameError" />
            <p v-if="showNameError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.name }}</p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-sm block mb-1">{{ t('admin.references.age_groups.col_short') }}</label>
              <InputText v-model="form.shortLabel" class="w-full" />
            </div>
            <div>
              <label class="text-sm block mb-1">{{ t('admin.references.age_groups.col_sort') }}</label>
              <InputNumber v-model="form.sortOrder" class="w-full" :min="0" :use-grouping="false" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-sm block mb-1">{{ t('admin.references.age_groups.field_min_year') }}</label>
              <InputNumber
                v-model="form.minBirthYear"
                class="w-full"
                :min="1900"
                :max="2100"
                :use-grouping="false"
                :disabled="conventionKind !== 'custom'"
              />
            </div>
            <div>
              <label class="text-sm block mb-1">{{ t('admin.references.age_groups.field_max_year') }}</label>
              <InputNumber
                v-model="form.maxBirthYear"
                class="w-full"
                :min="1900"
                :max="2100"
                :use-grouping="false"
                :disabled="conventionKind !== 'custom'"
              />
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <ToggleSwitch v-model="form.active" input-id="ag_active" />
          <label for="ag_active" class="text-sm cursor-pointer">{{ t('admin.references.age_groups.col_active') }}</label>
        </div>
        <div>
          <label class="text-sm block mb-1">{{ t('admin.references.age_groups.field_note') }}</label>
          <Textarea v-model="form.note" class="w-full" rows="2" auto-resize />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" :label="t('admin.editions.cancel')" text @click="showForm = false" />
          <Button
            type="button"
            :label="t('admin.editions.save')"
            icon="pi pi-check"
            :loading="saving"
            :disabled="saving || (submitAttempted && !canSave)"
            @click="save"
          />
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="showBulkDialog"
      modal
      block-scroll
      :header="t('admin.references.age_groups.bulk_title')"
      :style="{ width: 'min(26rem, 100vw - 2rem)' }"
    >
      <p class="text-sm text-muted-color mb-3">{{ t('admin.references.age_groups.bulk_lead') }}</p>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-sm">{{ t('admin.references.age_groups.bulk_from') }}</label>
          <InputNumber v-model="bulkFromYear" class="w-full" :min="1990" :max="2100" :use-grouping="false" />
        </div>
        <div>
          <label class="mb-1 block text-sm">{{ t('admin.references.age_groups.bulk_to') }}</label>
          <InputNumber v-model="bulkToYear" class="w-full" :min="1990" :max="2100" :use-grouping="false" />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button type="button" :label="t('admin.editions.cancel')" text :disabled="bulkSaving" @click="showBulkDialog = false" />
          <Button
            type="button"
            :label="t('admin.references.age_groups.bulk_create')"
            icon="pi pi-check"
            :loading="bulkSaving"
            @click="createBulkYouthRange"
          />
        </div>
      </template>
    </Dialog>

    <Dialog
      :visible="deleteDialogVisible"
      modal
      block-scroll
      :header="t('admin.references.age_groups.delete_title')"
      :style="{ width: 'min(24rem, 100vw - 2rem)' }"
      :closable="!deleteSaving"
      @update:visible="(v) => (deleteDialogVisible = v)"
      @hide="onDeleteDialogHide"
    >
      <p v-if="deleteTarget" class="text-sm text-surface-700 dark:text-surface-200">
        {{ t('admin.references.age_groups.delete_confirm', { name: deleteTarget.name }) }}
      </p>
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <Button type="button" :label="t('admin.editions.cancel')" text :disabled="deleteSaving" @click="deleteDialogVisible = false" />
          <Button
            type="button"
            :label="t('admin.references.age_groups.delete_btn')"
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

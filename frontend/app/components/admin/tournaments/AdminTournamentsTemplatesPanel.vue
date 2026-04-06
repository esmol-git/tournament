<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { TournamentFormat } from '~/types/admin/tournaments-index'
import type { TournamentTemplateListItem } from '~/types/admin/tournament-template'
import { normalizeLegacyGroupsFormat } from '~/composables/admin/useTournamentForm'
import { useTournamentReferences } from '~/composables/admin/useTournamentReferences'
import { getApiErrorMessage, getApiErrorMessages } from '~/utils/apiError'
import { MIN_SKELETON_DISPLAY_MS, sleepRemainingAfter } from '~/utils/minimumLoadingDelay'
import {
  hasSubscriptionFeature,
  subscriptionPlanFromAuthUser,
} from '~/utils/subscriptionFeatures'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { computed, onMounted, reactive, ref, watch } from 'vue'

function inputNumberValue(e: unknown): unknown {
  if (e && typeof e === 'object' && 'value' in e) {
    return (e as { value?: unknown }).value
  }
  return undefined
}

type TemplateKind = 'FORMAT' | 'OPERATIONAL' | 'BRANDED'

const toast = useToast()
const { t, locale } = useI18n()
const { token, user, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()

const subscriptionPlan = computed(() => subscriptionPlanFromAuthUser(user.value))

const canAccessReferenceBasic = computed(() =>
  hasSubscriptionFeature(subscriptionPlan.value, 'reference_directory_basic'),
)
const canAccessReferenceStandard = computed(() =>
  hasSubscriptionFeature(subscriptionPlan.value, 'reference_directory_standard'),
)
const canTournamentAutomation = computed(() =>
  hasSubscriptionFeature(subscriptionPlan.value, 'tournament_automation'),
)

const ALL_FORMAT_VALUES = [
  'SINGLE_GROUP',
  'PLAYOFF',
  'GROUPS_PLUS_PLAYOFF',
  'MANUAL',
] as const satisfies readonly TournamentFormat[]

const formatOptionsForForm = computed((): { value: TournamentFormat; label: string }[] => {
  const values = canTournamentAutomation.value ? ALL_FORMAT_VALUES : (['MANUAL'] as const)
  return values.map((value) => ({
    value,
    label: t(`admin.tournaments_list.formats.${value}`),
  }))
})

function templateListFormatLabel(f?: string | null): string {
  if (f == null || f === '') return t('admin.tournaments_list.card_date_placeholder')
  if (f === 'GROUPS_2' || f === 'GROUPS_3' || f === 'GROUPS_4') {
    return t('admin.tournaments_list.formats.GROUPS_PLUS_PLAYOFF')
  }
  const key = `admin.tournaments_list.formats.${f}` as const
  const translated = t(key)
  return translated !== key ? translated : f
}

const templateKindOptions = computed(() => [
  { value: 'FORMAT' as const, label: t('admin.tournament_templates.kind_format') },
  { value: 'OPERATIONAL' as const, label: t('admin.tournament_templates.kind_operational') },
  { value: 'BRANDED' as const, label: t('admin.tournament_templates.kind_branded') },
])

const playoffTeamCountOptions = [4, 8, 16, 32, 64, 128, 256, 512]

const tournamentCalendarColorPresets = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
] as const

const DEFAULT_CALENDAR_PICKER_FALLBACK = '#6366f1'

function buildEmptyForm() {
  return {
    name: '',
    description: '',
    kind: 'FORMAT' as TemplateKind,
    format: 'SINGLE_GROUP' as TournamentFormat,
    groupCount: 1,
    playoffQualifiersPerGroup: 2,
    intervalDays: 7,
    allowedDays: [6, 0] as number[],
    roundRobinCycles: 1,
    matchDurationMinutes: 50,
    matchBreakMinutes: 10,
    simultaneousMatches: 1,
    dayStartTimeDefault: '12:00',
    minTeams: 6,
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    calendarColor: '',
    category: '',
    seasonId: '',
    competitionId: '',
    ageGroupId: '',
    stadiumId: '',
    refereeIds: [] as string[],
  }
}

const form = reactive(buildEmptyForm())

const weekdayLabelByValue = computed<Record<number, string>>(() => ({
  1: t('admin.tournament_page.weekday_mon'),
  2: t('admin.tournament_page.weekday_tue'),
  3: t('admin.tournament_page.weekday_wed'),
  4: t('admin.tournament_page.weekday_thu'),
  5: t('admin.tournament_page.weekday_fri'),
  6: t('admin.tournament_page.weekday_sat'),
  0: t('admin.tournament_page.weekday_sun'),
}))

const allowedDayOptions = computed(() => [
  { value: 1, label: weekdayLabelByValue.value[1] },
  { value: 2, label: weekdayLabelByValue.value[2] },
  { value: 3, label: weekdayLabelByValue.value[3] },
  { value: 4, label: weekdayLabelByValue.value[4] },
  { value: 5, label: weekdayLabelByValue.value[5] },
  { value: 6, label: weekdayLabelByValue.value[6] },
  { value: 0, label: weekdayLabelByValue.value[0] },
])

const {
  seasonsList,
  competitionsList,
  ageGroupsList,
  seasonsLoading,
  competitionsLoading,
  ageGroupsLoading,
  stadiumsLoading,
  refereesLoading,
  seasonSelectOptions,
  competitionSelectOptions,
  ageGroupSelectOptions,
  stadiumSelectOptions,
  refereeMultiOptions,
  fetchSeasonsList,
  fetchCompetitionsList,
  fetchAgeGroupsList,
  fetchStadiumsReferees,
} = useTournamentReferences({
  token,
  tenantId,
  apiUrl,
  authFetch,
  canAccessReferenceBasic,
  canAccessReferenceStandard,
})

const impliedGroupCount = computed<number | null>(() => {
  switch (form.format) {
    case 'SINGLE_GROUP':
      return 1
    case 'PLAYOFF':
      return 0
    case 'MANUAL':
      return null
    default:
      return null
  }
})

const groupCountMin = computed(() => (impliedGroupCount.value === null ? 1 : impliedGroupCount.value))
const groupCountMax = computed(() => (impliedGroupCount.value === null ? 8 : impliedGroupCount.value))
const isPlayoffFormat = computed(() => form.format === 'PLAYOFF')
const isGroupsPlusPlayoffFormat = computed(() => form.format === 'GROUPS_PLUS_PLAYOFF')
const showGroupCountField = computed(() => impliedGroupCount.value === null)
const showPlayoffQualifiersField = computed(() => {
  if (form.format === 'PLAYOFF' || form.format === 'SINGLE_GROUP' || form.format === 'MANUAL') {
    return false
  }
  return true
})
const minTeamsMinValue = computed(() => (form.format === 'PLAYOFF' ? 4 : 2))

const minTeamsGridClass = computed(() => {
  if (showGroupCountField.value && !showPlayoffQualifiersField.value) {
    return 'md:col-start-2 md:row-start-2'
  }
  if (form.format === 'SINGLE_GROUP' || form.format === 'PLAYOFF') {
    return 'md:col-start-2 md:row-start-1'
  }
  if (form.format === 'GROUPS_PLUS_PLAYOFF') {
    return 'md:col-start-1 md:row-start-2'
  }
  return 'md:col-start-1'
})

watch(
  () => form.format,
  (next, prev) => {
    const implied = impliedGroupCount.value
    if (implied !== null) {
      form.groupCount = implied
    }
    if (next === 'PLAYOFF' && prev !== 'PLAYOFF') {
      form.minTeams = 4
      return
    }
    if (next === 'PLAYOFF' && form.minTeams < 4) {
      form.minTeams = 4
    }
    if (next === 'MANUAL' && !canTournamentAutomation.value) {
      form.groupCount = Math.max(1, form.groupCount || 1)
    }
  },
  { immediate: true },
)

watch(
  [groupCountMin, groupCountMax],
  () => {
    const min = groupCountMin.value
    const max = groupCountMax.value
    const n = form.groupCount
    if (typeof n !== 'number' || Number.isNaN(n)) {
      form.groupCount = min
      return
    }
    if (n < min) form.groupCount = min
    else if (n > max) form.groupCount = max
  },
  { immediate: true },
)

watch(
  () => canTournamentAutomation.value,
  (auto) => {
    if (!auto && form.format !== 'MANUAL') {
      form.format = 'MANUAL'
      form.groupCount = 1
      if (form.minTeams > 2) form.minTeams = 2
    }
  },
)

const calendarColorPickerModel = computed({
  get() {
    const c = String(form.calendarColor ?? '').trim().toLowerCase()
    return /^#[0-9a-f]{6}$/.test(c) ? c : DEFAULT_CALENDAR_PICKER_FALLBACK
  },
  set(v: string) {
    const s = (v || '').trim().toLowerCase()
    if (/^#[0-9a-f]{6}$/.test(s)) form.calendarColor = s
  },
})

function clearCalendarColor() {
  form.calendarColor = ''
}

function calendarColorTrimmed() {
  return String(form.calendarColor ?? '').trim()
}

type NumericFieldKey =
  | 'groupCount'
  | 'playoffQualifiersPerGroup'
  | 'minTeams'
  | 'intervalDays'
  | 'roundRobinCycles'
  | 'matchDurationMinutes'
  | 'matchBreakMinutes'
  | 'simultaneousMatches'
  | 'pointsWin'
  | 'pointsDraw'
  | 'pointsLoss'

function syncNumericField(key: NumericFieldKey, value: unknown) {
  const n = Number(value)
  if (Number.isFinite(n)) form[key] = n
}

const loading = ref(true)
const items = ref<TournamentTemplateListItem[]>([])
const skeletonTemplateRows = Array.from({ length: 8 }, (_, i) => ({ id: `sk-tt-${i}` }))
const formDialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const saving = ref(false)
const deleteSaving = ref(false)
const editingId = ref<string | null>(null)
const deleteTarget = ref<TournamentTemplateListItem | null>(null)
const submitAttempted = ref(false)

const isEdit = computed(() => !!editingId.value)

const validationRules = computed(() => ({
  name: { required },
}))
const v$ = useVuelidate(validationRules, form, { $autoDirty: true })

function kindLabel(k: string) {
  const found = templateKindOptions.value.find((o) => o.value === k)
  return found?.label ?? k
}

function formatUpdatedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString(locale.value, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function populateFromRow(row: TournamentTemplateListItem) {
  const normalized = normalizeLegacyGroupsFormat(row.format, row.groupCount ?? 1)
  form.name = row.name
  form.description = row.description ?? ''
  form.kind = (row.kind as TemplateKind) || 'FORMAT'
  form.format = normalized.format
  form.groupCount = normalized.groupCount
  form.playoffQualifiersPerGroup = row.playoffQualifiersPerGroup ?? 2
  form.intervalDays = row.intervalDays ?? 7
  form.allowedDays = Array.isArray(row.allowedDays) ? [...row.allowedDays] : []
  form.roundRobinCycles = row.roundRobinCycles ?? 1
  form.matchDurationMinutes = row.matchDurationMinutes ?? 50
  form.matchBreakMinutes = row.matchBreakMinutes ?? 10
  form.simultaneousMatches = row.simultaneousMatches ?? 1
  form.dayStartTimeDefault = row.dayStartTimeDefault ?? '12:00'
  form.minTeams = row.minTeams ?? 2
  form.pointsWin = row.pointsWin ?? 3
  form.pointsDraw = row.pointsDraw ?? 1
  form.pointsLoss = row.pointsLoss ?? 0
  const cc = row.calendarColor?.trim()
  form.calendarColor =
    cc && /^#[0-9A-Fa-f]{6}$/i.test(cc) ? cc.toLowerCase() : ''
  form.category = row.category ?? ''
  if (canAccessReferenceBasic.value) {
    form.seasonId = row.seasonId ?? ''
    form.ageGroupId = row.ageGroupId ?? ''
  } else {
    form.seasonId = ''
    form.ageGroupId = ''
  }
  if (canAccessReferenceStandard.value) {
    form.stadiumId = row.stadiumId ?? ''
    form.competitionId = row.competitionId ?? ''
    form.refereeIds = (row.templateReferees ?? []).map((r) => r.refereeId)
  } else {
    form.stadiumId = ''
    form.competitionId = ''
    form.refereeIds = []
  }

  if (!canTournamentAutomation.value && form.format !== 'MANUAL') {
    form.format = 'MANUAL'
    form.groupCount = 1
    if (form.minTeams > 2) form.minTeams = 2
  }
}

async function fetchList() {
  if (!token.value) {
    loading.value = false
    return
  }
  const started = Date.now()
  loading.value = true
  try {
    items.value = await authFetch<TournamentTemplateListItem[]>(
      apiUrl(`/tenants/${tenantId.value}/tournament-templates`),
    )
  } catch (err: unknown) {
    items.value = []
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_templates.page_title'),
      detail: getApiErrorMessage(err, t('admin.tournament_templates.load_error')),
      life: 5000,
    })
  } finally {
    await sleepRemainingAfter(MIN_SKELETON_DISPLAY_MS, started)
    loading.value = false
  }
}

async function ensureRefsLoaded() {
  if (!token.value) return
  if (!seasonsList.value.length) await fetchSeasonsList()
  if (!competitionsList.value.length) await fetchCompetitionsList()
  if (!ageGroupsList.value.length) await fetchAgeGroupsList()
  await fetchStadiumsReferees()
}

function openCreate() {
  editingId.value = null
  submitAttempted.value = false
  Object.assign(form, buildEmptyForm())
  if (!canTournamentAutomation.value) {
    form.format = 'MANUAL'
    form.groupCount = 1
    form.minTeams = Math.min(form.minTeams, 2)
  }
  v$.value.$reset()
  void ensureRefsLoaded()
  formDialogVisible.value = true
}

function openEdit(row: TournamentTemplateListItem) {
  editingId.value = row.id
  submitAttempted.value = false
  populateFromRow(row)
  v$.value.$reset()
  void ensureRefsLoaded()
  formDialogVisible.value = true
}

function openDelete(row: TournamentTemplateListItem) {
  deleteTarget.value = row
  deleteDialogVisible.value = true
}

function validateBusiness(): boolean {
  const time = form.dayStartTimeDefault.trim()
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    toast.add({ severity: 'warn', summary: t('admin.tournament_templates.save'), detail: t('admin.tournament_templates.error_time'), life: 5000 })
    return false
  }
  if (form.format === 'PLAYOFF' && !playoffTeamCountOptions.includes(form.minTeams)) {
    toast.add({
      severity: 'warn',
      summary: t('admin.tournament_templates.save'),
      detail: t('admin.tournament_templates.error_playoff_teams'),
      life: 6000,
    })
    return false
  }
  if (form.format === 'GROUPS_PLUS_PLAYOFF') {
    const g = form.groupCount
    const m = form.minTeams
    if (g < 1 || m < g * 2 || m % g !== 0) {
      toast.add({
        severity: 'warn',
        summary: t('admin.tournament_templates.save'),
        detail: t('admin.tournament_templates.error_groups_teams'),
        life: 6000,
      })
      return false
    }
  }
  return true
}

function buildPayload() {
  const body: Record<string, unknown> = {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    kind: form.kind,
    format: form.format,
    groupCount: form.groupCount,
    playoffQualifiersPerGroup: form.playoffQualifiersPerGroup,
    intervalDays: form.intervalDays,
    allowedDays: [...form.allowedDays],
    roundRobinCycles: form.roundRobinCycles,
    matchDurationMinutes: form.matchDurationMinutes,
    matchBreakMinutes: form.matchBreakMinutes,
    simultaneousMatches: form.simultaneousMatches,
    dayStartTimeDefault: form.dayStartTimeDefault.trim(),
    minTeams: form.minTeams,
    pointsWin: form.pointsWin,
    pointsDraw: form.pointsDraw,
    pointsLoss: form.pointsLoss,
  }
  const cat = form.category.trim()
  body.category = cat || null

  const cc = String(form.calendarColor ?? '').trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(cc)) {
    body.calendarColor = cc
  } else {
    body.calendarColor = null
  }

  if (canAccessReferenceBasic.value) {
    body.seasonId = form.seasonId.trim() ? form.seasonId.trim() : null
    body.ageGroupId = form.ageGroupId.trim() ? form.ageGroupId.trim() : null
  }

  if (canAccessReferenceStandard.value) {
    body.competitionId = form.competitionId.trim() ? form.competitionId.trim() : null
    body.stadiumId = form.stadiumId.trim() ? form.stadiumId.trim() : null
    body.refereeIds = [...form.refereeIds]
  }

  return body
}

async function saveForm() {
  submitAttempted.value = true
  v$.value.$touch()
  if (v$.value.$invalid) return
  if (!validateBusiness()) return
  if (!token.value) return

  saving.value = true
  try {
    const body = buildPayload()
    if (isEdit.value && editingId.value) {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/tournament-templates/${editingId.value}`), {
        method: 'PATCH',
        body,
      })
    } else {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/tournament-templates`), {
        method: 'POST',
        body,
      })
    }
    formDialogVisible.value = false
    toast.add({ severity: 'success', summary: t('admin.tournament_templates.saved'), life: 2500 })
    await fetchList()
  } catch (e: unknown) {
    for (const msg of getApiErrorMessages(e, getApiErrorMessage(e))) {
      toast.add({ severity: 'error', summary: t('admin.tournament_templates.save'), detail: msg, life: 6500 })
    }
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!token.value || !deleteTarget.value) return
  deleteSaving.value = true
  try {
    await authFetch(
      apiUrl(`/tenants/${tenantId.value}/tournament-templates/${deleteTarget.value.id}`),
      { method: 'DELETE' },
    )
    deleteDialogVisible.value = false
    deleteTarget.value = null
    toast.add({ severity: 'success', summary: t('admin.tournament_templates.deleted'), life: 2500 })
    await fetchList()
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_templates.delete'),
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    deleteSaving.value = false
  }
}

const dialogTitle = computed(() =>
  isEdit.value
    ? t('admin.tournament_templates.dialog_edit_title', {
        name: form.name.trim() || t('admin.tournament_templates.dialog_edit_untitled'),
      })
    : t('admin.tournament_templates.dialog_create_title'),
)

onMounted(() => {
  void fetchList()
})
</script>

<template>
  <div class="space-y-4">
    <header class="flex flex-col gap-3 min-w-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
      <div class="min-w-0">
        <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-0 sm:text-xl">
          {{ t('admin.tournament_templates.page_title') }}
        </h1>
        <p class="mt-1 text-xs text-muted-color sm:text-sm">
          {{ t('admin.tournament_templates.page_subtitle') }}
        </p>
      </div>
      <div class="admin-toolbar-responsive flex flex-wrap items-center gap-2">
        <Button
          :label="t('admin.tournament_templates.refresh')"
          icon="pi pi-refresh"
          text
          severity="secondary"
          :loading="loading"
          @click="fetchList"
        />
        <Button
          :label="t('admin.tournament_templates.create')"
          icon="pi pi-plus"
          @click="openCreate"
        />
      </div>
    </header>

    <div
      v-if="loading"
      class="admin-datatable-scroll min-w-0 rounded-xl border border-surface-200 bg-surface-0 dark:border-surface-700 dark:bg-surface-900"
      aria-busy="true"
    >
      <DataTable
        :value="skeletonTemplateRows"
        data-key="id"
        striped-rows
        size="small"
        class="min-h-[16rem]"
      >
        <Column :header="t('admin.tournament_templates.col_name')" class="min-w-[10rem]">
          <template #body>
            <Skeleton width="72%" height="0.875rem" class="rounded-md" />
          </template>
        </Column>
        <Column :header="t('admin.tournament_templates.col_format')">
          <template #body>
            <Skeleton width="5.5rem" height="0.875rem" class="rounded-md" />
          </template>
        </Column>
        <Column :header="t('admin.tournament_templates.col_kind')">
          <template #body>
            <Skeleton width="6rem" height="0.875rem" class="rounded-md" />
          </template>
        </Column>
        <Column :header="t('admin.tournament_templates.col_updated')">
          <template #body>
            <Skeleton width="8.5rem" height="0.875rem" class="rounded-md" />
          </template>
        </Column>
        <Column :exportable="false" style="width: 8rem">
          <template #body>
            <div class="flex flex-wrap justify-end gap-1">
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
    <div
      v-else-if="!items.length"
      class="rounded-xl border border-dashed border-surface-300 bg-surface-50 p-10 text-center dark:border-surface-600 dark:bg-surface-900/40"
    >
      <p class="text-sm text-muted-color">
        {{ t('admin.tournament_templates.empty') }}
      </p>
      <Button
        class="mt-4"
        :label="t('admin.tournament_templates.create')"
        icon="pi pi-plus"
        @click="openCreate"
      />
    </div>
    <div v-else class="admin-datatable-scroll min-w-0 rounded-xl border border-surface-200 bg-surface-0 dark:border-surface-700 dark:bg-surface-900">
    <DataTable :value="items" data-key="id" striped-rows size="small">
      <Column field="name" :header="t('admin.tournament_templates.col_name')" class="min-w-[10rem]">
        <template #body="{ data }">
          <span class="font-medium text-surface-900 dark:text-surface-0">{{ data.name }}</span>
        </template>
      </Column>
      <Column field="format" :header="t('admin.tournament_templates.col_format')">
        <template #body="{ data }">
          {{ templateListFormatLabel(data.format) }}
        </template>
      </Column>
      <Column field="kind" :header="t('admin.tournament_templates.col_kind')">
        <template #body="{ data }">
          {{ kindLabel(data.kind) }}
        </template>
      </Column>
      <Column field="updatedAt" :header="t('admin.tournament_templates.col_updated')">
        <template #body="{ data }">
          {{ formatUpdatedAt(data.updatedAt) }}
        </template>
      </Column>
      <Column :exportable="false" style="width: 8rem">
        <template #body="{ data }">
          <div class="flex flex-wrap justify-end gap-1">
            <Button
              icon="pi pi-pencil"
              rounded
              text
              severity="secondary"
              :aria-label="t('admin.tournament_templates.edit')"
              @click="openEdit(data)"
            />
            <Button
              icon="pi pi-trash"
              rounded
              text
              severity="danger"
              :aria-label="t('admin.tournament_templates.delete')"
              @click="openDelete(data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
    </div>

    <Dialog
      :visible="formDialogVisible"
      modal
      :header="dialogTitle"
      :style="{ width: 'min(960px, calc(100vw - 2rem))' }"
      :closable="!saving"
      @update:visible="(v) => (formDialogVisible = v)"
      @hide="editingId = null"
    >
      <div class="max-h-[min(70vh,720px)] space-y-4 overflow-y-auto pr-1">
        <Message
          v-if="!canTournamentAutomation"
          severity="info"
          :closable="false"
          class="w-full text-sm"
        >
          {{ t('admin.tournament_form.manual_only_tariff') }}
        </Message>

        <section
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
            {{ t('admin.tournament_templates.section_main') }}
          </h3>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FloatLabel variant="on" class="block md:col-span-2">
              <InputText
                id="tpl_name"
                v-model="form.name"
                class="w-full"
                :invalid="submitAttempted && v$.name.$invalid"
              />
              <label for="tpl_name">{{ t('admin.tournament_templates.col_name') }} *</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block md:col-span-2">
              <Select
                input-id="tpl_kind"
                v-model="form.kind"
                :options="templateKindOptions"
                option-label="label"
                option-value="value"
                class="w-full"
              />
              <label for="tpl_kind">{{ t('admin.tournament_templates.col_kind') }}</label>
            </FloatLabel>
            <div class="md:col-span-2">
              <label for="tpl_desc" class="mb-1 block text-sm">{{
                t('admin.tournament_templates.field_description')
              }}</label>
              <AdminMarkdownEditor input-id="tpl_desc" v-model="form.description" :rows="3" />
            </div>
            <FloatLabel variant="on" class="block md:col-span-2">
              <InputText id="tpl_category" v-model="form.category" class="w-full" />
              <label for="tpl_category">{{ t('admin.tournament_templates.field_category') }}</label>
            </FloatLabel>
          </div>
        </section>

        <section
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
            {{ t('admin.tournament_templates.section_format') }}
          </h3>
          <div class="mb-4 flex flex-col gap-2">
            <label class="text-sm font-medium text-surface-900 dark:text-surface-0">
              {{ t('admin.tournament_form.calendar_color_label') }}
            </label>
            <div class="flex flex-wrap items-center gap-2">
              <button
                v-for="c in tournamentCalendarColorPresets"
                :key="c"
                type="button"
                class="h-8 w-8 shrink-0 rounded-full border-2 border-surface-300 shadow-sm transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-surface-600"
                :class="
                  calendarColorTrimmed().toLowerCase() === c
                    ? 'ring-2 ring-primary ring-offset-2 dark:ring-offset-surface-900'
                    : ''
                "
                :style="{ backgroundColor: c }"
                :title="c"
                :aria-label="c"
                @click="form.calendarColor = c"
              />
              <input
                v-model="calendarColorPickerModel"
                type="color"
                class="h-9 w-14 cursor-pointer rounded border border-surface-300 bg-surface-0 p-0.5 dark:border-surface-600"
                :aria-label="t('admin.tournament_form.calendar_color_label')"
              />
              <Button
                v-if="calendarColorTrimmed()"
                type="button"
                :label="t('admin.tournament_form.calendar_color_reset')"
                text
                severity="secondary"
                size="small"
                @click="clearCalendarColor"
              />
            </div>
          </div>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FloatLabel variant="on" class="block">
              <Select
                input-id="tpl_format"
                v-model="form.format"
                :options="formatOptionsForForm"
                option-label="label"
                option-value="value"
                class="w-full"
              />
              <label for="tpl_format">{{ t('admin.tournament_templates.col_format') }}</label>
            </FloatLabel>

            <div v-if="showGroupCountField">
              <FloatLabel variant="on" class="block">
                <InputNumber
                  input-id="tpl_groups"
                  v-model="form.groupCount"
                  class="w-full"
                  :min="groupCountMin"
                  :max="groupCountMax"
                  @input="(e) => syncNumericField('groupCount', inputNumberValue(e))"
                />
                <label for="tpl_groups">{{ t('admin.tournament_templates.field_group_count') }}</label>
              </FloatLabel>
            </div>

            <div :class="minTeamsGridClass">
              <FloatLabel v-if="isPlayoffFormat" variant="on" class="block">
                <Select
                  input-id="tpl_min_teams_po"
                  v-model="form.minTeams"
                  :options="playoffTeamCountOptions"
                  class="w-full"
                />
                <label for="tpl_min_teams_po">{{ t('admin.tournament_templates.field_team_count') }}</label>
              </FloatLabel>
              <FloatLabel v-else-if="isGroupsPlusPlayoffFormat" variant="on" class="block">
                <InputNumber
                  input-id="tpl_min_teams_g"
                  v-model="form.minTeams"
                  class="w-full"
                  :min="2"
                  @input="(e) => syncNumericField('minTeams', inputNumberValue(e))"
                />
                <label for="tpl_min_teams_g">{{ t('admin.tournament_templates.field_team_count') }}</label>
              </FloatLabel>
              <FloatLabel v-else variant="on" class="block">
                <InputNumber
                  input-id="tpl_min_teams"
                  v-model="form.minTeams"
                  class="w-full"
                  :min="minTeamsMinValue"
                  @input="(e) => syncNumericField('minTeams', inputNumberValue(e))"
                />
                <label for="tpl_min_teams">{{ t('admin.tournament_templates.field_team_count') }}</label>
              </FloatLabel>
            </div>

            <div v-if="showPlayoffQualifiersField">
              <FloatLabel variant="on" class="block">
                <InputNumber
                  input-id="tpl_pq"
                  v-model="form.playoffQualifiersPerGroup"
                  class="w-full"
                  :min="1"
                  :max="8"
                  @input="(e) => syncNumericField('playoffQualifiersPerGroup', inputNumberValue(e))"
                />
                <label for="tpl_pq">{{ t('admin.tournament_templates.field_playoff_qualifiers') }}</label>
              </FloatLabel>
            </div>
          </div>
        </section>

        <section
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
            {{ t('admin.tournament_templates.section_schedule') }}
          </h3>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FloatLabel variant="on" class="block">
              <InputNumber
                input-id="tpl_interval"
                v-model="form.intervalDays"
                class="w-full"
                :min="1"
                @input="(e) => syncNumericField('intervalDays', inputNumberValue(e))"
              />
              <label for="tpl_interval">{{ t('admin.tournament_page.interval_days') }}</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block">
              <InputNumber
                input-id="tpl_cycles"
                v-model="form.roundRobinCycles"
                class="w-full"
                :min="1"
                :max="4"
                @input="(e) => syncNumericField('roundRobinCycles', inputNumberValue(e))"
              />
              <label for="tpl_cycles">{{ t('admin.tournament_page.round_robin_cycles') }}</label>
            </FloatLabel>
            <div class="md:col-span-2">
              <label class="mb-1 block text-sm">{{ t('admin.tournament_page.allowed_days') }}</label>
              <MultiSelect
                v-model="form.allowedDays"
                :options="allowedDayOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                :maxSelectedLabels="0"
                :selectedItemsLabel="t('admin.tournament_page.selected_count', { count: '{0}' })"
                :placeholder="t('admin.tournament_page.any_days')"
                :showToggleAll="false"
              />
            </div>
            <FloatLabel variant="on" class="block">
              <InputNumber
                input-id="tpl_match_dur"
                v-model="form.matchDurationMinutes"
                class="w-full"
                :min="1"
                @input="(e) => syncNumericField('matchDurationMinutes', inputNumberValue(e))"
              />
              <label for="tpl_match_dur">{{ t('admin.tournament_page.duration_minutes') }}</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block">
              <InputNumber
                input-id="tpl_break"
                v-model="form.matchBreakMinutes"
                class="w-full"
                :min="0"
                @input="(e) => syncNumericField('matchBreakMinutes', inputNumberValue(e))"
              />
              <label for="tpl_break">{{ t('admin.tournament_page.break_minutes') }}</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block">
              <InputNumber
                input-id="tpl_sim"
                v-model="form.simultaneousMatches"
                class="w-full"
                :min="1"
                @input="(e) => syncNumericField('simultaneousMatches', inputNumberValue(e))"
              />
              <label for="tpl_sim">{{ t('admin.tournament_page.simultaneous_matches') }}</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block">
              <InputText id="tpl_day_start" v-model="form.dayStartTimeDefault" class="w-full" />
              <label for="tpl_day_start">{{ t('admin.tournament_templates.field_day_start') }}</label>
            </FloatLabel>
          </div>
        </section>

        <section
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
            {{ t('admin.tournament_templates.section_points') }}
          </h3>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FloatLabel variant="on" class="block">
              <InputNumber
                input-id="tpl_pw"
                v-model="form.pointsWin"
                class="w-full !flex"
                :min="0"
                input-class="w-full"
                @input="(e) => syncNumericField('pointsWin', inputNumberValue(e))"
              />
              <label for="tpl_pw">{{ t('admin.tournament_templates.field_points_win') }}</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block">
              <InputNumber
                input-id="tpl_pd"
                v-model="form.pointsDraw"
                class="w-full !flex"
                :min="0"
                input-class="w-full"
                @input="(e) => syncNumericField('pointsDraw', inputNumberValue(e))"
              />
              <label for="tpl_pd">{{ t('admin.tournament_templates.field_points_draw') }}</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block">
              <InputNumber
                input-id="tpl_pl"
                v-model="form.pointsLoss"
                class="w-full !flex"
                :min="0"
                input-class="w-full"
                @input="(e) => syncNumericField('pointsLoss', inputNumberValue(e))"
              />
              <label for="tpl_pl">{{ t('admin.tournament_templates.field_points_loss') }}</label>
            </FloatLabel>
          </div>
        </section>

        <section
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
            {{ t('admin.tournament_templates.section_refs') }}
          </h3>
          <Message
            v-if="!canAccessReferenceBasic"
            severity="secondary"
            :closable="false"
            class="mb-3 w-full text-xs"
          >
            {{ t('admin.tournament_page.reference_fields_plan_basic_locked') }}
          </Message>
          <Message
            v-if="!canAccessReferenceStandard"
            severity="secondary"
            :closable="false"
            class="mb-3 w-full text-xs"
          >
            {{ t('admin.tournament_page.reference_fields_plan_standard_locked') }}
          </Message>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FloatLabel variant="on" class="block min-w-0">
              <Select
                input-id="tpl_season"
                v-model="form.seasonId"
                :options="seasonSelectOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                :loading="seasonsLoading"
                :disabled="!canAccessReferenceBasic"
              />
              <label for="tpl_season">{{ t('admin.tournament_page.season_label') }}</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block min-w-0">
              <Select
                input-id="tpl_comp"
                v-model="form.competitionId"
                :options="competitionSelectOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                :loading="competitionsLoading"
                :disabled="!canAccessReferenceStandard"
              />
              <label for="tpl_comp">{{ t('admin.tournament_page.competition_type_label') }}</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block min-w-0">
              <Select
                input-id="tpl_age"
                v-model="form.ageGroupId"
                :options="ageGroupSelectOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                :loading="ageGroupsLoading"
                :disabled="!canAccessReferenceBasic"
              />
              <label for="tpl_age">{{ t('admin.tournament_page.age_group_label') }}</label>
            </FloatLabel>
          </div>
          <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <FloatLabel variant="on" class="block min-w-0">
              <Select
                input-id="tpl_stadium"
                v-model="form.stadiumId"
                :options="stadiumSelectOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                :loading="stadiumsLoading"
                :disabled="!canAccessReferenceStandard"
              />
              <label for="tpl_stadium">{{ t('admin.tournament_templates.field_stadium') }}</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block min-w-0">
              <MultiSelect
                input-id="tpl_refs"
                v-model="form.refereeIds"
                :options="refereeMultiOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                :loading="refereesLoading"
                :placeholder="t('admin.tournament_templates.referees_placeholder')"
                filter
                :maxSelectedLabels="0"
                :selectedItemsLabel="t('admin.tournament_templates.referees_selected', { count: '{0}' })"
                :disabled="!canAccessReferenceStandard"
              />
              <label for="tpl_refs">{{ t('admin.tournament_templates.field_referees') }}</label>
            </FloatLabel>
          </div>
        </section>
      </div>
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            :label="t('admin.tournament_templates.cancel')"
            text
            :disabled="saving"
            @click="formDialogVisible = false"
          />
          <Button
            :label="t('admin.tournament_templates.save')"
            icon="pi pi-check"
            :loading="saving"
            @click="saveForm"
          />
        </div>
      </template>
    </Dialog>

    <Dialog
      :visible="deleteDialogVisible"
      modal
      :header="t('admin.tournament_templates.delete_title')"
      :style="{ width: '24rem' }"
      :closable="!deleteSaving"
      @update:visible="(v) => (deleteDialogVisible = v)"
      @hide="deleteTarget = null"
    >
      <p v-if="deleteTarget" class="text-sm text-surface-700 dark:text-surface-200">
        {{ t('admin.tournament_templates.delete_lead', { name: deleteTarget.name }) }}
      </p>
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            :label="t('admin.tournament_templates.cancel')"
            text
            :disabled="deleteSaving"
            @click="deleteDialogVisible = false"
          />
          <Button
            :label="t('admin.tournament_templates.delete')"
            icon="pi pi-trash"
            severity="danger"
            :loading="deleteSaving"
            @click="confirmDelete"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>

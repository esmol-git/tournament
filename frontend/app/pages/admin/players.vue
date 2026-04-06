<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, useId } from 'vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useAdminOrgModeratorReadOnly } from '~/composables/useAdminOrgModeratorReadOnly'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import { PLAYER_POSITION_OPTIONS } from '~/constants/playerPositions'
import {
  useLazyPaginatedTeamsSelect,
  useTeamSelectOptions,
} from '~/composables/useLazyPaginatedTeamsSelect'
import type { PlayerRow } from '~/types/admin/player'
import { getApiErrorMessage } from '~/utils/apiError'
import { MIN_SKELETON_DISPLAY_MS } from '~/utils/minimumLoadingDelay'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'
import { toYmdLocal as toYmd } from '~/utils/dateYmd'
import { formatAgeFromIsoDate } from '~/utils/ageYearsRu'
import { useRouter } from 'vue-router'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'

definePageMeta({
  layout: 'admin',
  /** Глобальный MODERATOR — org read-only; реестр путей в `adminModeratorOrgPolicy`. */
  adminOrgModeratorReadOnly: true,
})

const router = useRouter()
const { token, syncWithStorage, loggedIn, authFetch, authFetchBlob } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()
const { t } = useI18n()
const tenantId = useTenantId()
const isModeratorReadOnly = useAdminOrgModeratorReadOnly()

/** Амплуа в форме — общий справочник `constants/playerPositions` */
const positionOptions = [...PLAYER_POSITION_OPTIONS]

const positionFilterOptions = computed(() => [
  { value: '', label: 'Все амплуа' },
  ...PLAYER_POSITION_OPTIONS,
])

const genderOptions = [
  { value: 'MALE' as const, label: 'Мужской' },
  { value: 'FEMALE' as const, label: 'Женский' },
]

/** Фильтр по году рождения: только допустимый диапазон (дети младше 4 лет в справочнике не нужны) */
const MIN_BIRTH_YEAR_FILTER = 1950

function maxBirthYearForFilter(): number {
  return new Date().getFullYear() - 4
}

const birthYearFilterOptions = computed(() => {
  const max = maxBirthYearForFilter()
  const min = MIN_BIRTH_YEAR_FILTER
  const opts: { value: number | ''; label: string }[] = [{ value: '', label: 'Все годы' }]
  for (let y = max; y >= min; y -= 1) {
    opts.push({ value: y, label: String(y) })
  }
  return opts
})

/** Селект «Команда» в форме и в фильтре таблицы — ленивая пагинация через composable */
const {
  teamsLoading,
  teamsLoadingMore,
  teamsLoaded,
  selectedTeamCache,
  teamsHasMore,
  onTeamSelectFilter,
  onTeamSelectPanelShow,
  onTeamSelectPanelHide,
} = useLazyPaginatedTeamsSelect({
  panelRootClass: '.player-team-select-panel',
  tenantId,
  token,
  authFetch,
  apiUrl,
})

const {
  teamsLoading: listFilterTeamsLoading,
  teamsLoadingMore: listFilterTeamsLoadingMore,
  teamsLoaded: listFilterTeamsLoaded,
  selectedTeamCache: listFilterSelectedTeamCache,
  teamsHasMore: listFilterTeamsHasMore,
  onTeamSelectFilter: onListFilterTeamSelectFilter,
  onTeamSelectPanelShow: onListFilterTeamSelectPanelShow,
  onTeamSelectPanelHide: onListFilterTeamSelectPanelHide,
} = useLazyPaginatedTeamsSelect({
  panelRootClass: '.player-list-team-filter-panel',
  tenantId,
  token,
  authFetch,
  apiUrl,
})

/** true до первого завершённого запроса — иначе при F5 один кадр с пустым списком и «Нет игроков». */
const PLAYERS_TABLE_SKELETON_ROWS = 10
const skeletonPlayerRows = Array.from({ length: PLAYERS_TABLE_SKELETON_ROWS }, (_, i) => ({
  id: `__psk-${i}`,
}))
const {
  items: players,
  loading,
  error,
  run,
  retry,
} = useAdminAsyncListState<PlayerRow>({
  initialLoading: true,
  clearItemsOnError: true,
  minLoadingMs: MIN_SKELETON_DISPLAY_MS,
})
const totalPlayers = ref(0)

const pageSize = ref(10)
const first = ref(0)
const currentPage = ref(1)

const sortField = ref<string | null>(null)
const sortOrder = ref<number | null>(null)

const filters = reactive({
  /** Поиск по имени и/или фамилии (слова через пробел) */
  name: '',
  position: '',
  /** Фильтр по команде (id) */
  teamId: '',
  /** Год рождения: '' — не фильтровать; иначе число в [MIN_BIRTH_YEAR_FILTER .. maxBirthYearForFilter()] */
  birthYear: '' as number | '',
})

let filterDebounceTimer: ReturnType<typeof setTimeout> | null = null

/** Те же фильтры и сортировка, что у таблицы (без page/pageSize) — для GET .../players/export/csv на бэкенде */
function buildPlayersFilterSortParams(): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  if (sortField.value) params.sortField = sortField.value
  if (sortOrder.value === 1 || sortOrder.value === -1) params.sortOrder = sortOrder.value
  if (filters.name.trim()) params.name = filters.name.trim()
  if (filters.position.trim()) params.position = filters.position.trim()
  if (filters.teamId.trim()) params.teamId = filters.teamId.trim()
  const by = filters.birthYear
  if (by !== '') {
    const yearNum = typeof by === 'number' ? by : Number(by)
    const maxY = maxBirthYearForFilter()
    if (
      Number.isInteger(yearNum) &&
      yearNum >= MIN_BIRTH_YEAR_FILTER &&
      yearNum <= maxY
    ) {
      params.birthDateFrom = `${yearNum}-01-01`
      params.birthDateTo = `${yearNum}-12-31`
    }
  }
  return params
}

const buildPlayersQueryParams = (
  page: number,
  pageSizeNum: number,
): Record<string, string | number> => ({
  page,
  pageSize: pageSizeNum,
  ...buildPlayersFilterSortParams(),
})

const csvDownloading = ref(false)
const csvImporting = ref(false)
const xlsxDownloading = ref(false)
const xlsxImporting = ref(false)
type TransferFormat = 'csv' | 'xlsx'
type ImportFieldKey =
  | 'lastName'
  | 'firstName'
  | 'birthDate'
  | 'gender'
  | 'position'
  | 'phone'
  | 'bioNumber'
  | 'team'
  | 'biography'
  | 'photoUrl'
const transferFormatOptions = [
  { value: 'xlsx' as const, label: 'Excel (.xlsx)' },
  { value: 'csv' as const, label: 'CSV (.csv)' },
]
const exportFormat = ref<TransferFormat>('xlsx')
const importFormat = ref<TransferFormat>('xlsx')
const importDialogVisible = ref(false)
const playersImportId = useId()
const playerFormId = useId()
const importFileInput = ref<HTMLInputElement | null>(null)
const importFile = ref<File | null>(null)
const importFileName = computed(() => importFile.value?.name ?? '')
const transferBusy = computed(
  () =>
    csvDownloading.value || xlsxDownloading.value || csvImporting.value || xlsxImporting.value,
)
const importBusy = computed(() => csvImporting.value || xlsxImporting.value)
const importAccept = computed(() =>
  importFormat.value === 'csv'
    ? '.csv,text/csv'
    : '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
)

/** Соответствует query `mode` на POST .../players/import/csv */
const csvImportMode = ref<'upsert' | 'createOnly' | 'updateOnly'>('upsert')
const csvImportModeOptions = [
  {
    value: 'upsert' as const,
    label: 'Создать и обновить по id',
  },
  {
    value: 'createOnly' as const,
    label: 'Только новые (строки с id не трогать)',
  },
  {
    value: 'updateOnly' as const,
    label: 'Только обновить по id (без id — пропустить)',
  },
]
const importFieldOptions: Array<{ value: ImportFieldKey; label: string }> = [
  { value: 'lastName', label: 'Фамилия' },
  { value: 'firstName', label: 'Имя' },
  { value: 'birthDate', label: 'Дата рождения' },
  { value: 'gender', label: 'Пол' },
  { value: 'position', label: 'Амплуа' },
  { value: 'phone', label: 'Телефон' },
  { value: 'bioNumber', label: 'Номер игрока' },
  { value: 'team', label: 'Команда (teamId/teamName)' },
  { value: 'biography', label: 'Биография' },
  { value: 'photoUrl', label: 'Ссылка на фото' },
]
const importSelectedFields = ref<ImportFieldKey[]>(
  importFieldOptions.map((option) => option.value),
)
const allImportFieldsSelected = computed(
  () => importSelectedFields.value.length === importFieldOptions.length,
)
const importModeFieldsValid = computed(
  () =>
    csvImportMode.value === 'updateOnly' ||
    (importSelectedFields.value.includes('lastName') &&
      importSelectedFields.value.includes('firstName')),
)

const selectAllImportFields = () => {
  importSelectedFields.value = importFieldOptions.map((option) => option.value)
}

type ImportErrorRow = {
  row: number
  message: string
  field?: string
  code?: string
  value?: string
}

type ImportResult = {
  created: number
  updated: number
  skipped: number
  errors: ImportErrorRow[]
}

const buildImportPreview = (errors: ImportErrorRow[]) =>
  errors
    .slice(0, 5)
    .map((x) => {
      const meta = [x.field, x.code].filter(Boolean).join('/')
      return `${x.row}${meta ? ` [${meta}]` : ''} (${x.message})`
    })
    .join('; ')

const showImportToast = (res: ImportResult) => {
  const errList = res.errors ?? []
  const errCount = errList.length
  const skipped = res.skipped ?? 0
  const preview =
    errCount > 0
      ? ` Строки с ошибками: ${buildImportPreview(errList)}${errCount > 5 ? '…' : ''}`
      : ''

  toast.add({
    severity: errCount ? 'warn' : 'success',
    summary: errCount ? 'Импорт завершён с ошибками' : 'Импорт выполнен',
    detail: `Создано: ${res.created}, обновлено: ${res.updated}${
      skipped ? `, пропущено: ${skipped}` : ''
    }.${preview}`,
    life: errCount ? 12000 : 5000,
  })
}

const downloadPlayersCsv = async () => {
  if (!token.value) return
  csvDownloading.value = true
  try {
    const params = buildPlayersFilterSortParams()
    const blob = await authFetchBlob(apiUrl(`/tenants/${tenantId.value}/players/export/csv`), {
      params,
    })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `players-export.csv`
    a.click()
    URL.revokeObjectURL(href)
    toast.add({
      severity: 'success',
      summary: 'CSV скачан',
      detail:
        'Файл сформирован на сервере (до 20 000 строк): id, teamId, даты YYYY-MM-DD — удобно для обратного импорта.',
      life: 5000,
    })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось скачать CSV',
      detail: getApiErrorMessage(err),
      life: 6000,
    })
  } finally {
    csvDownloading.value = false
  }
}

const downloadPlayersXlsx = async () => {
  if (!token.value) return
  xlsxDownloading.value = true
  try {
    const params = buildPlayersFilterSortParams()
    const blob = await authFetchBlob(apiUrl(`/tenants/${tenantId.value}/players/export/xlsx`), {
      params,
    })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = 'players-export.xlsx'
    a.click()
    URL.revokeObjectURL(href)
    toast.add({
      severity: 'success',
      summary: 'XLSX скачан',
      detail: 'Файл сформирован на сервере по текущим фильтрам и сортировке.',
      life: 5000,
    })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось скачать XLSX',
      detail: getApiErrorMessage(err),
      life: 6000,
    })
  } finally {
    xlsxDownloading.value = false
  }
}

const downloadPlayersByFormat = async () => {
  if (exportFormat.value === 'csv') {
    await downloadPlayersCsv()
    return
  }
  await downloadPlayersXlsx()
}

const triggerImportFilePick = () => {
  if (importBusy.value) return
  importFileInput.value?.click()
}

const onImportFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  importFile.value = file ?? null
}

const runPlayersImport = async (
  format: TransferFormat,
  file: File,
  fields: ImportFieldKey[],
) => {
  if (!token.value) return
  if (format === 'csv') csvImporting.value = true
  else xlsxImporting.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const importPath = `/tenants/${tenantId.value}/players/import/${format}`
    const qParts: string[] = []
    if (csvImportMode.value !== 'upsert') {
      qParts.push(`mode=${encodeURIComponent(csvImportMode.value)}`)
    }
    qParts.push(`fields=${encodeURIComponent(fields.join(','))}`)
    const q = qParts.length ? `?${qParts.join('&')}` : ''
    const res = await authFetch<ImportResult>(apiUrl(`${importPath}${q}`), {
      method: 'POST',
      body: fd,
    })

    await fetchPlayers()
    showImportToast(res)
    importDialogVisible.value = false
    importFile.value = null
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: `Импорт ${format.toUpperCase()} не удался`,
      detail: getApiErrorMessage(err),
      life: 7000,
    })
  } finally {
    if (format === 'csv') csvImporting.value = false
    else xlsxImporting.value = false
  }
}

const submitImport = async () => {
  const file = importFile.value
  if (!file) {
    toast.add({
      severity: 'warn',
      summary: 'Файл не выбран',
      detail: 'Выберите CSV/XLSX файл перед запуском импорта.',
      life: 5000,
    })
    return
  }
  if (!importSelectedFields.value.length) {
    toast.add({
      severity: 'warn',
      summary: 'Поля не выбраны',
      detail: 'Отметьте хотя бы одно поле для импорта.',
      life: 5000,
    })
    return
  }
  if (!importModeFieldsValid.value) {
    toast.add({
      severity: 'warn',
      summary: 'Недостаточно полей для выбранного режима',
      detail:
        'Для режимов createOnly/upsert отметьте минимум поля "Фамилия" и "Имя".',
      life: 6000,
    })
    return
  }
  await runPlayersImport(importFormat.value, file, importSelectedFields.value)
}

const fetchPlayers = async () => {
  if (!token.value) {
    loading.value = false
    return
  }
  const page = Math.max(1, Math.floor(Number(currentPage.value) || 1))
  const pageSizeNum = Math.max(1, Math.floor(Number(pageSize.value) || 10))

  await run(async () => {
    const params = buildPlayersQueryParams(page, pageSizeNum)

    const res = await authFetch<{ items: PlayerRow[]; total: number }>(
      apiUrl(`/tenants/${tenantId.value}/players`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
        params,
      },
    )

    players.value = res.items
    totalPlayers.value = res.total
  })
}

const scheduleFilterFetch = () => {
  if (filterDebounceTimer) clearTimeout(filterDebounceTimer)
  filterDebounceTimer = setTimeout(() => {
    filterDebounceTimer = null
    currentPage.value = 1
    first.value = 0
    fetchPlayers()
  }, 350)
}

watch(
  () => [filters.name, filters.position, filters.teamId, filters.birthYear] as const,
  () => scheduleFilterFetch(),
  { deep: true },
)

const onPlayersPage = (event: any) => {
  const nextFirst = Number(event.first ?? 0)
  const nextSizeCandidate = Number(event.rows ?? pageSize.value)
  const nextSize = nextSizeCandidate > 0 ? nextSizeCandidate : pageSize.value
  const nextPage = Math.floor(nextFirst / nextSize) + 1

  first.value = nextFirst
  pageSize.value = nextSize
  currentPage.value = nextPage
  fetchPlayers()
}

const onPlayersSort = (event: any) => {
  const nextField = typeof event.sortField === 'string' ? event.sortField : null
  const nextOrder = event.sortOrder === 1 || event.sortOrder === -1 ? event.sortOrder : null

  // Разрешаем только поля, которые есть в DTO/Prisma
  sortField.value = nextField && ['lastName', 'firstName', 'birthDate', 'position'].includes(nextField)
    ? nextField
    : null
  sortOrder.value = nextOrder

  currentPage.value = 1
  first.value = 0
  fetchPlayers()
}

const showPlayersPaginator = computed(() => totalPlayers.value > PLAYERS_TABLE_SKELETON_ROWS)

const resetFilters = () => {
  if (filterDebounceTimer) {
    clearTimeout(filterDebounceTimer)
    filterDebounceTimer = null
  }
  filters.name = ''
  filters.position = ''
  filters.teamId = ''
  filters.birthYear = ''
  listFilterSelectedTeamCache.value = null
  currentPage.value = 1
  first.value = 0
  fetchPlayers()
}

const showForm = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const isEdit = computed(() => !!editingId.value)

const form = reactive({
  firstName: '',
  lastName: '',
  birthDate: null as Date | null,
  gender: '' as '' | 'MALE' | 'FEMALE',
  position: '',
  phone: '',
  bioNumber: '',
  photoUrl: '',
  biography: '',
  /** одна команда или пусто */
  teamId: '',
})
const submitAttempted = ref(false)
const playerValidationRules = computed(() => ({
  firstName: { required },
  lastName: { required },
  birthDate: {},
  phone: {},
}))
const v$ = useVuelidate(playerValidationRules, form, { $autoDirty: true })

function formatRuPhone(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (!digits) return ''
  let core = digits
  if (core.length === 11 && (core.startsWith('7') || core.startsWith('8'))) {
    core = core.slice(1)
  }
  if (core.length > 10) core = core.slice(0, 10)
  const p1 = core.slice(0, 3)
  const p2 = core.slice(3, 6)
  const p3 = core.slice(6, 8)
  const p4 = core.slice(8, 10)
  let out = '+7'
  if (p1) out += ` (${p1}`
  if (p1.length === 3) out += ')'
  if (p2) out += ` ${p2}`
  if (p3) out += `-${p3}`
  if (p4) out += `-${p4}`
  return out
}

function normalizeRuPhoneForApi(input: string): string {
  let digits = input.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) digits = `7${digits}`
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`
  if (!(digits.length === 11 && digits.startsWith('7'))) return ''
  return `+${digits}`
}

const playerFormErrors = computed(() => ({
  lastName: form.lastName.trim() ? '' : t('admin.validation.required_last_name'),
  firstName: form.firstName.trim() ? '' : t('admin.validation.required_first_name'),
  birthDate:
    form.birthDate && form.birthDate.getTime() > Date.now()
      ? t('admin.validation.date_not_future')
      : '',
  phone:
    form.phone.trim() && !normalizeRuPhoneForApi(form.phone)
      ? t('admin.validation.invalid_phone_ru')
      : '',
}))
const canSavePlayer = computed(
  () =>
    !!token.value &&
    !saving.value &&
    !v$.value.$invalid &&
    !playerFormErrors.value.lastName &&
    !playerFormErrors.value.firstName &&
    !playerFormErrors.value.birthDate &&
    !playerFormErrors.value.phone,
)
const showLastNameError = computed(
  () => (submitAttempted.value || v$.value.lastName.$dirty) && !!playerFormErrors.value.lastName,
)
const showFirstNameError = computed(
  () => (submitAttempted.value || v$.value.firstName.$dirty) && !!playerFormErrors.value.firstName,
)
const showBirthDateError = computed(
  () => (submitAttempted.value || v$.value.birthDate.$dirty) && !!playerFormErrors.value.birthDate,
)
const showPhoneError = computed(
  () => (submitAttempted.value || v$.value.phone.$dirty) && !!playerFormErrors.value.phone,
)

const listFilterTeamSelectOptions = useTeamSelectOptions(
  listFilterTeamsLoaded,
  listFilterSelectedTeamCache,
  () => filters.teamId,
  { value: '', label: 'Все команды' },
)

watch(
  () => filters.teamId,
  (id) => {
    if (!id) {
      return
    }
    const hit = listFilterTeamsLoaded.value.find((t) => t.id === id)
    if (hit) {
      listFilterSelectedTeamCache.value = hit
    }
  },
)

const teamSelectOptions = useTeamSelectOptions(
  teamsLoaded,
  selectedTeamCache,
  () => form.teamId,
  { value: '', label: 'Без команды' },
)

const openCreate = () => {
  submitAttempted.value = false
  selectedTeamCache.value = null
  editingId.value = null
  form.firstName = ''
  form.lastName = ''
  form.birthDate = null
  form.gender = ''
  form.position = ''
  form.phone = ''
  form.bioNumber = ''
  form.photoUrl = ''
  form.biography = ''
  form.teamId = ''
  v$.value.$reset()
  showForm.value = true
}

const openEdit = (p: PlayerRow) => {
  submitAttempted.value = false
  selectedTeamCache.value = p.team ?? null
  editingId.value = p.id
  form.firstName = p.firstName ?? ''
  form.lastName = p.lastName ?? ''
  form.birthDate = p.birthDate ? new Date(p.birthDate) : null
  form.gender = p.gender ?? ''
  form.position = p.position ?? ''
  form.phone = formatRuPhone(p.phone ?? '')
  form.bioNumber = p.bioNumber ?? ''
  form.photoUrl = p.photoUrl ?? ''
  form.biography = p.biography ?? ''
  form.teamId = p.team?.id ?? ''
  v$.value.$reset()
  showForm.value = true
}

const photoFileInput = ref<HTMLInputElement | null>(null)
const photoUploading = ref(false)
const photoRemoving = ref(false)

const triggerPhotoPick = () => {
  if (photoUploading.value || photoRemoving.value) return
  photoFileInput.value?.click()
}

const onPhotoFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) return

  const maxBytes = 15 * 1024 * 1024
  if (file.size > maxBytes) {
    toast.add({
      severity: 'warn',
      summary: 'Файл слишком большой',
      detail: 'Максимум 15 МБ.',
      life: 4000,
    })
    if (target) target.value = ''
    return
  }

  photoUploading.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    const res = await authFetch<{ key: string; url: string }>(apiUrl('/upload?folder=players'), {
      method: 'POST',
      body,
    })
    const imageUrl = res.url
    form.photoUrl = imageUrl

    if (isEdit.value && editingId.value && token.value) {
      try {
        await authFetch(apiUrl(`/tenants/${tenantId.value}/players/${editingId.value}`), {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token.value}` },
          body: { photoUrl: imageUrl },
        })
        await fetchPlayers()
        toast.add({
          severity: 'success',
          summary: 'Фото загружено и сохранено',
          life: 3000,
        })
      } catch (patchErr: unknown) {
        toast.add({
          severity: 'warn',
          summary: 'Файл загружен, но ссылка не записана в игрока',
          detail: `${getApiErrorMessage(patchErr)} — нажми «Сохранить».`,
          life: 7000,
        })
      }
    } else {
      toast.add({
        severity: 'success',
        summary: 'Фото загружено',
        detail: 'Нажми «Создать», чтобы сохранить игрока.',
        life: 4000,
      })
    }
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось загрузить',
      detail: getApiErrorMessage(err),
      life: 6000,
    })
  } finally {
    photoUploading.value = false
    if (target) target.value = ''
  }
}

const removePlayerPhoto = async (e: MouseEvent) => {
  e.stopPropagation()
  e.preventDefault()
  if (!form.photoUrl || photoUploading.value || photoRemoving.value) return

  form.photoUrl = ''

  if (isEdit.value && editingId.value && token.value) {
    photoRemoving.value = true
    try {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/players/${editingId.value}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { photoUrl: null },
      })
      await fetchPlayers()
      toast.add({
        severity: 'success',
        summary: 'Фото удалено',
        life: 2500,
      })
    } catch (err: unknown) {
      toast.add({
        severity: 'error',
        summary: 'Не удалось убрать фото',
        detail: getApiErrorMessage(err),
        life: 6000,
      })
    } finally {
      photoRemoving.value = false
    }
  }
}

const savePlayer = async () => {
  if (!token.value) return
  submitAttempted.value = true
  v$.value.$touch()
  if (!canSavePlayer.value) {
    return
  }
  saving.value = true
  try {
    const normalizedPhone = normalizeRuPhoneForApi(form.phone)
    const payload: any = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      gender: form.gender || undefined,
      position: form.position || undefined,
      phone: normalizedPhone || undefined,
      birthDate: form.birthDate ? toYmd(form.birthDate) : undefined,
      bioNumber: form.bioNumber || undefined,
      biography: form.biography || undefined,
      photoUrl: form.photoUrl || undefined,
    }

    if (isEdit.value) {
      payload.teamId = form.teamId.trim() ? form.teamId.trim() : null
      await authFetch(apiUrl(`/tenants/${tenantId.value}/players/${editingId.value}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: payload,
      })
    } else {
      if (form.teamId.trim()) {
        payload.teamId = form.teamId.trim()
      }
      await authFetch(apiUrl(`/tenants/${tenantId.value}/players`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: payload,
      })
    }

    showForm.value = false
    await fetchPlayers()
    toast.add({
      severity: 'success',
      summary: isEdit.value ? 'Игрок обновлен' : 'Игрок создан',
      life: 2500,
    })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: isEdit.value ? 'Не удалось обновить игрока' : 'Не удалось создать игрока',
      detail: getApiErrorMessage(err),
      life: 7000,
    })
  } finally {
    saving.value = false
  }
}

const deletePlayerConfirmOpen = ref(false)
const deletePlayerPending = ref<PlayerRow | null>(null)

const deletePlayerMessage = computed(() => {
  const p = deletePlayerPending.value
  if (!p) return ''
  return `Удалить игрока «${p.lastName} ${p.firstName}»? Действие необратимо.`
})

function requestDeletePlayer(p: PlayerRow) {
  deletePlayerPending.value = p
  deletePlayerConfirmOpen.value = true
}

async function confirmDeletePlayer() {
  const p = deletePlayerPending.value
  if (!token.value || !p) return
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/players/${p.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await fetchPlayers()
    toast.add({ severity: 'success', summary: 'Игрок удалён', life: 2500 })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось удалить игрока',
      detail: getApiErrorMessage(err),
      life: 6000,
    })
  } finally {
    deletePlayerPending.value = null
  }
}

watch(importDialogVisible, (value) => {
  if (!value) {
    importFile.value = null
    if (importFileInput.value) importFileInput.value.value = ''
  }
})

onMounted(() => {
  if (typeof window !== 'undefined') {
    syncWithStorage()
    if (!loggedIn.value) {
      loading.value = false
      router.push('/admin/login')
      return
    }
  }
  currentPage.value = 1
  void fetchPlayers()
})
</script>

<template>
  <section class="admin-page">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <h1 class="text-lg font-semibold text-surface-900 sm:text-xl">Игроки</h1>
        <p class="mt-1 text-xs text-muted-color sm:text-sm">Справочник игроков тенанта.</p>
      </div>
      <div class="admin-toolbar-responsive flex flex-wrap items-center justify-end gap-2">
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          text
          severity="secondary"
          :loading="loading"
          @click="fetchPlayers()"
        />
        <Button
          v-if="!isModeratorReadOnly"
          label="Создать"
          icon="pi pi-plus"
          @click="openCreate"
        />
      </div>
    </header>

    <Message v-if="isModeratorReadOnly" severity="info" :closable="false" class="text-sm">
      Режим просмотра: создание, изменение, импорт и экспорт игроков недоступны.
    </Message>

    <div
      v-if="!isModeratorReadOnly"
      class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-3 sm:p-4"
    >
      <div class="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(16rem,20rem)_1fr] xl:items-end">
        <FloatLabel variant="on" class="min-w-0">
          <Select
            v-model="exportFormat"
            :options="transferFormatOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            :disabled="transferBusy"
          />
          <label>Формат экспорта</label>
        </FloatLabel>
        <div class="admin-toolbar-responsive flex flex-wrap items-center gap-2 xl:justify-end">
          <Button
            label="Экспорт"
            icon="pi pi-download"
            outlined
            severity="secondary"
            size="small"
            :loading="csvDownloading || xlsxDownloading"
            :disabled="transferBusy"
            @click="downloadPlayersByFormat"
          />
          <Button
            v-if="!isModeratorReadOnly"
            label="Импорт"
            icon="pi pi-upload"
            severity="secondary"
            size="small"
            :loading="importBusy"
            :disabled="transferBusy"
            @click="importDialogVisible = true"
          />
        </div>
      </div>
      <p class="mt-2 text-xs text-muted-color">
        Экспорт учитывает текущие фильтры и сортировку. Режим и формат импорта выбираются в диалоге импорта.
      </p>
    </div>

    <Dialog
      v-if="!isModeratorReadOnly"
      :visible="importDialogVisible"
      modal
      block-scroll
      header="Импорт игроков"
      class="w-full max-w-2xl"
      @update:visible="importDialogVisible = $event"
    >
      <div class="pt-2 space-y-4">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FloatLabel variant="on">
            <Select
              :input-id="`${playersImportId}-format`"
              v-model="importFormat"
              :options="transferFormatOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              :disabled="importBusy"
            />
            <label :for="`${playersImportId}-format`">Формат файла</label>
          </FloatLabel>
          <FloatLabel variant="on">
            <Select
              :input-id="`${playersImportId}-mode`"
              v-model="csvImportMode"
              :options="csvImportModeOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              :disabled="importBusy"
            />
            <label :for="`${playersImportId}-mode`">Режим импорта</label>
          </FloatLabel>
        </div>

        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <p class="text-sm font-medium text-surface-800 dark:text-surface-100">
              Поля для импорта
            </p>
            <Button
              v-if="!allImportFieldsSelected"
              type="button"
              label="Выбрать все"
              icon="pi pi-check-square"
              text
              size="small"
              severity="secondary"
              :disabled="importBusy"
              @click="selectAllImportFields"
            />
          </div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label
              v-for="field in importFieldOptions"
              :key="field.value"
              :for="`import_field_${field.value}`"
              class="flex items-center gap-2 text-sm text-surface-700 dark:text-surface-200"
            >
              <Checkbox
                :input-id="`import_field_${field.value}`"
                v-model="importSelectedFields"
                :value="field.value"
                :disabled="importBusy"
              />
              <span>{{ field.label }}</span>
            </label>
          </div>
          <p class="mt-2 text-xs text-muted-color">
            Будут обновлены только выбранные поля. В режиме updateOnly это удобно для точечных правок.
          </p>
          <p
            v-if="!importModeFieldsValid"
            :id="`${playersImportId}-fields-hint`"
            role="alert"
            class="mt-1 text-xs text-red-500"
          >
            Для режимов createOnly/upsert обязательно выберите поля «Фамилия» и «Имя».
          </p>
        </div>

        <div class="rounded-lg border border-dashed border-surface-300 dark:border-surface-600 p-3">
          <div class="flex flex-wrap items-center gap-2">
            <Button
              label="Выбрать файл"
              icon="pi pi-paperclip"
              outlined
              severity="secondary"
              :disabled="importBusy"
              @click="triggerImportFilePick"
            />
            <span class="text-sm text-muted-color">
              {{ importFileName || 'Файл не выбран' }}
            </span>
          </div>
          <p class="mt-2 text-xs text-muted-color">
            Поддерживается один файл в формате {{ importFormat.toUpperCase() }}.
          </p>
          <input
            ref="importFileInput"
            type="file"
            :accept="importAccept"
            class="hidden"
            @change="onImportFileChange"
          />
        </div>
      </div>

      <template #footer>
        <Button
          type="button"
          label="Отмена"
          text
          severity="secondary"
          :disabled="importBusy"
          @click="importDialogVisible = false"
        />
        <Button
          type="button"
          label="Запустить импорт"
          icon="pi pi-check"
          :loading="importBusy"
          :disabled="!importFile || !importSelectedFields.length || !importModeFieldsValid || importBusy"
          @click="submitImport"
        />
      </template>
    </Dialog>

    <div
      class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12 xl:items-end"
    >
      <FloatLabel variant="on" class="min-w-0 xl:col-span-3">
        <InputText
          v-model="filters.name"
          class="w-full"
        />
        <label>Имя или фамилия</label>
      </FloatLabel>
      <FloatLabel variant="on" class="min-w-0 xl:col-span-2">
        <Select
          v-model="filters.position"
          :options="positionFilterOptions"
          option-label="label"
          option-value="value"
          class="w-full"
        />
        <label>Амплуа</label>
      </FloatLabel>
      <FloatLabel variant="on" class="min-w-0 xl:col-span-3">
        <Select
          v-model="filters.teamId"
          :options="listFilterTeamSelectOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          panel-class="player-list-team-filter-panel"
          :loading="listFilterTeamsLoading"
          filter
          filter-placeholder="Поиск команды (сервер)"
          reset-filter-on-hide
          @show="onListFilterTeamSelectPanelShow"
          @hide="onListFilterTeamSelectPanelHide"
          @filter="onListFilterTeamSelectFilter"
        >
          <template #footer>
            <div
              v-if="listFilterTeamsHasMore || listFilterTeamsLoadingMore"
              class="px-2 py-2 border-t border-surface-200 text-center text-xs text-muted-color"
            >
              <span v-if="listFilterTeamsLoadingMore">Загрузка…</span>
              <span v-else>Прокрутите список вниз, чтобы подгрузить ещё</span>
            </div>
          </template>
        </Select>
        <label>Команда</label>
      </FloatLabel>
      <FloatLabel variant="on" class="min-w-0 sm:col-span-2 xl:col-span-4">
        <Select
          v-model="filters.birthYear"
          :options="birthYearFilterOptions"
          option-label="label"
          option-value="value"
          class="w-full"
        />
        <label>Год рождения</label>
      </FloatLabel>

      <div class="flex justify-end pt-1 sm:col-span-2 xl:col-span-12">
        <Button label="Сбросить фильтры" text severity="secondary" @click="resetFilters" />
      </div>
    </div>

    <AdminDataState
      :loading="loading"
      :error="error"
      :empty="false"
      :content-card="false"
      @retry="retry"
    >
      <template #loading>
        <div
          class="rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900 admin-datatable-scroll"
        >
          <DataTable
            :value="skeletonPlayerRows"
      striped-rows
      data-key="id"
      class="min-h-[28rem]"
      aria-busy="true"
    >
      <Column header="Игрок" style="min-width: 14rem">
        <template #body>
          <div class="flex min-w-0 items-center gap-3">
            <Skeleton width="2rem" height="0.75rem" class="rounded-md" />
            <Skeleton width="2.5rem" height="2.5rem" class="rounded-lg" />
            <Skeleton width="55%" height="1rem" class="rounded-md" />
          </div>
        </template>
      </Column>
      <Column header="Команда" style="min-width: 11rem">
        <template #body>
          <div class="flex items-center gap-2">
            <Skeleton width="2rem" height="2rem" class="rounded-md" />
            <Skeleton width="65%" height="0.875rem" class="rounded-md" />
          </div>
        </template>
      </Column>
      <Column header="Дата рождения">
        <template #body>
          <Skeleton width="5.5rem" height="1rem" class="rounded-md" />
        </template>
      </Column>
      <Column header="Возраст" style="min-width: 6rem">
        <template #body>
          <Skeleton width="4rem" height="1rem" class="rounded-md" />
        </template>
      </Column>
      <Column header="Амплуа">
        <template #body>
          <Skeleton width="4.5rem" height="1rem" class="rounded-md" />
        </template>
      </Column>
      <Column v-if="!isModeratorReadOnly" header="Действия" style="width: 8rem">
        <template #body>
          <div class="flex justify-end gap-2">
            <Skeleton shape="circle" width="2rem" height="2rem" />
            <Skeleton shape="circle" width="2rem" height="2rem" />
          </div>
        </template>
      </Column>
          </DataTable>
        </div>
      </template>
      <div
        class="rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900 admin-datatable-scroll"
      >
    <DataTable
      :value="players"
      striped-rows
      :paginator="showPlayersPaginator"
      lazy
      :total-records="totalPlayers"
      :first="first"
      :rows="pageSize"
      :rows-per-page-options="[5, 10, 20, 50]"
      paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
      current-page-report-template="{first}–{last} из {totalRecords}"
      @page="onPlayersPage"
      @sort="onPlayersSort"
      responsive-layout="scroll"
    >
      <template #empty>
        <div class="flex flex-col items-center justify-center gap-2 py-10 text-muted-color">
          <i class="pi pi-inbox text-4xl opacity-40" aria-hidden="true" />
          <span class="text-sm font-medium text-surface-700">Нет игроков</span>
          <span class="text-xs text-center max-w-sm">
            <template v-if="isModeratorReadOnly">Измените фильтры.</template>
            <template v-else>Измените фильтры или добавьте игрока кнопкой «Создать».</template>
          </span>
        </div>
      </template>
      <Column field="lastName" header="Игрок" sortable style="min-width: 14rem">
        <template #body="{ data }">
          <div class="flex items-center gap-3 min-w-0">
            <span
              v-if="data.bioNumber"
              class="text-xs font-semibold text-muted-color tabular-nums shrink-0 w-10 text-center"
            >
              №{{ data.bioNumber }}
            </span>
            <RemoteImage
              :src="data.photoUrl"
              :alt="`${data.firstName} ${data.lastName}`"
              placeholder-icon="user"
              class="h-10 w-10 rounded-lg"
            />
            <span class="min-w-0 truncate font-medium text-surface-900 dark:text-surface-0">
              {{ data.firstName }} {{ data.lastName }}
            </span>
          </div>
        </template>
      </Column>
      <Column header="Команда" style="min-width: 11rem">
        <template #body="{ data }">
          <div v-if="data.team" class="flex items-center gap-2 min-w-0">
            <RemoteImage
              :src="data.team.logoUrl"
              alt=""
              placeholder-icon="users"
              icon-class="text-sm"
              class="h-8 w-8 rounded-md"
            />
            <span class="text-sm truncate">{{ data.team.name }}</span>
          </div>
          <span v-else class="text-muted-color">—</span>
        </template>
      </Column>
      <Column field="birthDate" header="Дата рождения" sortable>
        <template #body="{ data }">
          <span v-if="data.birthDate">{{ new Date(data.birthDate).toLocaleDateString() }}</span>
          <span v-else class="text-muted-color">—</span>
        </template>
      </Column>
      <Column header="Возраст" style="min-width: 6.5rem">
        <template #body="{ data }">
          <span class="tabular-nums text-surface-800 dark:text-surface-100">{{
            formatAgeFromIsoDate(data.birthDate)
          }}</span>
        </template>
      </Column>
      <Column field="position" header="Амплуа" sortable>
        <template #body="{ data }">
          <span v-if="data.position">{{ data.position }}</span>
          <span v-else class="text-muted-color">—</span>
        </template>
      </Column>
      <Column v-if="!isModeratorReadOnly" header="Действия" style="width: 8rem">
        <template #body="{ data }">
          <div class="flex gap-2 justify-end">
            <Button
              type="button"
              icon="pi pi-pencil"
              text
              size="small"
              @click="openEdit(data)"
              aria-label="Редактировать"
            />
            <Button
              type="button"
              icon="pi pi-trash"
              text
              severity="danger"
              size="small"
              @click="requestDeletePlayer(data)"
              aria-label="Удалить"
            />
          </div>
        </template>
      </Column>
    </DataTable>
      </div>
    </AdminDataState>

    <AdminConfirmDialog
      v-model="deletePlayerConfirmOpen"
      title="Удалить игрока?"
      :message="deletePlayerMessage"
      @confirm="confirmDeletePlayer"
    />

    <Dialog
      :visible="showForm"
      @update:visible="(v) => (showForm = v)"
      modal
      block-scroll
      :header="isEdit ? 'Редактирование игрока' : 'Создание игрока'"
      :style="{ width: '54rem' }"
      :contentStyle="{ paddingTop: '1.75rem' }"
    >
      <div class="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
        <div class="md:col-span-1 space-y-3 md:-mt-2">
          <div class="relative w-full">
            <div
              class="relative overflow-hidden rounded-xl border border-surface-200 bg-surface-100 dark:border-surface-600 dark:bg-surface-800"
            >
              <button
                type="button"
                class="relative block h-52 w-full sm:h-60 md:h-[17rem]"
                :class="photoUploading || photoRemoving ? 'cursor-wait opacity-80' : 'cursor-pointer'"
                :disabled="photoUploading || photoRemoving"
                @click="triggerPhotoPick"
                aria-label="Загрузить или заменить фото игрока"
              >
                <RemoteImage
                  v-if="form.photoUrl && !photoUploading && !photoRemoving"
                  :src="form.photoUrl"
                  alt="Фото игрока"
                  placeholder-icon="user"
                  :lazy="false"
                  class="absolute inset-0 z-0 h-full w-full rounded-xl"
                />
                <div
                  v-else-if="!photoUploading && !photoRemoving"
                  class="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-muted-color"
                >
                  <i class="pi pi-image text-2xl opacity-60" aria-hidden="true" />
                  <span class="text-xs">Нажми, чтобы загрузить фото</span>
                </div>
                <div
                  v-if="photoUploading || photoRemoving"
                  class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-100/90 text-sm text-surface-700 dark:bg-surface-900/90 dark:text-surface-200"
                >
                  <i class="pi pi-spin pi-spinner text-2xl" aria-hidden="true" />
                  <span>{{ photoRemoving ? 'Удаление…' : 'Загрузка…' }}</span>
                </div>
              </button>
            </div>

            <Button
              v-if="form.photoUrl && !photoUploading && !photoRemoving"
              type="button"
              icon="pi pi-trash"
              rounded
              severity="danger"
              text
              class="!absolute top-2 right-2 z-10 !h-9 !w-9 !min-w-9 shadow-sm bg-surface-100/90 hover:!bg-surface-200 dark:bg-surface-900/90 dark:hover:!bg-surface-800"
              aria-label="Убрать фото"
              @click="removePlayerPhoto"
            />
          </div>

          <input
            ref="photoFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onPhotoFileChange"
          />
        </div>
        <div class="space-y-4 md:col-span-2">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FloatLabel variant="on" class="block">
                <InputText
                  :id="`${playerFormId}-firstName`"
                  v-model="form.firstName"
                  class="w-full"
                  :invalid="showFirstNameError"
                  :pt="
                    showFirstNameError
                      ? { root: { 'aria-describedby': `${playerFormId}-err-firstName` } }
                      : undefined
                  "
                />
                <label :for="`${playerFormId}-firstName`">Имя</label>
              </FloatLabel>
              <p
                v-if="showFirstNameError"
                :id="`${playerFormId}-err-firstName`"
                role="alert"
                class="mt-0 text-[11px] leading-4 text-red-500"
              >
                {{ playerFormErrors.firstName }}
              </p>
            </div>
            <div>
              <FloatLabel variant="on" class="block">
                <InputText
                  :id="`${playerFormId}-lastName`"
                  v-model="form.lastName"
                  class="w-full"
                  :invalid="showLastNameError"
                  :pt="
                    showLastNameError
                      ? { root: { 'aria-describedby': `${playerFormId}-err-lastName` } }
                      : undefined
                  "
                />
                <label :for="`${playerFormId}-lastName`">Фамилия</label>
              </FloatLabel>
              <p
                v-if="showLastNameError"
                :id="`${playerFormId}-err-lastName`"
                role="alert"
                class="mt-0 text-[11px] leading-4 text-red-500"
              >
                {{ playerFormErrors.lastName }}
              </p>
            </div>

            <div>
              <FloatLabel variant="on" class="block">
                <DatePicker
                  :input-id="`${playerFormId}-birthDate`"
                  v-model="form.birthDate"
                  class="w-full"
                  dateFormat="yy-mm-dd"
                  showIcon
                  :invalid="showBirthDateError"
                  :pt="
                    showBirthDateError
                      ? { pcInputText: { root: { 'aria-describedby': `${playerFormId}-err-birthDate` } } }
                      : undefined
                  "
                />
                <label :for="`${playerFormId}-birthDate`">Дата рождения</label>
              </FloatLabel>
              <p
                v-if="showBirthDateError"
                :id="`${playerFormId}-err-birthDate`"
                role="alert"
                class="mt-0 text-[11px] leading-4 text-red-500"
              >
                {{ playerFormErrors.birthDate }}
              </p>
            </div>
            <FloatLabel variant="on" class="block">
              <Select
                :input-id="`${playerFormId}-gender`"
                v-model="form.gender"
                :options="genderOptions"
                option-label="label"
                option-value="value"
                class="w-full"
              />
              <label :for="`${playerFormId}-gender`">Пол</label>
            </FloatLabel>

            <FloatLabel variant="on" class="block">
              <Select
                :input-id="`${playerFormId}-position`"
                v-model="form.position"
                :options="positionOptions"
                option-label="label"
                option-value="value"
                class="w-full"
              />
              <label :for="`${playerFormId}-position`">Амплуа</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block">
              <InputText :id="`${playerFormId}-bioNumber`" v-model="form.bioNumber" class="w-full" />
              <label :for="`${playerFormId}-bioNumber`">Номер игрока</label>
            </FloatLabel>

            <FloatLabel variant="on" class="block">
              <Select
                :input-id="`${playerFormId}-team`"
                v-model="form.teamId"
                :options="teamSelectOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                panel-class="player-team-select-panel"
                :loading="teamsLoading"
                filter
                filter-placeholder="Поиск по названию (сервер)"
                reset-filter-on-hide
                @show="onTeamSelectPanelShow"
                @hide="onTeamSelectPanelHide"
                @filter="onTeamSelectFilter"
              >
                <template #footer>
                  <div
                    v-if="teamsHasMore || teamsLoadingMore"
                    class="border-t border-surface-200 px-2 py-2 text-center text-xs text-muted-color"
                  >
                    <span v-if="teamsLoadingMore">Загрузка…</span>
                    <span v-else>Прокрутите список вниз, чтобы подгрузить ещё</span>
                  </div>
                </template>
              </Select>
              <label :for="`${playerFormId}-team`">Команда</label>
            </FloatLabel>
            <div>
              <FloatLabel variant="on" class="block">
                <InputMask
                  :id="`${playerFormId}-phone`"
                  v-model="form.phone"
                  class="w-full"
                  mask="+7 (999) 999-99-99"
                  :invalid="showPhoneError"
                  autoClear
                  placeholder="+7 (___) ___-__-__"
                  :pt="
                    showPhoneError
                      ? {
                          root: {
                            'aria-describedby': `${playerFormId}-err-phone`,
                          },
                        }
                      : undefined
                  "
                />
                <label :for="`${playerFormId}-phone`">Мобильный телефон</label>
              </FloatLabel>
              <p
                v-if="showPhoneError"
                :id="`${playerFormId}-err-phone`"
                role="alert"
                class="mt-0 text-[11px] leading-4 text-red-500"
              >
                {{ playerFormErrors.phone }}
              </p>
            </div>
          </div>
        </div>

        <div class="md:col-span-3">
          <label for="player_bio" class="mb-1 block text-sm">Биография</label>
          <AdminMarkdownEditor input-id="player_bio" v-model="form.biography" :rows="6" />
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button type="button" label="Отмена" text @click="showForm = false" />
          <Button
            type="button"
            :label="isEdit ? 'Сохранить' : 'Создать'"
            icon="pi pi-check"
            :loading="saving"
            :disabled="saving || (submitAttempted && !canSavePlayer)"
            @click="savePlayer"
          />
        </div>
      </template>
    </Dialog>
  </section>
</template>


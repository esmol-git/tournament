<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useAdminOrgModeratorReadOnly } from '~/composables/useAdminOrgModeratorReadOnly'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import { useTenantTeamLogo } from '~/composables/useTenantTeamLogo'
import { PLAYER_POSITION_OPTIONS } from '~/constants/playerPositions'
import type { AgeGroupRow } from '~/types/admin/age-group'
import type { RegionRow } from '~/types/admin/region'
import type { TeamCategoryRow } from '~/types/admin/team-category'
import type { TeamPlayerRow, TeamRow } from '~/types/admin/team'
import { getApiErrorMessage } from '~/utils/apiError'
import { toYmdLocal as toYmd } from '~/utils/dateYmd'
import { MIN_SKELETON_DISPLAY_MS, sleepRemainingAfter } from '~/utils/minimumLoadingDelay'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'
import { slugifyFromTitle } from '~/utils/slugify'
import {
  hasSubscriptionFeature,
  tenantPlanLimitsFromAuthUser,
} from '~/utils/subscriptionFeatures'
import { useQueryClient } from '@tanstack/vue-query'
import { invalidateAdminTenantTeamsQueries } from '~/composables/admin/adminTenantQueryKeys'
import InputSwitch from 'primevue/inputswitch'

definePageMeta({
  layout: 'admin',
  /** Глобальный MODERATOR — org read-only; реестр путей в `adminModeratorOrgPolicy`. */
  adminOrgModeratorReadOnly: true,
})

const router = useRouter()
const { token, user, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()
const { t } = useI18n()
const tenantId = useTenantId()
const queryClient = useQueryClient()

const isModeratorReadOnly = useAdminOrgModeratorReadOnly()

const subscriptionPlan = computed(() => {
  const u = user.value as { tenantSubscription?: { plan?: string | null } | null } | null
  return u?.tenantSubscription?.plan ?? null
})

const planLimitsSnapshot = computed(() => tenantPlanLimitsFromAuthUser(user.value))

const teamsPerTenantMax = computed(() => planLimitsSnapshot.value?.teamsPerTenant ?? null)

/** Без активного поиска `totalTeams` — число всех команд тенанта (для лимита). */
const teamsLimitReached = computed(
  () =>
    !searchQuery.value.trim() &&
    teamsPerTenantMax.value !== null &&
    totalTeams.value >= teamsPerTenantMax.value,
)

/** true до первого завершённого запроса — иначе при F5 один кадр с пустым списком и «Нет команд». */
const {
  items: teams,
  loading,
  error,
  run,
  retry,
} = useAdminAsyncListState<TeamRow>({
  initialLoading: true,
  clearItemsOnError: true,
  minLoadingMs: MIN_SKELETON_DISPLAY_MS,
})
/** Скелетон совпадает по числу строк с дефолтным pageSize. */
const TEAMS_TABLE_SKELETON_ROWS = 10
const skeletonTeamRows = Array.from({ length: TEAMS_TABLE_SKELETON_ROWS }, (_, i) => ({
  id: `__sk-${i}`,
}))
const pageSize = ref(10)
const first = ref(0)
const totalTeams = ref(0)
const currentPage = ref(1)
const searchQuery = ref('')
const sortField = ref<string | null>(null)
const sortOrder = ref<number | null>(null)
const ageGroupsList = ref<AgeGroupRow[]>([])
const regionsList = ref<RegionRow[]>([])
const teamCategoriesList = ref<TeamCategoryRow[]>([])
const ageGroupsLoading = ref(false)
const regionsLoading = ref(false)
const teamCategoriesLoading = ref(false)
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

const showForm = ref(false)
const saving = ref(false)
const editing = ref<TeamRow | null>(null)
const isEdit = computed(() => !!editing.value)

const form = reactive({
  name: '',
  rating: 3,
  logoUrl: '',
  coachName: '',
  coachPhone: '',
  coachEmail: '',
  contactName: '',
  contactPhone: '',
  description: '',
  ageGroupId: '',
  teamCategoryId: '',
  regionId: '',
})
const submitAttempted = ref(false)
const teamRules = computed(() => ({
  name: { required },
}))
const v$ = useVuelidate(teamRules, form, { $autoDirty: true })
const teamFormErrors = computed(() => ({
  name: form.name.trim() ? '' : t('admin.validation.required_name'),
}))
const canSaveTeam = computed(() => !v$.value.$invalid && !teamFormErrors.value.name)
const showNameError = computed(
  () => (submitAttempted.value || v$.value.name.$dirty) && !!teamFormErrors.value.name,
)

/** Slug в API всегда из названия (как на публичных URL). */
const teamSlugGenerated = computed(() => slugifyFromTitle(form.name, 'team'))

const showTeamsPaginator = computed(() => totalTeams.value > TEAMS_TABLE_SKELETON_ROWS)

const canImportTeamsCsv = computed(() =>
  hasSubscriptionFeature(subscriptionPlan.value, 'data_import_export'),
)
const teamCsvImportVisible = ref(false)
const teamCsvImporting = ref(false)
const teamCsvFile = ref<File | null>(null)

function openTeamCsvImport() {
  teamCsvFile.value = null
  teamCsvImportVisible.value = true
}

function onTeamCsvFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  teamCsvFile.value = input.files?.[0] ?? null
  input.value = ''
}

async function submitTeamCsvImport() {
  if (!token.value || !teamCsvFile.value) {
    toast.add({
      severity: 'warn',
      summary: 'Файл не выбран',
      detail: 'Выберите CSV с колонкой name (или название).',
      life: 4000,
    })
    return
  }
  teamCsvImporting.value = true
  try {
    const fd = new FormData()
    fd.append('file', teamCsvFile.value)
    const res = await authFetch<{
      created: number
      skipped: number
      errors: Array<{ row: number; message: string }>
    }>(apiUrl(`/tenants/${tenantId.value}/teams/import/csv`), {
      method: 'POST',
      body: fd,
    })
    const errPreview =
      res.errors.length > 0
        ? ` Ошибки в строках: ${res.errors
            .slice(0, 5)
            .map((e) => `${e.row} (${e.message})`)
            .join('; ')}${res.errors.length > 5 ? '…' : ''}`
        : ''
    toast.add({
      severity: res.errors.length ? 'warn' : 'success',
      summary: 'Импорт команд',
      detail: `Создано: ${res.created}, пропущено пустых: ${res.skipped}.${errPreview}`,
      life: 9000,
    })
    teamCsvImportVisible.value = false
    teamCsvFile.value = null
    await fetchTeams(currentPage.value, pageSize.value, searchQuery.value)
    void invalidateAdminTenantTeamsQueries(queryClient, tenantId.value)
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Импорт CSV не удался',
      detail: getApiErrorMessage(err),
      life: 7000,
    })
  } finally {
    teamCsvImporting.value = false
  }
}

const teamsEmptyDescription = computed(() =>
  isModeratorReadOnly.value
    ? 'По заданным условиям записей нет. Измените поиск.'
    : 'По заданным условиям записей нет. Измените поиск или создайте команду кнопкой «Создать».',
)

const fetchTeams = async (page: number = 1, size: number = pageSize.value, nameQuery: string = searchQuery.value) => {
  if (!token.value) {
    loading.value = false
    return
  }
  const pageNum = Math.max(1, Math.floor(Number(page) || 1))
  const pageSizeNum = Math.max(1, Math.floor(Number(size) || pageSize.value || 10))
  await run(async () => {
    const res = await authFetch<{ items: TeamRow[]; total: number }>(
      apiUrl(`/tenants/${tenantId.value}/teams`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
        params: {
          page: pageNum,
          pageSize: pageSizeNum,
          ...(nameQuery ? { name: nameQuery } : {}),
          ...(sortField.value ? { sortField: sortField.value } : {}),
          ...(sortOrder.value === 1 || sortOrder.value === -1 ? { sortOrder: sortOrder.value } : {}),
        },
      },
    )
    teams.value = res.items
    totalTeams.value = res.total
  })
}

const {
  logoFileInput,
  logoUploading,
  logoRemoving,
  triggerLogoPick,
  onLogoFileChange,
  removeTeamLogo,
} = useTenantTeamLogo({
  form,
  isEdit,
  editingTeamId: () => editing.value?.id ?? null,
  tenantId,
  token,
  authFetch,
  apiUrl,
  toast,
  onAfterPersist: async () => {
    await fetchTeams(currentPage.value, pageSize.value, searchQuery.value)
    void invalidateAdminTenantTeamsQueries(queryClient, tenantId.value)
  },
})

async function fetchAgeGroupsAndRegions() {
  if (!token.value) return
  const canBasic = hasSubscriptionFeature(subscriptionPlan.value, 'reference_directory_basic')
  const canStandard = hasSubscriptionFeature(subscriptionPlan.value, 'reference_directory_standard')
  if (!canBasic && !canStandard) return

  ageGroupsLoading.value = canBasic
  regionsLoading.value = canStandard
  teamCategoriesLoading.value = canBasic
  if (!canBasic) ageGroupsList.value = []
  if (!canBasic) teamCategoriesList.value = []
  if (!canStandard) regionsList.value = []
  try {
    const parts: Promise<void>[] = []
    if (canBasic) {
      parts.push(
        authFetch<AgeGroupRow[]>(apiUrl(`/tenants/${tenantId.value}/age-groups`), {
          headers: { Authorization: `Bearer ${token.value}` },
        }).then((ag) => {
          ageGroupsList.value = ag
        }),
      )
      parts.push(
        authFetch<TeamCategoryRow[]>(apiUrl(`/tenants/${tenantId.value}/team-categories`), {
          headers: { Authorization: `Bearer ${token.value}` },
        }).then((rows) => {
          teamCategoriesList.value = rows
        }),
      )
    }
    if (canStandard) {
      parts.push(
        authFetch<RegionRow[]>(apiUrl(`/tenants/${tenantId.value}/regions`), {
          headers: { Authorization: `Bearer ${token.value}` },
        }).then((rg) => {
          regionsList.value = rg
        }),
      )
    }
    if (parts.length) await Promise.all(parts)
  } catch {
    if (canBasic) ageGroupsList.value = []
    if (canBasic) teamCategoriesList.value = []
    if (canStandard) regionsList.value = []
  } finally {
    ageGroupsLoading.value = false
    regionsLoading.value = false
    teamCategoriesLoading.value = false
  }
}

const ageGroupSelectOptions = computed(() => [
  { label: 'Не указано', value: '' },
  ...ageGroupsList.value
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'))
    .map((g) => ({
      label: g.active ? g.name : `${g.name} (неактивна)`,
      value: g.id,
    })),
])

const regionSelectOptions = computed(() => [
  { label: 'Не указано', value: '' },
  ...regionsList.value
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'))
    .map((r) => ({
      label: r.active ? r.name : `${r.name} (неактивен)`,
      value: r.id,
    })),
])

const teamCategorySelectOptions = computed(() => [
  { label: 'Не указано', value: '' },
  ...teamCategoriesList.value
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .map((c) => ({ label: c.name, value: c.id })),
])

const positionOptions = [...PLAYER_POSITION_OPTIONS]

watch(searchQuery, (v) => {
  // Debounce чтобы не дергать сервер на каждом символе
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    currentPage.value = 1
    first.value = 0
    fetchTeams(1, pageSize.value, v)
  }, 300)
})

const openCreate = () => {
  if (teamsLimitReached.value) {
    toast.add({
      severity: 'warn',
      summary: 'Достигнут лимит команд',
      detail: `На вашем тарифе не больше ${teamsPerTenantMax.value} команд в организации.`,
      life: 6000,
    })
    return
  }
  submitAttempted.value = false
  editing.value = null
  form.name = ''
  form.rating = 3
  form.logoUrl = ''
  form.coachName = ''
  form.coachPhone = ''
  form.coachEmail = ''
  form.contactName = ''
  form.contactPhone = ''
  form.description = ''
  form.ageGroupId = ''
  form.teamCategoryId = ''
  form.regionId = ''
  v$.value.$reset()
  showForm.value = true
  void fetchAgeGroupsAndRegions()
}

const openEdit = (t: TeamRow) => {
  submitAttempted.value = false
  editing.value = t
  form.name = t.name
  form.rating = Math.min(5, Math.max(1, Number(t.rating ?? 3)))
  form.logoUrl = t.logoUrl ?? ''
  form.ageGroupId = t.ageGroupId ?? ''
  form.teamCategoryId = t.teamCategoryId ?? ''
  form.regionId = t.regionId ?? ''
  form.coachName = t.coachName ?? ''
  form.coachPhone = ''
  form.coachEmail = ''
  form.contactName = ''
  form.contactPhone = ''
  form.description = ''
  v$.value.$reset()
  showForm.value = true
  void fetchAgeGroupsAndRegions()
}

const saveTeam = async () => {
  if (!token.value) return
  submitAttempted.value = true
  v$.value.$touch()
  if (!canSaveTeam.value) {
    return
  }
  saving.value = true
  try {
    const ag = form.ageGroupId.trim()
    const rg = form.regionId.trim()
    const tc = form.teamCategoryId.trim()
    const body: any = {
      name: form.name,
      rating: Math.min(5, Math.max(1, Number(form.rating || 3))),
      slug: teamSlugGenerated.value,
      logoUrl: form.logoUrl || undefined,
      coachName: form.coachName || undefined,
      coachPhone: form.coachPhone || undefined,
      coachEmail: form.coachEmail || undefined,
      contactName: form.contactName || undefined,
      contactPhone: form.contactPhone || undefined,
      description: form.description || undefined,
      ...(isEdit.value
        ? {
            ageGroupId: ag || null,
            regionId: rg || null,
            teamCategoryId: tc || null,
          }
        : {
            ...(ag ? { ageGroupId: ag } : {}),
            ...(rg ? { regionId: rg } : {}),
            ...(tc ? { teamCategoryId: tc } : {}),
          }),
    }

    if (isEdit.value) {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/teams/${editing.value!.id}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
    } else {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/teams`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
    }

    showForm.value = false
    await fetchTeams(currentPage.value, pageSize.value, searchQuery.value)
    void invalidateAdminTenantTeamsQueries(queryClient, tenantId.value)
  } catch (err: unknown) {
    const editingTeam = isEdit.value
    toast.add({
      severity: 'error',
      summary: editingTeam ? 'Не удалось сохранить команду' : 'Не удалось создать команду',
      detail: getApiErrorMessage(err),
      life: 7000,
    })
  } finally {
    saving.value = false
  }
}

const deleteTeamConfirmOpen = ref(false)
const teamToDelete = ref<TeamRow | null>(null)
const deleteTeamMessage = computed(() => {
  const t = teamToDelete.value
  if (!t) return ''
  return `Удалить команду «${t.name}»? Связи с игроками и турнирами будут сняты.`
})

function requestDeleteTeam(t: TeamRow) {
  teamToDelete.value = t
  deleteTeamConfirmOpen.value = true
}

async function confirmDeleteTeam() {
  const t = teamToDelete.value
  if (!token.value || !t) return
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/teams/${t.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await fetchTeams(currentPage.value, pageSize.value, searchQuery.value)
    void invalidateAdminTenantTeamsQueries(queryClient, tenantId.value)
    toast.add({ severity: 'success', summary: 'Команда удалена', life: 2500 })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось удалить команду',
      detail: getApiErrorMessage(err),
      life: 6000,
    })
  } finally {
    teamToDelete.value = null
  }
}

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
  void fetchTeams(1, pageSize.value, searchQuery.value)
})

const onTeamsPage = (event: any) => {
  // Для PrimeVue `first` — индекс первой строки (0-based), `rows` — размер страницы.
  // Поэтому страницу считаем как: floor(first / rows) + 1 (1-based для бэка).
  const nextFirst = Number(event.first ?? 0)
  const nextSizeCandidate = Number(event.rows ?? pageSize.value)
  const nextSize = nextSizeCandidate > 0 ? nextSizeCandidate : pageSize.value
  const nextPage = Math.floor(nextFirst / nextSize) + 1

  pageSize.value = nextSize
  first.value = nextFirst
  currentPage.value = nextPage

  fetchTeams(nextPage, nextSize, searchQuery.value)
}

const onTeamsSort = (event: any) => {
  const nextField = typeof event.sortField === 'string' ? event.sortField : null
  const nextOrder = event.sortOrder === 1 || event.sortOrder === -1 ? event.sortOrder : null

  // Разрешаем только то, что поддерживает бэк.
  sortField.value = nextField === 'name' || nextField === 'playersCount' ? nextField : null
  sortOrder.value = nextOrder

  currentPage.value = 1
  first.value = 0
  fetchTeams(1, pageSize.value, searchQuery.value)
}

const rosterOpen = ref(false)
const rosterTeam = ref<TeamRow | null>(null)
const rosterPlayers = ref<TeamPlayerRow[]>([])
const rosterTotal = ref(0)
const rosterLoading = ref(false)
const rosterSkeletonRows = Array.from({ length: TEAMS_TABLE_SKELETON_ROWS }, (_, i) => ({
  id: `__rsk-${i}`,
}))
/** Сбрасываем в finally только если это актуальный запрос (закрытие диалога / новый fetch). */
let rosterFetchSeq = 0

const rosterPageSize = ref(10)
const rosterFirst = ref(0)
const rosterCurrentPage = ref(1)

const rosterSortField = ref<string | undefined>(undefined)
const rosterSortOrder = ref<number | undefined>(undefined)

/** Как на странице «Игроки»: одно поле имени, селект амплуа, диапазон дат рождения */
const rosterFilters = reactive({
  name: '',
  position: '',
  phone: '',
  birthDateRange: null as Date[] | null,
})

const rosterPositionFilterOptions = computed(() => [
  { value: '', label: 'Все амплуа' },
  ...PLAYER_POSITION_OPTIONS,
])

let rosterFilterDebounce: ReturnType<typeof setTimeout> | null = null

function clearRosterFilterDebounce() {
  if (rosterFilterDebounce) {
    clearTimeout(rosterFilterDebounce)
    rosterFilterDebounce = null
  }
}

function scheduleRosterFilterFetch() {
  if (!rosterOpen.value || !rosterTeam.value) return
  clearRosterFilterDebounce()
  rosterFilterDebounce = setTimeout(() => {
    rosterFilterDebounce = null
    rosterCurrentPage.value = 1
    rosterFirst.value = 0
    void fetchRosterPlayers()
  }, 350)
}

const hasActiveRosterFilters = computed(() => {
  const br = rosterFilters.birthDateRange
  const hasRange = !!(br && br.length >= 2 && br[0] && br[1])
  return !!(
    rosterFilters.name.trim() ||
    rosterFilters.position.trim() ||
    rosterFilters.phone.trim() ||
    hasRange
  )
})

watch(
  () =>
    [
      rosterOpen.value,
      rosterTeam.value?.id,
      rosterFilters.name,
      rosterFilters.position,
      rosterFilters.phone,
      rosterFilters.birthDateRange,
    ] as const,
  () => {
    if (!rosterOpen.value || !rosterTeam.value) return
    scheduleRosterFilterFetch()
  },
  { deep: true },
)

const fetchRosterPlayers = async () => {
  if (!token.value || !rosterTeam.value) {
    rosterLoading.value = false
    return
  }
  const seq = ++rosterFetchSeq
  const loadStartedAt = Date.now()
  rosterLoading.value = true
  const page = Math.max(1, Math.floor(Number(rosterCurrentPage.value) || 1))
  const size = Math.max(1, Math.floor(Number(rosterPageSize.value) || 10))

  try {
    const params: Record<string, unknown> = {
      page,
      pageSize: size,
    }
    if (rosterSortField.value) params.sortField = rosterSortField.value
    if (rosterSortOrder.value === 1 || rosterSortOrder.value === -1) params.sortOrder = rosterSortOrder.value

    if (rosterFilters.name.trim()) params.name = rosterFilters.name.trim()
    if (rosterFilters.position.trim()) params.position = rosterFilters.position.trim()
    if (rosterFilters.phone.trim()) params.phone = rosterFilters.phone.trim()
    const br = rosterFilters.birthDateRange
    if (br && br.length >= 2 && br[0] && br[1]) {
      const a = br[0]
      const b = br[1]
      const from = a <= b ? a : b
      const to = a <= b ? b : a
      params.birthDateFrom = toYmd(from)
      params.birthDateTo = toYmd(to)
    }

    const res = await authFetch<{ items: TeamPlayerRow[]; total: number }>(
      apiUrl(`/tenants/${tenantId.value}/teams/${rosterTeam.value.id}/players`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
        params,
      },
    )
    rosterPlayers.value = res.items
    rosterTotal.value = res.total
  } finally {
    await sleepRemainingAfter(MIN_SKELETON_DISPLAY_MS, loadStartedAt)
    if (seq === rosterFetchSeq) {
      rosterLoading.value = false
    }
  }
}

const onRosterPage = (event: any) => {
  const nextFirst = Number(event.first ?? 0)
  const nextSizeCandidate = Number(event.rows ?? rosterPageSize.value)
  const nextSize = nextSizeCandidate > 0 ? nextSizeCandidate : rosterPageSize.value
  const nextPage = Math.floor(nextFirst / nextSize) + 1

  rosterFirst.value = nextFirst
  rosterPageSize.value = nextSize
  rosterCurrentPage.value = nextPage
  fetchRosterPlayers()
}

/** Сортировка на сервере; поле/порядок синхронизируются через v-model на DataTable */
const onRosterSort = () => {
  rosterCurrentPage.value = 1
  rosterFirst.value = 0
  void fetchRosterPlayers()
}

const resetRosterFilters = () => {
  clearRosterFilterDebounce()
  rosterFilters.name = ''
  rosterFilters.position = ''
  rosterFilters.phone = ''
  rosterFilters.birthDateRange = null
  rosterCurrentPage.value = 1
  rosterFirst.value = 0
  void fetchRosterPlayers()
  void nextTick(() => clearRosterFilterDebounce())
}

const openRoster = async (team: TeamRow) => {
  clearRosterFilterDebounce()
  rosterTeam.value = team
  rosterLoading.value = true
  rosterPlayers.value = []
  rosterTotal.value = 0
  rosterOpen.value = true
  rosterCurrentPage.value = 1
  rosterFirst.value = 0
  rosterSortField.value = undefined
  rosterSortOrder.value = undefined
  rosterFilters.name = ''
  rosterFilters.position = ''
  rosterFilters.phone = ''
  rosterFilters.birthDateRange = null
  await fetchRosterPlayers()
  await nextTick(() => clearRosterFilterDebounce())
}

watch(rosterOpen, (open) => {
  if (!open) {
    rosterFetchSeq += 1
    rosterLoading.value = false
  }
})

const rosterEditorOpen = ref(false)
const rosterEditorMode = ref<'create' | 'edit'>('create')
const rosterEditorSaving = ref(false)

const editorPlayerId = ref<string | null>(null)
const editorJerseyNumber = ref<number | null>(null)
const editorPosition = ref<string>('')

const editorPickQuery = ref('')
const editorPickLoading = ref(false)
const editorPickPlayers = ref<
  Array<{
    id: string
    firstName: string
    lastName: string
    birthDate: string | null
    team?: { id: string; name: string } | null
  }>
>([])
const editorPickSelected = ref<
  Array<{
    id: string
    firstName: string
    lastName: string
    birthDate: string | null
    team?: { id: string; name: string } | null
  }>
>([])

const fetchPickPlayers = async () => {
  if (!token.value || !rosterTeam.value) return
  editorPickLoading.value = true
  try {
    const res = await authFetch<{
      items: Array<{
        id: string
        firstName: string
        lastName: string
        birthDate: string | null
        team?: { id: string; name: string } | null
      }>
      total: number
    }>(
      apiUrl(`/tenants/${tenantId.value}/players`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
        params: {
          page: 1,
          pageSize: 200,
          ...(editorPickQuery.value.trim() ? { name: editorPickQuery.value.trim() } : {}),
        },
      },
    )
    editorPickPlayers.value = res.items.filter((p) => !p.team)
    const allowed = new Set(editorPickPlayers.value.map((p) => p.id))
    editorPickSelected.value = editorPickSelected.value.filter((p) => allowed.has(p.id))
  } finally {
    editorPickLoading.value = false
  }
}

const openAddRosterPlayer = async () => {
  rosterEditorMode.value = 'create'
  editorPlayerId.value = null
  editorJerseyNumber.value = null
  editorPosition.value = ''
  editorPickQuery.value = ''
  editorPickSelected.value = []
  editorPickPlayers.value = []
  await fetchPickPlayers()
  rosterEditorOpen.value = true
}

const openEditRosterPlayer = (tp: TeamPlayerRow) => {
  rosterEditorMode.value = 'edit'
  editorPlayerId.value = tp.playerId
  editorJerseyNumber.value = tp.jerseyNumber
  editorPosition.value = tp.position ?? ''
  rosterEditorOpen.value = true
}

const saveRosterPlayer = async () => {
  if (!token.value || !rosterTeam.value) return
  rosterEditorSaving.value = true
  try {
    if (rosterEditorMode.value === 'create') {
      if (!editorPickSelected.value.length) {
        toast.add({
          severity: 'warn',
          summary: 'Не выбраны игроки',
          detail: 'Отметьте хотя бы одного игрока в таблице.',
          life: 3500,
        })
        return
      }
      const canBulk = hasSubscriptionFeature(subscriptionPlan.value, 'data_import_export')
      if (!canBulk) {
        let added = 0
        for (const p of editorPickSelected.value) {
          await authFetch(apiUrl(`/tenants/${tenantId.value}/teams/${rosterTeam.value.id}/players`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` },
            body: { playerId: p.id },
          })
          added += 1
        }
        toast.add({
          severity: 'success',
          summary: 'Игроки добавлены в команду',
          detail: `Добавлено: ${added}.`,
          life: 3000,
        })
      } else {
        const bulkRes = await authFetch<{
          total: number
          added: number
          failed: number
          results: Array<{ playerId: string; ok: boolean; error?: string }>
        }>(apiUrl(`/tenants/${tenantId.value}/teams/${rosterTeam.value.id}/players/bulk`), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token.value}` },
          body: { playerIds: editorPickSelected.value.map((p) => p.id) },
        })
        if (bulkRes.failed > 0) {
          const firstError = bulkRes.results.find((r) => !r.ok)?.error
          toast.add({
            severity: bulkRes.added > 0 ? 'warn' : 'error',
            summary: bulkRes.added > 0 ? 'Добавлены не все игроки' : 'Не удалось добавить игроков',
            detail: firstError || `Не удалось добавить ${bulkRes.failed} из ${bulkRes.total}.`,
            life: 7000,
          })
        } else {
          toast.add({
            severity: 'success',
            summary: 'Игроки добавлены в команду',
            detail: `Добавлено: ${bulkRes.added}.`,
            life: 3000,
          })
        }
      }
    } else {
      if (!editorPlayerId.value) return
      await authFetch(
        apiUrl(`/tenants/${tenantId.value}/teams/${rosterTeam.value.id}/players/${editorPlayerId.value}`),
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token.value}` },
          body: {
            jerseyNumber: editorJerseyNumber.value ?? undefined,
            position: editorPosition.value || undefined,
          },
        },
      )
    }
    rosterEditorOpen.value = false
    await fetchRosterPlayers()
    if (rosterEditorMode.value === 'edit') {
      toast.add({
        severity: 'success',
        summary: 'Игрок обновлен',
        life: 2500,
      })
    }
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary:
        rosterEditorMode.value === 'create'
          ? 'Не удалось добавить игрока в команду'
          : 'Не удалось обновить игрока в команде',
      detail: getApiErrorMessage(err),
      life: 7000,
    })
  } finally {
    rosterEditorSaving.value = false
  }
}

const rosterActiveTogglingId = ref<string | null>(null)

async function setTeamPlayerActive(tp: TeamPlayerRow, value: boolean) {
  if (!token.value || !rosterTeam.value || isModeratorReadOnly.value) return
  const current = tp.isActive !== false
  if (value === current) return
  rosterActiveTogglingId.value = tp.id
  try {
    await authFetch(
      apiUrl(`/tenants/${tenantId.value}/teams/${rosterTeam.value.id}/players/${tp.playerId}`),
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { isActive: value },
      },
    )
    await fetchRosterPlayers()
    toast.add({
      severity: 'success',
      summary: value ? 'Игрок в заявке' : 'Игрок не в заявке',
      life: 2200,
    })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось изменить статус',
      detail: getApiErrorMessage(err),
      life: 7000,
    })
  } finally {
    rosterActiveTogglingId.value = null
  }
}

const deleteRosterPlayerConfirmOpen = ref(false)
const rosterPlayerToDelete = ref<TeamPlayerRow | null>(null)
const deleteRosterPlayerMessage = computed(() => {
  const tp = rosterPlayerToDelete.value
  if (!tp) return ''
  return `Убрать игрока «${tp.player.lastName} ${tp.player.firstName}» из состава команды?`
})

function requestDeleteRosterPlayer(tp: TeamPlayerRow) {
  rosterPlayerToDelete.value = tp
  deleteRosterPlayerConfirmOpen.value = true
}

async function confirmDeleteRosterPlayer() {
  const tp = rosterPlayerToDelete.value
  if (!token.value || !rosterTeam.value || !tp) return
  try {
    await authFetch(
      apiUrl(`/tenants/${tenantId.value}/teams/${rosterTeam.value.id}/players/${tp.playerId}`),
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token.value}` },
      },
    )
    await fetchRosterPlayers()
    toast.add({ severity: 'success', summary: 'Игрок убран из состава', life: 2500 })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось убрать игрока',
      detail: getApiErrorMessage(err),
      life: 6000,
    })
  } finally {
    rosterPlayerToDelete.value = null
  }
}
</script>

<template>
  <section class="admin-page">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <h1 class="text-lg font-semibold text-surface-900 sm:text-xl">Команды</h1>
        <p class="mt-1 text-xs text-muted-color sm:text-sm">Справочник команд тенанта.</p>
      </div>
      <div class="admin-toolbar-responsive flex flex-wrap items-center gap-2">
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          text
          severity="secondary"
          :loading="loading"
          @click="fetchTeams(currentPage, pageSize, searchQuery)"
        />
        <Button
          v-if="!isModeratorReadOnly && canImportTeamsCsv"
          label="Импорт CSV"
          icon="pi pi-upload"
          severity="secondary"
          outlined
          :disabled="teamsLimitReached"
          @click="openTeamCsvImport"
        />
        <Button
          v-if="!isModeratorReadOnly"
          label="Создать"
          icon="pi pi-plus"
          :disabled="teamsLimitReached"
          @click="openCreate"
        />
      </div>
    </header>

    <Message v-if="isModeratorReadOnly" severity="info" :closable="false" class="text-sm">
      Режим просмотра: создание и изменение команд, состава и логотипов недоступны.
    </Message>

    <Message
      v-else-if="teamsPerTenantMax !== null"
      :severity="teamsLimitReached ? 'warn' : 'info'"
      :closable="false"
      class="text-sm"
    >
      <span v-if="!searchQuery.trim()">
        Команд в организации: {{ totalTeams }} из {{ teamsPerTenantMax }}.
        <span v-if="teamsLimitReached"> Чтобы добавить ещё, повысьте тариф.</span>
      </span>
      <span v-else>
        Лимит по тарифу — до {{ teamsPerTenantMax }} команд; при поиске счётчик не фильтруется.
        Очистите поиск, чтобы увидеть фактическое число команд.
      </span>
    </Message>

    <div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <InputText
        v-model="searchQuery"
        placeholder="Название команды"
        class="w-full min-w-0 sm:max-w-xs md:w-72"
      />
      <Button
        v-if="searchQuery"
        text
        icon="pi pi-times"
        severity="secondary"
        size="small"
        @click="searchQuery = ''"
      />
    </div>

    <AdminDataState
      :loading="loading"
      :error="error"
      :empty="!teams.length"
      empty-icon="pi pi-shield"
      empty-title="Нет команд"
      :empty-description="teamsEmptyDescription"
      @retry="retry"
    >
      <template #loading>
        <div
          class="rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900 admin-datatable-scroll"
        >
          <DataTable
            :value="skeletonTeamRows"
            striped-rows
            data-key="id"
            class="min-h-[28rem]"
            aria-busy="true"
          >
            <Column header="" style="width: 5.5rem">
              <template #body>
                <Skeleton width="2.5rem" height="2.5rem" class="rounded" />
              </template>
            </Column>
            <Column header="Название">
              <template #body>
                <Skeleton width="70%" height="1rem" class="rounded-md" />
              </template>
            </Column>
            <Column header="Рейтинг" style="width: 7rem">
              <template #body>
                <Skeleton width="2rem" height="1rem" class="rounded-md" />
              </template>
            </Column>
            <Column header="Возраст">
              <template #body>
                <Skeleton width="40%" height="1rem" class="rounded-md" />
              </template>
            </Column>
            <Column header="Категория состава" style="min-width: 7rem">
              <template #body>
                <Skeleton width="55%" height="1rem" class="rounded-md" />
              </template>
            </Column>
            <Column header="Регион">
              <template #body>
                <Skeleton width="40%" height="1rem" class="rounded-md" />
              </template>
            </Column>
            <Column header="Игроков">
              <template #body>
                <Skeleton width="2rem" height="1rem" class="rounded-md" />
              </template>
            </Column>
            <Column v-if="!isModeratorReadOnly" header="Действия" style="width: 16rem">
              <template #body>
                <div class="flex justify-end gap-2">
                  <Skeleton shape="circle" width="2rem" height="2rem" />
                  <Skeleton shape="circle" width="2rem" height="2rem" />
                  <Skeleton shape="circle" width="2rem" height="2rem" />
                </div>
              </template>
            </Column>
          </DataTable>
        </div>
      </template>

      <template #empty-actions>
        <Button
          v-if="!isModeratorReadOnly"
          label="Создать команду"
          icon="pi pi-plus"
          :disabled="teamsLimitReached"
          @click="openCreate"
        />
      </template>

    <DataTable
      :value="teams"
      striped-rows
      :paginator="showTeamsPaginator"
      lazy
      :total-records="totalTeams"
      :first="first"
      :rows="pageSize"
      :rows-per-page-options="[5, 10, 20, 50]"
      paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
      current-page-report-template="{first}–{last} из {totalRecords}"
      @page="onTeamsPage"
      @sort="onTeamsSort"
    >
      <template #empty>
        <span class="sr-only">Пусто</span>
      </template>
      <Column header="" style="width: 5.5rem">
        <template #body="{ data }">
          <RemoteImage
            :src="data.logoUrl"
            alt="Логотип"
            placeholder-icon="users"
            class="h-10 w-10 rounded"
          />
        </template>
      </Column>
      <Column field="name" header="Название" sortable />
      <Column field="rating" header="Рейтинг" sortable style="width: 7rem">
        <template #body="{ data }">{{ data.rating ?? 3 }}</template>
      </Column>
      <Column header="Возраст" style="min-width: 6rem">
        <template #body="{ data }">
          <span v-if="data.ageGroup?.shortLabel || data.ageGroup?.name" class="text-sm">
            {{ data.ageGroup?.shortLabel || data.ageGroup?.name }}
          </span>
          <span v-else class="text-muted-color">—</span>
        </template>
      </Column>
      <Column header="Категория состава" style="min-width: 7rem">
        <template #body="{ data }">
          <span v-if="data.teamCategory?.name" class="text-sm">{{ data.teamCategory.name }}</span>
          <span v-else class="text-muted-color">—</span>
        </template>
      </Column>
      <Column header="Регион" style="min-width: 7rem">
        <template #body="{ data }">
          <span v-if="data.region?.name" class="text-sm">{{ data.region.name }}</span>
          <span v-else class="text-muted-color">—</span>
        </template>
      </Column>
      <Column field="playersCount" header="Игроков" sortable>
        <template #body="{ data }">{{ data.playersCount }}</template>
      </Column>
      <Column header="Действия" :style="{ width: isModeratorReadOnly ? '5rem' : '16rem' }">
        <template #body="{ data }">
          <div class="flex w-full justify-end gap-2">
            <Button
              v-if="!isModeratorReadOnly"
              icon="pi pi-pencil"
              text
              size="small"
              @click="openEdit(data)"
              aria-label="Редактировать"
            />
            <Button
              icon="pi pi-users"
              text
              size="small"
              @click="openRoster(data)"
              aria-label="Игроки команды"
            />
            <Button
              v-if="!isModeratorReadOnly"
              icon="pi pi-trash"
              text
              severity="danger"
              size="small"
              @click="requestDeleteTeam(data)"
              aria-label="Удалить"
            />
          </div>
        </template>
      </Column>
    </DataTable>
    </AdminDataState>

    <Dialog
      v-model:visible="teamCsvImportVisible"
      modal
      header="Импорт команд из CSV"
      :style="{ width: 'min(32rem, 95vw)' }"
    >
      <p class="mb-3 text-sm text-muted-color">
        Первая строка — заголовки. Обязательная колонка:
        <code class="rounded bg-surface-100 px-1 dark:bg-surface-800">name</code>
        (или «название», «команда»). Опционально:
        slug, category; возрастная группа — колонки
        <code class="rounded bg-surface-100 px-1 dark:bg-surface-800">agegroup</code>
        /
        <code class="rounded bg-surface-100 px-1 dark:bg-surface-800">возраст</code>
        (имя из справочника); категория состава —
        <code class="rounded bg-surface-100 px-1 dark:bg-surface-800">teamcategory</code>
        ; регион —
        <code class="rounded bg-surface-100 px-1 dark:bg-surface-800">region</code>
        . Контакты: coachName, coachPhone, coachEmail, contactName, contactPhone, description. UTF-8.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        class="mb-4 block w-full text-sm"
        @change="onTeamCsvFileChange"
      >
      <div class="flex justify-end gap-2">
        <Button label="Отмена" severity="secondary" @click="teamCsvImportVisible = false" />
        <Button
          label="Загрузить"
          icon="pi pi-check"
          :loading="teamCsvImporting"
          :disabled="!teamCsvFile"
          @click="submitTeamCsvImport"
        />
      </div>
    </Dialog>

    <AdminConfirmDialog
      v-model="deleteTeamConfirmOpen"
      title="Удалить команду?"
      :message="deleteTeamMessage"
      @confirm="confirmDeleteTeam"
    />

    <AdminConfirmDialog
      v-model="deleteRosterPlayerConfirmOpen"
      title="Убрать из состава?"
      :message="deleteRosterPlayerMessage"
      confirm-label="Убрать"
      @confirm="confirmDeleteRosterPlayer"
    />

    <Dialog
      :visible="showForm"
      @update:visible="(v) => (showForm = v)"
      modal
      :header="isEdit ? 'Редактировать команду' : 'Создать команду'"
      :style="{ width: '44rem' }"
      :contentStyle="{ paddingTop: '1.75rem' }"
    >
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <!-- Left: квадратный логотип -->
        <div class="md:col-span-1 flex items-start justify-center md:justify-stretch relative">
          <button
            type="button"
            class="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-surface-200 bg-surface-100 leading-none dark:border-surface-600 dark:bg-surface-800 relative"
            :class="[
              logoUploading || logoRemoving ? 'cursor-wait opacity-80' : 'cursor-pointer',
              form.logoUrl && !logoUploading && !logoRemoving ? 'border-transparent dark:border-transparent' : '',
            ]"
            :disabled="logoUploading || logoRemoving"
            @click="triggerLogoPick"
            aria-label="Загрузить или заменить логотип команды"
          >
            <RemoteImage
              v-if="form.logoUrl && !logoUploading && !logoRemoving"
              :src="form.logoUrl"
              alt="Логотип"
              placeholder-icon="users"
              :lazy="false"
              class="absolute inset-0 z-0 h-full w-full rounded-xl"
            />
            <div
              v-else-if="!logoUploading && !logoRemoving"
              class="relative flex flex-col items-center justify-center gap-2 px-3 text-center text-muted-color"
            >
              <i class="pi pi-image text-2xl opacity-60" aria-hidden="true" />
              <span class="text-xs">Нажми, чтобы загрузить логотип</span>
            </div>
            <div
              v-if="logoUploading || logoRemoving"
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-100/90 text-sm text-surface-700 dark:bg-surface-900/90 dark:text-surface-200"
            >
              <i class="pi pi-spin pi-spinner text-2xl" aria-hidden="true" />
              <span>{{ logoRemoving ? 'Удаление…' : 'Загрузка…' }}</span>
            </div>
          </button>

          <Button
            v-if="form.logoUrl && !logoUploading && !logoRemoving"
            type="button"
            icon="pi pi-trash"
            rounded
            severity="danger"
            text
            class="!absolute top-2 right-2 z-10 !h-9 !w-9 !min-w-9 shadow-sm bg-surface-100/90 hover:!bg-surface-200 dark:bg-surface-900/90 dark:hover:!bg-surface-800"
            aria-label="Удалить логотип"
            @click="removeTeamLogo"
          />

          <input
            ref="logoFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onLogoFileChange"
          />

        </div>

        <!-- Справа от логотипа: название, slug, тренер, рейтинг -->
        <div class="space-y-4 md:col-span-2">
          <FloatLabel variant="on" class="block">
            <InputText id="team_name" v-model="form.name" class="w-full" :invalid="showNameError" />
            <label for="team_name">Название</label>
          </FloatLabel>
          <p v-if="showNameError" class="mt-0 text-[11px] leading-3 text-red-500">{{ teamFormErrors.name }}</p>

          <FloatLabel variant="on" class="block">
            <InputText
              id="team_slug"
              :modelValue="teamSlugGenerated"
              class="w-full"
              readonly
              disabled
            />
            <label for="team_slug">Slug (авто)</label>
          </FloatLabel>

          <FloatLabel variant="on" class="block">
            <InputText id="team_coach" v-model="form.coachName" class="w-full" />
            <label for="team_coach">Тренер (имя)</label>
          </FloatLabel>

          <FloatLabel variant="on" class="block">
            <InputNumber
              inputId="team_rating"
              v-model="form.rating"
              class="w-full"
              :min="1"
              :max="5"
            />
            <label for="team_rating">Рейтинг (1-5)</label>
          </FloatLabel>
        </div>

        <div class="md:col-span-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          <FloatLabel variant="on" class="block">
            <Select
              inputId="team_age_group"
              v-model="form.ageGroupId"
              :options="ageGroupSelectOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              :loading="ageGroupsLoading"
            />
            <label for="team_age_group">Возрастная группа</label>
          </FloatLabel>
          <FloatLabel variant="on" class="block">
            <Select
              inputId="team_team_category"
              v-model="form.teamCategoryId"
              :options="teamCategorySelectOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              :loading="teamCategoriesLoading"
            />
            <label for="team_team_category">Категория состава</label>
          </FloatLabel>
          <FloatLabel variant="on" class="block">
            <Select
              inputId="team_region"
              v-model="form.regionId"
              :options="regionSelectOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              :loading="regionsLoading"
            />
            <label for="team_region">Регион</label>
          </FloatLabel>
        </div>
        <p class="md:col-span-3 text-xs leading-snug text-muted-color">
          Возрастная группа — для фильтров и заявки команды в турнир (если у турнира задана группа).
          Категория состава — правила из справочника «Категории команд»: кого можно добавлять в состав.
        </p>

        <!-- Bottom: description -->
        <div class="md:col-span-3">
          <label for="team_desc" class="mb-1 block text-sm">Описание</label>
          <AdminMarkdownEditor input-id="team_desc" v-model="form.description" :rows="3" />
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Отмена" text @click="showForm = false" />
          <Button
            :label="isEdit ? 'Сохранить' : 'Создать'"
            icon="pi pi-check"
            :loading="saving"
            :disabled="saving || (submitAttempted && !canSaveTeam)"
            @click="saveTeam"
          />
        </div>
      </template>
    </Dialog>

    <Dialog
      :visible="rosterOpen"
      @update:visible="(v) => (rosterOpen = v)"
      modal
      :header="rosterTeam ? `Игроки команды: ${rosterTeam.name}` : 'Игроки команды'"
      :style="{ width: '74rem' }"
      :contentStyle="{ paddingTop: '1.75rem' }"
    >
      <div class="space-y-4">
        <div
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12 xl:items-end"
        >
          <FloatLabel variant="on" class="min-w-0 xl:col-span-3">
            <InputText v-model="rosterFilters.name" class="w-full" />
            <label>Имя или фамилия</label>
          </FloatLabel>
          <FloatLabel variant="on" class="min-w-0 xl:col-span-2">
            <Select
              v-model="rosterFilters.position"
              :options="rosterPositionFilterOptions"
              option-label="label"
              option-value="value"
              class="w-full"
            />
            <label>Амплуа</label>
          </FloatLabel>
          <FloatLabel variant="on" class="min-w-0 xl:col-span-2">
            <InputText v-model="rosterFilters.phone" class="w-full" />
            <label>Телефон</label>
          </FloatLabel>
          <FloatLabel variant="on" class="min-w-0 sm:col-span-2 xl:col-span-5">
            <DatePicker
              v-model="rosterFilters.birthDateRange"
              class="w-full"
              dateFormat="yy-mm-dd"
              showIcon
              selectionMode="range"
              placeholder="Дата рождения: от — до"
            />
            <label>Дата рождения</label>
          </FloatLabel>

          <div class="flex flex-wrap justify-end gap-2 pt-1 sm:col-span-2 xl:col-span-12">
            <Button label="Сбросить фильтры" text severity="secondary" @click="resetRosterFilters" />
            <Button
              v-if="!isModeratorReadOnly"
              label="Добавить"
              icon="pi pi-plus"
              @click="openAddRosterPlayer"
            />
          </div>
        </div>

        <Message v-if="!isModeratorReadOnly" severity="info" :closable="false" class="text-sm">
          В публичном составе каждого турнира показываются только игроки «в заявке» (активная связь с
          командой). Одна и та же команда может участвовать в нескольких турнирах одновременно (например,
          первенство и кубок). Отключить или убрать игрока из состава нельзя, если в протоколах
          <strong>активного</strong>
          турнира уже есть события с этим игроком.
        </Message>

        <DataTable
          v-if="rosterLoading"
          :value="rosterSkeletonRows"
          striped-rows
          data-key="id"
          class="min-h-[24rem]"
          responsive-layout="scroll"
          aria-busy="true"
        >
          <Column header="№" style="width: 5rem">
            <template #body>
              <Skeleton width="1.75rem" height="1rem" class="rounded-md" />
            </template>
          </Column>
          <Column header="Игрок" style="min-width: 14rem">
            <template #body>
              <div class="flex items-center gap-3">
                <Skeleton width="2.5rem" height="2.5rem" class="rounded-lg" />
                <div class="min-w-0 flex-1 space-y-2">
                  <Skeleton width="75%" height="0.875rem" class="rounded-md" />
                  <Skeleton width="45%" height="0.75rem" class="rounded-md" />
                </div>
              </div>
            </template>
          </Column>
          <Column header="Дата рождения" style="min-width: 9rem">
            <template #body>
              <Skeleton width="5.5rem" height="1rem" class="rounded-md" />
            </template>
          </Column>
          <Column header="Амплуа" style="min-width: 8rem">
            <template #body>
              <Skeleton width="4rem" height="1rem" class="rounded-md" />
            </template>
          </Column>
          <Column header="Телефон" style="min-width: 10rem">
            <template #body>
              <Skeleton width="70%" height="1rem" class="rounded-md" />
            </template>
          </Column>
          <Column v-if="!isModeratorReadOnly" header="В заявке" style="width: 7rem">
            <template #body>
              <Skeleton width="2.25rem" height="1.25rem" class="rounded-md" />
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

        <DataTable
          v-else
          :value="rosterPlayers"
          :row-class="(data: TeamPlayerRow) => (data.isActive === false ? 'opacity-70' : undefined)"
          striped-rows
          :paginator="rosterTotal >= 6"
          lazy
          v-model:sort-field="rosterSortField"
          v-model:sort-order="rosterSortOrder"
          :total-records="rosterTotal"
          :first="rosterFirst"
          :rows="rosterPageSize"
          :rows-per-page-options="[5, 10, 20, 50]"
          responsive-layout="scroll"
          @page="onRosterPage"
          @sort="onRosterSort"
        >
          <template #empty>
            <div class="flex flex-col items-center justify-center gap-2 py-10 text-muted-color">
              <i class="pi pi-inbox text-4xl opacity-40" aria-hidden="true" />
              <span class="text-sm font-medium text-surface-700">
                <template v-if="hasActiveRosterFilters">Нет игроков по заданным фильтрам</template>
                <template v-else>В этой команде пока нет игроков</template>
              </span>
              <span class="text-xs text-center max-w-sm">
                <template v-if="hasActiveRosterFilters">
                  Измените фильтры или сбросьте их.
                </template>
                <template v-else-if="!isModeratorReadOnly">
                  Добавьте игрока кнопкой «Добавить».
                </template>
                <template v-else>Состав команды пуст.</template>
              </span>
            </div>
          </template>
          <Column
            field="jerseyNumber"
            header="№"
            sortable
            style="width: 5rem"
          >
            <template #body="{ data }">
              <span v-if="data.jerseyNumber != null" class="tabular-nums font-medium">{{ data.jerseyNumber }}</span>
              <span v-else class="text-muted-color">—</span>
            </template>
          </Column>
          <Column field="lastName" header="Игрок" sortable style="min-width: 14rem">
            <template #body="{ data }">
              <div class="flex items-center gap-3 min-w-0">
                <RemoteImage
                  :src="data.player.photoUrl"
                  :alt="`${data.player.firstName} ${data.player.lastName}`"
                  placeholder-icon="user"
                  class="h-10 w-10 rounded-lg"
                />
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium text-surface-900 dark:text-surface-0">
                    {{ data.player.firstName }} {{ data.player.lastName }}
                  </div>
                  <div v-if="data.player.birthDate" class="text-xs text-muted-color">
                    {{ new Date(data.player.birthDate).toLocaleDateString() }}
                  </div>
                  <div v-else class="text-xs text-muted-color">—</div>
                </div>
              </div>
            </template>
          </Column>
          <Column field="birthDate" header="Дата рождения" sortable style="min-width: 9rem">
            <template #body="{ data }">
              <span v-if="data.player.birthDate">{{ new Date(data.player.birthDate).toLocaleDateString() }}</span>
              <span v-else class="text-muted-color">—</span>
            </template>
          </Column>
          <Column field="position" header="Амплуа" sortable style="min-width: 8rem">
            <template #body="{ data }">
              <span v-if="data.position">{{ data.position }}</span>
              <span v-else class="text-muted-color">—</span>
            </template>
          </Column>
          <Column field="phone" header="Телефон" sortable style="min-width: 10rem">
            <template #body="{ data }">
              <span v-if="data.player.phone">{{ data.player.phone }}</span>
              <span v-else class="text-muted-color">—</span>
            </template>
          </Column>
          <Column v-if="!isModeratorReadOnly" header="В заявке" style="width: 7rem">
            <template #body="{ data }">
              <div class="flex items-center justify-center">
                <InputSwitch
                  :model-value="data.isActive !== false"
                  :disabled="rosterActiveTogglingId === data.id"
                  :input-id="`active-${data.id}`"
                  @update:model-value="(v: boolean) => setTeamPlayerActive(data, v)"
                />
              </div>
            </template>
          </Column>
          <Column v-if="!isModeratorReadOnly" header="Действия" style="width: 8rem">
            <template #body="{ data }">
              <div class="flex w-full justify-end gap-2">
                <Button icon="pi pi-pencil" text size="small" @click="openEditRosterPlayer(data)" aria-label="Редактировать" />
                <Button icon="pi pi-trash" text severity="danger" size="small" @click="requestDeleteRosterPlayer(data)" aria-label="Удалить" />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
    </Dialog>

    <Dialog
      :visible="rosterEditorOpen"
      @update:visible="(v) => (rosterEditorOpen = v)"
      modal
      :header="rosterEditorMode === 'edit' ? 'Редактировать игрока в команде' : 'Добавить игрока в команду'"
      :style="{ width: '44rem' }"
      :contentStyle="{ paddingTop: '1.75rem' }"
    >
      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div v-if="rosterEditorMode === 'create'">
            <FloatLabel variant="on" class="block">
              <InputText v-model="editorPickQuery" class="w-full" placeholder="Поиск игрока по имени/фамилии" />
              <label>Поиск</label>
            </FloatLabel>
            <Button
              label="Найти"
              icon="pi pi-search"
              text
              class="w-full mt-2"
              @click="fetchPickPlayers"
            />
          </div>

          <div v-if="rosterEditorMode === 'create'" class="md:col-span-2">
            <DataTable
              :value="editorPickPlayers"
              v-model:selection="editorPickSelected"
              dataKey="id"
              selectionMode="multiple"
              :loading="editorPickLoading"
              size="small"
              scrollable
              scrollHeight="280px"
              class="rounded-lg border border-surface-200 dark:border-surface-700"
            >
              <Column selectionMode="multiple" headerStyle="width: 3rem" />
              <Column field="lastName" header="Фамилия" />
              <Column field="firstName" header="Имя" />
              <Column header="Дата рождения">
                <template #body="{ data }">
                  <span v-if="data.birthDate">{{ new Date(data.birthDate).toLocaleDateString() }}</span>
                  <span v-else class="text-muted-color">—</span>
                </template>
              </Column>
              <template #empty>
                <div class="py-6 text-center text-sm text-muted-color">
                  Нет игроков без команды по текущему поиску
                </div>
              </template>
            </DataTable>
          </div>

          <FloatLabel variant="on" class="block" v-if="rosterEditorMode === 'edit'">
            <InputNumber v-model="editorJerseyNumber" class="w-full" placeholder="№" :min="0" />
            <label>Номер игрока</label>
          </FloatLabel>

          <FloatLabel variant="on" class="block" v-if="rosterEditorMode === 'edit'">
            <Select
              v-model="editorPosition"
              :options="positionOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              placeholder="Выберите амплуа"
            />
            <label>Амплуа</label>
          </FloatLabel>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Отмена" text @click="rosterEditorOpen = false" />
          <Button
            :label="rosterEditorMode === 'edit' ? 'Сохранить' : 'Добавить'"
            icon="pi pi-check"
            :loading="rosterEditorSaving"
            @click="saveRosterPlayer"
          />
        </div>
      </template>
    </Dialog>
  </section>
</template>


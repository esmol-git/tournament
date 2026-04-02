<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type {
  TournamentDetails,
  TournamentFormat,
  TournamentListResponse,
  TournamentRow,
  TournamentStatus,
  UserLite,
} from '~/types/admin/tournaments-index'
import type { TeamLite } from '~/types/tournament-admin'
import {
  buildDefaultTournamentForm,
  patchFormFromTournament,
} from '~/composables/admin/useTournamentForm'
import { appendUniqueById, buildTournamentListParams } from '~/composables/admin/useTournamentList'
import { useTournamentReferences } from '~/composables/admin/useTournamentReferences'
import { getApiErrorMessage, getApiErrorMessages } from '~/utils/apiError'
import { MIN_SKELETON_DISPLAY_MS, sleepRemainingAfter } from '~/utils/minimumLoadingDelay'
import { tournamentFormatLabel } from '~/utils/tournamentAdminUi'
import { slugifyFromTitle } from '~/utils/slugify'
import {
  hasSubscriptionFeature,
  maxTournamentsForSubscriptionPlan,
  subscriptionPlanFromAuthUser,
} from '~/utils/subscriptionFeatures'
import AdminTournamentCard from '~/app/components/admin/tournaments/AdminTournamentCard.vue'
import AdminTournamentFormDialog from '~/app/components/admin/tournaments/AdminTournamentFormDialog.vue'
import AdminTournamentListFilters from '~/app/components/admin/tournaments/AdminTournamentListFilters.vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

definePageMeta({ layout: 'admin' })

const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const { token, user, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()

const tenantId = useTenantId()

const subscriptionPlan = computed(() => subscriptionPlanFromAuthUser(user.value))

const tournamentLimitMax = computed(() => maxTournamentsForSubscriptionPlan(subscriptionPlan.value))

/** Совпадает с `RequireSubscriptionPlanFeature` на бэкенде для seasons / age-groups. */
const canAccessReferenceBasic = computed(() =>
  hasSubscriptionFeature(subscriptionPlan.value, 'reference_directory_basic'),
)
/** Сезоны типов соревнований, стадионы, судьи — `reference_directory_standard`. */
const canAccessReferenceStandard = computed(() =>
  hasSubscriptionFeature(subscriptionPlan.value, 'reference_directory_standard'),
)

const canTournamentAutomation = computed(() =>
  hasSubscriptionFeature(subscriptionPlan.value, 'tournament_automation'),
)

const TOURNAMENT_FORMAT_OPTIONS: { value: TournamentFormat; label: string }[] = [
  { value: 'SINGLE_GROUP', label: 'Единая группа (круговой турнир)' },
  { value: 'PLAYOFF', label: 'Сразу плей-офф (олимпийка)' },
  { value: 'GROUPS_PLUS_PLAYOFF', label: 'Группы + плей-офф' },
  { value: 'MANUAL', label: 'Только ручное расписание (без автогенерации)' },
]

const formatOptionsForForm = computed(() => {
  if (canTournamentAutomation.value) return TOURNAMENT_FORMAT_OPTIONS
  const manualOnly = TOURNAMENT_FORMAT_OPTIONS.filter((o) => o.value === 'MANUAL')
  if (isEdit.value) {
    const cur = TOURNAMENT_FORMAT_OPTIONS.find((o) => o.value === form.format)
    if (cur && cur.value !== 'MANUAL') {
      return [cur, ...manualOnly]
    }
  }
  return manualOnly
})

const canCreateAnotherTournament = computed(() => {
  const max = tournamentLimitMax.value
  if (max === null) return true
  return tournamentsTotal.value < max
})

const createTournamentBlockedHint = computed(() =>
  t('admin.settings.subscription.tournament_limit_reached_hint', {
    max: tournamentLimitMax.value ?? 1,
  }),
)

/** true до первого завершённого запроса списка — иначе при F5 один кадр «Пока нет турниров». */
const loading = ref(true)
const tournaments = ref<TournamentRow[]>([])
const tournamentsTotal = ref(0)
const tournamentsPage = ref(0)
const tournamentsPageSize = 5
/** Число карточек в скелетоне = `tournamentsPageSize` (первая страница списка). */
const skeletonTournamentRows = Array.from({ length: tournamentsPageSize }, (_, i) => ({
  id: `__tsk-${i}`,
}))
const loadingMoreTournaments = ref(false)
const tournamentsSearch = ref('')
const loadMoreAnchor = ref<HTMLElement | null>(null)
const hasUserInteractedForInfinite = ref(false)
let searchDebounce: ReturnType<typeof setTimeout> | null = null
let tournamentsObserver: IntersectionObserver | null = null
let detachScrollUnlock: (() => void) | null = null

const showForm = ref(false)
const loadingEdit = ref(false)
const savingForm = ref(false)
const editingId = ref<string | null>(null)
const isEdit = computed(() => !!editingId.value)
const initialTeamIds = ref<string[]>([])
const manualPlayoffEnabled = ref(false)

const logoFileInput = ref<HTMLInputElement | null>(null)
const logoUploading = ref(false)

const triggerLogoPick = () => {
  if (logoUploading.value) return
  logoFileInput.value?.click()
}

const onLogoFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) return
  if (!token.value) {
    toast.add({
      severity: 'warn',
      summary: 'Нужна авторизация',
      detail: 'Войдите снова и повторите загрузку.',
      life: 4000,
    })
    if (target) target.value = ''
    return
  }

  if (!file.type.startsWith('image/')) {
    toast.add({
      severity: 'warn',
      summary: 'Неверный тип файла',
      detail: 'Выберите изображение (JPEG, PNG, WebP и т.д.).',
      life: 4000,
    })
    if (target) target.value = ''
    return
  }

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

  logoUploading.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    const res = await authFetch<{ key: string; url: string }>(apiUrl('/upload?folder=tournaments'), {
      method: 'POST',
      body,
    })
    const imageUrl = res.url
    form.logoUrl = imageUrl

    // Уже существующий турнир — сразу пишем logoUrl в API
  if (editingId.value) {
      try {
        await authFetch(apiUrl(`/tournaments/${editingId.value}`), {
          method: 'PATCH',
          body: { logoUrl: imageUrl },
        })
        await fetchTournaments()
        toast.add({
          severity: 'success',
          summary: 'Логотип загружен и сохранён',
          life: 3000,
        })
      } catch (patchErr: unknown) {
        toast.add({
          severity: 'warn',
          summary: 'Файл загружен, но ссылка не записана в турнир',
          detail: `${getApiErrorMessage(patchErr)} — нажми «Сохранить».`,
          life: 7000,
        })
      }
    } else {
      toast.add({
        severity: 'success',
        summary: 'Логотип загружен',
        detail: 'Нажми «Создать», чтобы сохранить турнир.',
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
    logoUploading.value = false
    if (target) target.value = ''
  }
}

const logoRemoving = ref(false)

const removeTournamentLogo = async (e: MouseEvent) => {
  e.stopPropagation()
  e.preventDefault()
  if (!form.logoUrl || logoUploading.value || logoRemoving.value) return

  form.logoUrl = ''

  if (editingId.value && token.value) {
    logoRemoving.value = true
    try {
      await authFetch(apiUrl(`/tournaments/${editingId.value}`), {
        method: 'PATCH',
        body: { logoUrl: null },
      })
      await fetchTournaments()
      toast.add({
        severity: 'success',
        summary: 'Логотип удалён',
        life: 2500,
      })
    } catch (err: unknown) {
      toast.add({
        severity: 'error',
        summary: 'Не удалось убрать логотип',
        detail: getApiErrorMessage(err),
        life: 6000,
      })
    } finally {
      logoRemoving.value = false
    }
  }
}

const teamsLoading = ref(false)
const teams = ref<TeamLite[]>([])

const statusOptions = [
  { value: 'DRAFT' as const, label: 'Черновик' },
  { value: 'ACTIVE' as const, label: 'Активный' },
  { value: 'COMPLETED' as const, label: 'Завершен' },
  { value: 'ARCHIVED' as const, label: 'Архивный' },
]

const statusTabOptions = [
  { value: 'all' as const, label: 'Все' },
  ...statusOptions,
]

const statusFilter = ref<'all' | TournamentStatus>('all')
/** Пустая строка — все сезоны */
const seasonFilter = ref<string>('')
/** Пустая строка — все типы соревнований */
const competitionFilter = ref<string>('')
const ageGroupFilter = ref<string>('')

const hasMoreTournaments = computed(
  () => tournaments.value.length < tournamentsTotal.value,
)

const tournamentsFiltersActive = computed(
  () =>
    !!tournamentsSearch.value.trim() ||
    statusFilter.value !== 'all' ||
    seasonFilter.value !== '' ||
    competitionFilter.value !== '' ||
    ageGroupFilter.value !== '',
)

/**
 * Нет турниров и не включены фильтры — без шапки (заголовок и «Создать» дублируют пустое состояние).
 * true и во время загрузки, чтобы при «Обновить» на пустом списке шапка не мигала.
 */
const tournamentsListSemanticallyEmpty = computed(
  () =>
    tournamentsTotal.value === 0 &&
    !tournamentsFiltersActive.value &&
    tournaments.value.length === 0,
)

/** То же, что `tournamentsListSemanticallyEmpty` (старое имя — на случай кэша HMR/шаблона). */
const showInitialTournamentsEmpty = tournamentsListSemanticallyEmpty

function statusLabel(s: TournamentStatus): string {
  return statusOptions.find((o) => o.value === s)?.label ?? s
}

function statusBadgeClass(s: TournamentStatus): string {
  switch (s) {
    case 'DRAFT':
      return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100'
    case 'ACTIVE':
      return 'border-primary/35 bg-primary/12 text-primary'
    case 'COMPLETED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
    case 'ARCHIVED':
      return 'border-surface-300 bg-surface-100 text-surface-600 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300'
    default:
      return 'border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-900'
  }
}

const adminsLoading = ref(false)
const users = ref<UserLite[]>([])
const {
  seasonsList,
  seasonsLoading,
  competitionsList,
  competitionsLoading,
  ageGroupsList,
  ageGroupsLoading,
  stadiumsLoading,
  refereesLoading,
  seasonSelectOptions,
  seasonFilterOptions,
  competitionSelectOptions,
  competitionFilterOptions,
  ageGroupSelectOptions,
  ageGroupFilterOptions,
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

const form = reactive(buildDefaultTournamentForm())
const submitAttempted = ref(false)
const tournamentValidationRules = computed(() => ({
  name: { required },
  teamIds: {
    required: (value: unknown) => Array.isArray(value) && value.length > 0,
  },
  logoUrl: {},
  startsAt: {},
  endsAt: {},
  minTeams: {},
  groupCount: {},
}))
const v$ = useVuelidate(tournamentValidationRules, form, { $autoDirty: true })

const tournamentSlugGenerated = computed(() => slugifyFromTitle(form.name, 'tournament'))
const impliedGroupCount = computed<number | null>(() => {
  switch (form.format) {
    case 'SINGLE_GROUP':
      return 1
    case 'PLAYOFF':
      return 0
    case 'MANUAL':
      return null
    default:
      return null // GROUPS_PLUS_PLAYOFF: кол-во групп задаётся полем ниже (1–8)
  }
})

const groupCountMin = computed(() => (impliedGroupCount.value === null ? 1 : impliedGroupCount.value))
const groupCountMax = computed(() => (impliedGroupCount.value === null ? 8 : impliedGroupCount.value))
const minTeamsMinValue = computed(() => (form.format === 'PLAYOFF' ? 4 : 2))
const isPlayoffFormat = computed(() => form.format === 'PLAYOFF')
const isGroupsPlusPlayoffFormat = computed(() => form.format === 'GROUPS_PLUS_PLAYOFF')
const showGroupCountField = computed(() => impliedGroupCount.value === null)
const showPlayoffQualifiersField = computed(() => {
  if (form.format === 'PLAYOFF' || form.format === 'SINGLE_GROUP') return false
  if (form.format === 'MANUAL') return manualPlayoffEnabled.value
  return true
})
const minTeamsGridClass = computed(() => {
  if (showGroupCountField.value && !showPlayoffQualifiersField.value) {
    return 'md:col-start-2 md:row-start-2'
  }
  if (form.format === 'MANUAL') {
    return manualPlayoffEnabled.value
      ? 'md:col-start-2 md:row-start-2'
      : 'md:col-span-2 md:row-start-3'
  }
  if (form.format === 'SINGLE_GROUP' || form.format === 'PLAYOFF') {
    return 'md:col-start-2 md:row-start-1'
  }
  if (form.format === 'GROUPS_PLUS_PLAYOFF') {
    return 'md:col-start-1 md:row-start-2'
  }
  return 'md:col-start-1'
})
const playoffTeamCountOptions = [4, 8, 16, 32, 64, 128, 256, 512]
const maxTournamentTeams = 512
const groupedPlayoffFormats: TournamentFormat[] = [
  'GROUPS_PLUS_PLAYOFF',
  'GROUPS_2',
  'GROUPS_3',
  'GROUPS_4',
]

function isPowerOfTwo(n: number) {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

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

function clearTournamentCalendarColor() {
  form.calendarColor = ''
}

function tournamentCalendarColorTrimmed() {
  return String(form.calendarColor ?? '').trim()
}

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
  },
  { immediate: true },
)

/** Не даём «0» и выход за min/max (бэкенд/API могли отдать 0). */
watch(
  [groupCountMin, groupCountMax],
  () => {
    const min = groupCountMin.value
    const max = groupCountMax.value
    let n = form.groupCount
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
  () => form.teamIds.slice(),
  (ids) => {
    if (ids.length <= form.minTeams) return
    form.teamIds = ids.slice(0, form.minTeams)
    toast.add({
      severity: 'warn',
      summary: 'Лимит команд',
      detail: `Можно выбрать не больше ${form.minTeams} команд.`,
      life: 3500,
    })
  },
)

watch(
  () => form.ageGroupId,
  async () => {
    await fetchTeamsLite()
    const allowedIds = new Set((teams.value ?? []).map((t) => t.id))
    const filtered = form.teamIds.filter((id) => allowedIds.has(id))
    if (filtered.length !== form.teamIds.length) {
      form.teamIds = filtered
      toast.add({
        severity: 'warn',
        summary: 'Состав обновлен',
        detail: 'Команды из другой возрастной группы убраны из турнира.',
        life: 3500,
      })
    }
  },
)

const groupCountHintText = computed(() => {
  const implied = impliedGroupCount.value
  if (implied === null) {
    return 'Укажите число групп (1–8). Для «Группы + плей-офф» обычно 2 и больше. Календарь потребует достаточно команд по группам.'
  }
  if (implied === 0) {
    return 'Для «Сразу плей-офф» группы не используются — это олимпийская сетка.'
  }
  return `Для выбранного формата число групп задано автоматически: ${implied}.`
})

const playoffQualifiersHintText =
  'Сколько сильнейших команд из каждой группы выходят в плей-офф. Удобно, чтобы (число групп × это значение) было 4, 8, 16… — тогда сетка без «пустых» ячеек.'

const formatFieldHintText =
  'Тип турнира: круговая одна группа, группы с выходом в плей-офф, только плей-офф или полностью ручное расписание.'

const minTeamsHintText = computed(() =>
  form.format === 'PLAYOFF'
    ? 'Для олимпийки это точное количество участников сетки. Доступные значения: 4, 8, 16, 32, 64, 128, 256, 512.'
    : form.format === 'GROUPS_PLUS_PLAYOFF'
      ? 'Для формата «Группы + плей-офф» выбирается количество команд, кратное числу групп (минимум по 2 команды на группу).'
    : 'Фиксированное количество команд в турнире. Выбрать можно ровно это число (максимум 512).',
)

const playoffPreview = computed(() => {
  if (!groupedPlayoffFormats.includes(form.format) && form.format !== 'MANUAL') return null
  if (form.format === 'MANUAL' && !manualPlayoffEnabled.value) return null
  const groups = Number(form.groupCount)
  const qualifiersPerGroup = Number(form.playoffQualifiersPerGroup)
  const totalQualifiers = groups * qualifiersPerGroup
  const minTeamsNum = Number(form.minTeams)
  const gridOk =
    Number.isInteger(groups) &&
    groups >= 1 &&
    Number.isInteger(qualifiersPerGroup) &&
    qualifiersPerGroup >= 1 &&
    qualifiersPerGroup <= 8 &&
    isPowerOfTwo(totalQualifiers) &&
    totalQualifiers <= maxTournamentTeams
  const teamsCoverPlayoff =
    Number.isInteger(minTeamsNum) && minTeamsNum >= totalQualifiers

  return {
    groups,
    qualifiersPerGroup,
    totalQualifiers,
    minTeams: minTeamsNum,
    gridOk,
    teamsCoverPlayoff,
    valid: gridOk && teamsCoverPlayoff,
  }
})

const groupedTeamsPreview = computed(() => {
  if (!groupedPlayoffFormats.includes(form.format)) return null
  const groups = Number(form.groupCount)
  const minTeams = Number(form.minTeams)
  if (!Number.isInteger(groups) || groups < 1) return null
  if (!Number.isInteger(minTeams) || minTeams < 2) return null

  const divisible = minTeams % groups === 0
  const perGroup = divisible ? minTeams / groups : null
  const enoughForGroups = minTeams >= groups * 2
  const valid = divisible && enoughForGroups

  return {
    groups,
    minTeams,
    divisible,
    enoughForGroups,
    perGroup,
    valid,
  }
})

const groupedAndPlayoffHint = computed(() => {
  if (!groupedPlayoffFormats.includes(form.format)) return null
  const group = groupedTeamsPreview.value
  const playoff = playoffPreview.value
  if (!group && !playoff) return null

  if (group && playoff) {
    const teamsCoverPlayoff =
      Number.isInteger(group.minTeams) &&
      group.minTeams >= playoff.groups * playoff.qualifiersPerGroup
    return {
      valid: group.valid && playoff.valid && teamsCoverPlayoff,
      text: `Группы: ${group.groups} × ${group.perGroup ?? '—'} команд; плей-офф: ${playoff.totalQualifiers} (${playoff.groups} × ${playoff.qualifiersPerGroup}).`,
    }
  }

  if (group) {
    return {
      valid: group.valid,
      text: group.valid
        ? `Группы: ${group.groups} × ${group.perGroup ?? '—'} команд.`
        : `Для ${group.groups} групп нужно кратное число команд (сейчас ${group.minTeams}) и минимум ${group.groups * 2}.`,
    }
  }

  return {
    valid: playoff?.valid ?? false,
    text: playoff?.valid
      ? `Плей-офф: ${playoff?.totalQualifiers} (${playoff?.groups} × ${playoff?.qualifiersPerGroup}) — валидная сетка.`
      : `Плей-офф: ${playoff?.totalQualifiers} — невалидно, нужно 4/8/16/32/64/128/256/512.`,
  }
})

const manualGroupsHint = computed(() => {
  if (form.format !== 'MANUAL' || manualPlayoffEnabled.value) return ''
  return 'Ручной формат допускает разное количество команд в группах. Ограничения по плей-офф применяются только если включить «Будет плей-офф».'
})

const formatCalendarHint = computed<{ valid: boolean; text: string } | null>(() => {
  if (groupedPlayoffFormats.includes(form.format)) {
    if (!groupedAndPlayoffHint.value) return null
    return groupedAndPlayoffHint.value
  }

  if (form.format === 'MANUAL') {
    if (!manualPlayoffEnabled.value) {
      return { valid: true, text: manualGroupsHint.value }
    }
    if (!playoffPreview.value) return null
    const pv = playoffPreview.value
    const invalidText = !pv.gridOk
      ? `Итого в плей-офф: ${pv.totalQualifiers} — невалидно, нужно 4/8/16/32/64/128/256/512.`
      : t('admin.validation.playoff_qualifiers_exceed_min_teams', {
          groups: pv.groups,
          k: pv.qualifiersPerGroup,
          needed: pv.totalQualifiers,
          minTeams: pv.minTeams,
        })
    return {
      valid: pv.valid,
      text: pv.valid
        ? `Итого в плей-офф: ${pv.totalQualifiers} (${pv.groups} × ${pv.qualifiersPerGroup}) — валидная сетка.`
        : invalidText,
    }
  }

  if (form.format === 'PLAYOFF') {
    const valid = playoffTeamCountOptions.includes(form.minTeams)
    return {
      valid,
      text: valid
        ? `Сетка плей-офф: ${form.minTeams} команд. Допустимые значения: 4, 8, 16, 32, 64, 128, 256, 512.`
        : 'Для олимпийки выберите 4, 8, 16, 32, 64, 128, 256 или 512 команд.',
    }
  }

  if (form.format === 'SINGLE_GROUP') {
    return {
      valid: true,
      text: 'Единая группа: календарь строится круговым турниром без плей-офф.',
    }
  }

  return null
})

type NumericFieldKey = 'groupCount' | 'playoffQualifiersPerGroup' | 'minTeams'
function syncNumericField(key: NumericFieldKey, value: unknown) {
  const n = Number(value)
  if (Number.isFinite(n)) form[key] = n
}

const onStatusFilterChange = (value: string) => {
  statusFilter.value = value === 'all' ? 'all' : (value as TournamentStatus)
}

const fetchTournaments = async (opts: { reset?: boolean } = {}) => {
  if (!token.value) {
    loading.value = false
    loadingMoreTournaments.value = false
    return
  }
  const reset = opts.reset !== false
  const nextPage = reset ? 1 : tournamentsPage.value + 1
  const loadStartedAt = Date.now()
  if (reset) loading.value = true
  else loadingMoreTournaments.value = true
  try {
    const res = await authFetch<TournamentListResponse>(
      apiUrl(`/tenants/${tenantId.value}/tournaments`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
        params: buildTournamentListParams({
          page: nextPage,
          pageSize: tournamentsPageSize,
          statusFilter: statusFilter.value,
          search: tournamentsSearch.value,
          seasonId: seasonFilter.value,
          competitionId: competitionFilter.value,
          ageGroupId: ageGroupFilter.value,
        }),
      },
    )
    const items = res.items ?? []
    tournamentsTotal.value = res.total ?? 0
    tournamentsPage.value = res.page ?? nextPage
    if (reset) {
      tournaments.value = items
      return
    }
    tournaments.value = appendUniqueById(tournaments.value, items)
  } finally {
    if (reset) {
      await sleepRemainingAfter(MIN_SKELETON_DISPLAY_MS, loadStartedAt)
      loading.value = false
    } else {
      loadingMoreTournaments.value = false
    }
  }
}

const onTournamentsSearchInput = (v: string) => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    searchDebounce = null
    tournamentsSearch.value = v
    void fetchTournaments({ reset: true })
  }, 250)
}

const fetchUsersLite = async () => {
  if (!token.value) return
  adminsLoading.value = true
  try {
    const res = await authFetch<{ items: UserLite[]; total: number }>(apiUrl('/users'), {
      params: { page: 1, pageSize: 200 },
      headers: { Authorization: `Bearer ${token.value}` },
    })
    users.value = res.items.filter((u) => !u.blocked)
  } finally {
    adminsLoading.value = false
  }
}

const fetchTeamsLite = async () => {
  if (!token.value) return
  teamsLoading.value = true
  try {
    const res = await authFetch<{ items: TeamLite[]; total: number }>(
      apiUrl(`/tenants/${tenantId.value}/teams`),
      {
      headers: { Authorization: `Bearer ${token.value}` },
      params: {
        ...(form.ageGroupId.trim() ? { ageGroupId: form.ageGroupId.trim() } : {}),
      },
      },
    )
    teams.value = res.items
  } catch {
    teams.value = []
  } finally {
    teamsLoading.value = false
  }
}

const openCreate = async () => {
  if (!canCreateAnotherTournament.value) {
    toast.add({
      severity: 'warn',
      summary: t('admin.settings.subscription.title'),
      detail: createTournamentBlockedHint.value,
      life: 6000,
    })
    return
  }
  submitAttempted.value = false
  editingId.value = null
  initialTeamIds.value = []
  Object.assign(form, buildDefaultTournamentForm())
  manualPlayoffEnabled.value = false
  if (!canTournamentAutomation.value) {
    form.format = 'MANUAL'
    form.groupCount = 1
    if (form.minTeams > 2) form.minTeams = 2
  }
  v$.value.$reset()
  showForm.value = true
  if (!users.value.length) await fetchUsersLite()
  if (!seasonsList.value.length) await fetchSeasonsList()
  if (!competitionsList.value.length) await fetchCompetitionsList()
  if (!ageGroupsList.value.length) await fetchAgeGroupsList()
  await fetchTeamsLite()
  await fetchStadiumsReferees()
}

const openEdit = async (t: TournamentRow) => {
  if (!token.value) return
  submitAttempted.value = false
  editingId.value = t.id
  loadingEdit.value = true
  try {
    const res = await authFetch<TournamentDetails>(apiUrl(`/tournaments/${t.id}`), {
      headers: { Authorization: `Bearer ${token.value}` },
    })

    const mapped = patchFormFromTournament(form, res)
    initialTeamIds.value = mapped.initialTeamIds
    manualPlayoffEnabled.value = mapped.manualPlayoffEnabled

    v$.value.$reset()
    showForm.value = true
    if (!users.value.length) await fetchUsersLite()
    if (!seasonsList.value.length) await fetchSeasonsList()
    if (!competitionsList.value.length) await fetchCompetitionsList()
    if (!ageGroupsList.value.length) await fetchAgeGroupsList()
    await fetchTeamsLite()
    await fetchStadiumsReferees()
  } finally {
    loadingEdit.value = false
  }
}

const toDateString = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined)

const syncTournamentTeams = async (tournamentId: string) => {
  if (!token.value) return
  const next = new Set(form.teamIds)
  const prev = new Set(initialTeamIds.value)
  const toAdd = [...next].filter((id): id is string => typeof id === 'string' && !prev.has(id))
  const toRemove = [...prev].filter((id): id is string => typeof id === 'string' && !next.has(id))

  for (const teamId of toAdd) {
    if (teamId.startsWith('team-')) continue
    await authFetch(apiUrl(`/tournaments/${tournamentId}/teams/${teamId}`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
    })
  }
  for (const teamId of toRemove) {
    if (teamId.startsWith('team-')) continue
    await authFetch(apiUrl(`/tournaments/${tournamentId}/teams/${teamId}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
  }

  initialTeamIds.value = [...form.teamIds]
}

const tournamentFormErrors = computed(() => {
  const name = form.name.trim()
  const logoUrl = form.logoUrl.trim()

  const nameError = name ? '' : t('admin.validation.required_name')
  const logoUrlError =
    logoUrl && !isHttpUrl(logoUrl)
      ? t('admin.validation.invalid_url')
      : ''
  const teamsError =
    !form.teamIds.length
      ? 'Добавьте хотя бы одну команду для создания турнира.'
      : form.teamIds.length !== form.minTeams
        ? `Нужно выбрать ровно ${form.minTeams} команд. Сейчас выбрано: ${form.teamIds.length}.`
        : ''
  const datesError =
    form.startsAt && form.endsAt && form.startsAt > form.endsAt
      ? t('admin.validation.end_after_start')
      : ''

  let formatError = ''
  if (form.minTeams > maxTournamentTeams) {
    formatError = `Максимум команд в одном турнире: ${maxTournamentTeams}.`
  } else if (form.format === 'PLAYOFF' && (form.minTeams < 4 || !isPowerOfTwo(form.minTeams))) {
    formatError = 'Для олимпийки укажите 4, 8, 16, 32, 64, 128, 256 или 512.'
  } else if (form.format === 'PLAYOFF' && !playoffTeamCountOptions.includes(form.minTeams)) {
    formatError = 'Для олимпийки доступны только: 4, 8, 16, 32, 64, 128, 256, 512.'
  } else if (
    groupedPlayoffFormats.includes(form.format) &&
    (!Number.isInteger(form.groupCount) ||
      form.groupCount < 1 ||
      form.minTeams < form.groupCount * 2 ||
      form.minTeams % form.groupCount !== 0)
  ) {
    formatError = `Для ${form.groupCount} групп количество команд должно быть кратно числу групп и не меньше ${form.groupCount * 2}.`
  } else if (
    (groupedPlayoffFormats.includes(form.format) ||
      (form.format === 'MANUAL' && manualPlayoffEnabled.value)) &&
    Number.isInteger(form.groupCount) &&
    form.groupCount >= 1 &&
    Number.isInteger(form.playoffQualifiersPerGroup) &&
    form.playoffQualifiersPerGroup >= 1 &&
    Number.isInteger(form.minTeams) &&
    form.minTeams < form.groupCount * form.playoffQualifiersPerGroup
  ) {
    const needed = form.groupCount * form.playoffQualifiersPerGroup
    formatError = t('admin.validation.playoff_qualifiers_exceed_min_teams', {
      groups: form.groupCount,
      k: form.playoffQualifiersPerGroup,
      needed,
      minTeams: form.minTeams,
    })
  } else if (
    groupedPlayoffFormats.includes(form.format) &&
    (!Number.isInteger(form.playoffQualifiersPerGroup) ||
      form.playoffQualifiersPerGroup < 1 ||
      form.playoffQualifiersPerGroup > 8 ||
      !isPowerOfTwo(form.groupCount * form.playoffQualifiersPerGroup))
  ) {
    const total = form.groupCount * form.playoffQualifiersPerGroup
    formatError = `Сетка плей-офф невалидна: ${form.groupCount} × ${form.playoffQualifiersPerGroup} = ${total}. Нужно 4, 8, 16, 32, 64, 128, 256 или 512.`
  } else if (
    form.format === 'MANUAL' &&
    manualPlayoffEnabled.value &&
    (!Number.isInteger(form.playoffQualifiersPerGroup) ||
      form.playoffQualifiersPerGroup < 1 ||
      form.playoffQualifiersPerGroup > 8 ||
      !isPowerOfTwo(form.groupCount * form.playoffQualifiersPerGroup))
  ) {
    const total = form.groupCount * form.playoffQualifiersPerGroup
    formatError = `Для ручного турнира с плей-офф сетка невалидна: ${form.groupCount} × ${form.playoffQualifiersPerGroup} = ${total}. Нужно 4, 8, 16, 32, 64, 128, 256 или 512.`
  }

  const firstError = nameError || logoUrlError || teamsError || datesError || formatError
  return { nameError, logoUrlError, teamsError, datesError, formatError, firstError }
})

const canSaveTournament = computed(
  () =>
    !!token.value &&
    !loadingEdit.value &&
    !savingForm.value &&
    !v$.value.$invalid &&
    !tournamentFormErrors.value.firstError,
)
const showNameError = computed(
  () => (submitAttempted.value || v$.value.name.$dirty) && !!tournamentFormErrors.value.nameError,
)
const showTeamsError = computed(
  () => (submitAttempted.value || v$.value.teamIds.$dirty) && !!tournamentFormErrors.value.teamsError,
)
const saveTournament = async () => {
  if (!token.value) return
  submitAttempted.value = true
  v$.value.$touch()
  const name = form.name.trim()
  const logoUrl = form.logoUrl.trim()
  if (!canSaveTournament.value) {
    return
  }
  savingForm.value = true
  try {
    const playoffQualifiersForBody =
      form.format === 'MANUAL' && !manualPlayoffEnabled.value
        ? undefined
        : form.playoffQualifiersPerGroup

    const body: Record<string, unknown> = {
      name,
      slug: tournamentSlugGenerated.value,
      description: form.description || undefined,
      logoUrl: logoUrl || undefined,
      format: form.format,
      groupCount: form.format === 'PLAYOFF' ? 0 : form.groupCount,
      playoffQualifiersPerGroup: playoffQualifiersForBody,
      startsAt: toDateString(form.startsAt),
      endsAt: toDateString(form.endsAt),
      intervalDays: form.intervalDays,
      allowedDays: form.allowedDays,
      minTeams: form.minTeams,
      pointsWin: form.pointsWin,
      pointsDraw: form.pointsDraw,
      pointsLoss: form.pointsLoss,
      admins: form.adminIds.map((id) => ({ userId: id })),
    }

    const calendarColorNormalized = String(form.calendarColor ?? '')
      .trim()
      .toLowerCase()
    if (/^#[0-9a-f]{6}$/.test(calendarColorNormalized)) {
      body.calendarColor = calendarColorNormalized
    } else if (isEdit.value) {
      body.calendarColor = null
    }

    if (canAccessReferenceBasic.value) {
      body.seasonId = form.seasonId.trim() ? form.seasonId.trim() : null
      body.ageGroupId = form.ageGroupId.trim() ? form.ageGroupId.trim() : null
    } else if (!isEdit.value) {
      body.seasonId = null
      body.ageGroupId = null
    }

    if (canAccessReferenceStandard.value) {
      body.stadiumId = form.stadiumId.trim() ? form.stadiumId : null
      body.competitionId = form.competitionId.trim() ? form.competitionId.trim() : null
      body.refereeIds = form.refereeIds
    } else if (!isEdit.value) {
      body.stadiumId = null
      body.competitionId = null
      body.refereeIds = [] as string[]
    }

    let id: string
    if (isEdit.value) {
      await authFetch(apiUrl(`/tournaments/${editingId.value}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
      id = editingId.value!
    } else {
      const created = await authFetch<{ id: string }>(apiUrl(`/tenants/${tenantId.value}/tournaments`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
      id = created.id
      editingId.value = created.id
    }

    await syncTournamentTeams(id)
    showForm.value = false
    await fetchTournaments()
  } catch (e: unknown) {
    const messages = getApiErrorMessages(e, 'Не удалось создать турнир')
    for (const msg of messages) {
      toast.add({
        severity: 'error',
        summary: 'Ошибка создания турнира',
        detail: msg,
        life: 6500,
      })
    }
  } finally {
    savingForm.value = false
  }
}

const deleteDialogVisible = ref(false)
const deleteTarget = ref<TournamentRow | null>(null)
const deleteSaving = ref(false)
const listPublishSavingId = ref<string | null>(null)

const openDeleteDialog = (t: TournamentRow) => {
  deleteTarget.value = t
  deleteDialogVisible.value = true
}

const confirmDeleteTournament = async () => {
  if (!token.value || !deleteTarget.value) return
  const t = deleteTarget.value
  deleteSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${t.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    deleteDialogVisible.value = false
    deleteTarget.value = null
    await fetchTournaments()
    toast.add({ severity: 'success', summary: 'Турнир удалён', life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось удалить турнир',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    deleteSaving.value = false
  }
}

const moveTournamentToArchive = async () => {
  if (!token.value || !deleteTarget.value) return
  const t = deleteTarget.value
  if (t.status === 'ARCHIVED') {
    toast.add({ severity: 'info', summary: 'Турнир уже в архиве', life: 2500 })
    return
  }
  deleteSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${t.id}`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { status: 'ARCHIVED' },
    })
    deleteDialogVisible.value = false
    deleteTarget.value = null
    await fetchTournaments()
    toast.add({ severity: 'success', summary: 'Турнир отправлен в архив', life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось отправить турнир в архив',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    deleteSaving.value = false
  }
}

const goToTournament = (t: TournamentRow) => {
  router.push(`/admin/tournaments/${t.id}`)
}

const openTournamentNews = (t: TournamentRow) => {
  router.push({ path: '/admin/news', query: { tournament: t.id } })
}

const openTournamentGallery = (t: TournamentRow) => {
  router.push({ path: '/admin/gallery', query: { tournament: t.id } })
}

async function toggleTournamentListPublished(t: TournamentRow) {
  if (!token.value || listPublishSavingId.value) return
  const next = !t.published
  if (next && t.status === 'DRAFT') {
    toast.add({
      severity: 'warn',
      summary: t('admin.tournament_page.published_toggle_label'),
      detail: t('admin.tournament_page.published_draft_blocked_hint'),
      life: 6000,
    })
    return
  }
  listPublishSavingId.value = t.id
  try {
    await authFetch(apiUrl(`/tournaments/${t.id}`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { published: next },
    })
    const row = tournaments.value.find((x) => x.id === t.id)
    if (row) row.published = next
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.published_save_error'),
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    listPublishSavingId.value = null
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
  void fetchTournaments({ reset: true })
  void fetchSeasonsList()
  void fetchCompetitionsList()
  void fetchAgeGroupsList()

  if (typeof window !== 'undefined') {
    const unlockAndMaybeLoad = () => {
      hasUserInteractedForInfinite.value = true
      if (
        !loading.value &&
        !loadingMoreTournaments.value &&
        hasMoreTournaments.value &&
        loadMoreAnchor.value
      ) {
        const rect = loadMoreAnchor.value.getBoundingClientRect()
        if (rect.top <= window.innerHeight + 200) {
          void fetchTournaments({ reset: false })
        }
      }
    }
    const unlockOnKeydown = (e: KeyboardEvent) => {
      if (
        e.key === 'ArrowDown' ||
        e.key === 'PageDown' ||
        e.key === 'End' ||
        e.key === ' '
      ) {
        unlockAndMaybeLoad()
      }
    }
    window.addEventListener('wheel', unlockAndMaybeLoad, { passive: true })
    window.addEventListener('touchmove', unlockAndMaybeLoad, { passive: true })
    window.addEventListener('keydown', unlockOnKeydown)
    detachScrollUnlock = () => {
      window.removeEventListener('wheel', unlockAndMaybeLoad)
      window.removeEventListener('touchmove', unlockAndMaybeLoad)
      window.removeEventListener('keydown', unlockOnKeydown)
    }

    tournamentsObserver?.disconnect()
    tournamentsObserver = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (!first?.isIntersecting) return
        if (!hasUserInteractedForInfinite.value) return
        if (loading.value || loadingMoreTournaments.value || !hasMoreTournaments.value) return
        void fetchTournaments({ reset: false })
      },
      { root: null, rootMargin: '120px 0px 200px 0px', threshold: 0 },
    )
    if (loadMoreAnchor.value) tournamentsObserver.observe(loadMoreAnchor.value)
  }
})

onBeforeUnmount(() => {
  if (searchDebounce) clearTimeout(searchDebounce)
  tournamentsObserver?.disconnect()
  tournamentsObserver = null
  detachScrollUnlock?.()
  detachScrollUnlock = null
})

watch(loadMoreAnchor, (el) => {
  if (!tournamentsObserver) return
  tournamentsObserver.disconnect()
  if (el) tournamentsObserver.observe(el)
})

watch(statusFilter, () => {
  void fetchTournaments({ reset: true })
})

watch(seasonFilter, () => {
  void fetchTournaments({ reset: true })
})

watch(competitionFilter, () => {
  void fetchTournaments({ reset: true })
})

watch(ageGroupFilter, () => {
  void fetchTournaments({ reset: true })
})
</script>

<template>
  <section class="p-6 space-y-4">
    <header
      v-if="!tournamentsListSemanticallyEmpty"
      class="flex items-center justify-between gap-4"
    >
      <div>
        <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-0">
          {{ t('admin.tournaments_list.title') }}
        </h1>
        <p class="mt-1 text-sm text-muted-color">
          {{ t('admin.tournaments_list.subtitle') }}
        </p>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2 shrink-0">
        <Button
          :label="t('admin.tournaments_list.refresh')"
          icon="pi pi-refresh"
          text
          severity="secondary"
          :loading="loading"
          @click="fetchTournaments({ reset: true })"
        />
        <Button
          :label="t('admin.tournaments_list.create')"
          icon="pi pi-plus"
          :disabled="!canCreateAnotherTournament"
          v-tooltip.top="canCreateAnotherTournament ? undefined : createTournamentBlockedHint"
          @click="openCreate"
        />
      </div>
    </header>

    <div v-if="loading" class="space-y-3 min-h-[28rem]" aria-busy="true">
      <div
        v-for="row in skeletonTournamentRows"
        :key="row.id"
        class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-5 min-w-0 flex-1">
            <Skeleton width="10rem" height="10rem" class="rounded-xl shrink-0" />
            <div class="min-w-0 flex-1 space-y-3">
              <Skeleton width="65%" height="1.125rem" class="rounded-md" />
              <Skeleton width="8rem" height="0.75rem" class="rounded-md" />
              <Skeleton width="85%" height="0.875rem" class="rounded-md" />
              <Skeleton width="75%" height="0.875rem" class="rounded-md" />
              <Skeleton width="55%" height="0.875rem" class="rounded-md" />
            </div>
          </div>
          <div class="flex flex-col gap-2 shrink-0 items-end">
            <Skeleton shape="circle" width="2rem" height="2rem" />
            <Skeleton shape="circle" width="2rem" height="2rem" />
            <Skeleton shape="circle" width="2rem" height="2rem" />
          </div>
        </div>
      </div>
    </div>
    <div v-else class="space-y-3">
      <AdminTournamentListFilters
        v-if="
          tournamentsTotal ||
          tournamentsSearch ||
          statusFilter !== 'all' ||
          seasonFilter !== '' ||
          competitionFilter !== '' ||
          ageGroupFilter !== ''
        "
        :tournamentsTotal="tournamentsTotal"
        :tournamentsLoaded="tournaments.length"
        :tournamentsSearch="tournamentsSearch"
        :statusFilter="statusFilter"
        :statusTabOptions="statusTabOptions"
        :seasonFilter="seasonFilter"
        :seasonFilterOptions="seasonFilterOptions"
        :seasonsLoading="seasonsLoading"
        :competitionFilter="competitionFilter"
        :competitionFilterOptions="competitionFilterOptions"
        :competitionsLoading="competitionsLoading"
        :ageGroupFilter="ageGroupFilter"
        :ageGroupFilterOptions="ageGroupFilterOptions"
        :ageGroupsLoading="ageGroupsLoading"
        @update:statusFilter="onStatusFilterChange"
        @update:seasonFilter="(v) => (seasonFilter = v)"
        @update:competitionFilter="(v) => (competitionFilter = v)"
        @update:ageGroupFilter="(v) => (ageGroupFilter = v)"
        @searchInput="onTournamentsSearchInput"
      />

      <AdminTournamentCard
        v-for="t in tournaments"
        :key="t.id"
        :tournament="t"
        :formatLabel="tournamentFormatLabel(t.format)"
        :statusLabel="statusLabel(t.status)"
        :statusClass="statusBadgeClass(t.status)"
        :publishSavingTournamentId="listPublishSavingId"
        @open="goToTournament"
        @edit="openEdit"
        @delete="openDeleteDialog"
        @news="openTournamentNews"
        @gallery="openTournamentGallery"
        @togglePublished="toggleTournamentListPublished"
      />

      <div
        v-if="!tournaments.length && (tournamentsTotal > 0 || tournamentsFiltersActive)"
        class="rounded-xl border border-dashed border-surface-300 bg-surface-50/80 px-6 py-12 text-center dark:border-surface-600 dark:bg-surface-900/40"
        role="status"
      >
        <p class="text-sm text-muted-color">
          {{ t('admin.tournaments_list.filtered_empty') }}
        </p>
      </div>

      <div
        v-else-if="tournamentsListSemanticallyEmpty"
        class="relative flex min-h-[22rem] flex-col items-center justify-center rounded-2xl border border-surface-200 bg-surface-0 px-6 py-14 text-center shadow-sm dark:border-surface-700 dark:bg-surface-900"
        role="region"
        :aria-label="t('admin.tournaments_list.empty_title')"
      >
        <Button
          type="button"
          class="!absolute end-4 top-4"
          :label="t('admin.tournaments_list.refresh')"
          icon="pi pi-refresh"
          text
          severity="secondary"
          :loading="loading"
          @click="fetchTournaments({ reset: true })"
        />
        <div
          class="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary/15"
          aria-hidden="true"
        >
          <i class="pi pi-trophy text-3xl" />
        </div>
        <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-0">
          {{ t('admin.tournaments_list.empty_title') }}
        </h2>
        <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-color">
          {{ t('admin.tournaments_list.empty_lead') }}
        </p>
        <Button
          class="mt-6"
          :label="t('admin.tournaments_list.empty_cta')"
          icon="pi pi-plus"
          :disabled="!canCreateAnotherTournament"
          v-tooltip.top="canCreateAnotherTournament ? undefined : createTournamentBlockedHint"
          @click="openCreate"
        />
      </div>

      <div v-if="loadingMoreTournaments" class="text-sm text-muted-color">
        {{ t('admin.tournaments_list.loading_more') }}
      </div>
      <div
        v-if="hasMoreTournaments"
        ref="loadMoreAnchor"
        class="h-6 w-full"
        aria-hidden="true"
      />
    </div>

    <AdminTournamentFormDialog
      :visible="showForm"
      @update:visible="(v) => (showForm = v)"
      :isEdit="isEdit"
      :saving="savingForm || loadingEdit"
      :submitAttempted="submitAttempted"
      :canSave="canSaveTournament"
      @cancel="showForm = false"
      @save="saveTournament"
    >
      <div class="flex flex-col gap-4">
        <!-- Основное -->
        <section
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">Основное</h3>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <!-- Left: превью логотипа -->
        <div class="md:col-span-1 space-y-3">
          <div
            class="relative overflow-hidden rounded-xl border border-surface-200 bg-surface-100 dark:border-surface-600 dark:bg-surface-800"
          >
            <button
              type="button"
              class="relative block aspect-[4/3] w-full"
              :class="logoUploading || logoRemoving ? 'cursor-wait opacity-80' : 'cursor-pointer'"
              :disabled="logoUploading || logoRemoving"
              @click="triggerLogoPick"
              aria-label="Загрузить или заменить картинку турнира"
            >
              <img
                v-if="form.logoUrl && !logoUploading && !logoRemoving"
                :src="form.logoUrl"
                alt="Логотип"
                class="absolute inset-0 h-full w-full object-cover"
              />
              <div
                v-else-if="!logoUploading && !logoRemoving"
                class="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-muted-color"
              >
                <i class="pi pi-image text-3xl opacity-60" aria-hidden="true" />
                <span class="text-xs">Нажми, чтобы загрузить логотип</span>
              </div>
              <div
                v-if="logoUploading || logoRemoving"
                class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-0/90 text-sm text-surface-700 dark:bg-surface-900/90 dark:text-surface-200"
              >
                <i class="pi pi-spin pi-spinner text-2xl" aria-hidden="true" />
                <span>{{ logoRemoving ? 'Удаление…' : 'Загрузка…' }}</span>
              </div>
            </button>
          </div>

          <div v-if="form.logoUrl && !logoUploading && !logoRemoving" class="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              icon="pi pi-trash"
              label="Убрать"
              text
              severity="danger"
              @click="removeTournamentLogo"
            />
          </div>

          <input
            ref="logoFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onLogoFileChange"
          />
        </div>

        <!-- Right: title + dates -->
        <div class="space-y-4 md:col-span-1">
          <div class="space-y-0.5">
            <FloatLabel variant="on" class="block">
              <InputText id="t_name" v-model="form.name" class="w-full" :invalid="showNameError" />
              <label for="t_name">Название</label>
            </FloatLabel>
            <p v-if="showNameError" class="text-[11px] leading-3 text-red-500">
              {{ tournamentFormErrors.nameError }}
            </p>
          </div>

          <FloatLabel variant="on" class="block">
            <InputText
              id="t_slug"
              :model-value="tournamentSlugGenerated"
              readonly
              tabindex="-1"
              class="w-full cursor-default bg-surface-50 font-mono text-sm dark:bg-surface-900"
            />
            <label for="t_slug">Slug в URL (формируется автоматически)</label>
          </FloatLabel>

          <FloatLabel variant="on" class="block">
            <DatePicker
              inputId="t_startsAt"
              v-model="form.startsAt"
              class="w-full"
              dateFormat="yy-mm-dd"
              showIcon
            />
            <label for="t_startsAt">Начало</label>
          </FloatLabel>

          <FloatLabel variant="on" class="block">
            <DatePicker
              inputId="t_endsAt"
              v-model="form.endsAt"
              class="w-full"
              dateFormat="yy-mm-dd"
              showIcon
            />
            <label for="t_endsAt">Окончание</label>
          </FloatLabel>
        </div>
          </div>
        </section>

        <!-- Описание -->
        <section
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">Описание</h3>
          <div>
            <label for="t_desc" class="mb-1 block text-sm">Текст для участников</label>
            <AdminMarkdownEditor input-id="t_desc" v-model="form.description" :rows="3" />
          </div>
        </section>

        <!-- Формат и календарь -->
        <section
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
            Формат и календарь
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
                  tournamentCalendarColorTrimmed().toLowerCase() === c
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
                v-if="tournamentCalendarColorTrimmed()"
                type="button"
                :label="t('admin.tournament_form.calendar_color_reset')"
                text
                severity="secondary"
                size="small"
                @click="clearTournamentCalendarColor"
              />
            </div>
            <p class="text-[11px] leading-relaxed text-muted-color">
              {{ t('admin.tournament_form.calendar_color_hint') }}
            </p>
          </div>
          <Message
            v-if="!canTournamentAutomation"
            severity="info"
            :closable="false"
            class="mb-4 w-full text-sm"
          >
            {{ t('admin.tournament_form.manual_only_tariff') }}
          </Message>
          <Message
            v-if="isEdit && !canTournamentAutomation && form.format !== 'MANUAL'"
            severity="warn"
            :closable="false"
            class="mb-4 w-full text-sm"
          >
            {{ t('admin.tournament_form.legacy_format_need_manual_or_plan') }}
          </Message>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FloatLabel variant="on" class="block">
              <Select
                inputId="t_format"
                v-model="form.format"
                :options="formatOptionsForForm"
                option-label="label"
                option-value="value"
                class="w-full"
              />
              <label for="t_format" class="has-tooltip flex items-center gap-1.5">
                <span>Формат</span>
                <button
                  type="button"
                  class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                  aria-label="Подсказка: формат турнира"
                  v-tooltip.top="formatFieldHintText"
                  @click.prevent
                >
                  <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                </button>
              </label>
            </FloatLabel>

            <div
              v-if="form.format === 'MANUAL'"
              class="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800/60 md:col-start-2 md:row-start-1"
            >
              <label for="manual_playoff_enabled" class="inline-flex items-center gap-2 cursor-pointer">
                <Checkbox
                  inputId="manual_playoff_enabled"
                  v-model="manualPlayoffEnabled"
                  binary
                />
                <span>Будет плей-офф</span>
              </label>
            </div>

            <div
              v-if="showGroupCountField"
              :class="form.format === 'MANUAL' ? 'md:col-start-1 md:row-start-2' : ''"
            >
              <FloatLabel variant="on" class="block">
                <InputNumber
                  inputId="t_groupCount"
                  v-model="form.groupCount"
                  class="w-full"
                  :min="groupCountMin"
                  :max="groupCountMax"
                  :readonly="impliedGroupCount !== null"
                  @input="(e) => syncNumericField('groupCount', e?.value)"
                />
                <label for="t_groupCount" class="has-tooltip flex items-center gap-1.5">
                  <span>Кол-во групп</span>
                  <button
                    type="button"
                    class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                    aria-label="Подсказка: количество групп"
                    v-tooltip.top="groupCountHintText"
                    @click.prevent
                  >
                    <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                  </button>
                </label>
              </FloatLabel>
            </div>

            <div :class="minTeamsGridClass">
              <FloatLabel v-if="isPlayoffFormat" variant="on" class="block">
                <Select
                  inputId="t_minTeams"
                  v-model="form.minTeams"
                  :options="playoffTeamCountOptions"
                  class="w-full"
                />
                <label for="t_minTeams" class="has-tooltip flex items-center gap-1.5">
                  <span>Количество команд</span>
                  <button
                    type="button"
                    class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                    aria-label="Подсказка: количество команд"
                    v-tooltip.top="minTeamsHintText"
                    @click.prevent
                  >
                    <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                  </button>
                </label>
              </FloatLabel>

              <FloatLabel v-else-if="isGroupsPlusPlayoffFormat" variant="on" class="block">
                <InputNumber
                  inputId="t_minTeams"
                  v-model="form.minTeams"
                  class="w-full"
                  :min="2"
                  @input="(e) => syncNumericField('minTeams', e?.value)"
                />
                <label for="t_minTeams" class="has-tooltip flex items-center gap-1.5">
                  <span>Количество команд</span>
                  <button
                    type="button"
                    class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                    aria-label="Подсказка: количество команд"
                    v-tooltip.top="minTeamsHintText"
                    @click.prevent
                  >
                    <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                  </button>
                </label>
              </FloatLabel>

              <FloatLabel v-else variant="on" class="block">
                <InputNumber
                  inputId="t_minTeams"
                  v-model="form.minTeams"
                  class="w-full"
                  :min="minTeamsMinValue"
                  @input="(e) => syncNumericField('minTeams', e?.value)"
                />
                <label for="t_minTeams" class="has-tooltip flex items-center gap-1.5">
                  <span>Количество команд</span>
                  <button
                    type="button"
                    class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                    aria-label="Подсказка: минимум команд"
                    v-tooltip.top="minTeamsHintText"
                    @click.prevent
                  >
                    <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                  </button>
                </label>
              </FloatLabel>
            </div>

            <div
              v-if="showPlayoffQualifiersField"
              :class="form.format === 'MANUAL' ? 'md:col-start-1 md:row-start-3' : 'md:col-start-2 md:row-start-2'"
            >
              <FloatLabel variant="on" class="block">
                <InputNumber
                  inputId="t_playoffQualifiersPerGroup"
                  v-model="form.playoffQualifiersPerGroup"
                  class="w-full"
                  :min="1"
                  :max="8"
                  @input="(e) => syncNumericField('playoffQualifiersPerGroup', e?.value)"
                />
                <label for="t_playoffQualifiersPerGroup" class="has-tooltip flex items-center gap-1.5">
                  <span>Команд выходит из группы</span>
                  <button
                    type="button"
                    class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                    aria-label="Подсказка: выход в плей-офф"
                    v-tooltip.top="playoffQualifiersHintText"
                    @click.prevent
                  >
                    <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                  </button>
                </label>
              </FloatLabel>
            </div>

            <div
              v-if="formatCalendarHint"
              class="rounded-lg border px-3 py-2 text-xs md:col-span-2"
              :class="
                formatCalendarHint.valid
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              "
            >
              {{ formatCalendarHint.text }}
            </div>
          </div>
        </section>

        <!-- Площадка и судьи -->
        <section
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
            Площадка и судьи
          </h3>
          <p class="mb-3 text-xs text-muted-color">
            Заполните справочники «Стадионы» и «Судьи», затем выберите площадку и судей. Сезон, тип
            соревнования и возрастная группа («Сезоны», «Соревнования», «Возрастные группы») задают
            контекст турнира для фильтров и публичного каталога.
          </p>
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
                inputId="t_seasonId"
                v-model="form.seasonId"
                :options="seasonSelectOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                :loading="seasonsLoading"
                :disabled="!canAccessReferenceBasic"
              />
              <label for="t_seasonId">Сезон</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block min-w-0">
              <Select
                inputId="t_competitionId"
                v-model="form.competitionId"
                :options="competitionSelectOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                :loading="competitionsLoading"
                :disabled="!canAccessReferenceStandard"
              />
              <label for="t_competitionId">Тип соревнования</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block min-w-0">
              <Select
                inputId="t_ageGroupId"
                v-model="form.ageGroupId"
                :options="ageGroupSelectOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                :loading="ageGroupsLoading"
                :disabled="!canAccessReferenceBasic"
              />
              <label for="t_ageGroupId">Возрастная группа</label>
            </FloatLabel>
          </div>
          <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <FloatLabel variant="on" class="block min-w-0">
              <Select
                inputId="t_stadiumId"
                v-model="form.stadiumId"
                :options="stadiumSelectOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                :loading="stadiumsLoading"
                :disabled="!canAccessReferenceStandard"
              />
              <label for="t_stadiumId">Стадион</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block min-w-0">
              <MultiSelect
                inputId="t_refereeIds"
                v-model="form.refereeIds"
                :options="refereeMultiOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                :loading="refereesLoading"
                placeholder="Выбрать судей"
                filter
                :maxSelectedLabels="0"
                selectedItemsLabel="Выбрано: {0}"
                :disabled="!canAccessReferenceStandard"
              />
              <label for="t_refereeIds">Судьи турнира</label>
            </FloatLabel>
          </div>
        </section>

        <!-- Участники и доступ -->
        <section
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
            Участники и доступ
          </h3>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FloatLabel variant="on" class="block min-w-0">
              <MultiSelect
                inputId="t_adminIds"
                v-model="form.adminIds"
                :loading="adminsLoading"
                :options="users"
                option-label="email"
                option-value="id"
                class="w-full"
                placeholder="Выбрать пользователей"
                filter
                :maxSelectedLabels="0"
                selectedItemsLabel="Выбрано: {0}"
              />
              <label for="t_adminIds">Админы турнира</label>
            </FloatLabel>

            <FloatLabel variant="on" class="block min-w-0">
              <MultiSelect
                inputId="t_teamIds"
                v-model="form.teamIds"
                :loading="teamsLoading"
                :options="teams"
                option-label="name"
                option-value="id"
                class="w-full"
                placeholder="Выбрать команды"
                :emptyMessage="form.ageGroupId ? 'Нет команд в выбранной возрастной группе' : 'Нет доступных команд'"
                filter
                :maxSelectedLabels="0"
                selectedItemsLabel="Выбрано: {0}"
                :invalid="showTeamsError"
              />
              <label for="t_teamIds">Команды</label>
            </FloatLabel>
            <p v-if="showTeamsError" class="mt-0 text-[11px] leading-4 text-red-500">
              {{ tournamentFormErrors.teamsError }}
            </p>
          </div>
        </section>

        <!-- Очки -->
        <section
          v-if="!isPlayoffFormat"
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
            Турнирная таблица (очки)
          </h3>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FloatLabel variant="on" class="w-full flex flex-col">
              <InputNumber
                inputId="t_pointsWin"
                v-model="form.pointsWin"
                class="w-full !flex"
                :min="0"
                inputClass="w-full"
              />
              <label for="t_pointsWin">Очки за победу</label>
            </FloatLabel>

            <FloatLabel variant="on" class="w-full flex flex-col">
              <InputNumber
                inputId="t_pointsDraw"
                v-model="form.pointsDraw"
                class="w-full !flex"
                :min="0"
                inputClass="w-full"
              />
              <label for="t_pointsDraw">Очки за ничью</label>
            </FloatLabel>

            <FloatLabel variant="on" class="w-full flex flex-col">
              <InputNumber
                inputId="t_pointsLoss"
                v-model="form.pointsLoss"
                class="w-full !flex"
                :min="0"
                inputClass="w-full"
              />
              <label for="t_pointsLoss">Очки за поражение</label>
            </FloatLabel>
          </div>
        </section>
      </div>

    </AdminTournamentFormDialog>

    <Dialog
      :visible="deleteDialogVisible"
      @update:visible="(v) => (deleteDialogVisible = v)"
      modal
      header="Удалить турнир?"
      :style="{ width: '24rem' }"
      :closable="!deleteSaving"
      @hide="deleteTarget = null"
    >
      <p v-if="deleteTarget" class="text-sm text-surface-700 dark:text-surface-200">
        Турнир
        <span class="font-semibold text-surface-900 dark:text-surface-0">«{{ deleteTarget.name }}»</span>
        и все связанные данные будут безвозвратно утеряны.
      </p>
      <p class="mt-2 text-sm text-surface-600 dark:text-surface-300">
        Рекомендуем вместо удаления перенести турнир в архив.
      </p>
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <Button label="Отмена" text :disabled="deleteSaving" @click="deleteDialogVisible = false" />
          <Button
            label="В архив"
            icon="pi pi-box"
            severity="secondary"
            :disabled="deleteSaving || deleteTarget?.status === 'ARCHIVED'"
            :loading="deleteSaving"
            @click="moveTournamentToArchive"
          />
          <Button
            label="Удалить"
            icon="pi pi-trash"
            severity="danger"
            :loading="deleteSaving"
            @click="confirmDeleteTournament"
          />
        </div>
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
:deep(.p-floatlabel label.has-tooltip) {
  pointer-events: auto;
}
</style>


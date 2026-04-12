<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useMatchProtocolReferences } from '~/composables/useMatchProtocolReferences'
import { useTenantId } from '~/composables/useTenantId'
import { usePlayoffSlotLabels } from '~/composables/usePlayoffSlotLabels'
import type { StadiumRow } from '~/types/admin/stadium'
import type { MatchRow, TournamentDetails } from '~/types/tournament-admin'
import { getApiErrorMessage } from '~/utils/apiError'
import { toastScheduleWarnings } from '~/utils/scheduleWarningsToast'
import { toastMatchScheduleCreateApiError } from '~/utils/matchCreateToast'
import { mergeDateAndTime, splitStartTimeToDateAndTime } from '~/utils/matchDateTimeFields'
import {
  formatDateTimeNoSeconds,
  formatMatchScoreDisplay,
  isMatchEditLocked,
  matchListRowToneClass,
  statusLabel,
  statusPillClass,
} from '~/utils/tournamentAdminUi'
import { computed, reactive, ref, watch } from 'vue'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'
import { useAdminAsyncState } from '~/composables/admin/useAdminAsyncState'

const props = withDefaults(
  defineProps<{
    tournamentId: string
    /** Данные с родительской страницы турнира — без отдельного GET. */
    embedded?: boolean
    tournament?: TournamentDetails | null
    /** Страница турнира: общий диалог протокола в родителе. */
    externalOpenProtocol?: (m: MatchRow) => void
    /** Быстрый диагностический пресет фильтра списка матчей. */
    presetFilter?:
      | 'all'
      | 'without_stadium'
      | 'without_group'
      | 'live_without_stadium'
      | 'team_overlap'
      | 'stadium_overlap'
      | 'finished_without_score'
      | 'scheduled_in_past'
    /** Встроенный режим: догрузка матчей пачками (родитель мержит страницы). */
    matchesHasMore?: boolean
    matchesLoadingMore?: boolean
    /** Вкладка «Матчи» активна — иначе скрытая панель TabView не даёт intersection. */
    matchesTabVisible?: boolean
    loadMoreMatches?: () => Promise<void>
  }>(),
  {
    embedded: false,
    tournament: null,
    externalOpenProtocol: undefined,
    presetFilter: 'all',
    matchesHasMore: false,
    matchesLoadingMore: false,
    matchesTabVisible: true,
    loadMoreMatches: undefined,
  },
)

const emit = defineEmits<{
  updated: []
}>()

const { token, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()
const toast = useToast()
const { t } = useI18n()

const { loadRefs, postponeReasonOptions } = useMatchProtocolReferences()

const localTournament = ref<TournamentDetails | null>(null)
const {
  loading: matchesWorkspaceLoading,
  error: matchesWorkspaceError,
  run: runMatchesWorkspaceLoad,
  retry: retryMatchesWorkspaceLoad,
} = useAdminAsyncState({ initialLoading: !props.embedded })

const effectiveTournament = computed<TournamentDetails | null>(() =>
  props.embedded ? props.tournament ?? null : localTournament.value,
)

const { playoffSlotLabels } = usePlayoffSlotLabels(effectiveTournament)

const isManualFormat = computed(() => effectiveTournament.value?.format === 'MANUAL')

const manualMatchDialog = ref(false)
const manualMatchSaving = ref(false)
const manualMatchSubmitAttempted = ref(false)
const manualMatchDate = ref<Date | null>(null)
const manualMatchTime = ref<Date | null>(null)
const manualMatchForm = reactive({
  homeTeamId: '',
  awayTeamId: '',
  startTime: null as Date | null,
  roundNumber: 1,
  groupId: '' as string,
  stadiumId: '' as string,
  /** Групповой этап или плей-офф (на вылет). */
  matchStage: 'GROUP' as 'GROUP' | 'PLAYOFF',
  /** Только для PLAYOFF; пусто — без уточнения раунда. */
  playoffRound: '' as
    | ''
    | 'SEMIFINAL'
    | 'FINAL'
    | 'THIRD_PLACE'
    | 'ROUND_OF_16'
    | 'QUARTERFINAL',
})

const playoffRoundOptions = [
  { label: 'Не указывать', value: '' },
  { label: '1/8 финала', value: 'ROUND_OF_16' as const },
  { label: 'Четвертьфинал', value: 'QUARTERFINAL' as const },
  { label: 'Полуфинал', value: 'SEMIFINAL' as const },
  { label: 'Финал', value: 'FINAL' as const },
  { label: 'За 3-е место', value: 'THIRD_PLACE' as const },
]

const manualGroupStageRequiresGroup = computed(
  () =>
    isManualFormat.value && (effectiveTournament.value?.groupCount ?? 1) > 1,
)

const editMatchDialog = ref(false)
const editMatchSaving = ref(false)
const editMatchSubmitAttempted = ref(false)
const editMatchDate = ref<Date | null>(null)
const editMatchTime = ref<Date | null>(null)
const editMatchOriginalStartMs = ref<number | null>(null)
const editMatchForm = reactive({
  matchId: '',
  homeTeamId: '',
  awayTeamId: '',
  startTime: null as Date | null,
  roundNumber: 1,
  groupId: '' as string,
  stadiumId: '' as string,
  matchStage: 'GROUP' as 'GROUP' | 'PLAYOFF',
  scheduleChangeReasonId: '' as string,
})

const tenantStadiumsList = ref<StadiumRow[]>([])
const bulkSelectedMatches = ref<MatchRow[]>([])
const bulkSaving = ref(false)
const bulkConfirmOpen = ref(false)
const matchesQuickFilter = ref<
  | 'all'
  | 'without_stadium'
  | 'without_group'
  | 'live_without_stadium'
  | 'team_overlap'
  | 'stadium_overlap'
  | 'finished_without_score'
  | 'scheduled_in_past'
>('all')
const matchesWorkspaceCollapsed = ref(true)
const bulkForm = reactive({
  shiftMinutes: null as number | null,
  stadiumId: '' as string,
  scheduleChangeReasonId: '' as string,
  scheduleChangeNote: '' as string,
  /** unchanged | show — publishedOnPublic true | hide — false */
  bulkVisibility: 'unchanged' as 'unchanged' | 'show' | 'hide',
})
const bulkSelectedIds = computed(() => bulkSelectedMatches.value.map((m) => m.id))
const bulkAllSelectableChecked = computed(
  () =>
    visibleMatchesSorted.value.length > 0 &&
    bulkSelectedMatches.value.length === visibleMatchesSorted.value.length,
)
const bulkSomeSelected = computed(
  () =>
    bulkSelectedMatches.value.length > 0 &&
    bulkSelectedMatches.value.length < visibleMatchesSorted.value.length,
)
const bulkShiftPresets = [15, 30, 60, -15, -30]
const bulkVisibilityOptions = [
  { label: '—', value: 'unchanged' as const },
  { label: 'На сайте', value: 'show' as const },
  { label: 'Скрыть с сайта', value: 'hide' as const },
]
const bulkShiftPreviewLabel = computed(() => {
  if (bulkForm.shiftMinutes === null || !Number.isFinite(Number(bulkForm.shiftMinutes))) return '—'
  const shift = Number(bulkForm.shiftMinutes)
  if (shift === 0) return 'Без сдвига'
  return shift > 0 ? `+${shift} мин` : `${shift} мин`
})
const bulkPreviewSummary = computed(() => {
  const changes: string[] = []
  if (bulkForm.shiftMinutes !== null && Number.isFinite(Number(bulkForm.shiftMinutes)) && Number(bulkForm.shiftMinutes) !== 0) {
    changes.push(`сдвиг времени: ${bulkShiftPreviewLabel.value}`)
  }
  if (bulkForm.stadiumId !== '') changes.push('смена площадки')
  if (bulkForm.scheduleChangeReasonId.trim()) changes.push('установка причины переноса')
  if (bulkForm.scheduleChangeNote.trim()) changes.push('комментарий')
  if (bulkForm.bulkVisibility === 'show') changes.push('показать на сайте')
  if (bulkForm.bulkVisibility === 'hide') changes.push('скрыть с сайта')
  return changes.length ? changes.join(', ') : 'нет изменений'
})

const matchStadiumSelectOptions = computed(() => {
  const links = effectiveTournament.value?.tournamentStadiums ?? []
  const base =
    links.length > 0
      ? [...links]
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map((l) => ({
            label: l.stadium.city ? `${l.stadium.name} (${l.stadium.city})` : l.stadium.name,
            value: l.stadiumId,
          }))
      : tenantStadiumsList.value.map((s) => ({
          label: s.city ? `${s.name} (${s.city})` : s.name,
          value: s.id,
        }))
  return [{ label: 'Не указано', value: '' }, ...base]
})

async function ensureMatchStadiumOptionsLoaded() {
  const links = effectiveTournament.value?.tournamentStadiums ?? []
  if (links.length || !token.value) return
  try {
    tenantStadiumsList.value = await authFetch<StadiumRow[]>(
      apiUrl(`/tenants/${tenantId.value}/stadiums`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  } catch {
    tenantStadiumsList.value = []
  }
}

const groupSelectOptions = computed(() => {
  const gs = (effectiveTournament.value?.groups ?? []).map((g) => ({ label: g.name, value: g.id }))
  if (manualGroupStageRequiresGroup.value) {
    return gs
  }
  return [{ label: 'Без группы', value: '' }, ...gs]
})

const groupSelectOptionsForEdit = computed(() => {
  const gs = (effectiveTournament.value?.groups ?? []).map((g) => ({ label: g.name, value: g.id }))
  if (editMatchForm.matchStage === 'PLAYOFF') {
    return [{ label: 'Без группы', value: '' }, ...gs]
  }
  if (manualGroupStageRequiresGroup.value) {
    return gs
  }
  return [{ label: 'Без группы', value: '' }, ...gs]
})

watch([manualMatchDate, manualMatchTime], () => {
  manualMatchForm.startTime = mergeDateAndTime(manualMatchDate.value, manualMatchTime.value)
})

watch([editMatchDate, editMatchTime], () => {
  editMatchForm.startTime = mergeDateAndTime(editMatchDate.value, editMatchTime.value)
})

const groupNameForMatch = (m: MatchRow) => {
  if (!m.groupId) return '—'
  const g = effectiveTournament.value?.groups?.find((x) => x.id === m.groupId)
  return g?.name ?? '—'
}

const canManageManualMatches = computed(
  () =>
    isManualFormat.value &&
    !!token.value &&
    effectiveTournament.value?.status !== 'ARCHIVED' &&
    (effectiveTournament.value?.tournamentTeams?.length ?? 0) >= 2,
)

const tournamentTeamSelectOptions = computed(() =>
  (effectiveTournament.value?.tournamentTeams ?? []).map((tt) => ({
    label: tt.team.name,
    value: tt.teamId,
  })),
)

const openManualMatchDialog = () => {
  void ensureMatchStadiumOptionsLoaded()
  manualMatchSubmitAttempted.value = false
  manualMatchForm.homeTeamId = ''
  manualMatchForm.awayTeamId = ''
  manualMatchForm.stadiumId = ''
  manualMatchForm.startTime = new Date()
  const sp = splitStartTimeToDateAndTime(manualMatchForm.startTime)
  manualMatchDate.value = sp.date
  manualMatchTime.value = sp.time
  manualMatchForm.roundNumber = 1
  manualMatchForm.groupId = ''
  manualMatchForm.matchStage = 'GROUP'
  manualMatchForm.playoffRound = ''
  manualMatchDialog.value = true
}

const manualMatchErrors = computed(() => ({
  homeTeamId: manualMatchForm.homeTeamId ? '' : 'Выберите команду хозяев.',
  awayTeamId: manualMatchForm.awayTeamId ? '' : 'Выберите команду гостей.',
  startTime: manualMatchForm.startTime ? '' : 'Укажите дату и время начала матча.',
  distinctTeams:
    manualMatchForm.homeTeamId &&
    manualMatchForm.awayTeamId &&
    manualMatchForm.homeTeamId === manualMatchForm.awayTeamId
      ? 'Нужно выбрать две разные команды.'
      : '',
  groupId:
    manualMatchForm.matchStage === 'GROUP' &&
    manualGroupStageRequiresGroup.value &&
    !manualMatchForm.groupId
      ? 'Для группового этапа выберите группу.'
      : '',
}))
const canSubmitManualMatch = computed(
  () =>
    !manualMatchErrors.value.homeTeamId &&
    !manualMatchErrors.value.awayTeamId &&
    !manualMatchErrors.value.startTime &&
    !manualMatchErrors.value.distinctTeams &&
    !manualMatchErrors.value.groupId,
)

const submitManualMatch = async () => {
  if (!token.value || !effectiveTournament.value) return
  manualMatchSubmitAttempted.value = true
  if (!canSubmitManualMatch.value) return
  const manualStart = manualMatchForm.startTime
  if (!manualStart) return
  manualMatchSaving.value = true
  try {
    const body: Record<string, unknown> = {
      homeTeamId: manualMatchForm.homeTeamId,
      awayTeamId: manualMatchForm.awayTeamId,
      startTime: manualStart.toISOString(),
      roundNumber: manualMatchForm.roundNumber,
    }
    if (manualMatchForm.matchStage === 'PLAYOFF') {
      body.stage = 'PLAYOFF'
      body.groupId = null
      if (manualMatchForm.playoffRound) {
        body.playoffRound = manualMatchForm.playoffRound
      }
    } else {
      body.stage = 'GROUP'
      if (manualMatchForm.groupId) body.groupId = manualMatchForm.groupId
    }
    if (manualMatchForm.stadiumId.trim()) {
      body.stadiumId = manualMatchForm.stadiumId.trim()
    }
    const created = await authFetch<{ scheduleWarnings?: string[] }>(
      apiUrl(`/tournaments/${props.tournamentId}/matches`),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      },
    )
    toastScheduleWarnings(toast, created)
    manualMatchDialog.value = false
    await afterMutation()
    toast.add({
      severity: 'success',
      summary: 'Матч добавлен',
      life: 2500,
    })
  } catch (e: unknown) {
    toastMatchScheduleCreateApiError((m) => toast.add(m), t, e)
  } finally {
    manualMatchSaving.value = false
  }
}

const deletingMatchId = ref<string | null>(null)
const detachingMatchId = ref<string | null>(null)

const detachManualMatchConfirmOpen = ref(false)
const manualMatchToDetach = ref<MatchRow | null>(null)
const detachManualMatchMessage =
  'Открепить матч от турнира? Он появится в разделе «Матчи» как свободный; таблица турнира пересчитается.'

function requestDetachManualMatch(m: MatchRow) {
  if (!token.value) return
  if (isMatchEditLocked(m.status)) {
    toast.add({
      severity: 'info',
      summary: 'Матч завершён',
      detail: 'Нельзя открепить завершённый матч.',
      life: 4000,
    })
    return
  }
  manualMatchToDetach.value = m
  detachManualMatchConfirmOpen.value = true
}

async function confirmDetachManualMatch() {
  const m = manualMatchToDetach.value
  if (!token.value || !m) return
  detachingMatchId.value = m.id
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/matches/${m.id}/detach`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await afterMutation()
    toast.add({
      severity: 'success',
      summary: 'Матч откреплён',
      detail: 'Матч перенесён в свободные; таблица турнира обновлена.',
      life: 4000,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось открепить',
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 6000,
    })
  } finally {
    detachingMatchId.value = null
    manualMatchToDetach.value = null
  }
}

const deleteManualMatchConfirmOpen = ref(false)
const manualMatchToDeleteWs = ref<MatchRow | null>(null)
const deleteManualMatchWsMessage =
  'Удалить этот матч из турнира? Календарь и таблица обновятся.'

function requestDeleteManualMatchWs(m: MatchRow) {
  if (!token.value) return
  if (isMatchEditLocked(m.status)) {
    toast.add({
      severity: 'info',
      summary: 'Матч завершён',
      detail: 'Нельзя удалить завершённый матч.',
      life: 4000,
    })
    return
  }
  manualMatchToDeleteWs.value = m
  deleteManualMatchConfirmOpen.value = true
}

async function confirmDeleteManualMatchWs() {
  const m = manualMatchToDeleteWs.value
  if (!token.value || !m) return
  deletingMatchId.value = m.id
  try {
    await authFetch(apiUrl(`/tournaments/${props.tournamentId}/matches/${m.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await afterMutation()
    toast.add({
      severity: 'success',
      summary: 'Матч удалён',
      life: 2500,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось удалить матч',
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 6000,
    })
  } finally {
    deletingMatchId.value = null
    manualMatchToDeleteWs.value = null
  }
}

const canEditMatchSchedule = computed(
  () => !!token.value && effectiveTournament.value?.status !== 'ARCHIVED',
)
const bulkHasSchedulePatch = computed(() => {
  if (bulkForm.shiftMinutes !== null && Number.isFinite(Number(bulkForm.shiftMinutes)) && Number(bulkForm.shiftMinutes) !== 0) {
    return true
  }
  if (bulkForm.stadiumId !== '') return true
  if (bulkForm.scheduleChangeReasonId.trim()) return true
  if (bulkForm.scheduleChangeNote.trim()) return true
  return false
})
const bulkHasVisibilityPatch = computed(
  () => bulkForm.bulkVisibility === 'show' || bulkForm.bulkVisibility === 'hide',
)
const canRunBulkUpdate = computed(() => {
  if (!canEditMatchSchedule.value || bulkSelectedIds.value.length === 0 || bulkSaving.value) return false
  if (!bulkHasSchedulePatch.value && !bulkHasVisibilityPatch.value) return false
  if (bulkHasSchedulePatch.value) {
    if (bulkSelectedMatches.value.some((m) => isMatchEditLocked(m.status))) return false
  }
  return true
})

const allMatchesSorted = computed(() => {
  const list = effectiveTournament.value?.matches ?? []
  return [...list].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )
})
const visibleMatchesSorted = computed(() => {
  const overlapMap = overlapIssueByMatchId.value
  if (matchesQuickFilter.value === 'without_stadium') {
    return allMatchesSorted.value.filter((m) => !m.stadiumId)
  }
  if (matchesQuickFilter.value === 'live_without_stadium') {
    return allMatchesSorted.value.filter(
      (m) => (m.status === 'LIVE' || m.status === 'SCHEDULED') && !m.stadiumId,
    )
  }
  if (matchesQuickFilter.value === 'without_group') {
    return allMatchesSorted.value.filter(
      (m) => m.stage === 'GROUP' && !m.groupId,
    )
  }
  if (matchesQuickFilter.value === 'team_overlap') {
    return allMatchesSorted.value.filter((m) => overlapMap.get(m.id)?.team === true)
  }
  if (matchesQuickFilter.value === 'stadium_overlap') {
    return allMatchesSorted.value.filter((m) => overlapMap.get(m.id)?.stadium === true)
  }
  if (matchesQuickFilter.value === 'finished_without_score') {
    return allMatchesSorted.value.filter(
      (m) =>
        (m.status === 'FINISHED' || m.status === 'PLAYED') &&
        (m.homeScore === null || m.awayScore === null),
    )
  }
  if (matchesQuickFilter.value === 'scheduled_in_past') {
    const now = Date.now()
    return allMatchesSorted.value.filter(
      (m) => m.status === 'SCHEDULED' && new Date(m.startTime).getTime() < now,
    )
  }
  return allMatchesSorted.value
})

const overlapIssueByMatchId = computed(() => {
  const rows = allMatchesSorted.value
  const durationMs = Math.max(1, Number(effectiveTournament.value?.matchDurationMinutes ?? 90)) * 60_000
  const map = new Map<string, { team: boolean; stadium: boolean }>()
  const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1
  for (const r of rows) map.set(r.id, { team: false, stadium: false })
  for (let i = 0; i < rows.length; i += 1) {
    const a = rows[i]
    if (!a) continue
    const a0 = new Date(a.startTime).getTime()
    const a1 = a0 + durationMs
    for (let j = i + 1; j < rows.length; j += 1) {
      const b = rows[j]
      if (!b) continue
      const b0 = new Date(b.startTime).getTime()
      const b1 = b0 + durationMs
      if (!overlaps(a0, a1, b0, b1)) continue
      const teamConflict =
        a.homeTeam.id === b.homeTeam.id ||
        a.homeTeam.id === b.awayTeam.id ||
        a.awayTeam.id === b.homeTeam.id ||
        a.awayTeam.id === b.awayTeam.id
      const stadiumConflict = !!a.stadiumId && !!b.stadiumId && a.stadiumId === b.stadiumId
      if (teamConflict) {
        const ai = map.get(a.id)
        const bi = map.get(b.id)
        if (ai) ai.team = true
        if (bi) bi.team = true
      }
      if (stadiumConflict) {
        const ai = map.get(a.id)
        const bi = map.get(b.id)
        if (ai) ai.stadium = true
        if (bi) bi.stadium = true
      }
    }
  }
  return map
})

const matchesIssueChips = computed(() => {
  const rows = allMatchesSorted.value
  const withoutStadium = rows.filter((m) => !m.stadiumId).length
  const liveWithoutStadium = rows.filter(
    (m) => (m.status === 'LIVE' || m.status === 'SCHEDULED') && !m.stadiumId,
  ).length
  const withoutGroup = rows.filter((m) => m.stage === 'GROUP' && !m.groupId).length
  return [
    {
      id: 'without_stadium' as const,
      label: `Без площадки: ${withoutStadium}`,
      count: withoutStadium,
    },
    {
      id: 'live_without_stadium' as const,
      label: `Активные без площадки: ${liveWithoutStadium}`,
      count: liveWithoutStadium,
    },
    {
      id: 'without_group' as const,
      label: `Без группы: ${withoutGroup}`,
      count: withoutGroup,
      onlyManual: true,
    },
    {
      id: 'team_overlap' as const,
      label: `Пересечения команд: ${rows.filter((m) => overlapIssueByMatchId.value.get(m.id)?.team).length}`,
      count: rows.filter((m) => overlapIssueByMatchId.value.get(m.id)?.team).length,
    },
    {
      id: 'stadium_overlap' as const,
      label: `Пересечения площадок: ${rows.filter((m) => overlapIssueByMatchId.value.get(m.id)?.stadium).length}`,
      count: rows.filter((m) => overlapIssueByMatchId.value.get(m.id)?.stadium).length,
    },
    {
      id: 'finished_without_score' as const,
      label: `Завершены без счёта: ${rows.filter((m) => (m.status === 'FINISHED' || m.status === 'PLAYED') && (m.homeScore === null || m.awayScore === null)).length}`,
      count: rows.filter((m) => (m.status === 'FINISHED' || m.status === 'PLAYED') && (m.homeScore === null || m.awayScore === null)).length,
    },
    {
      id: 'scheduled_in_past' as const,
      label: `Запланированы в прошлом: ${rows.filter((m) => m.status === 'SCHEDULED' && new Date(m.startTime).getTime() < Date.now()).length}`,
      count: rows.filter((m) => m.status === 'SCHEDULED' && new Date(m.startTime).getTime() < Date.now()).length,
    },
  ].filter((x) => (x.onlyManual ? isManualFormat.value : true))
})

const quickFilterLabelById: Record<
  | 'all'
  | 'without_stadium'
  | 'without_group'
  | 'live_without_stadium'
  | 'team_overlap'
  | 'stadium_overlap'
  | 'finished_without_score'
  | 'scheduled_in_past',
  string
> = {
  all: 'Все матчи',
  without_stadium: 'Без площадки',
  without_group: 'Без группы',
  live_without_stadium: 'Активные без площадки',
  team_overlap: 'Пересечения команд',
  stadium_overlap: 'Пересечения площадок',
  finished_without_score: 'Завершены без счёта',
  scheduled_in_past: 'Запланированы в прошлом',
}

const openEditMatchDialog = async (m: MatchRow) => {
  void ensureMatchStadiumOptionsLoaded()
  if (isMatchEditLocked(m.status)) {
    toast.add({
      severity: 'info',
      summary: 'Матч завершён',
      detail: 'Расписание завершённого матча нельзя менять.',
      life: 4000,
    })
    return
  }
  if (token.value) {
    await loadRefs()
  }
  editMatchForm.matchId = m.id
  editMatchForm.homeTeamId = m.homeTeam.id
  editMatchForm.awayTeamId = m.awayTeam.id
  editMatchForm.startTime = new Date(m.startTime)
  editMatchOriginalStartMs.value = editMatchForm.startTime.getTime()
  editMatchForm.scheduleChangeReasonId = ''
  const esp = splitStartTimeToDateAndTime(editMatchForm.startTime)
  editMatchDate.value = esp.date
  editMatchTime.value = esp.time
  editMatchForm.roundNumber = typeof m.roundNumber === 'number' ? m.roundNumber : 1
  editMatchForm.groupId = m.groupId ?? ''
  editMatchForm.stadiumId = m.stadiumId ?? ''
  editMatchForm.matchStage = m.stage === 'PLAYOFF' ? 'PLAYOFF' : 'GROUP'
  editMatchSubmitAttempted.value = false
  editSmartSuggestionsRemote.value = null
  editSmartSuggestionSelectedId.value = ''
  editMatchDialog.value = true
  void loadEditSmartSuggestions()
}

const editMatchStartChanged = computed(
  () =>
    editMatchOriginalStartMs.value != null &&
    editMatchForm.startTime instanceof Date &&
    editMatchForm.startTime.getTime() !== editMatchOriginalStartMs.value,
)
const editMatchErrors = computed(() => ({
  startTime: editMatchForm.startTime ? '' : 'Время начала матча обязательно.',
  homeTeamId:
    isManualFormat.value && !editMatchForm.homeTeamId ? 'Выберите команду хозяев.' : '',
  awayTeamId:
    isManualFormat.value && !editMatchForm.awayTeamId ? 'Выберите команду гостей.' : '',
  distinctTeams:
    isManualFormat.value &&
    editMatchForm.homeTeamId &&
    editMatchForm.awayTeamId &&
    editMatchForm.homeTeamId === editMatchForm.awayTeamId
      ? 'Нужны две разные команды.'
      : '',
  groupId:
    isManualFormat.value &&
    manualGroupStageRequiresGroup.value &&
    editMatchForm.matchStage === 'GROUP' &&
    !editMatchForm.groupId
      ? 'Для группового этапа выберите группу.'
      : '',
}))
const canSubmitEditMatch = computed(
  () =>
    !editMatchErrors.value.startTime &&
    !editMatchErrors.value.homeTeamId &&
    !editMatchErrors.value.awayTeamId &&
    !editMatchErrors.value.distinctTeams &&
    !editMatchErrors.value.groupId,
)

const submitEditMatch = async () => {
  if (!token.value || !editMatchForm.matchId) return
  editMatchSubmitAttempted.value = true
  if (!canSubmitEditMatch.value) return
  const editStart = editMatchForm.startTime
  if (!editStart) return
  editMatchSaving.value = true
  try {
    const body: Record<string, unknown> = {
      startTime: editStart.toISOString(),
    }
    if (editMatchStartChanged.value && editMatchForm.scheduleChangeReasonId.trim()) {
      body.scheduleChangeReasonId = editMatchForm.scheduleChangeReasonId.trim()
    }
    if (isManualFormat.value) {
      body.homeTeamId = editMatchForm.homeTeamId
      body.awayTeamId = editMatchForm.awayTeamId
      body.roundNumber = editMatchForm.roundNumber
      body.groupId = editMatchForm.groupId || null
    }
    body.stadiumId = editMatchForm.stadiumId.trim() ? editMatchForm.stadiumId.trim() : null
    const updated = await authFetch<{ scheduleWarnings?: string[] }>(
      apiUrl(`/tournaments/${props.tournamentId}/matches/${editMatchForm.matchId}`),
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      },
    )
    toastScheduleWarnings(toast, updated)
    editMatchDialog.value = false
    await afterMutation()
    toast.add({
      severity: 'success',
      summary: 'Матч обновлён',
      life: 2500,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить',
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 6000,
    })
  } finally {
    editMatchSaving.value = false
  }
}

const setEditStartTime = (next: Date) => {
  editMatchForm.startTime = next
  const sp = splitStartTimeToDateAndTime(next)
  editMatchDate.value = sp.date
  editMatchTime.value = sp.time
}

type EditScheduleSuggestion = {
  id: string
  /** Короткая подпись варианта (без счётчика конфликтов). */
  label: string
  conflicts: number
  /** Пояснения с бэкенда — по строке на пункт. */
  explainLines?: string[]
  nextStartTime: Date
  nextStadiumId: string
}

type EditScheduleSuggestionApiItem = {
  id: string
  kind: 'shift' | 'next_day' | 'alt_stadium'
  label: string
  startTime: string
  stadiumId: string | null
  stadiumName: string | null
  conflicts: {
    total: number
    team: number
    stadium: number
    crossTournament: number
    nearbyLoad?: number
    nearbyLoadWeighted?: number
  }
  explain?: string[]
}

const editSmartSuggestionsRemote = ref<EditScheduleSuggestion[] | null>(null)
const editSmartSuggestionsLoading = ref(false)
const editSmartSuggestionSelectedId = ref<string>('')

const loadEditSmartSuggestions = async () => {
  if (!token.value || !editMatchForm.matchId) return
  editSmartSuggestionsLoading.value = true
  try {
    const res = await authFetch<{ items?: EditScheduleSuggestionApiItem[] }>(
      apiUrl(`/tournaments/${props.tournamentId}/matches/${editMatchForm.matchId}/suggestions?limit=5`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
      },
    )
    const items = (res.items ?? [])
      .map((x): EditScheduleSuggestion | null => {
        const dt = new Date(x.startTime)
        if (Number.isNaN(dt.getTime())) return null
        return {
          id: x.id,
          label: x.label,
          conflicts: x.conflicts.total,
          explainLines: x.explain?.length ? [...x.explain] : undefined,
          nextStartTime: dt,
          nextStadiumId: x.stadiumId ?? '',
        }
      })
      .filter((x): x is EditScheduleSuggestion => !!x)
    editSmartSuggestionsRemote.value = items.length ? items : null
    editSmartSuggestionSelectedId.value = items[0]?.id ?? ''
  } catch {
    editSmartSuggestionsRemote.value = null
    editSmartSuggestionSelectedId.value = ''
  } finally {
    editSmartSuggestionsLoading.value = false
  }
}

const editSmartSuggestions = computed<EditScheduleSuggestion[]>(() => {
  if (editSmartSuggestionsRemote.value?.length) return editSmartSuggestionsRemote.value
  if (!editMatchForm.matchId || !editMatchForm.startTime || !effectiveTournament.value) return []
  const t = effectiveTournament.value
  const durationMs = Math.max(1, Number(t.matchDurationMinutes ?? 90)) * 60_000
  const current = t.matches.find((m) => m.id === editMatchForm.matchId)
  if (!current) return []
  const candidateStadiums = matchStadiumSelectOptions.value
    .map((x) => String(x.value ?? ''))
    .filter(Boolean)
  const baseCandidates: Array<{ key: string; label: string; time: Date; stadiumId: string }> = []
  const baseTime = editMatchForm.startTime
  const curStadium = editMatchForm.stadiumId || ''
  baseCandidates.push({ key: 's+15', label: '+15 мин', time: new Date(baseTime.getTime() + 15 * 60_000), stadiumId: curStadium })
  baseCandidates.push({ key: 's+30', label: '+30 мин', time: new Date(baseTime.getTime() + 30 * 60_000), stadiumId: curStadium })
  baseCandidates.push({ key: 's+60', label: '+60 мин', time: new Date(baseTime.getTime() + 60 * 60_000), stadiumId: curStadium })
  baseCandidates.push({ key: 's+1d', label: 'Следующий день', time: new Date(baseTime.getTime() + 24 * 60 * 60_000), stadiumId: curStadium })
  for (const sid of candidateStadiums) {
    if (sid === curStadium) continue
    const stLabel = matchStadiumSelectOptions.value.find((x) => String(x.value ?? '') === sid)?.label ?? 'Другая площадка'
    baseCandidates.push({ key: `st:${sid}`, label: `Площадка: ${stLabel}`, time: new Date(baseTime), stadiumId: sid })
  }

  const intervalOverlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1
  const activeStatuses = new Set(['SCHEDULED', 'LIVE'])
  const score = (time: Date, stadiumId: string) => {
    const start = time.getTime()
    const end = start + durationMs
    let conflicts = 0
    for (const m of t.matches) {
      if (m.id === current.id) continue
      if (!activeStatuses.has(String(m.status))) continue
      const ms = new Date(m.startTime).getTime()
      const me = ms + durationMs
      if (!intervalOverlap(start, end, ms, me)) continue
      if (
        m.homeTeam.id === current.homeTeam.id ||
        m.awayTeam.id === current.homeTeam.id ||
        m.homeTeam.id === current.awayTeam.id ||
        m.awayTeam.id === current.awayTeam.id
      ) {
        conflicts += 1
        continue
      }
      if (stadiumId && m.stadiumId && stadiumId === m.stadiumId) {
        conflicts += 1
      }
    }
    return conflicts
  }

  return baseCandidates
    .map((c) => ({
      id: c.key,
      label: c.label,
      conflicts: score(c.time, c.stadiumId),
      explainLines: [`Локальная оценка по турниру (без учёта других турниров)`],
      nextStartTime: c.time,
      nextStadiumId: c.stadiumId,
    }))
    .sort((a, b) => a.conflicts - b.conflicts)
    .slice(0, 5)
})

const selectedEditSmartSuggestion = computed(() => {
  const all = editSmartSuggestions.value
  if (!all.length) return null
  if (!editSmartSuggestionSelectedId.value) return all[0] ?? null
  return (
    all.find((s) => s.id === editSmartSuggestionSelectedId.value) ??
    all[0] ??
    null
  )
})

const applyEditSmartSuggestion = (s: EditScheduleSuggestion) => {
  setEditStartTime(new Date(s.nextStartTime))
  editMatchForm.stadiumId = s.nextStadiumId
  editSmartSuggestionSelectedId.value = s.id
  editSmartSuggestionsRemote.value = null
}

const fetchStandalone = async () => {
  if (props.embedded) return
  if (!token.value || !props.tournamentId) {
    matchesWorkspaceLoading.value = false
    localTournament.value = null
    return
  }
  localTournament.value = null
  await runMatchesWorkspaceLoad(async () => {
    try {
      const res = await authFetch<TournamentDetails>(apiUrl(`/tournaments/${props.tournamentId}`), {
        headers: { Authorization: `Bearer ${token.value}` },
      })
      localTournament.value = res
    } catch (e: unknown) {
      localTournament.value = null
      throw e
    }
  })
}

async function afterMutation() {
  if (!props.embedded) {
    await fetchStandalone()
  }
  emit('updated')
}

watch(
  () => props.tournamentId,
  () => {
    if (!props.embedded) fetchStandalone()
  },
  { immediate: true },
)

watch(
  () => effectiveTournament.value?.id,
  () => {
    void ensureMatchStadiumOptionsLoaded()
    if (token.value) void loadRefs()
  },
  { immediate: true },
)

watch(visibleMatchesSorted, (rows) => {
  const byId = new Map(rows.map((m) => [m.id, m]))
  bulkSelectedMatches.value = bulkSelectedMatches.value
    .map((m) => byId.get(m.id))
    .filter((m): m is MatchRow => !!m)
})

const matchesPagingTotal = computed(() => {
  const tour = effectiveTournament.value
  if (!tour) return 0
  return typeof tour.matchesTotal === 'number'
    ? tour.matchesTotal
    : tour.matches?.length ?? 0
})

watch(
  () => props.presetFilter,
  (next) => {
    if (
      next === 'without_stadium' ||
      next === 'without_group' ||
      next === 'live_without_stadium' ||
      next === 'team_overlap' ||
      next === 'stadium_overlap' ||
      next === 'finished_without_score' ||
      next === 'scheduled_in_past'
    ) {
      matchesQuickFilter.value = next
      return
    }
    matchesQuickFilter.value = 'all'
  },
  { immediate: true },
)

const protocolVisible = ref(false)
const protocolMatch = ref<MatchRow | null>(null)

const onProtocolClick = (m: MatchRow) => {
  if (props.externalOpenProtocol) {
    props.externalOpenProtocol(m)
    return
  }
  protocolMatch.value = m
  protocolVisible.value = true
}

const onProtocolSaved = async () => {
  await afterMutation()
}

const clearBulkForm = () => {
  bulkForm.shiftMinutes = null
  bulkForm.stadiumId = ''
  bulkForm.scheduleChangeReasonId = ''
  bulkForm.scheduleChangeNote = ''
  bulkForm.bulkVisibility = 'unchanged'
}
const toggleBulkSelectAll = (checked: boolean) => {
  bulkSelectedMatches.value = checked ? [...visibleMatchesSorted.value] : []
}
const toggleBulkRow = (match: MatchRow, checked: boolean) => {
  const next = new Map(bulkSelectedMatches.value.map((m) => [m.id, m]))
  if (checked) next.set(match.id, match)
  else next.delete(match.id)
  bulkSelectedMatches.value = Array.from(next.values())
}

const submitBulkUpdate = async () => {
  if (!token.value || !canRunBulkUpdate.value) return
  const body: Record<string, unknown> = { matchIds: bulkSelectedIds.value }
  if (bulkForm.shiftMinutes !== null && Number.isFinite(Number(bulkForm.shiftMinutes))) {
    body.shiftMinutes = Number(bulkForm.shiftMinutes)
  }
  if (bulkForm.stadiumId !== '') {
    body.stadiumId = bulkForm.stadiumId || null
  }
  if (bulkForm.scheduleChangeReasonId.trim()) {
    body.scheduleChangeReasonId = bulkForm.scheduleChangeReasonId.trim()
  }
  if (bulkForm.scheduleChangeNote.trim()) {
    body.scheduleChangeNote = bulkForm.scheduleChangeNote.trim()
  }
  if (bulkForm.bulkVisibility === 'show') {
    body.publishedOnPublic = true
  } else if (bulkForm.bulkVisibility === 'hide') {
    body.publishedOnPublic = false
  }
  const hasPatch =
    body.shiftMinutes !== undefined ||
    body.stadiumId !== undefined ||
    body.scheduleChangeReasonId !== undefined ||
    body.scheduleChangeNote !== undefined ||
    body.publishedOnPublic !== undefined
  if (!hasPatch) {
    toast.add({
      severity: 'warn',
      summary: 'Укажите хотя бы одно массовое изменение',
      life: 3500,
    })
    return
  }
  bulkSaving.value = true
  try {
    const res = await authFetch<{ updatedCount?: number }>(
      apiUrl(`/tournaments/${props.tournamentId}/matches/bulk`),
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      },
    )
    await afterMutation()
    bulkSelectedMatches.value = []
    clearBulkForm()
    toast.add({
      severity: 'success',
      summary: `Массово обновлено матчей: ${Number(res.updatedCount ?? 0)}`,
      life: 3500,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось выполнить массовое обновление',
      detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
      life: 6000,
    })
  } finally {
    bulkSaving.value = false
  }
}
const requestBulkUpdate = () => {
  if (!canRunBulkUpdate.value) return
  bulkConfirmOpen.value = true
}

defineExpose({
  openManualMatchDialog,
})
</script>

<template>
  <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4">
    <AdminDataState
      v-if="!embedded && (matchesWorkspaceLoading || matchesWorkspaceError)"
      :loading="matchesWorkspaceLoading"
      :error="matchesWorkspaceError"
      :empty="false"
      :content-card="false"
      :error-title="t('admin.tournament_page.load_error_title')"
      @retry="retryMatchesWorkspaceLoad"
    >
      <template #loading>
        <div class="space-y-4 py-2" aria-busy="true">
          <Skeleton height="0.875rem" width="32%" class="rounded-md" />
          <Skeleton height="2.75rem" width="100%" class="rounded-lg" />
          <Skeleton height="14rem" width="100%" class="rounded-lg" />
        </div>
      </template>
    </AdminDataState>

    <template v-else-if="effectiveTournament">
      <div class="mb-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-800/40 p-3">
      <div class="panel-header-row admin-toolbar-responsive flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <h2 class="panel-header-title text-sm font-semibold text-surface-900 dark:text-surface-0 flex items-center gap-1.5">
            <span>Оперативная панель матчей</span>
            <i
              class="panel-info-icon pi pi-info-circle text-muted-color"
              v-tooltip.top="'Фильтры проблем, быстрые массовые действия и служебные подсказки перед работой с таблицей матчей.'"
            />
          </h2>
          <p class="mt-1 text-xs text-muted-color">
            Полный список по дате начала. Для MANUAL с несколькими группами группа матча обязательна: таблица и очки
            считаются только по матчам с нужным groupId, команды должны быть в этой группе на вкладке «Составы».
            Плей-офф для MANUAL не генерируется автоматически — матчи на вылет создаются вручную: в «Добавить матч»
            выберите стадию «Плей-офф». «Открепить» — матч в свободные на странице «Матчи».
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button
            v-if="canManageManualMatches"
            label="Добавить матч"
            icon="pi pi-plus"
            size="small"
            class="shrink-0"
            @click="openManualMatchDialog"
          />
          <Button
            class="panel-chevron-btn collapse-toggle-icon-btn"
            size="small"
            text
            severity="secondary"
            :icon="matchesWorkspaceCollapsed ? 'pi pi-chevron-down' : 'pi pi-chevron-up'"
            :label="matchesWorkspaceCollapsed ? 'Развернуть' : 'Свернуть'"
            @click="matchesWorkspaceCollapsed = !matchesWorkspaceCollapsed"
          />
        </div>
      </div>

      <template v-if="!matchesWorkspaceCollapsed">
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="small"
          severity="secondary"
          :outlined="matchesQuickFilter !== 'all'"
          label="Все матчи"
          @click="matchesQuickFilter = 'all'"
        />
        <Button
          size="small"
          severity="secondary"
          :outlined="matchesQuickFilter !== 'without_stadium'"
          label="Без площадки"
          @click="matchesQuickFilter = 'without_stadium'"
        />
        <Button
          v-if="isManualFormat"
          size="small"
          severity="secondary"
          :outlined="matchesQuickFilter !== 'without_group'"
          label="Без группы"
          @click="matchesQuickFilter = 'without_group'"
        />
        <Button
          size="small"
          severity="secondary"
          :outlined="matchesQuickFilter !== 'live_without_stadium'"
          label="Активные без площадки"
          @click="matchesQuickFilter = 'live_without_stadium'"
        />
      </div>

      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <Button
          v-for="chip in matchesIssueChips"
          :key="chip.id"
          size="small"
          text
          severity="contrast"
          :disabled="chip.count === 0"
          :label="chip.label"
          @click="matchesQuickFilter = chip.id"
        />
        <Tag
          v-if="matchesQuickFilter !== 'all'"
          severity="secondary"
          :value="`Фильтр: ${quickFilterLabelById[matchesQuickFilter]}`"
        />
        <Button
          v-if="matchesQuickFilter !== 'all'"
          size="small"
          text
          severity="secondary"
          icon="pi pi-times"
          label="Сбросить фильтр"
          @click="matchesQuickFilter = 'all'"
        />
      </div>
      </template>
      </div>

      <div v-if="!visibleMatchesSorted.length" class="mt-4 text-sm text-muted-color">
        Пока нет матчей.
      </div>

      <div v-else class="admin-datatable-scroll mt-4 min-w-0">
      <div
        v-if="!matchesWorkspaceCollapsed"
        class="mb-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50/70 dark:bg-surface-800/40 p-3"
      >
        <div class="flex flex-wrap items-end gap-2">
          <div class="min-w-[10rem] flex-1">
            <label class="mb-1 block text-xs text-muted-color">Сдвиг (мин)</label>
            <InputNumber
              v-model="bulkForm.shiftMinutes"
              :min="-1440"
              :max="1440"
              showButtons
              class="w-full"
            />
          </div>
          <div class="min-w-[12rem] flex-1">
            <label class="mb-1 block text-xs text-muted-color">Площадка</label>
            <Select
              v-model="bulkForm.stadiumId"
              :options="matchStadiumSelectOptions"
              optionLabel="label"
              optionValue="value"
              class="w-full"
            />
          </div>
          <div class="min-w-[11rem] flex-1">
            <label class="mb-1 block text-xs text-muted-color">Публичный сайт</label>
            <Select
              v-model="bulkForm.bulkVisibility"
              :options="bulkVisibilityOptions"
              optionLabel="label"
              optionValue="value"
              class="w-full"
            />
          </div>
          <div class="min-w-[12rem] flex-1">
            <label class="mb-1 block text-xs text-muted-color">Причина переноса</label>
            <Select
              v-model="bulkForm.scheduleChangeReasonId"
              :options="postponeReasonOptions"
              optionLabel="label"
              optionValue="value"
              class="w-full"
            />
          </div>
          <div class="min-w-[14rem] flex-[2]">
            <label class="mb-1 block text-xs text-muted-color">Комментарий</label>
            <InputText v-model="bulkForm.scheduleChangeNote" class="w-full" />
          </div>
          <Button
            label="Применить к выбранным"
            icon="pi pi-bolt"
            :loading="bulkSaving"
            :disabled="!canRunBulkUpdate"
            @click="requestBulkUpdate"
          />
        </div>
        <p class="mt-2 text-xs text-muted-color">
          Выбрано матчей: {{ bulkSelectedIds.length }} · Изменения: {{ bulkPreviewSummary }}
        </p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <Button
            v-for="preset in bulkShiftPresets"
            :key="preset"
            size="small"
            text
            severity="secondary"
            :label="preset > 0 ? `+${preset}м` : `${preset}м`"
            @click="bulkForm.shiftMinutes = preset"
          />
        </div>
      </div>
      <DataTable
        :value="visibleMatchesSorted"
        dataKey="id"
        sortMode="single"
        sortField="startTime"
        :sortOrder="1"
        stripedRows
        class="mt-0"
        :rowClass="(data: MatchRow) => matchListRowToneClass(data.status)"
      >
        <Column headerStyle="width: 2.5rem">
          <template #header>
            <Checkbox
              binary
              :modelValue="bulkAllSelectableChecked"
              :indeterminate="bulkSomeSelected"
              @update:modelValue="toggleBulkSelectAll(!!$event)"
            />
          </template>
          <template #body="{ data }">
            <Checkbox
              binary
              :modelValue="bulkSelectedIds.includes(data.id)"
              @update:modelValue="toggleBulkRow(data, !!$event)"
            />
          </template>
        </Column>
        <Column header="#" style="width: 2.75rem">
          <template #body="{ index }">
            <span class="tabular-nums text-sm text-muted-color">{{ (index ?? 0) + 1 }}</span>
          </template>
        </Column>
        <Column field="startTime" header="Начало" sortable style="min-width: 10rem">
          <template #body="{ data }">
            {{ formatDateTimeNoSeconds(data.startTime) }}
          </template>
        </Column>
        <Column header="Хозяева" style="min-width: 8rem">
          <template #body="{ data }">
            {{ playoffSlotLabels(data)?.home ?? data.homeTeam.name }}
          </template>
        </Column>
        <Column header="Гости" style="min-width: 8rem">
          <template #body="{ data }">
            {{ playoffSlotLabels(data)?.away ?? data.awayTeam.name }}
          </template>
        </Column>
        <Column header="Площадка" style="min-width: 7rem">
          <template #body="{ data }">
            <span v-if="data.stadium?.name">{{ data.stadium.name }}</span>
            <span v-else class="text-muted-color">—</span>
          </template>
        </Column>
        <Column v-if="isManualFormat" header="Тур" style="width: 4rem">
          <template #body="{ data }">
            {{ typeof data.roundNumber === 'number' ? data.roundNumber : '—' }}
          </template>
        </Column>
        <Column v-if="isManualFormat" header="Группа" style="min-width: 6rem">
          <template #body="{ data }">
            {{ groupNameForMatch(data) }}
          </template>
        </Column>
        <Column header="Счёт" style="width: 5rem">
          <template #body="{ data }">
            <span v-if="data.homeScore !== null && data.awayScore !== null">
              {{ formatMatchScoreDisplay(data) }}
            </span>
            <span v-else class="text-muted-color">—</span>
          </template>
        </Column>
        <Column header="Статус" style="width: 8rem">
          <template #body="{ data }">
            <span :class="statusPillClass(data.status)">{{ statusLabel(data.status) }}</span>
          </template>
        </Column>
        <Column header="Сайт" style="width: 6.5rem">
          <template #body="{ data }">
            <Tag
              v-if="data.publishedOnPublic === false"
              severity="secondary"
              value="Скрыт"
              class="text-xs"
            />
            <Tag v-else severity="success" value="На сайте" class="text-xs" />
          </template>
        </Column>
        <Column
          header="Действия"
          style="width: 9rem; min-width: 9rem"
          header-class="text-right"
          :header-style="{ textAlign: 'right' }"
        >
          <template #body="{ data }">
            <div class="flex flex-wrap items-center justify-end gap-0">
              <Button
                icon="pi pi-book"
                text
                rounded
                size="small"
                class="!w-8 !h-8"
                v-tooltip.top="'Протокол'"
                @click="onProtocolClick(data)"
              />
              <Button
                v-if="canEditMatchSchedule"
                icon="pi pi-calendar"
                text
                rounded
                size="small"
                class="!w-8 !h-8"
                :disabled="isMatchEditLocked(data.status)"
                v-tooltip.top="'Дата и время'"
                @click="openEditMatchDialog(data)"
              />
              <Button
                v-if="canManageManualMatches"
                icon="pi pi-unlock"
                text
                rounded
                size="small"
                class="!w-8 !h-8"
                :disabled="isMatchEditLocked(data.status)"
                :loading="detachingMatchId === data.id"
                v-tooltip.top="'Открепить от турнира'"
                @click="requestDetachManualMatch(data)"
              />
              <Button
                v-if="canManageManualMatches"
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                class="!w-8 !h-8"
                :disabled="isMatchEditLocked(data.status)"
                :loading="deletingMatchId === data.id"
                v-tooltip.top="'Удалить'"
                @click="requestDeleteManualMatchWs(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
      <AdminTournamentMatchesPagingBar
        v-if="embedded && loadMoreMatches && matchesHasMore && matchesTabVisible !== false"
        :matches-has-more="matchesHasMore"
        :matches-loading-more="matchesLoadingMore"
        :load-more-matches="loadMoreMatches"
        :tab-visible="matchesTabVisible !== false"
        :loaded-count="effectiveTournament?.matches?.length ?? 0"
        :total-count="matchesPagingTotal"
      />
      </div>
    </template>

    <div
      v-else-if="
        !effectiveTournament &&
        (embedded || (!matchesWorkspaceLoading && !matchesWorkspaceError))
      "
      class="text-sm text-muted-color"
    >
      {{ t('admin.tournament_page.matches_workspace_not_found') }}
    </div>

    <AdminConfirmDialog
      v-model="detachManualMatchConfirmOpen"
      title="Открепить матч?"
      :message="detachManualMatchMessage"
      confirm-label="Открепить"
      confirm-severity="warn"
      @confirm="confirmDetachManualMatch"
    />

    <AdminConfirmDialog
      v-model="deleteManualMatchConfirmOpen"
      title="Удалить матч?"
      :message="deleteManualMatchWsMessage"
      @confirm="confirmDeleteManualMatchWs"
    />

    <AdminConfirmDialog
      v-model="bulkConfirmOpen"
      title="Применить массовые изменения?"
      :message="`Матчей: ${bulkSelectedIds.length}. Будет применено: ${bulkPreviewSummary}.`"
      confirm-label="Применить"
      confirm-severity="warn"
      @confirm="submitBulkUpdate"
    />

    <AdminMatchProtocolDialog
      v-if="!externalOpenProtocol"
      v-model:visible="protocolVisible"
      :tournament-id="tournamentId"
      :tournament="effectiveTournament"
      :match="protocolMatch"
      @saved="onProtocolSaved"
    />

    <Dialog
      :visible="manualMatchDialog"
      @update:visible="(v) => (manualMatchDialog = v)"
      modal
      header="Добавить матч"
      :style="{ width: '36rem' }"
    >
      <div class="space-y-4">
        <div>
          <label class="text-sm block mb-1">Стадия</label>
          <Select
            v-model="manualMatchForm.matchStage"
            :options="[
              { label: 'Групповой этап', value: 'GROUP' },
              { label: 'Плей-офф (на вылет)', value: 'PLAYOFF' },
            ]"
            option-label="label"
            option-value="value"
            class="w-full"
            :disabled="manualMatchSaving"
          />
        </div>
        <div v-if="manualMatchForm.matchStage === 'PLAYOFF'">
          <label class="text-sm block mb-1">Раунд плей-офф</label>
          <Select
            v-model="manualMatchForm.playoffRound"
            :options="playoffRoundOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            placeholder="По желанию"
            :disabled="manualMatchSaving"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Хозяева</label>
          <Select
            v-model="manualMatchForm.homeTeamId"
            :options="tournamentTeamSelectOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            placeholder="Команда"
            :invalid="
              !!(
                (manualMatchSubmitAttempted || manualMatchForm.homeTeamId) &&
                manualMatchErrors.homeTeamId
              )
            "
            :disabled="manualMatchSaving"
          />
          <p
            v-if="(manualMatchSubmitAttempted || manualMatchForm.homeTeamId) && manualMatchErrors.homeTeamId"
            class="mt-0 text-[11px] leading-3 text-red-500"
          >
            {{ manualMatchErrors.homeTeamId }}
          </p>
        </div>
        <div>
          <label class="text-sm block mb-1">Гости</label>
          <Select
            v-model="manualMatchForm.awayTeamId"
            :options="tournamentTeamSelectOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            placeholder="Команда"
            :invalid="
              !!(
                (manualMatchSubmitAttempted || manualMatchForm.awayTeamId) &&
                (manualMatchErrors.awayTeamId || manualMatchErrors.distinctTeams)
              )
            "
            :disabled="manualMatchSaving"
          />
          <p
            v-if="(manualMatchSubmitAttempted || manualMatchForm.awayTeamId) && manualMatchErrors.awayTeamId"
            class="mt-0 text-[11px] leading-3 text-red-500"
          >
            {{ manualMatchErrors.awayTeamId }}
          </p>
          <p
            v-else-if="(manualMatchSubmitAttempted || manualMatchForm.awayTeamId) && manualMatchErrors.distinctTeams"
            class="mt-0 text-[11px] leading-3 text-red-500"
          >
            {{ manualMatchErrors.distinctTeams }}
          </p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="text-sm block mb-1">Дата матча</label>
            <DatePicker
              v-model="manualMatchDate"
              class="w-full"
              dateFormat="dd.mm.yy"
              showIcon
              :invalid="manualMatchSubmitAttempted && !!manualMatchErrors.startTime"
              :disabled="manualMatchSaving"
            />
          </div>
          <div>
            <label class="text-sm block mb-1">Время матча</label>
            <DatePicker
              v-model="manualMatchTime"
              class="w-full"
              timeOnly
              hourFormat="24"
              showIcon
              :invalid="manualMatchSubmitAttempted && !!manualMatchErrors.startTime"
              :disabled="manualMatchSaving"
            />
          </div>
        </div>
        <p
          v-if="manualMatchSubmitAttempted && manualMatchErrors.startTime"
          class="mt-0 text-[11px] leading-3 text-red-500"
        >
          {{ manualMatchErrors.startTime }}
        </p>
        <div
          class="grid gap-3"
          :class="manualMatchForm.matchStage === 'GROUP' ? 'grid-cols-2' : 'grid-cols-1'"
        >
          <div>
            <label class="text-sm block mb-1">Номер тура</label>
            <InputNumber
              v-model="manualMatchForm.roundNumber"
              class="w-full"
              :min="1"
              :disabled="manualMatchSaving"
            />
          </div>
          <div v-if="manualMatchForm.matchStage === 'GROUP'">
            <label class="text-sm block mb-1">Группа</label>
            <Select
              v-model="manualMatchForm.groupId"
              :options="groupSelectOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              :placeholder="manualGroupStageRequiresGroup ? 'Выберите группу' : 'По желанию'"
              :invalid="manualMatchSubmitAttempted && !!manualMatchErrors.groupId"
              :disabled="manualMatchSaving"
            />
            <p
              v-if="manualMatchSubmitAttempted && manualMatchErrors.groupId"
              class="mt-0 text-[11px] leading-3 text-red-500"
            >
              {{ manualMatchErrors.groupId }}
            </p>
          </div>
        </div>
        <div>
          <label class="text-sm block mb-1">Площадка</label>
          <Select
            v-model="manualMatchForm.stadiumId"
            :options="matchStadiumSelectOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            placeholder="По желанию"
            show-clear
            :disabled="manualMatchSaving"
          />
          <p class="mt-1 text-[11px] text-muted-color leading-snug">
            Если у турнира задан список площадок — только из него. Иначе любой стадион организации.
          </p>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Отмена" text :disabled="manualMatchSaving" @click="manualMatchDialog = false" />
          <Button
            label="Создать"
            icon="pi pi-check"
            :loading="manualMatchSaving"
            :disabled="manualMatchSubmitAttempted && !canSubmitManualMatch"
            @click="submitManualMatch"
          />
        </div>
      </template>
    </Dialog>

    <Dialog
      :visible="editMatchDialog"
      @update:visible="(v) => (editMatchDialog = v)"
      modal
      header="Параметры матча"
      :style="{ width: '36rem' }"
    >
      <div v-if="editMatchForm.matchId" class="space-y-4">
        <template v-if="isManualFormat">
          <div>
            <label class="text-sm block mb-1">Хозяева</label>
            <Select
              v-model="editMatchForm.homeTeamId"
              :options="tournamentTeamSelectOptions"
              optionLabel="label"
              optionValue="value"
              class="w-full"
              placeholder="Команда"
              :invalid="
                !!(
                  (editMatchSubmitAttempted || editMatchForm.homeTeamId) &&
                  editMatchErrors.homeTeamId
                )
              "
              :disabled="editMatchSaving"
            />
            <p
              v-if="(editMatchSubmitAttempted || editMatchForm.homeTeamId) && editMatchErrors.homeTeamId"
              class="mt-0 text-[11px] leading-3 text-red-500"
            >
              {{ editMatchErrors.homeTeamId }}
            </p>
          </div>
          <div>
            <label class="text-sm block mb-1">Гости</label>
            <Select
              v-model="editMatchForm.awayTeamId"
              :options="tournamentTeamSelectOptions"
              optionLabel="label"
              optionValue="value"
              class="w-full"
              placeholder="Команда"
              :invalid="
                !!(
                  (editMatchSubmitAttempted || editMatchForm.awayTeamId) &&
                  (editMatchErrors.awayTeamId || editMatchErrors.distinctTeams)
                )
              "
              :disabled="editMatchSaving"
            />
            <p
              v-if="(editMatchSubmitAttempted || editMatchForm.awayTeamId) && editMatchErrors.awayTeamId"
              class="mt-0 text-[11px] leading-3 text-red-500"
            >
              {{ editMatchErrors.awayTeamId }}
            </p>
            <p
              v-else-if="(editMatchSubmitAttempted || editMatchForm.awayTeamId) && editMatchErrors.distinctTeams"
              class="mt-0 text-[11px] leading-3 text-red-500"
            >
              {{ editMatchErrors.distinctTeams }}
            </p>
          </div>
          <p class="text-xs text-muted-color">
            Если поменять пары, счёт и события матча на сервере сбрасываются.
          </p>
        </template>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="text-sm block mb-1">Дата матча</label>
            <DatePicker
              v-model="editMatchDate"
              class="w-full"
              dateFormat="dd.mm.yy"
              showIcon
              :invalid="editMatchSubmitAttempted && !!editMatchErrors.startTime"
              :disabled="editMatchSaving"
            />
          </div>
          <div>
            <label class="text-sm block mb-1">Время матча</label>
            <DatePicker
              v-model="editMatchTime"
              class="w-full"
              timeOnly
              hourFormat="24"
              showIcon
              :invalid="editMatchSubmitAttempted && !!editMatchErrors.startTime"
              :disabled="editMatchSaving"
            />
          </div>
        </div>
        <p
          v-if="editMatchSubmitAttempted && editMatchErrors.startTime"
          class="mt-0 text-[11px] leading-3 text-red-500"
        >
          {{ editMatchErrors.startTime }}
        </p>
        <div>
          <label class="text-sm block mb-1">Площадка</label>
          <Select
            v-model="editMatchForm.stadiumId"
            :options="matchStadiumSelectOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            placeholder="По желанию"
            show-clear
            :disabled="editMatchSaving"
          />
        </div>
        <div class="space-y-2 rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50/50 dark:bg-surface-800/30 p-3">
          <p class="text-xs text-muted-color">
            При переносе времени можно указать причину (справочник «Причины переноса и отмены»).
          </p>
          <div>
            <label class="text-sm block mb-1">Причина переноса</label>
            <Select
              v-model="editMatchForm.scheduleChangeReasonId"
              :options="postponeReasonOptions"
              option-label="label"
              option-value="value"
              show-clear
              placeholder="Не выбрано"
              class="w-full"
              :disabled="editMatchSaving"
            />
          </div>
          <div class="rounded-md border border-surface-200/80 dark:border-surface-700 p-2.5">
            <p class="text-xs font-medium text-surface-700 dark:text-surface-200">
              Рекомендованные варианты
            </p>
            <p v-if="editSmartSuggestionsLoading" class="mt-1 text-[11px] text-muted-color">
              Подбираем варианты...
            </p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <Button
                v-for="s in editSmartSuggestions"
                :key="s.id"
                size="small"
                :text="selectedEditSmartSuggestion?.id !== s.id"
                :outlined="selectedEditSmartSuggestion?.id === s.id"
                :severity="s.conflicts === 0 ? 'success' : 'secondary'"
                :label="`${s.label} · ${s.conflicts}`"
                :title="(s.explainLines ?? []).join('\n')"
                icon="pi pi-bolt"
                :disabled="editMatchSaving"
                @click="applyEditSmartSuggestion(s)"
              />
            </div>
            <div v-if="selectedEditSmartSuggestion?.explainLines?.length" class="mt-2">
              <p class="text-[11px] font-medium text-surface-600 dark:text-surface-300">
                Почему этот вариант
              </p>
              <ul
                class="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-muted-color"
              >
                <li
                  v-for="(line, i) in selectedEditSmartSuggestion.explainLines"
                  :key="i"
                >
                  {{ line }}
                </li>
              </ul>
            </div>
          </div>
        </div>
        <template v-if="isManualFormat">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-sm block mb-1">Номер тура</label>
              <InputNumber
                v-model="editMatchForm.roundNumber"
                class="w-full"
                :min="1"
                :disabled="editMatchSaving"
              />
            </div>
            <div>
              <label class="text-sm block mb-1">Группа</label>
              <Select
                v-model="editMatchForm.groupId"
                :options="groupSelectOptionsForEdit"
                option-label="label"
                option-value="value"
                class="w-full"
                :placeholder="
                  manualGroupStageRequiresGroup && editMatchForm.matchStage === 'GROUP'
                    ? 'Выберите группу'
                    : 'По желанию'
                "
                :invalid="editMatchSubmitAttempted && !!editMatchErrors.groupId"
                :disabled="editMatchSaving"
              />
              <p
                v-if="editMatchSubmitAttempted && editMatchErrors.groupId"
                class="mt-0 text-[11px] leading-3 text-red-500"
              >
                {{ editMatchErrors.groupId }}
              </p>
            </div>
          </div>
        </template>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Отмена" text :disabled="editMatchSaving" @click="editMatchDialog = false" />
          <Button
            label="Сохранить"
            icon="pi pi-check"
            :loading="editMatchSaving"
            :disabled="editMatchSubmitAttempted && !canSubmitEditMatch"
            @click="submitEditMatch"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.panel-header-row {
  min-height: 2.5rem;
}

.panel-header-title {
  min-height: 1.5rem;
}

.panel-info-icon {
  font-size: 12px;
  line-height: 1;
}

.panel-chevron-btn {
  --p-button-padding-y: 4px;
  --p-button-padding-x: 8px;
}

:deep(.panel-chevron-btn .p-button-icon) {
  font-size: 12px;
}

:deep(.p-datatable .p-datatable-tbody > tr > td),
:deep(.p-datatable .p-datatable-thead > tr > th) {
  font-size: 0.8125rem;
}

@media (max-width: 767px) {
  :deep(.collapse-toggle-icon-btn .p-button-label) {
    display: none;
  }

  :deep(.p-datatable .p-datatable-tbody > tr > td),
  :deep(.p-datatable .p-datatable-thead > tr > th) {
    font-size: 0.6875rem;
    line-height: 1.15rem;
  }
}
</style>

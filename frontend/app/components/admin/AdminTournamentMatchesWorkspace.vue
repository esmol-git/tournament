<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useMatchProtocolReferences } from '~/composables/useMatchProtocolReferences'
import { useTenantId } from '~/composables/useTenantId'
import { usePlayoffSlotLabels } from '~/composables/usePlayoffSlotLabels'
import type { MatchRow, TournamentDetails } from '~/types/tournament-admin'
import { getApiErrorMessage } from '~/utils/apiError'
import { mergeDateAndTime, splitStartTimeToDateAndTime } from '~/utils/matchDateTimeFields'
import {
  formatDateTimeNoSeconds,
  formatMatchScoreDisplay,
  isMatchEditLocked,
  statusLabel,
  statusPillClass,
} from '~/utils/tournamentAdminUi'
import { computed, reactive, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    tournamentId: string
    /** Данные с родительской страницы турнира — без отдельного GET. */
    embedded?: boolean
    tournament?: TournamentDetails | null
    /** Страница турнира: общий диалог протокола в родителе. */
    externalOpenProtocol?: (m: MatchRow) => void
  }>(),
  {
    embedded: false,
    tournament: null,
    externalOpenProtocol: undefined,
  },
)

const emit = defineEmits<{
  updated: []
}>()

const { token, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()
const toast = useToast()

const { loadRefs, postponeReasonOptions } = useMatchProtocolReferences()

const localTournament = ref<TournamentDetails | null>(null)
const loading = ref(false)

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
  matchStage: 'GROUP' as 'GROUP' | 'PLAYOFF',
  scheduleChangeReasonId: '' as string,
})

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
  manualMatchSubmitAttempted.value = false
  manualMatchForm.homeTeamId = ''
  manualMatchForm.awayTeamId = ''
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
  manualMatchSaving.value = true
  try {
    const body: Record<string, unknown> = {
      homeTeamId: manualMatchForm.homeTeamId,
      awayTeamId: manualMatchForm.awayTeamId,
      startTime: manualMatchForm.startTime.toISOString(),
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
    await authFetch(apiUrl(`/tournaments/${props.tournamentId}/matches`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
      body,
    })
    manualMatchDialog.value = false
    await afterMutation()
    toast.add({
      severity: 'success',
      summary: 'Матч добавлен',
      life: 2500,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось создать матч',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
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
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
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
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
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

const allMatchesSorted = computed(() => {
  const list = effectiveTournament.value?.matches ?? []
  return [...list].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )
})

const openEditMatchDialog = async (m: MatchRow) => {
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
    await loadRefs(authFetch, apiUrl, token.value, tenantId.value)
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
  editMatchForm.matchStage = m.stage === 'PLAYOFF' ? 'PLAYOFF' : 'GROUP'
  editMatchSubmitAttempted.value = false
  editMatchDialog.value = true
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
  editMatchSaving.value = true
  try {
    const body: Record<string, unknown> = {
      startTime: editMatchForm.startTime.toISOString(),
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
    await authFetch(apiUrl(`/tournaments/${props.tournamentId}/matches/${editMatchForm.matchId}`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body,
    })
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
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    editMatchSaving.value = false
  }
}

const fetchStandalone = async () => {
  if (!token.value || !props.tournamentId) return
  loading.value = true
  try {
    const res = await authFetch<TournamentDetails>(apiUrl(`/tournaments/${props.tournamentId}`), {
      headers: { Authorization: `Bearer ${token.value}` },
    })
    localTournament.value = res
  } catch (e: unknown) {
    localTournament.value = null
    toast.add({
      severity: 'error',
      summary: 'Не удалось загрузить турнир',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    loading.value = false
  }
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

defineExpose({
  openManualMatchDialog,
})
</script>

<template>
  <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4">
    <div v-if="loading && !embedded" class="text-sm text-muted-color">Загрузка…</div>

    <template v-else-if="effectiveTournament">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">Все матчи</h2>
          <p class="mt-1 text-xs text-muted-color">
            Полный список по дате начала. Для MANUAL с несколькими группами группа матча обязательна: таблица и очки
            считаются только по матчам с нужным groupId, команды должны быть в этой группе на вкладке «Составы».
            Плей-офф для MANUAL не генерируется автоматически — матчи на вылет создаются вручную: в «Добавить матч»
            выберите стадию «Плей-офф». «Открепить» — матч в свободные на странице «Матчи».
          </p>
        </div>
        <Button
          v-if="canManageManualMatches"
          label="Добавить матч"
          icon="pi pi-plus"
          size="small"
          class="shrink-0"
          @click="openManualMatchDialog"
        />
      </div>

      <div v-if="!allMatchesSorted.length" class="mt-4 text-sm text-muted-color">
        Пока нет матчей.
      </div>

      <DataTable
        v-else
        :value="allMatchesSorted"
        dataKey="id"
        sortMode="single"
        sortField="startTime"
        :sortOrder="1"
        stripedRows
        class="mt-4"
      >
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
        <Column header="Действия" style="min-width: 18rem">
          <template #body="{ data }">
            <div class="flex flex-wrap items-center justify-end gap-1">
              <Button
                label="Протокол"
                icon="pi pi-pencil"
                text
                size="small"
                @click="onProtocolClick(data)"
              />
              <Button
                v-if="canEditMatchSchedule"
                label="Изменить"
                icon="pi pi-calendar"
                text
                size="small"
                :disabled="isMatchEditLocked(data.status)"
                @click="openEditMatchDialog(data)"
              />
              <Button
                v-if="canManageManualMatches"
                label="Открепить"
                icon="pi pi-unlock"
                text
                size="small"
                :disabled="isMatchEditLocked(data.status)"
                :loading="detachingMatchId === data.id"
                aria-label="Открепить от турнира"
                @click="requestDetachManualMatch(data)"
              />
              <Button
                v-if="canManageManualMatches"
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                :disabled="isMatchEditLocked(data.status)"
                :loading="deletingMatchId === data.id"
                aria-label="Удалить матч"
                @click="requestDeleteManualMatchWs(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </template>

    <div v-else-if="!loading" class="text-sm text-muted-color">Турнир не найден или нет доступа.</div>

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
              (manualMatchSubmitAttempted || manualMatchForm.homeTeamId) &&
              !!manualMatchErrors.homeTeamId
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
              (manualMatchSubmitAttempted || manualMatchForm.awayTeamId) &&
              (!!manualMatchErrors.awayTeamId || !!manualMatchErrors.distinctTeams)
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
                (editMatchSubmitAttempted || editMatchForm.homeTeamId) &&
                !!editMatchErrors.homeTeamId
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
                (editMatchSubmitAttempted || editMatchForm.awayTeamId) &&
                (!!editMatchErrors.awayTeamId || !!editMatchErrors.distinctTeams)
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

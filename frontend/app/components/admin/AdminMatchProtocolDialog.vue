<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import { usePlayoffSlotLabels } from '~/composables/usePlayoffSlotLabels'
import type { MatchEventRow, MatchRow, TournamentDetails } from '~/types/tournament-admin'
import type { TeamPlayerRow } from '~/types/admin/team'
import { getApiErrorMessage } from '~/utils/apiError'
import { mergeDateAndTime, splitStartTimeToDateAndTime } from '~/utils/matchDateTimeFields'
import { useMatchProtocolReferences } from '~/composables/useMatchProtocolReferences'
import { isMatchEditLocked, statusOptions } from '~/utils/tournamentAdminUi'
import { computed, reactive, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Режим матчей без турнира — PATCH на /tenants/.../standalone-matches/... */
    standalone?: boolean
    tournamentId?: string | null
    tournament: TournamentDetails | null
    match: MatchRow | null
  }>(),
  {
    standalone: false,
    tournamentId: null,
  },
)

const visible = defineModel<boolean>('visible', { default: false })

const emit = defineEmits<{
  saved: []
}>()

const { token, user, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()
const toast = useToast()

const {
  loadRefs,
  eventKindOptions,
  postponeReasonOptions,
  cancelReasonOptions,
  getEventKindKey,
  applyEventKindKey,
} = useMatchProtocolReferences()

const tournamentRef = computed(() => props.tournament)
const { playoffSlotLabels } = usePlayoffSlotLabels(tournamentRef)
const homeTeamLabel = computed(() => {
  if (!props.match) return 'Команда 1'
  return playoffSlotLabels(props.match)?.home ?? props.match.homeTeam.name
})
const awayTeamLabel = computed(() => {
  if (!props.match) return 'Команда 2'
  return playoffSlotLabels(props.match)?.away ?? props.match.awayTeam.name
})

const canOverrideLockedProtocol = computed(
  () => user.value?.role === 'TENANT_ADMIN',
)
const protocolLocked = computed(
  () =>
    !!props.match &&
    isMatchEditLocked(props.match.status) &&
    !canOverrideLockedProtocol.value,
)

const protocolSaving = ref(false)
const protocolSubmitAttempted = ref(false)
const protocolPlayersLoading = ref(false)
const protocolHomePlayers = ref<TeamPlayerRow[]>([])
const protocolAwayPlayers = ref<TeamPlayerRow[]>([])

const protocolHomePlayerOptions = computed(() =>
  protocolHomePlayers.value.map((tp) => ({
    label: `${tp.player.lastName} ${tp.player.firstName}`,
    value: tp.playerId,
  })),
)
const protocolAwayPlayerOptions = computed(() =>
  protocolAwayPlayers.value.map((tp) => ({
    label: `${tp.player.lastName} ${tp.player.firstName}`,
    value: tp.playerId,
  })),
)
const protocolPlayerOptions = computed(() => [
  ...protocolHomePlayers.value.map((tp) => ({
    label: `${tp.player.lastName} ${tp.player.firstName} (${homeTeamLabel.value})`,
    value: tp.playerId,
    side: 'HOME' as const,
  })),
  ...protocolAwayPlayers.value.map((tp) => ({
    label: `${tp.player.lastName} ${tp.player.firstName} (${awayTeamLabel.value})`,
    value: tp.playerId,
    side: 'AWAY' as const,
  })),
])
const sidePlayerOptions = (side: 'HOME' | 'AWAY' | null | undefined) =>
  side === 'HOME'
    ? protocolHomePlayerOptions.value
    : side === 'AWAY'
      ? protocolAwayPlayerOptions.value
      : []
const assistPlayerOptions = (row: (typeof protocolForm.events)[number]) =>
  sidePlayerOptions(row.teamSide).filter((opt) => opt.value !== row.playerId)
const resolvePlayerSide = (playerId: string): 'HOME' | 'AWAY' | null => {
  if (!playerId) return null
  const hit = protocolPlayerOptions.value.find((x) => x.value === playerId)
  return hit?.side ?? null
}

const protocolDate = ref<Date | null>(null)
const protocolTime = ref<Date | null>(null)

const protocolForm = reactive({
  startTime: null as Date | null,
  homeScore: 0,
  awayScore: 0,
  extraTimeHomeScore: null as number | null,
  extraTimeAwayScore: null as number | null,
  penaltiesHomeScore: null as number | null,
  penaltiesAwayScore: null as number | null,
  status: 'PLAYED',
  schedulePostponeReasonId: '' as string,
  scheduleCancelReasonId: '' as string,
  events: [] as {
    type: string
    minute: number | null
    playerId: string
    assistPlayerId?: string
    cardType?: 'YELLOW' | 'RED' | null
    substitutePlayerInId?: string
    note?: string
    teamSide: 'HOME' | 'AWAY' | null
    protocolEventTypeId?: string | null
    payload?: Record<string, unknown>
  }[],
})

const isPlayoffMatch = computed(() => props.match?.stage === 'PLAYOFF')
const showExtraTimeFields = ref(false)
const showPenaltyFields = ref(false)

const EXTRA_TIME_META = 'EXTRA_TIME_SCORE'
const PENALTIES_META = 'PENALTY_SCORE'
const cardTypeOptions = [
  { label: 'Желтая', value: 'YELLOW' },
  { label: 'Красная', value: 'RED' },
] as const

function normalizeCardType(raw: unknown): 'YELLOW' | 'RED' | null {
  const value = String(raw ?? '').trim().toLowerCase()
  if (!value) return null
  if (value.includes('yellow') || value.includes('желт')) return 'YELLOW'
  if (value.includes('red') || value.includes('крас')) return 'RED'
  return null
}

function extractEventAssistId(payload: Record<string, unknown> | undefined): string {
  return String(payload?.assistId ?? payload?.assistPlayerId ?? '').trim()
}

const loadPlayers = async (m: MatchRow) => {
  protocolPlayersLoading.value = true
  try {
    const [home, away] = await Promise.all([
      authFetch<{ items: TeamPlayerRow[]; total: number }>(
        apiUrl(`/tenants/${tenantId.value}/teams/${m.homeTeam.id}/players`),
        {
          headers: { Authorization: `Bearer ${token.value}` },
          params: { page: 1, pageSize: 200 },
        },
      ),
      authFetch<{ items: TeamPlayerRow[]; total: number }>(
        apiUrl(`/tenants/${tenantId.value}/teams/${m.awayTeam.id}/players`),
        {
          headers: { Authorization: `Bearer ${token.value}` },
          params: { page: 1, pageSize: 200 },
        },
      ),
    ])
    protocolHomePlayers.value = home.items
    protocolAwayPlayers.value = away.items
  } catch {
    protocolHomePlayers.value = []
    protocolAwayPlayers.value = []
  } finally {
    protocolPlayersLoading.value = false
  }
}

watch(
  () => [visible.value, props.match] as const,
  async ([open, m]) => {
    if (!open || !m) return
    protocolSubmitAttempted.value = false
    if (token.value) {
      await loadRefs(authFetch, apiUrl, token.value, tenantId.value)
    }
    protocolForm.schedulePostponeReasonId = ''
    protocolForm.scheduleCancelReasonId = ''
    protocolForm.startTime = m.startTime ? new Date(m.startTime) : null
    const sp = splitStartTimeToDateAndTime(protocolForm.startTime)
    protocolDate.value = sp.date
    protocolTime.value = sp.time
    protocolForm.homeScore = (m.homeScore ?? 0) as number
    protocolForm.awayScore = (m.awayScore ?? 0) as number
    protocolForm.status = (m.status ?? 'PLAYED') as string
    protocolForm.extraTimeHomeScore = null
    protocolForm.extraTimeAwayScore = null
    protocolForm.penaltiesHomeScore = null
    protocolForm.penaltiesAwayScore = null
    showExtraTimeFields.value = false
    showPenaltyFields.value = false
    protocolForm.events = []

    for (const e of (m.events ?? []) as MatchEventRow[]) {
      const payload = (e as { payload?: Record<string, unknown> }).payload
      const metaType = typeof payload?.metaType === 'string' ? payload.metaType : null
      if (metaType === EXTRA_TIME_META) {
        protocolForm.extraTimeHomeScore =
          typeof payload.homeScore === 'number' ? payload.homeScore : null
        protocolForm.extraTimeAwayScore =
          typeof payload.awayScore === 'number' ? payload.awayScore : null
        showExtraTimeFields.value = true
        continue
      }
      if (metaType === PENALTIES_META) {
        protocolForm.penaltiesHomeScore =
          typeof payload.homeScore === 'number' ? payload.homeScore : null
        protocolForm.penaltiesAwayScore =
          typeof payload.awayScore === 'number' ? payload.awayScore : null
        showPenaltyFields.value = true
        continue
      }

      protocolForm.events.push({
        type: e.type,
        minute: (e.minute ?? null) as number | null,
        playerId: (e.playerId ?? '') as string,
        assistPlayerId: extractEventAssistId(payload ?? undefined),
        cardType: e.type === 'CARD' ? normalizeCardType(payload?.cardType ?? payload?.color ?? payload?.cardColor) : null,
        substitutePlayerInId: String(payload?.playerInId ?? '').trim(),
        note: String(payload?.note ?? '').trim(),
        teamSide: (e.teamSide ?? null) as 'HOME' | 'AWAY' | null,
        protocolEventTypeId: (e as { protocolEventTypeId?: string | null }).protocolEventTypeId ?? null,
        payload: payload ?? undefined,
      })
    }
    await loadPlayers(m)
  },
)

watch([protocolDate, protocolTime], () => {
  protocolForm.startTime = mergeDateAndTime(protocolDate.value, protocolTime.value)
})

const protocolTimeChanged = computed(() => {
  const m = props.match
  if (!m) return false
  const desired =
    protocolForm.startTime instanceof Date ? protocolForm.startTime : null
  const current = m.startTime ? new Date(m.startTime) : null
  return !!(
    desired &&
    (!current || desired.getTime() !== current.getTime())
  )
})

const protocolBecomingCanceled = computed(() => {
  const m = props.match
  if (!m) return false
  return (
    protocolForm.status === 'CANCELED' &&
    m.status !== 'CANCELED'
  )
})
const protocolFormErrors = computed(() => ({
  schedulePostponeReasonId:
    protocolTimeChanged.value && !protocolForm.schedulePostponeReasonId
      ? 'Выберите причину переноса.'
      : '',
  scheduleCancelReasonId:
    protocolBecomingCanceled.value && !protocolForm.scheduleCancelReasonId
      ? 'Выберите причину отмены.'
      : '',
}))

const protocolEventErrors = computed(() =>
  protocolForm.events.map((e) => {
    if (!e.teamSide) return 'Укажите команду.'
    if (e.type === 'GOAL') {
      if (!e.playerId) return 'Укажите автора гола.'
      if (e.assistPlayerId && e.assistPlayerId === e.playerId) {
        return 'Автор гола и ассистент не могут совпадать.'
      }
    }
    if (e.type === 'CARD') {
      if (!e.playerId) return 'Укажите игрока.'
      if (!e.cardType) return 'Выберите тип карточки.'
    }
    if (e.type === 'SUBSTITUTION') {
      if (!e.playerId) return 'Укажите заменяемого игрока.'
      if (!e.substitutePlayerInId) return 'Укажите выходящего игрока.'
      if (e.substitutePlayerInId === e.playerId) return 'Игрок на замену должен быть другим.'
    }
    return ''
  }),
)

const hasProtocolEventErrors = computed(() => protocolEventErrors.value.some((x) => !!x))
const canSaveProtocol = computed(
  () =>
    !protocolFormErrors.value.schedulePostponeReasonId &&
    !protocolFormErrors.value.scheduleCancelReasonId &&
    !hasProtocolEventErrors.value &&
    !goalEventsScore.value.hasUnknownGoalSide &&
    !scoreVsGoalEventsMismatch.value,
)

const addEvent = () => {
  const last = protocolForm.events[protocolForm.events.length - 1]
  const suggestedMinute =
    typeof last?.minute === 'number' && Number.isFinite(last.minute)
      ? Math.max(0, Math.trunc(last.minute) + 1)
      : null
  protocolForm.events.push({
    type: 'GOAL',
    minute: suggestedMinute,
    playerId: '',
    assistPlayerId: '',
    cardType: null,
    substitutePlayerInId: '',
    note: '',
    teamSide: (last?.teamSide ?? 'HOME') as 'HOME' | 'AWAY',
    protocolEventTypeId: null,
  })
}

const addEventPreset = (
  preset: 'GOAL_HOME' | 'GOAL_AWAY' | 'YELLOW_CARD' | 'RED_CARD' | 'SUBSTITUTION' | 'CUSTOM',
) => {
  const last = protocolForm.events[protocolForm.events.length - 1]
  const fallbackSide = (last?.teamSide ?? 'HOME') as 'HOME' | 'AWAY'
  const byPreset = {
    GOAL_HOME: { type: 'GOAL', teamSide: 'HOME' as const, cardType: null },
    GOAL_AWAY: { type: 'GOAL', teamSide: 'AWAY' as const, cardType: null },
    YELLOW_CARD: { type: 'CARD', teamSide: fallbackSide, cardType: 'YELLOW' as const },
    RED_CARD: { type: 'CARD', teamSide: fallbackSide, cardType: 'RED' as const },
    SUBSTITUTION: { type: 'SUBSTITUTION', teamSide: fallbackSide, cardType: null },
    CUSTOM: { type: 'CUSTOM', teamSide: fallbackSide, cardType: null },
  }[preset]
  const suggestedMinute =
    typeof last?.minute === 'number' && Number.isFinite(last.minute)
      ? Math.max(0, Math.trunc(last.minute) + 1)
      : null
  protocolForm.events.push({
    type: byPreset.type,
    minute: suggestedMinute,
    playerId: '',
    assistPlayerId: '',
    cardType: byPreset.cardType,
    substitutePlayerInId: '',
    note: '',
    teamSide: byPreset.teamSide,
    protocolEventTypeId: null,
  })
}

const removeEvent = (idx: number) => {
  protocolForm.events.splice(idx, 1)
}

const onProtocolEventTeamSideChange = (row: (typeof protocolForm.events)[number]) => {
  row.playerId = ''
  row.assistPlayerId = ''
  row.substitutePlayerInId = ''
}
const onProtocolEventPlayerChange = (row: (typeof protocolForm.events)[number]) => {
  const selectedPlayerId = String(row.playerId ?? '').trim()
  const side = resolvePlayerSide(String(row.playerId ?? '').trim())
  if (!side) return
  if (row.teamSide !== side) {
    row.teamSide = side
    row.assistPlayerId = ''
    row.substitutePlayerInId = ''
  }
  if (row.assistPlayerId === selectedPlayerId) {
    row.assistPlayerId = ''
  }
}
const bumpEventMinute = (row: (typeof protocolForm.events)[number], delta: number) => {
  const base =
    typeof row.minute === 'number' && Number.isFinite(row.minute)
      ? Math.trunc(row.minute)
      : 0
  row.minute = Math.max(0, base + delta)
}
const setProtocolEventTeamSide = (
  row: (typeof protocolForm.events)[number],
  side: 'HOME' | 'AWAY',
) => {
  if (row.teamSide !== side) {
    row.teamSide = side
    onProtocolEventTeamSideChange(row)
  }
}
const teamSideLabel = (side: 'HOME' | 'AWAY' | null | undefined) =>
  side === 'HOME' ? homeTeamLabel.value : side === 'AWAY' ? awayTeamLabel.value : 'Не выбрано'

const presetGoalHomeLabel = computed(() => `Гол: ${homeTeamLabel.value}`)
const presetGoalAwayLabel = computed(() => `Гол: ${awayTeamLabel.value}`)

const onProtocolEventKindChange = (
  row: (typeof protocolForm.events)[number],
  v: unknown,
) => {
  if (typeof v !== 'string') return
  applyEventKindKey(row, v)
  if (row.type !== 'GOAL') row.assistPlayerId = ''
  if (row.type === 'CARD') {
    row.cardType = row.cardType ?? 'YELLOW'
  } else {
    row.cardType = null
  }
  if (row.type !== 'SUBSTITUTION') row.substitutePlayerInId = ''
  if (row.type !== 'CUSTOM') row.note = ''
}

const safeEventKindKey = (row: (typeof protocolForm.events)[number]) => {
  const key = getEventKindKey(row)
  return eventKindOptions.value.some((opt) => opt.value === key)
    ? key
    : `builtin:${row.type}`
}

const goalEventsScore = computed(() => {
  let home = 0
  let away = 0
  let hasGoalEvents = false
  let hasUnknownGoalSide = false
  for (const e of protocolForm.events) {
    if (e.type !== 'GOAL') continue
    hasGoalEvents = true
    if (e.teamSide === 'HOME') home += 1
    else if (e.teamSide === 'AWAY') away += 1
    else hasUnknownGoalSide = true
  }
  return { home, away, hasGoalEvents, hasUnknownGoalSide }
})

const scoreVsGoalEventsMismatch = computed(
  () =>
    goalEventsScore.value.hasGoalEvents &&
    !goalEventsScore.value.hasUnknownGoalSide &&
    (protocolForm.homeScore !== goalEventsScore.value.home ||
      protocolForm.awayScore !== goalEventsScore.value.away),
)

const applyScoreFromGoalEvents = () => {
  protocolForm.homeScore = goalEventsScore.value.home
  protocolForm.awayScore = goalEventsScore.value.away
}

const saveProtocol = async () => {
  if (!token.value || !props.match) return
  protocolSubmitAttempted.value = true
  if (protocolLocked.value) {
    toast.add({
      severity: 'info',
      summary: 'Матч завершён',
      detail: 'Протокол нельзя изменить.',
      life: 4000,
    })
    return
  }
  if (!canSaveProtocol.value) return
  protocolSaving.value = true
  try {
    const desiredStartTime = protocolForm.startTime instanceof Date ? protocolForm.startTime : null
    const currentStartTime = props.match.startTime ? new Date(props.match.startTime) : null
    const timeChanged =
      desiredStartTime &&
      (!currentStartTime || desiredStartTime.getTime() !== currentStartTime.getTime())

    if (timeChanged) {
      const patchBody: Record<string, unknown> = {
        startTime: desiredStartTime!.toISOString(),
      }
      if (protocolForm.schedulePostponeReasonId) {
        patchBody.scheduleChangeReasonId = protocolForm.schedulePostponeReasonId
      }
      if (!protocolForm.schedulePostponeReasonId) {
        throw new Error('Выберите причину переноса из справочника')
      }
      if (props.standalone) {
        await authFetch(
          apiUrl(`/tenants/${tenantId.value}/standalone-matches/${props.match.id}`),
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body: patchBody,
          },
        )
      } else if (props.tournamentId) {
        await authFetch(
          apiUrl(`/tournaments/${props.tournamentId}/matches/${props.match.id}`),
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body: patchBody,
          },
        )
      }
    }

    const protocolUrl = props.standalone
      ? apiUrl(`/tenants/${tenantId.value}/standalone-matches/${props.match.id}/protocol`)
      : apiUrl(`/tournaments/${props.tournamentId}/matches/${props.match.id}/protocol`)

    if (goalEventsScore.value.hasUnknownGoalSide) {
      throw new Error('Для каждого события "Гол" нужно указать команду.')
    }
    if (scoreVsGoalEventsMismatch.value) {
      throw new Error('Счёт не совпадает с количеством голов в протоколе.')
    }

    const eventsPayload = protocolForm.events.map((e) => {
      const basePayload = { ...(e.payload ?? {}) } as Record<string, unknown>
      if (e.type === 'GOAL') {
        delete basePayload.cardType
        delete basePayload.color
        delete basePayload.cardColor
        delete basePayload.playerInId
        delete basePayload.note
        const assistId = String(e.assistPlayerId ?? '').trim()
        if (assistId && assistId !== e.playerId) {
          basePayload.assistId = assistId
        } else {
          delete basePayload.assistId
          delete basePayload.assistPlayerId
        }
      } else if (e.type === 'CARD') {
        delete basePayload.assistId
        delete basePayload.assistPlayerId
        delete basePayload.playerInId
        delete basePayload.note
        basePayload.cardType = e.cardType ?? 'YELLOW'
      } else if (e.type === 'SUBSTITUTION') {
        delete basePayload.assistId
        delete basePayload.assistPlayerId
        delete basePayload.cardType
        delete basePayload.color
        delete basePayload.cardColor
        delete basePayload.note
        const playerInId = String(e.substitutePlayerInId ?? '').trim()
        if (playerInId && playerInId !== e.playerId) {
          basePayload.playerInId = playerInId
        } else {
          delete basePayload.playerInId
        }
      } else if (e.type === 'CUSTOM') {
        delete basePayload.assistId
        delete basePayload.assistPlayerId
        delete basePayload.cardType
        delete basePayload.color
        delete basePayload.cardColor
        delete basePayload.playerInId
        const note = String(e.note ?? '').trim()
        if (note) {
          basePayload.note = note
        } else {
          delete basePayload.note
        }
      } else {
        delete basePayload.assistId
        delete basePayload.assistPlayerId
        delete basePayload.cardType
        delete basePayload.color
        delete basePayload.cardColor
        delete basePayload.playerInId
        delete basePayload.note
      }
      return {
        type: e.type,
        minute: e.minute ?? undefined,
        playerId: e.playerId || undefined,
        teamSide: e.teamSide ?? undefined,
        payload: Object.keys(basePayload).length ? basePayload : undefined,
        ...(e.protocolEventTypeId ? { protocolEventTypeId: e.protocolEventTypeId } : {}),
      }
    })

    const protocolBody: Record<string, unknown> = {
      homeScore: protocolForm.homeScore,
      awayScore: protocolForm.awayScore,
      status: protocolForm.status,
      events: eventsPayload,
    }
    if (protocolBecomingCanceled.value) {
      if (!protocolForm.scheduleCancelReasonId) {
        throw new Error('Выберите причину отмены из справочника')
      }
      if (protocolForm.scheduleCancelReasonId) {
        protocolBody.scheduleChangeReasonId = protocolForm.scheduleCancelReasonId
      }
    }

    if (isPlayoffMatch.value) {
      if (
        protocolForm.extraTimeHomeScore !== null &&
        protocolForm.extraTimeAwayScore !== null
      ) {
        eventsPayload.push({
          type: 'CUSTOM',
          minute: undefined,
          playerId: undefined,
          teamSide: undefined,
          payload: {
            metaType: EXTRA_TIME_META,
            homeScore: protocolForm.extraTimeHomeScore,
            awayScore: protocolForm.extraTimeAwayScore,
          },
        })
      }
      if (
        protocolForm.penaltiesHomeScore !== null &&
        protocolForm.penaltiesAwayScore !== null
      ) {
        eventsPayload.push({
          type: 'CUSTOM',
          minute: undefined,
          playerId: undefined,
          teamSide: undefined,
          payload: {
            metaType: PENALTIES_META,
            homeScore: protocolForm.penaltiesHomeScore,
            awayScore: protocolForm.penaltiesAwayScore,
          },
        })
      }
    }

    await authFetch(protocolUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: protocolBody,
    })
    visible.value = false
    emit('saved')
    toast.add({
      severity: 'success',
      summary: 'Протокол сохранён',
      detail: props.standalone
        ? 'Результат матча сохранён.'
        : 'Результат матча обновлён, таблица пересчитана.',
      life: 3000,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить протокол',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    protocolSaving.value = false
  }
}

const finishProtocol = async () => {
  if (protocolLocked.value) return
  if (protocolForm.status !== 'FINISHED') protocolForm.status = 'FINISHED'
  await saveProtocol()
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="(v) => (visible = v)"
    modal
    :header="protocolLocked ? 'Протокол матча (только просмотр)' : 'Протокол матча'"
    :style="{ width: '44rem', maxWidth: '96vw' }"
  >
    <div v-if="match" class="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
      <p
        v-if="protocolLocked"
        class="text-sm text-muted-color rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/80 px-3 py-2"
      >
        Завершённый матч нельзя редактировать.
      </p>
      <p
        v-else-if="match && isMatchEditLocked(match.status) && canOverrideLockedProtocol"
        class="text-sm text-amber-700 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2"
      >
        Экстренный режим: администратор арендатора может изменить протокол завершённого матча.
      </p>
      <div class="text-sm">
        <span class="font-medium">
          {{ playoffSlotLabels(match)?.home ?? match.homeTeam.name }}
        </span>
        <span class="text-muted-color mx-1">
          {{ playoffSlotLabels(match) ? '-' : 'vs' }}
        </span>
        <span class="font-medium">
          {{ playoffSlotLabels(match)?.away ?? match.awayTeam.name }}
        </span>
        <span class="text-muted-color">
          · {{ new Date(match.startTime).toLocaleDateString() }}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm block mb-1">Счёт (хозяева)</label>
          <InputNumber
            v-model="protocolForm.homeScore"
            class="w-full"
            :min="0"
            :disabled="protocolLocked"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Счёт (гости)</label>
          <InputNumber
            v-model="protocolForm.awayScore"
            class="w-full"
            :min="0"
            :disabled="protocolLocked"
          />
        </div>
      </div>

      <div v-if="isPlayoffMatch" class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium">Дополнительное время</label>
          <Button
            v-if="!showExtraTimeFields"
            label="Добавить"
            icon="pi pi-plus"
            text
            size="small"
            :disabled="protocolLocked"
            @click="showExtraTimeFields = true"
          />
          <Button
            v-else
            label="Скрыть"
            icon="pi pi-times"
            text
            size="small"
            severity="secondary"
            :disabled="protocolLocked"
            @click="
              showExtraTimeFields = false;
              protocolForm.extraTimeHomeScore = null;
              protocolForm.extraTimeAwayScore = null
            "
          />
        </div>
      </div>
      <div v-if="isPlayoffMatch && showExtraTimeFields" class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm block mb-1">Доп. время (хозяева)</label>
          <InputNumber
            v-model="protocolForm.extraTimeHomeScore"
            class="w-full"
            :min="0"
            :disabled="protocolLocked"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Доп. время (гости)</label>
          <InputNumber
            v-model="protocolForm.extraTimeAwayScore"
            class="w-full"
            :min="0"
            :disabled="protocolLocked"
          />
        </div>
      </div>

      <div v-if="isPlayoffMatch" class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium">Серия пенальти</label>
          <Button
            v-if="!showPenaltyFields"
            label="Добавить"
            icon="pi pi-plus"
            text
            size="small"
            :disabled="protocolLocked"
            @click="showPenaltyFields = true"
          />
          <Button
            v-else
            label="Скрыть"
            icon="pi pi-times"
            text
            size="small"
            severity="secondary"
            :disabled="protocolLocked"
            @click="
              showPenaltyFields = false;
              protocolForm.penaltiesHomeScore = null;
              protocolForm.penaltiesAwayScore = null
            "
          />
        </div>
      </div>
      <div v-if="isPlayoffMatch && showPenaltyFields" class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm block mb-1">Пенальти (хозяева)</label>
          <InputNumber
            v-model="protocolForm.penaltiesHomeScore"
            class="w-full"
            :min="0"
            :disabled="protocolLocked"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Пенальти (гости)</label>
          <InputNumber
            v-model="protocolForm.penaltiesAwayScore"
            class="w-full"
            :min="0"
            :disabled="protocolLocked"
          />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="text-sm block mb-1">Дата матча</label>
          <DatePicker
            v-model="protocolDate"
            class="w-full"
            dateFormat="dd.mm.yy"
            showIcon
            :disabled="protocolLocked"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Время матча</label>
          <DatePicker
            v-model="protocolTime"
            class="w-full"
            timeOnly
            hourFormat="24"
            showIcon
            :disabled="protocolLocked"
          />
        </div>
      </div>

      <div
        v-if="!protocolLocked && protocolTimeChanged"
        class="rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50/80 dark:bg-surface-800/40 p-3 space-y-2"
      >
        <p class="text-xs text-muted-color">
          Время начала изменено — при необходимости укажите причину переноса (из справочника).
        </p>
        <div>
          <label class="text-sm block mb-1">Причина переноса</label>
          <Select
            v-model="protocolForm.schedulePostponeReasonId"
            :options="postponeReasonOptions"
            option-label="label"
            option-value="value"
            show-clear
            placeholder="Не выбрано"
            class="w-full"
            :invalid="protocolSubmitAttempted && !!protocolFormErrors.schedulePostponeReasonId"
          />
          <p
            v-if="protocolSubmitAttempted && protocolFormErrors.schedulePostponeReasonId"
            class="mt-0 text-[11px] leading-3 text-red-500"
          >
            {{ protocolFormErrors.schedulePostponeReasonId }}
          </p>
        </div>
      </div>

      <div>
        <label class="text-sm block mb-1">Статус</label>
        <Select
          v-model="protocolForm.status"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          :disabled="protocolLocked"
        />
      </div>

      <div
        v-if="!protocolLocked && protocolBecomingCanceled"
        class="rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50/80 dark:bg-surface-800/40 p-3 space-y-2"
      >
        <p class="text-xs text-muted-color">
          Матч переводится в «Отменён» — можно указать причину из справочника.
        </p>
        <div>
          <label class="text-sm block mb-1">Причина отмены</label>
          <Select
            v-model="protocolForm.scheduleCancelReasonId"
            :options="cancelReasonOptions"
            option-label="label"
            option-value="value"
            show-clear
            placeholder="Не выбрано"
            class="w-full"
            :invalid="protocolSubmitAttempted && !!protocolFormErrors.scheduleCancelReasonId"
          />
          <p
            v-if="protocolSubmitAttempted && protocolFormErrors.scheduleCancelReasonId"
            class="mt-0 text-[11px] leading-3 text-red-500"
          >
            {{ protocolFormErrors.scheduleCancelReasonId }}
          </p>
        </div>
      </div>

      <div>
        <div class="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <label class="text-sm font-medium">События</label>
          <div class="flex flex-wrap items-center gap-1.5">
            <Button
              :label="presetGoalHomeLabel"
              size="small"
              outlined
              severity="secondary"
              class="!px-2 !py-1 text-xs"
              :disabled="protocolLocked"
              @click="addEventPreset('GOAL_HOME')"
            />
            <Button
              :label="presetGoalAwayLabel"
              size="small"
              outlined
              severity="secondary"
              class="!px-2 !py-1 text-xs"
              :disabled="protocolLocked"
              @click="addEventPreset('GOAL_AWAY')"
            />
            <Button
              label="ЖК"
              size="small"
              outlined
              severity="secondary"
              class="!px-2 !py-1 text-xs"
              :disabled="protocolLocked"
              @click="addEventPreset('YELLOW_CARD')"
            />
            <Button
              label="КК"
              size="small"
              outlined
              severity="secondary"
              class="!px-2 !py-1 text-xs"
              :disabled="protocolLocked"
              @click="addEventPreset('RED_CARD')"
            />
            <Button
              label="Замена"
              size="small"
              outlined
              severity="secondary"
              class="!px-2 !py-1 text-xs"
              :disabled="protocolLocked"
              @click="addEventPreset('SUBSTITUTION')"
            />
            <Button
              label="Другое"
              size="small"
              outlined
              severity="secondary"
              class="!px-2 !py-1 text-xs"
              :disabled="protocolLocked"
              @click="addEventPreset('CUSTOM')"
            />
            <Button
              label="Добавить"
              icon="pi pi-plus"
              text
              size="small"
              :disabled="protocolLocked"
              @click="addEvent"
            />
          </div>
        </div>
        <div
          v-if="goalEventsScore.hasGoalEvents"
          class="mt-2 flex flex-wrap items-center gap-2 text-xs"
          :class="scoreVsGoalEventsMismatch || goalEventsScore.hasUnknownGoalSide ? 'text-amber-600' : 'text-emerald-600'"
        >
          <span>
            Голы по протоколу: {{ goalEventsScore.home }} : {{ goalEventsScore.away }}
          </span>
          <span v-if="goalEventsScore.hasUnknownGoalSide">
            (для части голов не указана команда)
          </span>
          <span v-if="scoreVsGoalEventsMismatch">
            (счёт {{ protocolForm.homeScore }} : {{ protocolForm.awayScore }} не совпадает)
          </span>
          <Button
            v-if="scoreVsGoalEventsMismatch && !protocolLocked"
            label="Принять счёт из голов"
            text
            size="small"
            class="!p-0 !text-xs"
            @click="applyScoreFromGoalEvents"
          />
        </div>

        <div v-if="!protocolForm.events.length" class="mt-2 text-sm text-muted-color">
          Пока нет событий.
        </div>

        <div v-else class="mt-2 space-y-2">
          <div
            v-for="(e, idx) in protocolForm.events"
            :key="idx"
            class="rounded-lg border border-surface-200 dark:border-surface-700 p-3"
          >
            <div class="mb-2 flex items-center justify-between text-[11px] text-muted-color">
              <span>Событие #{{ idx + 1 }}</span>
              <div class="flex items-center gap-1">
                <Button
                  label="-1'"
                  text
                  size="small"
                  class="!px-1.5 !py-0.5 !text-[11px]"
                  :disabled="protocolLocked"
                  @click="bumpEventMinute(e, -1)"
                />
                <Button
                  label="+1'"
                  text
                  size="small"
                  class="!px-1.5 !py-0.5 !text-[11px]"
                  :disabled="protocolLocked"
                  @click="bumpEventMinute(e, 1)"
                />
                <Button
                  label="+5'"
                  text
                  size="small"
                  class="!px-1.5 !py-0.5 !text-[11px]"
                  :disabled="protocolLocked"
                  @click="bumpEventMinute(e, 5)"
                />
              </div>
            </div>
            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <label class="text-xs block mb-1 text-muted-color">Тип события</label>
                <Select
                  :model-value="safeEventKindKey(e)"
                  :options="eventKindOptions"
                  option-label="label"
                  option-value="value"
                  class="w-full"
                  :disabled="protocolLocked"
                  @update:model-value="(v) => onProtocolEventKindChange(e, v)"
                />
              </div>
              <div>
                <label class="text-xs block mb-1 text-muted-color">Команда</label>
                <div class="grid grid-cols-2 gap-2">
                  <Button
                    :label="homeTeamLabel"
                    size="small"
                    :outlined="e.teamSide !== 'HOME'"
                    :severity="e.teamSide === 'HOME' ? 'primary' : 'secondary'"
                    class="!justify-center"
                    :disabled="protocolLocked"
                    @click="setProtocolEventTeamSide(e, 'HOME')"
                  />
                  <Button
                    :label="awayTeamLabel"
                    size="small"
                    :outlined="e.teamSide !== 'AWAY'"
                    :severity="e.teamSide === 'AWAY' ? 'primary' : 'secondary'"
                    class="!justify-center"
                    :disabled="protocolLocked"
                    @click="setProtocolEventTeamSide(e, 'AWAY')"
                  />
                </div>
              </div>
              <div>
                <label class="text-xs block mb-1 text-muted-color">Минута</label>
                <InputNumber v-model="e.minute" class="w-full" :min="0" :disabled="protocolLocked" />
              </div>
              <div>
                <label class="text-xs block mb-1 text-muted-color">Игрок</label>
                <Select
                  v-model="e.playerId"
                  :options="protocolPlayerOptions"
                  option-label="label"
                  option-value="value"
                  class="w-full"
                  placeholder="Выберите игрок (команда определится автоматически)"
                  :loading="protocolPlayersLoading"
                  :disabled="protocolLocked || protocolPlayersLoading"
                  @update:model-value="onProtocolEventPlayerChange(e)"
                />
              </div>
              <div v-if="e.type === 'GOAL'">
                <label class="text-xs block mb-1 text-muted-color">Ассист</label>
                <Select
                  v-model="e.assistPlayerId"
                  :options="assistPlayerOptions(e)"
                  option-label="label"
                  option-value="value"
                  class="w-full"
                  placeholder="Без ассиста"
                  show-clear
                  :loading="protocolPlayersLoading"
                  :disabled="protocolLocked || protocolPlayersLoading || !e.teamSide || !e.playerId"
                />
              </div>
              <div v-if="e.type === 'CARD'">
                <label class="text-xs block mb-1 text-muted-color">Тип карточки</label>
                <Select
                  v-model="e.cardType"
                  :options="cardTypeOptions"
                  option-label="label"
                  option-value="value"
                  class="w-full"
                  :disabled="protocolLocked"
                />
              </div>
              <div v-if="e.type === 'SUBSTITUTION'">
                <label class="text-xs block mb-1 text-muted-color">Игрок на замену</label>
                <Select
                  v-model="e.substitutePlayerInId"
                  :options="sidePlayerOptions(e.teamSide)"
                  option-label="label"
                  option-value="value"
                  class="w-full"
                  placeholder="Кто вышел"
                  :loading="protocolPlayersLoading"
                  :disabled="protocolLocked || protocolPlayersLoading || !e.teamSide"
                />
              </div>
              <div v-if="e.type === 'CUSTOM'" class="md:col-span-2">
                <label class="text-xs block mb-1 text-muted-color">Комментарий</label>
                <InputText
                  v-model="e.note"
                  class="w-full"
                  placeholder="Например: травма, спорный эпизод, тех. пометка"
                  :disabled="protocolLocked"
                />
              </div>
            </div>
            <p
              v-if="protocolSubmitAttempted && protocolEventErrors[idx]"
              class="mt-2 text-[11px] leading-4 text-red-500"
            >
              {{ protocolEventErrors[idx] }}
            </p>
            <p class="mt-1 text-[11px] leading-4 text-muted-color">
              Команда события: {{ teamSideLabel(e.teamSide) }}
            </p>
            <div class="mt-2 flex justify-end">
              <Button
                label="Удалить"
                icon="pi pi-trash"
                text
                severity="danger"
                size="small"
                :disabled="protocolLocked"
                @click="removeEvent(idx)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button label="Закрыть" text @click="visible = false" />
        <Button
          v-if="!protocolLocked"
          label="Сохранить"
          icon="pi pi-check"
          :loading="protocolSaving"
          :disabled="protocolSubmitAttempted && !canSaveProtocol"
          @click="saveProtocol"
        />
        <Button
          v-if="!protocolLocked"
          label="Завершить"
          icon="pi pi-check-circle"
          severity="success"
          :loading="protocolSaving"
          :disabled="protocolForm.status === 'CANCELED' || protocolForm.status === 'FINISHED' || (protocolSubmitAttempted && !canSaveProtocol)"
          @click="finishProtocol"
        />
      </div>
    </template>
  </Dialog>
</template>

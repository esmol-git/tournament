import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as Haptics from 'expo-haptics'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  getErrorMessage,
  getTournamentDetail,
  loadProtocolRoster,
  updateTournamentMatchProtocol,
  type ProtocolRoster,
  type ProtocolRosterPlayer,
  type UpdateMatchProtocolBody,
} from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { canEditMatchProtocol } from '../../auth/roleLabels'
import { AppNotice } from '../../components/ui/AppNotice'
import { EmptyState } from '../../components/ui/EmptyState'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import type { MatchProtocolRouteParams } from '../../navigation/types'
import type { TournamentMatchRow } from '../../types/tournament'
import {
  buildProtocolEventsPayload,
  countGoalsFromDrafts,
  createEmptyDraft,
  draftsToProtocolTimelineEvents,
  hasGoalEvents,
  parseEventsFromMatch,
  type ProtocolEventDraft,
  validateDraftsBeforeSave,
} from '../../utils/matchProtocolPayload'
import {
  buildProtocolPlayerTimelineMapsForPicker,
  isProtocolPlayerSelectableAtMinute,
  parseProtocolMinute,
} from '../../../../shared/protocol/playerTimeline'
import {
  buildPlayerPreviewMapFromEvents,
  formatProtocolEventLineForDisplay,
  resolvePlayerDisplayName,
  summarizeDraftForDisplay,
} from '../../utils/protocolPlayerNames'
import { formatDateTime } from '../../utils/formatDate'
import { matchStatusLabel } from '../../utils/tournamentLabels'
import { createMatchProtocolStyles } from '../../theme/matchProtocolStyles'
import { useTheme } from '../../theme/ThemeContext'

type Props = NativeStackScreenProps<{ MatchProtocol: MatchProtocolRouteParams }, 'MatchProtocol'>

const EDITABLE_STATUSES = ['SCHEDULED', 'LIVE', 'PLAYED', 'FINISHED'] as const
type EditableStatus = (typeof EDITABLE_STATUSES)[number]

type ProtocolFormBaseline = {
  homeScoreStr: string
  awayScoreStr: string
  status: string
  draftEvents: ProtocolEventDraft[]
  extraTime: { home: string; away: string }
  penalty: { home: string; away: string }
}

function draftsEqual(a: ProtocolEventDraft[], b: ProtocolEventDraft[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

const MINUTE_UI_MAX = 200

function clampProtocolMinute(n: number): number {
  return Math.max(0, Math.min(MINUTE_UI_MAX, Math.round(n)))
}

function parseMinuteUi(s: string): number {
  const n = parseInt(s.replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? clampProtocolMinute(n) : 0
}

function parseScore(s: string): number {
  const n = parseInt(s.replace(/\D/g, ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function MatchProtocolScreen({ route, navigation }: Props) {
  const { tournamentId, matchId } = route.params
  const { colors } = useTheme()
  const { user, tenant } = useAuth()
  const [match, setMatch] = useState<TournamentMatchRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [homeScoreStr, setHomeScoreStr] = useState('0')
  const [awayScoreStr, setAwayScoreStr] = useState('0')
  const [status, setStatus] = useState<EditableStatus | string>('SCHEDULED')

  const [roster, setRoster] = useState<ProtocolRoster | null>(null)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [eventsEditorEnabled, setEventsEditorEnabled] = useState(false)

  const [draftEvents, setDraftEvents] = useState<ProtocolEventDraft[]>([])
  const [extraTime, setExtraTime] = useState({ home: '', away: '' })
  const [penalty, setPenalty] = useState({ home: '', away: '' })

  const [editorVisible, setEditorVisible] = useState(false)
  const [editorDraft, setEditorDraft] = useState<ProtocolEventDraft | null>(null)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerOptions, setPickerOptions] = useState<(ProtocolRosterPlayer & { disabled?: boolean })[]>([])
  const [pickerField, setPickerField] = useState<'playerId' | 'assistPlayerId' | 'substitutePlayerInId' | null>(null)
  const [pickerTeamSide, setPickerTeamSide] = useState<'HOME' | 'AWAY' | null>(null)

  /** «Матч» — счёт, статус, события; «Заявка» — длинные списки составов отдельно. */
  const [protocolTab, setProtocolTab] = useState<'match' | 'roster'>('match')

  /**
   * После успешного сохранения или «Выйти без сохранения» вызывается навигация назад.
   * Иначе снова сработает beforeRemove, isDirty всё ещё true → preventDefault → выйти нельзя.
   */
  const allowExitWithoutDirtyPromptRef = useRef(false)

  const [protocolBaseline, setProtocolBaseline] = useState<ProtocolFormBaseline | null>(null)

  const eventPlayerPreviewMap = useMemo(
    () => buildPlayerPreviewMapFromEvents(match?.events),
    [match?.events],
  )

  const load = useCallback(async () => {
    if (!user || !tenant) return
    setError(null)
    setLoading(true)
    setRosterError(null)
    setEventsEditorEnabled(false)
    setRoster(null)
    setProtocolBaseline(null)
    try {
      const d = await getTournamentDetail({
        tournamentId,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        role: user.role,
        matchesLimit: 200,
      })
      const m = d.matches?.find((x) => x.id === matchId) ?? null
      setMatch(m)
      if (m) {
        const st = m.status
        let editableStatus: EditableStatus = 'SCHEDULED'
        if (EDITABLE_STATUSES.includes(st as EditableStatus)) {
          editableStatus = st as EditableStatus
        }
        setStatus(editableStatus)

        const r = await loadProtocolRoster({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          role: user.role,
          tournamentId,
          homeTeamId: m.homeTeam?.id,
          awayTeamId: m.awayTeam?.id,
          tournamentPublished: d.published,
        })
        setRosterError(r.error)
        if (r.roster) {
          setRoster(r.roster)
          setEventsEditorEnabled(true)
          const parsed = parseEventsFromMatch(m.events)
          setDraftEvents(parsed.drafts)
          setExtraTime(parsed.extraTime)
          setPenalty(parsed.penalty)
          let homeStr = String(m.homeScore ?? 0)
          let awayStr = String(m.awayScore ?? 0)
          if (hasGoalEvents(parsed.drafts)) {
            const c = countGoalsFromDrafts(parsed.drafts)
            homeStr = String(c.home)
            awayStr = String(c.away)
          }
          setHomeScoreStr(homeStr)
          setAwayScoreStr(awayStr)
          setProtocolBaseline({
            homeScoreStr: homeStr,
            awayScoreStr: awayStr,
            status: editableStatus,
            draftEvents: parsed.drafts.map((row) => ({ ...row })),
            extraTime: { ...parsed.extraTime },
            penalty: { ...parsed.penalty },
          })
        } else {
          setDraftEvents([])
          setExtraTime({ home: '', away: '' })
          setPenalty({ home: '', away: '' })
          setHomeScoreStr(String(m.homeScore ?? 0))
          setAwayScoreStr(String(m.awayScore ?? 0))
          setProtocolBaseline({
            homeScoreStr: String(m.homeScore ?? 0),
            awayScoreStr: String(m.awayScore ?? 0),
            status: editableStatus,
            draftEvents: [],
            extraTime: { home: '', away: '' },
            penalty: { home: '', away: '' },
          })
        }
      }
    } catch (e) {
      setError(getErrorMessage(e))
      setMatch(null)
    } finally {
      setLoading(false)
    }
  }, [user, tenant, tournamentId, matchId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setProtocolTab('match')
  }, [matchId])

  useEffect(() => {
    if (!hasGoalEvents(draftEvents)) return
    const c = countGoalsFromDrafts(draftEvents)
    setHomeScoreStr(String(c.home))
    setAwayScoreStr(String(c.away))
  }, [draftEvents])

  useLayoutEffect(() => {
    const title = match
      ? `${match.homeTeam?.name ?? '—'} — ${match.awayTeam?.name ?? '—'}`
      : 'Протокол'
    navigation.setOptions({ title: title.length > 34 ? `${title.slice(0, 31)}…` : title })
  }, [navigation, match])

  const styles = useMemo(() => createMatchProtocolStyles(colors), [colors])

  const locked =
    match &&
    (match.status === 'FINISHED' || match.status === 'PLAYED' || match.status === 'CANCELED')

  const canEdit =
    user &&
    tenant &&
    canEditMatchProtocol(user.role) &&
    match &&
    match.status !== 'CANCELED'

  const isPlayoff = match?.stage === 'PLAYOFF'

  const homeName = match?.homeTeam?.name ?? 'Хозяева'
  const awayName = match?.awayTeam?.name ?? 'Гости'

  const isDirty = useMemo(() => {
    if (!protocolBaseline || !match || !user || !tenant) return false
    if (!canEditMatchProtocol(user.role) || match.status === 'CANCELED') return false
    const b = protocolBaseline
    return (
      b.homeScoreStr !== homeScoreStr ||
      b.awayScoreStr !== awayScoreStr ||
      b.status !== status ||
      !draftsEqual(b.draftEvents, draftEvents) ||
      b.extraTime.home !== extraTime.home ||
      b.extraTime.away !== extraTime.away ||
      b.penalty.home !== penalty.home ||
      b.penalty.away !== penalty.away
    )
  }, [
    protocolBaseline,
    match,
    user,
    tenant,
    homeScoreStr,
    awayScoreStr,
    status,
    draftEvents,
    extraTime,
    penalty,
  ])

  const openPicker = (field: typeof pickerField, side: 'HOME' | 'AWAY') => {
    if (!roster || !field || !editorDraft) return
    Keyboard.dismiss()
    let opts = side === 'HOME' ? roster.home : roster.away
    if (field === 'assistPlayerId' && editorDraft.playerId?.trim()) {
      opts = opts.filter((p) => p.playerId !== editorDraft.playerId)
    }
    if (field === 'substitutePlayerInId' && editorDraft.playerId?.trim()) {
      opts = opts.filter((p) => p.playerId !== editorDraft.playerId)
    }
    const timeline = draftsToProtocolTimelineEvents(
      draftEvents.filter((e) => e.key !== editorDraft.key),
    )
    const maps = buildProtocolPlayerTimelineMapsForPicker(timeline)
    const E = parseProtocolMinute(editorDraft.minute)
    const allowId =
      field === 'playerId'
        ? editorDraft.playerId
        : field === 'assistPlayerId'
          ? editorDraft.assistPlayerId
          : editorDraft.substitutePlayerInId
    opts = opts.map((p) => ({
      ...p,
      disabled: !isProtocolPlayerSelectableAtMinute(p.playerId, E, maps, { allowPlayerId: allowId }),
    }))
    setPickerField(field)
    setPickerOptions(opts)
    setPickerTeamSide(side)
    setPickerVisible(true)
  }

  const closePicker = () => {
    setPickerVisible(false)
    setPickerField(null)
    setPickerTeamSide(null)
  }

  const applyPicker = (playerId: string, rowDisabled?: boolean) => {
    if (!editorDraft || !pickerField || rowDisabled) return
    setEditorDraft((d) => {
      if (!d) return d
      if (pickerField === 'playerId') return { ...d, playerId }
      if (pickerField === 'assistPlayerId') return { ...d, assistPlayerId: playerId }
      return { ...d, substitutePlayerInId: playerId }
    })
    closePicker()
  }

  function openNewEvent() {
    setEditorDraft(createEmptyDraft('GOAL'))
    setEditorVisible(true)
  }

  function openEditEvent(row: ProtocolEventDraft) {
    setEditorDraft({
      ...row,
      teamSide: row.teamSide ?? (row.type === 'CUSTOM' ? null : 'HOME'),
    })
    setEditorVisible(true)
  }

  function saveEditor() {
    if (!editorDraft) return
    const mergedDrafts = (() => {
      const idx = draftEvents.findIndex((x) => x.key === editorDraft.key)
      if (idx >= 0) {
        const next = [...draftEvents]
        next[idx] = editorDraft
        return next
      }
      return [...draftEvents, editorDraft]
    })()
    const v = validateDraftsBeforeSave(mergedDrafts)
    if (v) {
      setError(v)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      return
    }
    setError(null)
    setDraftEvents(mergedDrafts)
    setEditorVisible(false)
    setEditorDraft(null)
  }

  function removeEvent(key: string) {
    setDraftEvents((prev) => prev.filter((x) => x.key !== key))
  }

  const bumpEditorMinute = useCallback((delta: number) => {
    setEditorDraft((d) => {
      if (!d) return d
      const next = clampProtocolMinute(parseMinuteUi(d.minute) + delta)
      return { ...d, minute: String(next) }
    })
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [])

  const onSave = useCallback(async (): Promise<boolean> => {
    if (!match || !user || !canEdit) return false
    setSaving(true)
    setError(null)
    try {
      const draftErr = eventsEditorEnabled ? validateDraftsBeforeSave(draftEvents) : null
      if (draftErr) {
        setError(draftErr)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        return false
      }

      let homeScore = parseScore(homeScoreStr)
      let awayScore = parseScore(awayScoreStr)
      if (eventsEditorEnabled && hasGoalEvents(draftEvents)) {
        const c = countGoalsFromDrafts(draftEvents)
        homeScore = c.home
        awayScore = c.away
      }

      if (isPlayoff && homeScore === awayScore) {
        const ph = parseInt(penalty.home.replace(/\D/g, ''), 10)
        const pa = parseInt(penalty.away.replace(/\D/g, ''), 10)
        const okPen =
          Number.isFinite(ph) && Number.isFinite(pa) && ph >= 0 && pa >= 0 && ph !== pa
        if (!okPen) {
          setError('В плей-офф при ничьей основного времени укажите разный счёт в серии пенальти.')
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
          return false
        }
      }

      const payload: UpdateMatchProtocolBody = {
        homeScore,
        awayScore,
        status: status as UpdateMatchProtocolBody['status'],
      }

      if (eventsEditorEnabled) {
        payload.events = buildProtocolEventsPayload(draftEvents, {
          isPlayoff,
          extraTime,
          penalty,
        })
      }

      let lastErr: unknown
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await updateTournamentMatchProtocol(tournamentId, matchId, payload)
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          allowExitWithoutDirtyPromptRef.current = true
          navigation.goBack()
          return true
        } catch (e) {
          lastErr = e
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 450))
          }
        }
      }
      setError(getErrorMessage(lastErr))
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return false
    } finally {
      setSaving(false)
    }
  }, [
    match,
    user,
    canEdit,
    eventsEditorEnabled,
    draftEvents,
    homeScoreStr,
    awayScoreStr,
    status,
    isPlayoff,
    penalty,
    extraTime,
    tournamentId,
    matchId,
    navigation,
  ])

  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (allowExitWithoutDirtyPromptRef.current) {
        allowExitWithoutDirtyPromptRef.current = false
        return
      }
      if (!isDirty) return
      e.preventDefault()
      Alert.alert(
        'Несохранённые изменения',
        'Протокол изменён. Сохранить перед выходом или выйти без сохранения?',
        [
          { text: 'Продолжить правку', style: 'cancel' },
          {
            text: 'Выйти без сохранения',
            style: 'destructive',
            onPress: () => {
              allowExitWithoutDirtyPromptRef.current = true
              navigation.dispatch(e.data.action)
            },
          },
          {
            text: 'Сохранить',
            onPress: () => {
              void (async () => {
                await onSave()
              })()
            },
          },
        ],
      )
    })
    return sub
  }, [navigation, isDirty, onSave])

  if (!user || !tenant) return null

  if (loading && !match) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    )
  }

  if (!match) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.emptyMatchWrap}>
          <EmptyState
            icon="alert-circle-outline"
            title="Матч недоступен"
            description={
              error ??
              'Матч не найден в турнире, удалён или у вас нет доступа к нему с текущей ролью.'
            }
            actionLabel="Повторить"
            onAction={() => void load()}
          />
          <View style={styles.emptyMatchBack}>
            <PrimaryButton label="Назад" variant="outline" onPress={() => navigation.goBack()} />
          </View>
        </View>
      </SafeAreaView>
    )
  }

  const readOnly = !canEdit
  const scoreFromGoalEvents = eventsEditorEnabled && hasGoalEvents(draftEvents)
  const hasRosterList = Boolean(roster && (roster.home.length > 0 || roster.away.length > 0))
  const rosterPlayerCount = roster ? roster.home.length + roster.away.length : 0
  const showRosterLoadError = !eventsEditorEnabled && Boolean(rosterError)
  const showRosterEmptySquads =
    Boolean(eventsEditorEnabled && roster && roster.home.length === 0 && roster.away.length === 0)

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          nestedScrollEnabled
        >
          <View style={styles.matchHeader}>
            <Text style={styles.time}>{formatDateTime(match.startTime)}</Text>
            <Text style={styles.teams}>
              {match.homeTeam?.name ?? '—'} — {match.awayTeam?.name ?? '—'}
            </Text>
          </View>
          {locked ? (
            <AppNotice variant="warning" style={styles.noticeBlock}>
              {`Матч в статусе «${matchStatusLabel(match.status)}». Правка может быть ограничена; при ошибке сохранения используйте веб-админку.`}
            </AppNotice>
          ) : null}
          {readOnly ? (
            <AppNotice variant="info" style={styles.noticeBlock}>
              {match.status === 'CANCELED'
                ? 'Отменённые матчи в приложении не редактируются.'
                : 'Режим просмотра: внести протокол могут администраторы, модераторы турнира и судьи. При необходимости используйте веб-админку.'}
            </AppNotice>
          ) : null}
          {!readOnly && user.role === 'REFEREE' ? (
            <AppNotice variant="info" style={styles.noticeBlock}>
              Роль «Судья»: проверьте статус матча, события и счёт перед сохранением — после отправки исправления возможны только через организаторов.
            </AppNotice>
          ) : null}

          <View style={styles.protocolTabBar}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: protocolTab === 'match' }}
              onPress={() => {
                setProtocolTab('match')
                void Haptics.selectionAsync()
              }}
              style={[styles.protocolTab, protocolTab === 'match' && styles.protocolTabActive]}
            >
              <Text style={[styles.protocolTabText, protocolTab === 'match' && styles.protocolTabTextActive]}>
                Матч
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: protocolTab === 'roster' }}
              onPress={() => {
                setProtocolTab('roster')
                void Haptics.selectionAsync()
              }}
              style={[styles.protocolTab, protocolTab === 'roster' && styles.protocolTabActive]}
            >
              <Text style={[styles.protocolTabText, protocolTab === 'roster' && styles.protocolTabTextActive]}>
                {rosterPlayerCount > 0 ? `Заявка (${rosterPlayerCount})` : 'Заявка'}
              </Text>
            </Pressable>
          </View>

          {protocolTab === 'match' ? (
            <>
          <View style={styles.scoreBoard}>
            {scoreFromGoalEvents ? (
              <View style={styles.scoreAutoPill}>
                <Ionicons name="football-outline" size={15} color={colors.accent} />
                <Text style={styles.scoreAutoPillText}>Счёт по событиям</Text>
              </View>
            ) : null}
            <View style={styles.scoreBoardRow}>
              <View style={styles.scoreTeamCol}>
                <Text style={styles.scoreLabel}>Хозяева</Text>
                <TextInput
                  style={[styles.scoreInput, scoreFromGoalEvents && styles.scoreInputMuted]}
                  keyboardType="number-pad"
                  editable={!readOnly && !scoreFromGoalEvents}
                  value={homeScoreStr}
                  onChangeText={setHomeScoreStr}
                />
              </View>
              <Text style={styles.colon}>:</Text>
              <View style={styles.scoreTeamCol}>
                <Text style={styles.scoreLabel}>Гости</Text>
                <TextInput
                  style={[styles.scoreInput, scoreFromGoalEvents && styles.scoreInputMuted]}
                  keyboardType="number-pad"
                  editable={!readOnly && !scoreFromGoalEvents}
                  value={awayScoreStr}
                  onChangeText={setAwayScoreStr}
                />
              </View>
            </View>
            {scoreFromGoalEvents ? (
              <Text style={styles.scoreFootnote}>
                Числа в табло берутся из голов в разделе «События» ниже — измените их там или удалите гол.
              </Text>
            ) : null}
          </View>
          <Text style={styles.label}>Статус матча</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chips}
          >
            {EDITABLE_STATUSES.map((s) => (
              <Pressable
                key={s}
                onPress={() => !readOnly && setStatus(s)}
                style={[
                  styles.chip,
                  status === s && styles.chipActive,
                  readOnly && styles.chipDisabled,
                ]}
              >
                <Text style={[styles.chipText, status === s && styles.chipTextActive]}>
                  {matchStatusLabel(s)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {showRosterLoadError ? (
            <AppNotice variant="warning" style={styles.noticeBlock}>
              {rosterError}
            </AppNotice>
          ) : null}
          {showRosterEmptySquads ? (
            <AppNotice variant="info" style={styles.noticeBlock}>
              В составах нет игроков — доступны только текстовые заметки и служебные поля плей-офф.
            </AppNotice>
          ) : null}

            </>
          ) : (
            <>
              <Text style={styles.rosterTabHint}>
                Списки игроков в заявке — для ориентира и выбора в событиях. Сохранение протокола — во вкладке «Матч».
              </Text>
              {showRosterLoadError ? (
                <AppNotice variant="warning" style={styles.noticeBlock}>
                  {rosterError}
                </AppNotice>
              ) : null}
              {showRosterEmptySquads ? (
                <AppNotice variant="info" style={styles.noticeBlock}>
                  В составах нет игроков — доступны только текстовые заметки и служебные поля плей-офф.
                </AppNotice>
              ) : null}
              {hasRosterList && roster ? (
                <View style={styles.rosterSection}>
                  <Text style={styles.rosterSectionTitle}>Составы</Text>
                  <Text style={styles.rosterSectionSub}>
                    При добавлении событий во вкладке «Матч» выбирайте игрока из списка своей команды.
                  </Text>
                  {roster.home.length > 0 ? (
                    <View style={[styles.rosterTeamCard, styles.rosterTeamCardFirst]}>
                      <Text style={styles.rosterSideLabel}>{homeName}</Text>
                      {roster.home.map((p, i) => (
                        <View
                          key={p.playerId}
                          style={[styles.rosterPlayerRow, i === roster.home.length - 1 && styles.rosterPlayerRowLast]}
                        >
                          <View style={styles.rosterBullet} />
                          <Text style={styles.rosterLine}>{p.label}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {roster.away.length > 0 ? (
                    <View style={[styles.rosterTeamCard, roster.home.length === 0 && styles.rosterTeamCardFirst]}>
                      <Text style={[styles.rosterSideLabel, styles.rosterSideSpacer]}>{awayName}</Text>
                      {roster.away.map((p, i) => (
                        <View
                          key={p.playerId}
                          style={[styles.rosterPlayerRow, i === roster.away.length - 1 && styles.rosterPlayerRowLast]}
                        >
                          <View style={styles.rosterBullet} />
                          <Text style={styles.rosterLine}>{p.label}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : !showRosterLoadError && !showRosterEmptySquads ? (
                <Text style={styles.eventsEmpty}>Состав для этого матча пока не загружен.</Text>
              ) : null}
            </>
          )}

          {protocolTab === 'match' && eventsEditorEnabled && !readOnly ? (
            <View style={styles.eventsSection}>
              <Text style={styles.eventsTitle}>События</Text>
              <Text style={styles.eventsSub}>
                Голы, карточки и замены попадают в протокол; счёт при наличии голов считается по ним.
              </Text>
              {draftEvents.length === 0 ? (
                <Text style={styles.eventsEmpty}>Пока нет событий</Text>
              ) : (
                draftEvents.map((ev) => (
                  <View key={ev.key} style={styles.evRow}>
                    <Pressable style={styles.evMain} onPress={() => openEditEvent(ev)}>
                      <Text style={styles.evText}>
                        {summarizeDraftForDisplay(ev, roster, homeName, awayName, eventPlayerPreviewMap)}
                      </Text>
                      <Text style={styles.evType}>{ev.type}</Text>
                    </Pressable>
                    <Pressable style={styles.evDel} onPress={() => removeEvent(ev.key)}>
                      <Text style={styles.evDelText}>✕</Text>
                    </Pressable>
                  </View>
                ))
              )}
              <Pressable style={styles.addEvBtn} onPress={openNewEvent}>
                <Text style={styles.addEvBtnText}>+ Добавить событие</Text>
              </Pressable>
            </View>
          ) : protocolTab === 'match' && !eventsEditorEnabled && match.events && match.events.length > 0 ? (
            <View style={styles.events}>
              <Text style={styles.eventsTitle}>События в протоколе</Text>
              <Text style={styles.eventsHint}>
                Редактирование событий недоступно (нет состава). Счёт и статус можно сохранить.
              </Text>
              {match.events.map((ev) => {
                const line = formatProtocolEventLineForDisplay(
                  ev,
                  roster,
                  eventPlayerPreviewMap,
                  homeName,
                  awayName,
                )
                if (!line) return null
                return (
                  <Text key={ev.id} style={styles.evLine}>
                    {line}
                  </Text>
                )
              })}
            </View>
          ) : null}

          {protocolTab === 'match' && isPlayoff && eventsEditorEnabled && !readOnly ? (
            <View style={styles.playoffBox}>
              <Text style={styles.playoffTitle}>Плей-офф</Text>
              <Text style={styles.playoffHint}>
                При ничьей в основное время укажите счёт пенальти (разный). Доп. время — по желанию.
              </Text>
              <Text style={styles.miniLabel}>Доп. время (счёт)</Text>
              <View style={styles.row}>
                <TextInput
                  style={styles.smallInput}
                  keyboardType="number-pad"
                  placeholder="Х"
                  value={extraTime.home}
                  onChangeText={(t) => setExtraTime((x) => ({ ...x, home: t }))}
                />
                <Text style={styles.colonSmall}>:</Text>
                <TextInput
                  style={styles.smallInput}
                  keyboardType="number-pad"
                  placeholder="Г"
                  value={extraTime.away}
                  onChangeText={(t) => setExtraTime((x) => ({ ...x, away: t }))}
                />
              </View>
              <Text style={styles.miniLabel}>Серия пенальти</Text>
              <View style={styles.row}>
                <TextInput
                  style={styles.smallInput}
                  keyboardType="number-pad"
                  placeholder="Х"
                  value={penalty.home}
                  onChangeText={(t) => setPenalty((x) => ({ ...x, home: t }))}
                />
                <Text style={styles.colonSmall}>:</Text>
                <TextInput
                  style={styles.smallInput}
                  keyboardType="number-pad"
                  placeholder="Г"
                  value={penalty.away}
                  onChangeText={(t) => setPenalty((x) => ({ ...x, away: t }))}
                />
              </View>
            </View>
          ) : null}

          {error ? (
            <AppNotice variant="error" style={styles.noticeBlock} onDismiss={() => setError(null)}>
              {error}
            </AppNotice>
          ) : null}
          {!readOnly ? (
            <PrimaryButton label="Сохранить протокол" onPress={() => void onSave()} loading={saving} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={editorVisible}
        animationType="slide"
        transparent
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => {
          setEditorVisible(false)
          setEditorDraft(null)
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalKeyboardRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalBackdrop}>
            <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.modalSheetSafe}>
              <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Событие</Text>
            {editorDraft ? (
              <ScrollView keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag">
                <Text style={styles.miniLabel}>Тип</Text>
                <View style={styles.chips}>
                  {(
                    [
                      ['GOAL', 'Гол'],
                      ['CARD', 'Карточка'],
                      ['SUBSTITUTION', 'Замена'],
                      ['CUSTOM', 'Заметка'],
                    ] as const
                  ).map(([val, label]) => (
                    <Pressable
                      key={val}
                      onPress={() => setEditorDraft({ ...createEmptyDraft(val), key: editorDraft.key })}
                      style={[styles.chip, editorDraft.type === val && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, editorDraft.type === val && styles.chipTextActive]}>
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {editorDraft.type !== 'CUSTOM' ? (
                  <>
                    <Text style={styles.miniLabel}>Команда</Text>
                    <View style={styles.teamChipsRow}>
                      {(['HOME', 'AWAY'] as const).map((s) => (
                        <Pressable
                          key={s}
                          onPress={() =>
                            setEditorDraft((d) => {
                              if (!d) return d
                              if (d.teamSide === s) return d
                              return {
                                ...d,
                                teamSide: s,
                                playerId: '',
                                assistPlayerId: '',
                                substitutePlayerInId: '',
                              }
                            })
                          }
                          style={[
                            styles.chip,
                            styles.teamChipHalf,
                            editorDraft.teamSide === s && styles.chipActive,
                          ]}
                        >
                          <Text
                            style={[styles.chipText, editorDraft.teamSide === s && styles.chipTextActive]}
                            numberOfLines={1}
                          >
                            {s === 'HOME' ? homeName : awayName}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
                <Text style={styles.miniLabel}>Минута</Text>
                <View style={styles.minuteControlRow}>
                  <Pressable
                    accessibilityLabel="Уменьшить минуту"
                    hitSlop={8}
                    onPress={() => bumpEditorMinute(-1)}
                    disabled={parseMinuteUi(editorDraft.minute) <= 0}
                    style={[
                      styles.minuteStepBtn,
                      parseMinuteUi(editorDraft.minute) <= 0 && styles.fieldBtnDisabled,
                    ]}
                  >
                    <Ionicons name="remove" size={22} color={colors.accent} />
                  </Pressable>
                  <TextInput
                    style={styles.minuteValueInput}
                    keyboardType="number-pad"
                    value={editorDraft.minute}
                    onChangeText={(t) => setEditorDraft({ ...editorDraft, minute: t })}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                  />
                  <Pressable
                    accessibilityLabel="Увеличить минуту"
                    hitSlop={8}
                    onPress={() => bumpEditorMinute(1)}
                    disabled={parseMinuteUi(editorDraft.minute) >= MINUTE_UI_MAX}
                    style={[
                      styles.minuteStepBtn,
                      parseMinuteUi(editorDraft.minute) >= MINUTE_UI_MAX && styles.fieldBtnDisabled,
                    ]}
                  >
                    <Ionicons name="add" size={22} color={colors.accent} />
                  </Pressable>
                </View>
                <View style={styles.minutePresetsRow}>
                  {([1, 5, 15, 30] as const).map((n) => (
                    <Pressable
                      key={n}
                      accessibilityLabel={`Плюс ${n} минут`}
                      onPress={() => bumpEditorMinute(n)}
                      style={styles.minutePresetBtn}
                    >
                      <Text style={styles.minutePresetText}>+{n}</Text>
                    </Pressable>
                  ))}
                </View>
                {editorDraft.type === 'GOAL' || editorDraft.type === 'CARD' || editorDraft.type === 'SUBSTITUTION' ? (
                  <>
                    <Text style={styles.miniLabel}>Игрок {editorDraft.type === 'SUBSTITUTION' ? '(уходит)' : ''}</Text>
                    <Pressable
                      style={[styles.fieldBtn, !editorDraft.teamSide && styles.fieldBtnDisabled]}
                      disabled={!editorDraft.teamSide || !roster}
                      onPress={() => {
                        if (editorDraft.teamSide) openPicker('playerId', editorDraft.teamSide)
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Выбрать игрока"
                    >
                      <View style={styles.fieldBtnRow}>
                        <Text style={styles.fieldBtnText} numberOfLines={2}>
                          {editorDraft.playerId
                            ? resolvePlayerDisplayName(
                                editorDraft.playerId,
                                editorDraft.teamSide,
                                roster,
                                eventPlayerPreviewMap,
                              )
                            : 'Выбрать игрока'}
                        </Text>
                        <Ionicons name="chevron-down" size={20} color={colors.muted} />
                      </View>
                    </Pressable>
                  </>
                ) : null}
                {editorDraft.type === 'GOAL' ? (
                  <>
                    <Text style={styles.miniLabel}>Передача (опционально)</Text>
                    <Pressable
                      style={[styles.fieldBtn, !editorDraft.teamSide && styles.fieldBtnDisabled]}
                      disabled={!editorDraft.teamSide || !roster}
                      onPress={() => {
                        if (editorDraft.teamSide) openPicker('assistPlayerId', editorDraft.teamSide)
                      }}
                      accessibilityRole="button"
                    >
                      <View style={styles.fieldBtnRow}>
                        <Text style={styles.fieldBtnText} numberOfLines={2}>
                          {editorDraft.assistPlayerId
                            ? resolvePlayerDisplayName(
                                editorDraft.assistPlayerId,
                                editorDraft.teamSide,
                                roster,
                                eventPlayerPreviewMap,
                              )
                            : 'Без передачи'}
                        </Text>
                        <Ionicons name="chevron-down" size={20} color={colors.muted} />
                      </View>
                    </Pressable>
                  </>
                ) : null}
                {editorDraft.type === 'CARD' ? (
                  <>
                    <Text style={styles.miniLabel}>Цвет</Text>
                    <View style={styles.chips}>
                      {(['YELLOW', 'RED'] as const).map((c) => (
                        <Pressable
                          key={c}
                          onPress={() => setEditorDraft({ ...editorDraft, cardType: c })}
                          style={[styles.chip, editorDraft.cardType === c && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, editorDraft.cardType === c && styles.chipTextActive]}>
                            {c === 'YELLOW' ? 'Жёлтая' : 'Красная'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
                {editorDraft.type === 'SUBSTITUTION' ? (
                  <>
                    <Text style={styles.miniLabel}>Выходит на поле</Text>
                    <Pressable
                      style={[styles.fieldBtn, !editorDraft.teamSide && styles.fieldBtnDisabled]}
                      disabled={!editorDraft.teamSide || !roster}
                      onPress={() => {
                        if (editorDraft.teamSide) openPicker('substitutePlayerInId', editorDraft.teamSide)
                      }}
                      accessibilityRole="button"
                    >
                      <View style={styles.fieldBtnRow}>
                        <Text style={styles.fieldBtnText} numberOfLines={2}>
                          {editorDraft.substitutePlayerInId
                            ? resolvePlayerDisplayName(
                                editorDraft.substitutePlayerInId,
                                editorDraft.teamSide,
                                roster,
                                eventPlayerPreviewMap,
                              )
                            : 'Выбрать игрока'}
                        </Text>
                        <Ionicons name="chevron-down" size={20} color={colors.muted} />
                      </View>
                    </Pressable>
                  </>
                ) : null}
                {editorDraft.type === 'CUSTOM' ? (
                  <>
                    <Text style={styles.miniLabel}>Текст</Text>
                    <TextInput
                      style={[styles.field, styles.fieldMultiline]}
                      multiline
                      value={editorDraft.note}
                      onChangeText={(t) => setEditorDraft({ ...editorDraft, note: t })}
                      placeholder="Комментарий в протокол"
                    />
                  </>
                ) : null}
                <View style={styles.modalActions}>
                  <Pressable
                    style={styles.modalBtnGhost}
                    onPress={() => {
                      setEditorVisible(false)
                      setEditorDraft(null)
                    }}
                  >
                    <Text style={styles.modalBtnGhostText}>Отмена</Text>
                  </Pressable>
                  <Pressable style={styles.modalBtn} onPress={saveEditor}>
                    <Text style={styles.modalBtnText}>Готово</Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : null}
              </View>
            </SafeAreaView>
          {pickerVisible ? (
            <View style={styles.pickerOverlayRoot} pointerEvents="box-none">
              <Pressable style={styles.pickerDimFull} onPress={closePicker} accessibilityRole="button" />
              <View style={styles.pickerSheet}>
                <Text style={styles.modalTitle}>
                  {pickerField === 'assistPlayerId'
                    ? 'Передача'
                    : pickerField === 'substitutePlayerInId'
                      ? 'Выходит на поле'
                      : 'Игрок'}
                  {pickerTeamSide
                    ? ` · ${pickerTeamSide === 'HOME' ? homeName : awayName}`
                    : ''}
                </Text>
                <Text style={styles.pickerHint}>Показаны только игроки выбранной команды</Text>
                <FlatList
                  data={pickerOptions}
                  extraData={{ n: pickerOptions.length, side: pickerTeamSide, field: pickerField }}
                  keyExtractor={(item) => item.playerId}
                  style={styles.pickerList}
                  renderItem={({ item }) => (
                    <Pressable
                      style={[styles.pickerRow, item.disabled && styles.pickerRowDisabled]}
                      disabled={item.disabled}
                      onPress={() => applyPicker(item.playerId, item.disabled)}
                    >
                      <Text style={[styles.pickerRowText, item.disabled && styles.pickerRowTextDisabled]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <Text style={styles.eventsEmpty}>
                      {pickerTeamSide ? 'Нет игроков в составе этой команды' : 'Нет игроков'}
                    </Text>
                  }
                />
                <Pressable style={styles.modalBtnGhost} onPress={closePicker}>
                  <Text style={styles.modalBtnGhostText}>Закрыть</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

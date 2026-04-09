import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import {
  ActivityIndicator,
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
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import type { MatchProtocolRouteParams } from '../../navigation/types'
import type { TournamentMatchRow } from '../../types/tournament'
import {
  buildProtocolEventsPayload,
  countGoalsFromDrafts,
  createEmptyDraft,
  hasGoalEvents,
  parseEventsFromMatch,
  type ProtocolEventDraft,
  validateDraftsBeforeSave,
} from '../../utils/matchProtocolPayload'
import {
  buildPlayerPreviewMapFromEvents,
  formatProtocolEventLineForDisplay,
  resolvePlayerDisplayName,
  summarizeDraftForDisplay,
} from '../../utils/protocolPlayerNames'
import { formatDateTime } from '../../utils/formatDate'
import { matchStatusLabel } from '../../utils/tournamentLabels'
import { colors } from '../../theme/colors'

type Props = NativeStackScreenProps<{ MatchProtocol: MatchProtocolRouteParams }, 'MatchProtocol'>

const EDITABLE_STATUSES = ['SCHEDULED', 'LIVE', 'PLAYED', 'FINISHED'] as const
type EditableStatus = (typeof EDITABLE_STATUSES)[number]

function parseScore(s: string): number {
  const n = parseInt(s.replace(/\D/g, ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function MatchProtocolScreen({ route, navigation }: Props) {
  const { tournamentId, matchId } = route.params
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
  const [pickerOptions, setPickerOptions] = useState<ProtocolRosterPlayer[]>([])
  const [pickerField, setPickerField] = useState<'playerId' | 'assistPlayerId' | 'substitutePlayerInId' | null>(null)
  const [pickerTeamSide, setPickerTeamSide] = useState<'HOME' | 'AWAY' | null>(null)

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
        setHomeScoreStr(String(m.homeScore ?? 0))
        setAwayScoreStr(String(m.awayScore ?? 0))
        const st = m.status
        if (EDITABLE_STATUSES.includes(st as EditableStatus)) {
          setStatus(st)
        } else {
          setStatus('SCHEDULED')
        }

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
        } else {
          setDraftEvents([])
          setExtraTime({ home: '', away: '' })
          setPenalty({ home: '', away: '' })
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

  const openPicker = (field: typeof pickerField, side: 'HOME' | 'AWAY') => {
    if (!roster || !field) return
    Keyboard.dismiss()
    let opts = side === 'HOME' ? roster.home : roster.away
    if (field === 'assistPlayerId' && editorDraft?.playerId?.trim()) {
      opts = opts.filter((p) => p.playerId !== editorDraft.playerId)
    }
    if (field === 'substitutePlayerInId' && editorDraft?.playerId?.trim()) {
      opts = opts.filter((p) => p.playerId !== editorDraft.playerId)
    }
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

  const applyPicker = (playerId: string) => {
    if (!editorDraft || !pickerField) return
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
    const v = validateDraftsBeforeSave([editorDraft])
    if (v) {
      setError(v)
      return
    }
    setError(null)
    setDraftEvents((prev) => {
      const idx = prev.findIndex((x) => x.key === editorDraft.key)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = editorDraft
        return next
      }
      return [...prev, editorDraft]
    })
    setEditorVisible(false)
    setEditorDraft(null)
  }

  function removeEvent(key: string) {
    setDraftEvents((prev) => prev.filter((x) => x.key !== key))
  }

  async function onSave() {
    if (!match || !user || !canEdit) return
    setSaving(true)
    setError(null)
    try {
      const draftErr = eventsEditorEnabled ? validateDraftsBeforeSave(draftEvents) : null
      if (draftErr) {
        setError(draftErr)
        return
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
          return
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

      await updateTournamentMatchProtocol(tournamentId, matchId, payload)
      navigation.goBack()
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

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
        <View style={styles.noticePage}>
          <AppNotice variant="error">{error ?? 'Матч не найден'}</AppNotice>
        </View>
      </SafeAreaView>
    )
  }

  const readOnly = !canEdit

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.time}>{formatDateTime(match.startTime)}</Text>
          <Text style={styles.teams}>
            {match.homeTeam?.name ?? '—'} — {match.awayTeam?.name ?? '—'}
          </Text>
          {locked ? (
            <AppNotice variant="warning" style={styles.noticeBlock}>
              Матч в статусе «{matchStatusLabel(match.status)}». Правка может быть ограничена; при ошибке
              сохранения используйте веб-админку.
            </AppNotice>
          ) : null}
          {readOnly ? (
            <AppNotice variant="warning" style={styles.noticeBlock}>
              {match.status === 'CANCELED'
                ? 'Отменённые матчи здесь не редактируются (используйте сайт).'
                : 'Недостаточно прав для внесения протокола.'}
            </AppNotice>
          ) : null}
          <View style={styles.row}>
            <View style={styles.scoreCol}>
              <Text style={styles.scoreLabel}>Хозяева</Text>
              <TextInput
                style={[styles.scoreInput, hasGoalEvents(draftEvents) && eventsEditorEnabled && styles.scoreInputMuted]}
                keyboardType="number-pad"
                editable={!readOnly && !(eventsEditorEnabled && hasGoalEvents(draftEvents))}
                value={homeScoreStr}
                onChangeText={setHomeScoreStr}
              />
              {eventsEditorEnabled && hasGoalEvents(draftEvents) ? (
                <Text style={styles.scoreHint}>По голам в списке ниже</Text>
              ) : null}
            </View>
            <Text style={styles.colon}>:</Text>
            <View style={styles.scoreCol}>
              <Text style={styles.scoreLabel}>Гости</Text>
              <TextInput
                style={[styles.scoreInput, hasGoalEvents(draftEvents) && eventsEditorEnabled && styles.scoreInputMuted]}
                keyboardType="number-pad"
                editable={!readOnly && !(eventsEditorEnabled && hasGoalEvents(draftEvents))}
                value={awayScoreStr}
                onChangeText={setAwayScoreStr}
              />
            </View>
          </View>
          <Text style={styles.label}>Статус матча</Text>
          <View style={styles.chips}>
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
          </View>

          {!eventsEditorEnabled && rosterError ? (
            <AppNotice variant="warning" style={styles.noticeBlock}>
              {rosterError}
            </AppNotice>
          ) : null}
          {eventsEditorEnabled && roster && roster.home.length === 0 && roster.away.length === 0 ? (
            <AppNotice variant="info" style={styles.noticeBlock}>
              В составах нет игроков — доступны только текстовые заметки и служебные поля плей-офф.
            </AppNotice>
          ) : null}

          {roster && (roster.home.length > 0 || roster.away.length > 0) ? (
            <View style={styles.rosterSection}>
              <Text style={styles.eventsTitle}>Игроки в заявке</Text>
              <Text style={styles.rosterSideLabel}>{homeName}</Text>
              {roster.home.map((p) => (
                <Text key={p.playerId} style={styles.rosterLine}>
                  · {p.label}
                </Text>
              ))}
              <Text style={[styles.rosterSideLabel, styles.rosterSideSpacer]}>{awayName}</Text>
              {roster.away.map((p) => (
                <Text key={p.playerId} style={styles.rosterLine}>
                  · {p.label}
                </Text>
              ))}
            </View>
          ) : null}

          {eventsEditorEnabled && !readOnly ? (
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
          ) : !eventsEditorEnabled && match.events && match.events.length > 0 ? (
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

          {isPlayoff && eventsEditorEnabled && !readOnly ? (
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

      <Modal visible={editorVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
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
                    <View style={styles.teamChipsCol}>
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
                            styles.teamChipFull,
                            editorDraft.teamSide === s && styles.chipActive,
                          ]}
                        >
                          <Text
                            style={[styles.chipText, editorDraft.teamSide === s && styles.chipTextActive]}
                          >
                            {s === 'HOME' ? homeName : awayName}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
                <Text style={styles.miniLabel}>Минута</Text>
                <TextInput
                  style={styles.field}
                  keyboardType="number-pad"
                  value={editorDraft.minute}
                  onChangeText={(t) => setEditorDraft({ ...editorDraft, minute: t })}
                  placeholder="например 23"
                />
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
                    <Pressable style={styles.pickerRow} onPress={() => applyPicker(item.playerId)}>
                      <Text style={styles.pickerRowText}>{item.label}</Text>
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
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noticePage: { flex: 1, padding: 16, justifyContent: 'flex-start' },
  noticeBlock: { marginBottom: 12 },
  time: { fontSize: 13, color: colors.muted, marginBottom: 8 },
  teams: { fontSize: 18, fontWeight: '700', color: colors.primary, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 20 },
  scoreCol: { flex: 1, maxWidth: 120 },
  scoreLabel: { fontSize: 12, color: colors.muted, marginBottom: 6 },
  scoreInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.text,
  },
  scoreInputMuted: {
    opacity: 0.75,
    backgroundColor: colors.surface,
  },
  scoreHint: { fontSize: 11, color: colors.muted, marginTop: 4, textAlign: 'center' },
  colon: { fontSize: 22, fontWeight: '700', paddingHorizontal: 8, paddingBottom: 10 },
  colonSmall: { fontSize: 18, fontWeight: '700', paddingHorizontal: 8, paddingBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.primary, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  teamChipsCol: { flexDirection: 'column', gap: 10, marginBottom: 12 },
  teamChipFull: { alignSelf: 'stretch' },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(200, 10, 72, 0.08)',
  },
  chipDisabled: { opacity: 0.5 },
  chipText: { fontSize: 13, color: colors.muted },
  chipTextActive: { color: colors.accent, fontWeight: '600' },
  eventsSection: { marginBottom: 16 },
  eventsTitle: { fontSize: 15, fontWeight: '600', color: colors.primary, marginBottom: 4 },
  eventsSub: { fontSize: 12, color: colors.muted, marginBottom: 10, lineHeight: 16 },
  eventsEmpty: { fontSize: 14, color: colors.muted, marginBottom: 8 },
  evRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  evMain: { flex: 1, padding: 10 },
  evText: { fontSize: 14, color: colors.text },
  evType: { fontSize: 11, color: colors.muted, marginTop: 2 },
  evDel: { padding: 12 },
  evDelText: { fontSize: 16, color: colors.error },
  addEvBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    marginTop: 4,
  },
  addEvBtnText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
  events: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventsHint: { fontSize: 11, color: colors.muted, marginBottom: 10, lineHeight: 15 },
  rosterSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rosterSideLabel: { fontSize: 13, fontWeight: '600', color: colors.primary, marginTop: 6 },
  rosterSideSpacer: { marginTop: 10 },
  rosterLine: { fontSize: 13, color: colors.text, marginLeft: 4, marginBottom: 2 },
  evLine: { fontSize: 13, color: colors.text, marginBottom: 4 },
  playoffBox: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  playoffTitle: { fontSize: 15, fontWeight: '600', color: colors.primary, marginBottom: 6 },
  playoffHint: { fontSize: 12, color: colors.muted, marginBottom: 10, lineHeight: 17 },
  miniLabel: { fontSize: 12, fontWeight: '600', color: colors.primary, marginBottom: 6, marginTop: 8 },
  smallInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    fontSize: 16,
    textAlign: 'center',
  },
  field: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  fieldMultiline: { minHeight: 72, textAlignVertical: 'top' },
  fieldBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    backgroundColor: colors.background,
  },
  fieldBtnText: { fontSize: 15, color: colors.text, flex: 1, paddingRight: 8 },
  fieldBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldBtnDisabled: { opacity: 0.45 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  pickerOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  pickerDimFull: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  pickerSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  pickerList: { flexGrow: 0, maxHeight: 380 },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '90%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  pickerHint: { fontSize: 12, color: colors.muted, marginBottom: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  modalBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  modalBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  modalBtnGhost: { paddingVertical: 12, paddingHorizontal: 12 },
  modalBtnGhostText: { color: colors.muted, fontWeight: '600', fontSize: 15 },
  pickerRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerRowText: { fontSize: 16, color: colors.text },
})

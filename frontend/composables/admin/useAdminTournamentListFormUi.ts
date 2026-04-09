import type { TournamentFormModel } from '~/composables/admin/useTournamentForm'
import type { TeamLite } from '~/types/tournament-admin'
import {
  groupedPlayoffFormats,
  isPowerOfTwo,
  maxTournamentTeams,
  playoffTeamCountOptions,
} from '~/utils/tournamentAdminFormShared'
import {
  DEFAULT_TOURNAMENT_CALENDAR_STRIPE,
  TOURNAMENT_CALENDAR_COLOR_PRESETS,
} from '~/utils/tournamentCalendarColor'
import type { Ref } from 'vue'
import { computed, watch } from 'vue'

export type TournamentFormNumericFieldKey = 'groupCount' | 'playoffQualifiersPerGroup' | 'minTeams'

/**
 * Превью групп/плей-офф, подсказки календаря, цвет, синхронизирующие watch по полям формы турнира (список).
 */
export function useAdminTournamentListFormUi(options: {
  form: TournamentFormModel
  manualPlayoffEnabled: Ref<boolean>
  teams: Ref<TeamLite[]>
  reloadTeamsForAgeFilter: () => Promise<void>
}) {
  const toast = useToast()
  const { t } = useI18n()
  const { form, manualPlayoffEnabled, teams, reloadTeamsForAgeFilter } = options

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

  const tournamentCalendarColorPresets = TOURNAMENT_CALENDAR_COLOR_PRESETS

  const DEFAULT_CALENDAR_PICKER_FALLBACK = DEFAULT_TOURNAMENT_CALENDAR_STRIPE

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
    () => form.teamIds.slice(),
    (ids) => {
      if (ids.length <= form.minTeams) return
      form.teamIds = ids.slice(0, form.minTeams)
      toast.add({
        severity: 'warn',
        summary: t('admin.tournament_form.list_toast_max_teams_summary'),
        detail: t('admin.tournament_form.list_toast_max_teams_detail', { max: form.minTeams }),
        life: 3500,
      })
    },
  )

  watch(
    () => form.ageGroupId,
    async () => {
      await reloadTeamsForAgeFilter()
      const allowedIds = new Set((teams.value ?? []).map((row) => row.id))
      const filtered = form.teamIds.filter((id) => allowedIds.has(id))
      if (filtered.length !== form.teamIds.length) {
        form.teamIds = filtered
        toast.add({
          severity: 'warn',
          summary: t('admin.tournament_form.list_toast_age_filter_summary'),
          detail: t('admin.tournament_form.list_toast_age_filter_detail'),
          life: 3500,
        })
      }
    },
  )

  const groupCountHintText = computed(() => {
    const implied = impliedGroupCount.value
    if (implied === null) {
      return t('admin.tournament_form.list_hint_group_count_free')
    }
    if (implied === 0) {
      return t('admin.tournament_form.list_hint_group_count_playoff_only')
    }
    return t('admin.tournament_form.list_hint_group_count_fixed', { count: implied })
  })

  const playoffQualifiersHintText = computed(() =>
    t('admin.tournament_form.list_hint_playoff_qualifiers'),
  )

  const formatFieldHintText = computed(() => t('admin.tournament_form.list_hint_format_field'))

  const minTeamsHintText = computed(() =>
    form.format === 'PLAYOFF'
      ? t('admin.tournament_form.list_hint_min_teams_playoff')
      : form.format === 'GROUPS_PLUS_PLAYOFF'
        ? t('admin.tournament_form.list_hint_min_teams_groups_playoff')
        : t('admin.tournament_form.list_hint_min_teams_default'),
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

    const dash = t('admin.tournaments_list.card_date_placeholder')

    if (group && playoff) {
      const teamsCoverPlayoff =
        Number.isInteger(group.minTeams) &&
        group.minTeams >= playoff.groups * playoff.qualifiersPerGroup
      const perGroup = group.perGroup != null ? String(group.perGroup) : dash
      return {
        valid: group.valid && playoff.valid && teamsCoverPlayoff,
        text: t('admin.tournament_form.list_preview_groups_playoff_line', {
          groups: group.groups,
          perGroup,
          totalQ: playoff.totalQualifiers,
          qpg: playoff.qualifiersPerGroup,
        }),
      }
    }

    if (group) {
      const perGroup = group.perGroup != null ? String(group.perGroup) : dash
      return {
        valid: group.valid,
        text: group.valid
          ? t('admin.tournament_form.list_preview_groups_ok', {
              groups: group.groups,
              perGroup,
            })
          : t('admin.tournament_form.list_preview_groups_bad', {
              groups: group.groups,
              minTeams: group.minTeams,
              minTotal: group.groups * 2,
            }),
      }
    }

    return {
      valid: playoff?.valid ?? false,
      text: playoff?.valid
        ? t('admin.tournament_form.list_preview_playoff_ok_long', {
            total: playoff!.totalQualifiers,
            groups: playoff!.groups,
            qpg: playoff!.qualifiersPerGroup,
          })
        : t('admin.tournament_form.list_preview_playoff_bad_short', {
            total: playoff?.totalQualifiers ?? dash,
          }),
    }
  })

  const manualGroupsHint = computed(() => {
    if (form.format !== 'MANUAL' || manualPlayoffEnabled.value) return ''
    return t('admin.tournament_form.list_hint_manual_no_playoff')
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
        ? t('admin.tournament_form.list_preview_manual_playoff_bad', {
            total: pv.totalQualifiers,
          })
        : t('admin.validation.playoff_qualifiers_exceed_min_teams', {
            groups: pv.groups,
            k: pv.qualifiersPerGroup,
            needed: pv.totalQualifiers,
            minTeams: pv.minTeams,
          })
      return {
        valid: pv.valid,
        text: pv.valid
          ? t('admin.tournament_form.list_preview_manual_playoff_ok', {
              total: pv.totalQualifiers,
              groups: pv.groups,
              qpg: pv.qualifiersPerGroup,
            })
          : invalidText,
      }
    }

    if (form.format === 'PLAYOFF') {
      const valid = (playoffTeamCountOptions as readonly number[]).includes(form.minTeams)
      return {
        valid,
        text: valid
          ? t('admin.tournament_form.list_preview_playoff_bracket_ok', { n: form.minTeams })
          : t('admin.tournament_form.list_preview_playoff_bracket_bad'),
      }
    }

    if (form.format === 'SINGLE_GROUP') {
      return {
        valid: true,
        text: t('admin.tournament_form.list_preview_single_group'),
      }
    }

    return null
  })

  function syncNumericField(key: TournamentFormNumericFieldKey, value: unknown) {
    const n = Number(value)
    if (Number.isFinite(n)) form[key] = n
  }

  return {
    impliedGroupCount,
    groupCountMin,
    groupCountMax,
    minTeamsMinValue,
    isPlayoffFormat,
    isGroupsPlusPlayoffFormat,
    showGroupCountField,
    showPlayoffQualifiersField,
    minTeamsGridClass,
    tournamentCalendarColorPresets,
    calendarColorPickerModel,
    clearTournamentCalendarColor,
    tournamentCalendarColorTrimmed,
    groupCountHintText,
    playoffQualifiersHintText,
    formatFieldHintText,
    minTeamsHintText,
    formatCalendarHint,
    syncNumericField,
  }
}

import type { TournamentFormModel } from '~/composables/admin/useTournamentForm'
import { getApiErrorMessages } from '~/utils/apiError'
import {
  groupedPlayoffFormats,
  isHttpUrl,
  isPowerOfTwo,
  maxTournamentTeams,
  playoffTeamCountOptions,
} from '~/utils/tournamentAdminFormShared'
import type { ComputedRef, Ref } from 'vue'
import { computed } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { invalidateAdminTenantTournamentsAll } from '~/composables/admin/adminTenantQueryKeys'

type AuthFetchFn = <T = unknown>(
  url: string,
  options?: Record<string, unknown>,
) => Promise<T>

export type TournamentListFormVuelidate = {
  $invalid: boolean
  $touch: () => void
  $reset: () => void
  name: { $dirty: boolean }
  teamIds: { $dirty: boolean }
}

function toDateString(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : undefined
}

/**
 * Кросс-валидация формы турнира (список), сохранение POST/PATCH и синхронизация состава команд.
 */
export function useAdminTournamentListFormSave(options: {
  token: Ref<string | null>
  tenantId: ComputedRef<string>
  authFetch: AuthFetchFn
  apiUrl: (path: string) => string
  form: TournamentFormModel
  initialTeamIds: Ref<string[]>
  editingId: Ref<string | null>
  isEdit: ComputedRef<boolean>
  manualPlayoffEnabled: Ref<boolean>
  canAccessReferenceBasic: ComputedRef<boolean>
  canAccessReferenceStandard: ComputedRef<boolean>
  createTemplateId: Ref<string>
  tournamentSlugGenerated: ComputedRef<string>
  v$: Ref<TournamentListFormVuelidate>
  submitAttempted: Ref<boolean>
  loadingEdit: Ref<boolean>
  savingForm: Ref<boolean>
  showForm: Ref<boolean>
  fetchTournaments: (opts?: { reset?: boolean }) => void | Promise<void>
}) {
  const toast = useToast()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const {
    token,
    tenantId,
    authFetch,
    apiUrl,
    form,
    initialTeamIds,
    editingId,
    isEdit,
    manualPlayoffEnabled,
    canAccessReferenceBasic,
    canAccessReferenceStandard,
    createTemplateId,
    tournamentSlugGenerated,
    v$,
    submitAttempted,
    loadingEdit,
    savingForm,
    showForm,
    fetchTournaments,
  } = options

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
        ? t('admin.validation.tournament_teams_required')
        : form.teamIds.length !== form.minTeams
          ? t('admin.validation.tournament_teams_exact', {
              expected: form.minTeams,
              selected: form.teamIds.length,
            })
          : ''
    const datesError =
      form.startsAt && form.endsAt && form.startsAt > form.endsAt
        ? t('admin.validation.end_after_start')
        : ''

    let formatError = ''
    if (form.minTeams > maxTournamentTeams) {
      formatError = t('admin.validation.tournament_max_teams', { max: maxTournamentTeams })
    } else if (form.format === 'PLAYOFF' && (form.minTeams < 4 || !isPowerOfTwo(form.minTeams))) {
      formatError = t('admin.validation.tournament_playoff_team_counts')
    } else if (
      form.format === 'PLAYOFF' &&
      !(playoffTeamCountOptions as readonly number[]).includes(form.minTeams)
    ) {
      formatError = t('admin.validation.tournament_playoff_team_counts_strict')
    } else if (
      groupedPlayoffFormats.includes(form.format) &&
      (!Number.isInteger(form.groupCount) ||
        form.groupCount < 1 ||
        form.minTeams < form.groupCount * 2 ||
        form.minTeams % form.groupCount !== 0)
    ) {
      formatError = t('admin.validation.tournament_groups_teams_rule', {
        groups: form.groupCount,
        minTotal: form.groupCount * 2,
      })
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
      formatError = t('admin.validation.tournament_playoff_grid_invalid', {
        groups: form.groupCount,
        qpg: form.playoffQualifiersPerGroup,
        total,
      })
    } else if (
      form.format === 'MANUAL' &&
      manualPlayoffEnabled.value &&
      (!Number.isInteger(form.playoffQualifiersPerGroup) ||
        form.playoffQualifiersPerGroup < 1 ||
        form.playoffQualifiersPerGroup > 8 ||
        !isPowerOfTwo(form.groupCount * form.playoffQualifiersPerGroup))
    ) {
      const total = form.groupCount * form.playoffQualifiersPerGroup
      formatError = t('admin.validation.tournament_manual_playoff_grid_invalid', {
        groups: form.groupCount,
        qpg: form.playoffQualifiersPerGroup,
        total,
      })
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
    () =>
      (submitAttempted.value || v$.value.teamIds.$dirty) && !!tournamentFormErrors.value.teamsError,
  )

  async function syncTournamentTeams(tournamentId: string) {
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

  async function saveTournament() {
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
        moderatorIds: [...form.moderatorIds],
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
        body.stadiumIds = [...form.stadiumIds]
        body.competitionId = form.competitionId.trim() ? form.competitionId.trim() : null
        body.refereeIds = form.refereeIds
      } else if (!isEdit.value) {
        body.stadiumIds = []
        body.competitionId = null
        body.refereeIds = [] as string[]
      }

      if (!isEdit.value && createTemplateId.value) {
        body.templateId = createTemplateId.value
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
      void invalidateAdminTenantTournamentsAll(queryClient, tenantId.value)
    } catch (e: unknown) {
      const messages = getApiErrorMessages(
        e,
        t('admin.tournament_form.save_error_fallback_detail'),
      )
      for (const msg of messages) {
        toast.add({
          severity: 'error',
          summary: t('admin.tournament_form.save_error_summary'),
          detail: msg,
          life: 6500,
        })
      }
    } finally {
      savingForm.value = false
    }
  }

  return {
    tournamentFormErrors,
    canSaveTournament,
    showNameError,
    showTeamsError,
    saveTournament,
  }
}

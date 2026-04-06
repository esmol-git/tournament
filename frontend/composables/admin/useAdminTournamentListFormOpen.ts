import {
  buildDefaultTournamentForm,
  patchFormFromTournament,
  type TournamentFormModel,
} from '~/composables/admin/useTournamentForm'
import type { TournamentDetails, TournamentRow, UserLite } from '~/types/admin/tournaments-index'
import type { TournamentListFormVuelidate } from '~/composables/admin/useAdminTournamentListFormSave'
import type { ComputedRef, Ref } from 'vue'

type ReadonlyListRef = Ref<unknown[]> | ComputedRef<unknown[]>

type AuthFetchFn = <T = unknown>(
  url: string,
  options?: Record<string, unknown>,
) => Promise<T>

/**
 * Загрузка пользователей для модераторов и открытие формы создания / редактирования турнира.
 */
export function useAdminTournamentListFormOpen(options: {
  token: Ref<string | null>
  authFetch: AuthFetchFn
  apiUrl: (path: string) => string
  form: TournamentFormModel
  manualPlayoffEnabled: Ref<boolean>
  canTournamentAutomation: ComputedRef<boolean>
  submitAttempted: Ref<boolean>
  editingId: Ref<string | null>
  initialTeamIds: Ref<string[]>
  createTemplateId: Ref<string>
  v$: Ref<TournamentListFormVuelidate>
  showForm: Ref<boolean>
  loadingEdit: Ref<boolean>
  users: Ref<UserLite[]>
  adminsLoading: Ref<boolean>
  seasonsList: ReadonlyListRef
  fetchSeasonsList: () => void | Promise<void>
  competitionsList: ReadonlyListRef
  fetchCompetitionsList: () => void | Promise<void>
  ageGroupsList: ReadonlyListRef
  fetchAgeGroupsList: () => void | Promise<void>
  fetchTournamentTemplates: () => void | Promise<void>
  fetchTeamsLite: () => void | Promise<void>
  fetchStadiumsReferees: () => void | Promise<void>
  canCreateAnotherTournament: ComputedRef<boolean>
  createTournamentBlockedHint: ComputedRef<string>
}) {
  const toast = useToast()
  const { t } = useI18n()
  const {
    token,
    authFetch,
    apiUrl,
    form,
    manualPlayoffEnabled,
    canTournamentAutomation,
    submitAttempted,
    editingId,
    initialTeamIds,
    createTemplateId,
    v$,
    showForm,
    loadingEdit,
    users,
    adminsLoading,
    seasonsList,
    fetchSeasonsList,
    competitionsList,
    fetchCompetitionsList,
    ageGroupsList,
    fetchAgeGroupsList,
    fetchTournamentTemplates,
    fetchTeamsLite,
    fetchStadiumsReferees,
    canCreateAnotherTournament,
    createTournamentBlockedHint,
  } = options

  async function fetchUsersLite() {
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

  async function openCreate() {
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
    createTemplateId.value = ''
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
    await fetchTournamentTemplates()
    await fetchTeamsLite()
    await fetchStadiumsReferees()
  }

  async function openEdit(row: TournamentRow) {
    if (!token.value) return
    submitAttempted.value = false
    createTemplateId.value = ''
    editingId.value = row.id
    loadingEdit.value = true
    try {
      const res = await authFetch<TournamentDetails>(apiUrl(`/tournaments/${row.id}`), {
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

  return {
    fetchUsersLite,
    openCreate,
    openEdit,
  }
}

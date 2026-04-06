import { normalizeLegacyGroupsFormat, type TournamentFormModel } from '~/composables/admin/useTournamentForm'
import type { TournamentTemplateRow } from '~/types/admin/tournament-template'
import type { ComputedRef, Ref } from 'vue'
import { computed, ref } from 'vue'

type AuthFetchFn = <T = unknown>(
  url: string,
  options?: Record<string, unknown>,
) => Promise<T>

/**
 * Шаблоны турниров на странице списка: загрузка, выбор при создании, применение полей в форму.
 */
export function useAdminTournamentListTemplates(options: {
  token: Ref<string | null>
  tenantId: ComputedRef<string>
  authFetch: AuthFetchFn
  apiUrl: (path: string) => string
  form: TournamentFormModel
  manualPlayoffEnabled: Ref<boolean>
  canAccessReferenceBasic: ComputedRef<boolean>
  canAccessReferenceStandard: ComputedRef<boolean>
  canTournamentAutomation: ComputedRef<boolean>
  /** После применения шаблона — перезагрузить команды под фильтр возраста и т.д. */
  reloadTeamsAfterTemplate: () => Promise<void>
}) {
  const toast = useToast()
  const { t } = useI18n()
  const {
    token,
    tenantId,
    authFetch,
    apiUrl,
    form,
    manualPlayoffEnabled,
    canAccessReferenceBasic,
    canAccessReferenceStandard,
    canTournamentAutomation,
    reloadTeamsAfterTemplate,
  } = options

  const tournamentTemplatesList = ref<TournamentTemplateRow[]>([])
  const tournamentTemplatesLoading = ref(false)
  /** При создании: id шаблона или пусто — без пресета. */
  const createTemplateId = ref('')

  const templateSelectOptions = computed(() => [
    { label: t('admin.tournament_templates.none'), value: '' },
    ...tournamentTemplatesList.value.map((row) => ({
      label: row.name,
      value: row.id,
    })),
  ])

  async function fetchTournamentTemplates() {
    if (!token.value) return
    tournamentTemplatesLoading.value = true
    try {
      tournamentTemplatesList.value = await authFetch<TournamentTemplateRow[]>(
        apiUrl(`/tenants/${tenantId.value}/tournament-templates`),
      )
    } catch {
      tournamentTemplatesList.value = []
    } finally {
      tournamentTemplatesLoading.value = false
    }
  }

  function applyTournamentTemplateToForm(row: TournamentTemplateRow) {
    const normalized = normalizeLegacyGroupsFormat(row.format, row.groupCount ?? 1)
    form.format = normalized.format
    form.groupCount = normalized.groupCount
    form.playoffQualifiersPerGroup = row.playoffQualifiersPerGroup ?? 2
    form.description = row.description ?? ''
    form.intervalDays = row.intervalDays ?? 7
    form.allowedDays = Array.isArray(row.allowedDays) ? [...row.allowedDays] : []
    form.minTeams = row.minTeams ?? 2
    form.pointsWin = row.pointsWin ?? 3
    form.pointsDraw = row.pointsDraw ?? 1
    form.pointsLoss = row.pointsLoss ?? 0
    if (canAccessReferenceBasic.value) {
      form.seasonId = row.seasonId ?? ''
      form.ageGroupId = row.ageGroupId ?? ''
    }
    if (canAccessReferenceStandard.value) {
      form.stadiumIds = row.stadiumId ? [row.stadiumId] : []
      form.competitionId = row.competitionId ?? ''
      form.refereeIds = (row.templateReferees ?? []).map((r) => r.refereeId)
    }
    const cc = row.calendarColor?.trim()
    form.calendarColor =
      cc && /^#[0-9A-Fa-f]{6}$/i.test(cc) ? cc.toLowerCase() : ''
    manualPlayoffEnabled.value = false

    if (!canTournamentAutomation.value) {
      if (form.format !== 'MANUAL') {
        form.format = 'MANUAL'
        form.groupCount = 1
        if (form.minTeams > 2) form.minTeams = 2
        toast.add({
          severity: 'info',
          summary: t('admin.settings.subscription.title'),
          detail: t('admin.tournament_templates.coerced_manual_tariff'),
          life: 5000,
        })
      }
    }
  }

  async function onCreateTemplatePick(value: string | null | undefined) {
    createTemplateId.value = value ?? ''
    if (!createTemplateId.value) return
    const row = tournamentTemplatesList.value.find((x) => x.id === createTemplateId.value)
    if (row) {
      applyTournamentTemplateToForm(row)
      await reloadTeamsAfterTemplate()
    }
  }

  return {
    tournamentTemplatesList,
    tournamentTemplatesLoading,
    createTemplateId,
    templateSelectOptions,
    fetchTournamentTemplates,
    onCreateTemplatePick,
  }
}

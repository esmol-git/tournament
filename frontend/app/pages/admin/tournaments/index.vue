<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { TournamentStatus, UserLite } from '~/types/admin/tournaments-index'
import { buildDefaultTournamentForm } from '~/composables/admin/useTournamentForm'
import { useAdminTournamentsList } from '~/composables/admin/useAdminTournamentsList'
import { useAdminTournamentFormLogo } from '~/composables/admin/useAdminTournamentFormLogo'
import { useAdminTournamentListCardActions } from '~/composables/admin/useAdminTournamentListCardActions'
import { useAdminTournamentListFormUi } from '~/composables/admin/useAdminTournamentListFormUi'
import { useAdminTournamentListDeleteDialog } from '~/composables/admin/useAdminTournamentListDeleteDialog'
import { useAdminTournamentListFormBodyBindings } from '~/composables/admin/useAdminTournamentListFormBodyBindings'
import { useAdminTournamentListFormSave } from '~/composables/admin/useAdminTournamentListFormSave'
import { useAdminTournamentListTemplates } from '~/composables/admin/useAdminTournamentListTemplates'
import { useAdminTournamentListFormOpen } from '~/composables/admin/useAdminTournamentListFormOpen'
import { useTournamentReferences } from '~/composables/admin/useTournamentReferences'
import { useAdminTenantTeamsTournamentFormQuery } from '~/composables/admin/useAdminTenantListQueries'
import { useTournamentFormatFormOptions } from '~/composables/admin/useTournamentFormatFormOptions'
import { tournamentFormatLabel, tournamentLifecycleBadgeClass } from '~/utils/tournamentAdminUi'
import { slugifyFromTitle } from '~/utils/slugify'
import { adminTooltip } from '~/utils/adminTooltip'
import { formatUserListLabel } from '~/utils/userDisplayName'
import {
  hasSubscriptionFeature,
  maxTournamentsForSubscriptionPlan,
  subscriptionPlanFromAuthUser,
  tenantPlanLimitsFromAuthUser,
} from '~/utils/subscriptionFeatures'
import { useAdminOrgModeratorReadOnly } from '~/composables/useAdminOrgModeratorReadOnly'
import AdminTournamentCard from '~/app/components/admin/tournaments/AdminTournamentCard.vue'
import AdminTenantTournamentLimits from '~/app/components/admin/tournaments/AdminTenantTournamentLimits.vue'
import AdminTournamentFormDialog from '~/app/components/admin/tournaments/AdminTournamentFormDialog.vue'
import AdminTournamentListFilters from '~/app/components/admin/tournaments/AdminTournamentListFilters.vue'
import AdminTournamentsTemplatesPanel from '~/app/components/admin/tournaments/AdminTournamentsTemplatesPanel.vue'
import AdminTournamentListFormBody from '~/app/components/admin/tournaments/AdminTournamentListFormBody.vue'
import AdminTournamentListDeleteDialog from '~/app/components/admin/tournaments/AdminTournamentListDeleteDialog.vue'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import type { Ref } from 'vue'
import { computed, onMounted, reactive, ref, toRef } from 'vue'
import type { TournamentListFormVuelidate } from '~/composables/admin/useAdminTournamentListFormSave'

definePageMeta({
  layout: 'admin',
  /** Список турниров: глобальный MODERATOR — org read-only; реестр в `adminModeratorOrgPolicy`. */
  adminOrgModeratorReadOnly: true,
})

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const { token, user, syncWithStorage, loggedIn, authFetch, fetchMe } = useAuth()
const { apiUrl } = useApiUrl()

const tenantId = useTenantId()

const isOrgModeratorReadOnly = useAdminOrgModeratorReadOnly()

const isTemplatesTab = computed(() => {
  const tab = route.query.tab
  if (tab === 'templates') return true
  if (Array.isArray(tab)) return tab.includes('templates')
  return false
})

const subscriptionPlan = computed(() => subscriptionPlanFromAuthUser(user.value))

/**
 * Сначала лимиты из `/me` (`tenantSubscription.limits`) — совпадают с бэкендом.
 * Иначе устаревший `auth_user` без подписки давал бы FREE и лимит 1.
 */
const tournamentLimitMax = computed(() => {
  const snap = tenantPlanLimitsFromAuthUser(user.value)
  if (snap) {
    return snap.tournaments
  }
  return maxTournamentsForSubscriptionPlan(subscriptionPlan.value)
})

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

const {
  loading,
  listError,
  retryList,
  tournaments,
  tournamentsTotal,
  skeletonTournamentRows,
  loadingMoreTournaments,
  tournamentsSearch,
  loadMoreAnchor,
  statusFilter,
  seasonFilter,
  competitionFilter,
  ageGroupFilter,
  hasMoreTournaments,
  tournamentsFiltersActive,
  tournamentsListSemanticallyEmpty,
  fetchTournaments,
  onTournamentsSearchInput,
  onStatusFilterChange,
  bootstrapListFromCurrentRoute,
  installInfiniteScrollAndObserver,
} = useAdminTournamentsList({
  token,
  tenantId,
  authFetch,
  apiUrl,
  isTemplatesTab,
})

const {
  listPublishSavingId,
  goToTournament,
  openTournamentNews,
  openTournamentGallery,
  toggleTournamentListPublished,
} = useAdminTournamentListCardActions({
  token,
  authFetch,
  apiUrl,
  tournaments,
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

const showForm = ref(false)
const loadingEdit = ref(false)
const savingForm = ref(false)
const editingId = ref<string | null>(null)
const isEdit = computed(() => !!editingId.value)
const initialTeamIds = ref<string[]>([])
const manualPlayoffEnabled = ref(false)

const statusOptions = computed(() => [
  { value: 'DRAFT' as const, label: t('admin.tournament_lifecycle.draft') },
  { value: 'ACTIVE' as const, label: t('admin.tournament_lifecycle.active') },
  { value: 'COMPLETED' as const, label: t('admin.tournament_lifecycle.completed') },
  { value: 'ARCHIVED' as const, label: t('admin.tournament_lifecycle.archived') },
])

const statusTabOptions = computed(() => [
  { value: 'all' as const, label: t('admin.tournaments_list.status_filter_all') },
  ...statusOptions.value,
])

function statusLabel(s: TournamentStatus): string {
  return statusOptions.value.find((o) => o.value === s)?.label ?? s
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
  stadiumMultiOptions,
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

const {
  teams,
  teamsLoading,
  refetchTeamsLite,
} = useAdminTenantTeamsTournamentFormQuery({
  showForm,
  ageGroupId: toRef(form, 'ageGroupId'),
})
const fetchTeamsLite = async () => {
  await refetchTeamsLite()
}

const { formatOptionsForForm } = useTournamentFormatFormOptions({
  canTournamentAutomation,
  isEdit,
  formFormat: toRef(form, 'format'),
})

const {
  logoFileInput,
  logoUploading,
  logoRemoving,
  triggerLogoPick,
  onLogoFileChange,
  removeTournamentLogo,
} = useAdminTournamentFormLogo({
  token,
  authFetch,
  apiUrl,
  form,
  editingId,
  refreshTournamentList: fetchTournaments,
})

/** Не реактивный объект: иначе в шаблоне `logoFileInput` разворачивается и в дочку уходит не `Ref`. */
const tournamentListLogoFileInputHolder = { input: logoFileInput }

/** В списке модераторов турнира — только пользователи с глобальной ролью MODERATOR в организации. */
const moderatorSelectOptions = computed(() =>
  users.value
    .filter((u) => u.role === 'MODERATOR')
    .map((u) => ({
      id: u.id,
      label: formatUserListLabel(u),
    })),
)
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

const {
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
} = useAdminTournamentListFormUi({
  form,
  manualPlayoffEnabled,
  teams,
  reloadTeamsForAgeFilter: fetchTeamsLite,
})

const {
  tournamentTemplatesLoading,
  createTemplateId,
  templateSelectOptions,
  fetchTournamentTemplates,
  onCreateTemplatePick,
} = useAdminTournamentListTemplates({
  token,
  tenantId,
  authFetch,
  apiUrl,
  form,
  manualPlayoffEnabled,
  canAccessReferenceBasic,
  canAccessReferenceStandard,
  canTournamentAutomation,
  reloadTeamsAfterTemplate: fetchTeamsLite,
})

const { openCreate, openEdit } = useAdminTournamentListFormOpen({
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
  v$: v$ as Ref<TournamentListFormVuelidate>,
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
})

const {
  tournamentFormErrors,
  canSaveTournament,
  showNameError,
  showTeamsError,
  saveTournament,
} = useAdminTournamentListFormSave({
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
  v$: v$ as Ref<TournamentListFormVuelidate>,
  submitAttempted,
  loadingEdit,
  savingForm,
  showForm,
  fetchTournaments,
})

const {
  deleteDialogVisible,
  deleteTarget,
  deleteSaving,
  openDeleteDialog,
  confirmDeleteTournament,
  moveTournamentToArchive,
} = useAdminTournamentListDeleteDialog({
  token,
  authFetch,
  apiUrl,
  refreshList: fetchTournaments,
})

const tournamentListFormBodyBindings = useAdminTournamentListFormBodyBindings({
  form,
  tournamentsTotal,
  isEdit,
  templateSelectOptions,
  tournamentTemplatesLoading,
  logoFileInputHolder: tournamentListLogoFileInputHolder,
  logoUploading,
  logoRemoving,
  tournamentSlugGenerated,
  showNameError,
  tournamentFormErrors,
  onCreateTemplatePick,
  triggerLogoPick,
  removeTournamentLogo,
  onLogoFileChange,
  canTournamentAutomation,
  formatOptionsForForm,
  tournamentCalendarColorPresets,
  tournamentCalendarColorTrimmed,
  clearTournamentCalendarColor,
  formatFieldHintText,
  groupCountHintText,
  playoffQualifiersHintText,
  minTeamsHintText,
  groupCountMin,
  groupCountMax,
  impliedGroupCount,
  showGroupCountField,
  minTeamsGridClass,
  isPlayoffFormat,
  isGroupsPlusPlayoffFormat,
  minTeamsMinValue,
  showPlayoffQualifiersField,
  formatCalendarHint,
  syncNumericField,
  seasonSelectOptions,
  seasonsLoading,
  competitionSelectOptions,
  competitionsLoading,
  ageGroupSelectOptions,
  ageGroupsLoading,
  stadiumMultiOptions,
  stadiumsLoading,
  refereeMultiOptions,
  refereesLoading,
  canAccessReferenceBasic,
  canAccessReferenceStandard,
  adminsLoading,
  moderatorSelectOptions,
  teamsLoading,
  teams,
  showTeamsError,
})

onMounted(() => {
  void (async () => {
    if (typeof window !== 'undefined') {
      syncWithStorage()
      if (!loggedIn.value) {
        loading.value = false
        router.push('/admin/login')
        return
      }
      await fetchMe()
    }
    bootstrapListFromCurrentRoute()
    void fetchSeasonsList()
    void fetchCompetitionsList()
    void fetchAgeGroupsList()

    if (typeof window !== 'undefined') {
      installInfiniteScrollAndObserver()
    }
  })()
})
</script>

<template>
  <section class="admin-page space-y-3 sm:space-y-4">
    <AdminTournamentsWorkspaceTabs v-if="!isOrgModeratorReadOnly" />
    <AdminTournamentsTemplatesPanel v-if="isTemplatesTab && !isOrgModeratorReadOnly" />
    <template v-else>
    <AdminTenantTournamentLimits
      v-if="!loading && !isOrgModeratorReadOnly"
      :tournaments-count="tournamentsTotal"
    />
    <header
      v-if="!tournamentsListSemanticallyEmpty || listError"
      class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
    >
      <div class="min-w-0">
        <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-0 sm:text-xl">
          {{ t('admin.tournaments_list.title') }}
        </h1>
        <p class="mt-1 text-xs text-muted-color sm:text-sm">
          {{ t('admin.tournaments_list.subtitle') }}
        </p>
      </div>
      <div
        class="admin-toolbar-responsive flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:shrink-0 sm:flex-row sm:flex-wrap sm:justify-end"
      >
        <Button
          class="w-full justify-center sm:w-auto"
          :label="t('admin.tournaments_list.refresh')"
          icon="pi pi-refresh"
          text
          severity="secondary"
          :loading="loading"
          @click="fetchTournaments({ reset: true })"
        />
        <Button
          v-if="!isOrgModeratorReadOnly"
          class="w-full justify-center sm:w-auto"
          :label="t('admin.tournaments_list.create')"
          icon="pi pi-plus"
          :disabled="!canCreateAnotherTournament"
          v-tooltip.top="canCreateAnotherTournament ? undefined : adminTooltip(createTournamentBlockedHint)"
          @click="openCreate"
        />
      </div>
    </header>

    <AdminDataState
      :loading="loading"
      :error="listError"
      :empty="false"
      :content-card="false"
      @retry="retryList"
    >
      <template #loading>
        <div class="min-h-[28rem] space-y-2 sm:space-y-3" aria-busy="true">
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
      </template>
      <div class="space-y-2 sm:space-y-3">
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
        v-for="row in tournaments"
        :key="row.id"
        :tournament="row"
        :formatLabel="tournamentFormatLabel(row.format)"
        :statusLabel="statusLabel(row.status)"
        :statusClass="tournamentLifecycleBadgeClass(row.status)"
        :publishSavingTournamentId="listPublishSavingId"
        :read-only="isOrgModeratorReadOnly"
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
          {{
            isOrgModeratorReadOnly
              ? t('admin.tournaments_list.empty_lead_moderator')
              : t('admin.tournaments_list.empty_lead')
          }}
        </p>
        <Button
          v-if="!isOrgModeratorReadOnly"
          class="mt-6"
          :label="t('admin.tournaments_list.empty_cta')"
          icon="pi pi-plus"
          :disabled="!canCreateAnotherTournament"
          v-tooltip.top="canCreateAnotherTournament ? undefined : adminTooltip(createTournamentBlockedHint)"
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
    </AdminDataState>

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
      <AdminTournamentListFormBody
        v-model:create-template-id="createTemplateId"
        v-model:manual-playoff-enabled="manualPlayoffEnabled"
        v-model:calendar-picker="calendarColorPickerModel"
        :bindings="tournamentListFormBodyBindings"
      />
    </AdminTournamentFormDialog>

    <AdminTournamentListDeleteDialog
      v-model:visible="deleteDialogVisible"
      :delete-saving="deleteSaving"
      :delete-target="deleteTarget"
      @hide="deleteTarget = null"
      @archive="moveTournamentToArchive"
      @confirm-delete="confirmDeleteTournament"
    />
    </template>
  </section>
</template>


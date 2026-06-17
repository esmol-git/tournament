<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type {
  CompetitionEditionDetail,
  CompetitionAudience,
  EditionStatus,
  SanctionScope,
} from '~/types/admin/competition-edition'
import type { SeasonRow } from '~/types/admin/season'
import type { CompetitionRow } from '~/types/admin/competition'
import type { AgeGroupRow } from '~/types/admin/age-group'
import type { TournamentRow } from '~/types/admin/tournaments-index'
import { getApiErrorMessage } from '~/utils/apiError'
import { slugifyFromTitle } from '~/utils/slugify'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()

const editionId = computed(() => String(route.params.id ?? ''))
const loading = ref(true)
const saving = ref(false)
const linking = ref(false)
const edition = ref<CompetitionEditionDetail | null>(null)
const preview = ref<{ name: string; slug: string } | null>(null)
const seasons = ref<SeasonRow[]>([])
const competitions = ref<CompetitionRow[]>([])
const ageGroups = ref<AgeGroupRow[]>([])
const allTournaments = ref<TournamentRow[]>([])
const tournamentToLink = ref<string | null>(null)

const form = reactive({
  name: '',
  slug: '',
  description: '',
  seasonId: '',
  competitionId: '',
  audience: 'OPEN' as CompetitionAudience,
  sanctionScope: 'EDITION' as SanctionScope,
  status: 'DRAFT' as EditionStatus,
  published: false,
  cardAutoBanEnabled: false,
  redCardBanMatches: 1,
  yellowAccumulationThreshold: 2,
  yellowAccumulationBanMatches: 1,
  eligibilityAgeGroupId: null as string | null,
  eligibilityMinBirthYear: null as number | null,
  eligibilityMaxBirthYear: null as number | null,
  eligibilityRequireBirthDate: false,
})

const ageGroupOptions = computed(() => [
  { label: t('admin.editions.eligibility_age_group_none'), value: null as string | null },
  ...ageGroups.value.map((ag) => ({ label: ag.name, value: ag.id })),
])

const audienceOptions = computed(() => [
  { label: t('admin.editions.audience_youth'), value: 'YOUTH' },
  { label: t('admin.editions.audience_adult_amateur'), value: 'ADULT_AMATEUR' },
  { label: t('admin.editions.audience_adult_competitive'), value: 'ADULT_COMPETITIVE' },
  { label: t('admin.editions.audience_open'), value: 'OPEN' },
])

const sanctionScopeOptions = computed(() => [
  { label: t('admin.editions.sanction_tournament'), value: 'TOURNAMENT' },
  { label: t('admin.editions.sanction_edition'), value: 'EDITION' },
])

const statusOptions = computed(() => [
  { label: t('admin.editions.status_draft'), value: 'DRAFT' },
  { label: t('admin.editions.status_active'), value: 'ACTIVE', disabled: !canPublishEdition.value },
  { label: t('admin.editions.status_archived'), value: 'ARCHIVED' },
])

const linkedIds = computed(() => new Set(edition.value?.tournaments.map((x) => x.id) ?? []))

const linkableTournaments = computed(() =>
  allTournaments.value.filter((tRow) => !linkedIds.value.has(tRow.id)),
)

const activePublishedTournamentCount = computed(() => {
  const list = edition.value?.tournaments ?? []
  return list.filter((tRow) => tRow.status === 'ACTIVE' && tRow.published).length
})
const canPublishEdition = computed(() => activePublishedTournamentCount.value > 0)

const pageLoading = computed(() => loading.value && !preview.value)
const headerTitle = computed(() => edition.value?.name ?? preview.value?.name ?? '')
const headerSlug = computed(() => edition.value?.slug ?? preview.value?.slug ?? '')

const slugEditable = ref(false)

watch(
  () => form.name,
  (name) => {
    if (!edition.value) return
    if (slugEditable.value) return
    // Автогенерация работает только пока slug не редактировали вручную:
    // если slug совпадает с текущим значением из БД (или пустой) — обновляем.
    const current = String(form.slug ?? '').trim()
    const baseDb = String(edition.value.slug ?? '').trim()
    if (!current || current === baseDb) {
      form.slug = slugifyFromTitle(name, baseDb || 'edition')
    }
  },
)

function toggleSlugEditing() {
  slugEditable.value = !slugEditable.value
}

function readEditionPreview() {
  const st = history.state as { editionPreview?: { name?: string; slug?: string } } | null
  const name = String(st?.editionPreview?.name ?? '').trim()
  const slug = String(st?.editionPreview?.slug ?? '').trim()
  if (name) preview.value = { name, slug: slug || name }
}

async function archiveEdition() {
  if (!token.value || !edition.value) return
  saving.value = true
  try {
    edition.value = await authFetch<CompetitionEditionDetail>(
      apiUrl(`/tenants/${tenantId.value}/editions/${editionId.value}`),
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: {
          status: 'ARCHIVED',
          published: false,
        },
      },
    )
    applyEditionToForm(edition.value)
    toast.add({ severity: 'success', summary: 'Серия архивирована', life: 3000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: getApiErrorMessage(e), life: 5000 })
  } finally {
    saving.value = false
  }
}

function applyEditionToForm(row: CompetitionEditionDetail) {
  form.name = row.name
  form.slug = row.slug
  slugEditable.value = false
  form.description = row.description ?? ''
  form.seasonId = row.season.id
  form.competitionId = row.competition.id
  form.audience = row.audience
  form.sanctionScope = row.sanctionScope
  form.status = row.status
  form.published = row.published
  form.cardAutoBanEnabled = row.cardAutoBanEnabled
  form.redCardBanMatches = row.redCardBanMatches
  form.yellowAccumulationThreshold = row.yellowAccumulationThreshold
  form.yellowAccumulationBanMatches = row.yellowAccumulationBanMatches
  const pol = row.eligibilityPolicy
  form.eligibilityAgeGroupId = pol?.ageGroupId ?? pol?.ageGroup?.id ?? null
  form.eligibilityMinBirthYear = pol?.minBirthYear ?? null
  form.eligibilityMaxBirthYear = pol?.maxBirthYear ?? null
  form.eligibilityRequireBirthDate = pol?.requireBirthDate ?? false
}

async function loadEdition() {
  if (!token.value) return
  edition.value = await authFetch<CompetitionEditionDetail>(
    apiUrl(`/tenants/${tenantId.value}/editions/${editionId.value}`),
    { headers: { Authorization: `Bearer ${token.value}` } },
  )
  applyEditionToForm(edition.value)
}

async function loadRefs() {
  if (!token.value) return
  const headers = { Authorization: `Bearer ${token.value}` }
  const [s, c, ag, toursRes] = await Promise.all([
    authFetch<SeasonRow[]>(apiUrl(`/tenants/${tenantId.value}/seasons`), { headers }),
    authFetch<CompetitionRow[]>(apiUrl(`/tenants/${tenantId.value}/competitions`), { headers }),
    authFetch<AgeGroupRow[]>(apiUrl(`/tenants/${tenantId.value}/age-groups`), { headers }),
    authFetch<{ items: TournamentRow[] }>(apiUrl(`/tenants/${tenantId.value}/tournaments`), {
      headers,
      params: { page: 1, pageSize: 100 },
    }),
  ])
  seasons.value = s
  competitions.value = c
  ageGroups.value = ag
  allTournaments.value = toursRes.items ?? []
}

async function reload() {
  loading.value = true
  try {
    await Promise.all([loadEdition(), loadRefs()])
  } catch (e) {
    toast.add({ severity: 'error', summary: getApiErrorMessage(e), life: 5000 })
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!token.value || !edition.value) return
  saving.value = true
  try {
    edition.value = await authFetch<CompetitionEditionDetail>(
      apiUrl(`/tenants/${tenantId.value}/editions/${editionId.value}`),
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: {
          name: form.name.trim(),
          slug: form.slug.trim(),
          description: form.description.trim() || null,
          seasonId: form.seasonId,
          competitionId: form.competitionId,
          audience: form.audience,
          sanctionScope: form.sanctionScope,
          status: form.status,
          published: form.published,
          cardAutoBanEnabled: form.cardAutoBanEnabled,
          redCardBanMatches: form.redCardBanMatches,
          yellowAccumulationThreshold: form.yellowAccumulationThreshold,
          yellowAccumulationBanMatches: form.yellowAccumulationBanMatches,
          eligibility: {
            ageGroupId: form.eligibilityAgeGroupId,
            minBirthYear: form.eligibilityMinBirthYear,
            maxBirthYear: form.eligibilityMaxBirthYear,
            requireBirthDate: form.eligibilityRequireBirthDate,
          },
        },
      },
    )
    applyEditionToForm(edition.value)
    toast.add({ severity: 'success', summary: t('admin.editions.saved'), life: 3000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: getApiErrorMessage(e), life: 5000 })
  } finally {
    saving.value = false
  }
}

async function linkTournament() {
  if (!token.value || !tournamentToLink.value) return
  linking.value = true
  try {
    edition.value = await authFetch<CompetitionEditionDetail>(
      apiUrl(
        `/tenants/${tenantId.value}/editions/${editionId.value}/tournaments/${tournamentToLink.value}`,
      ),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { regulationMode: 'INHERIT' },
      },
    )
    tournamentToLink.value = null
    toast.add({ severity: 'success', summary: t('admin.editions.tournament_linked'), life: 3000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: getApiErrorMessage(e), life: 5000 })
  } finally {
    linking.value = false
  }
}

async function unlinkTournament(tournamentId: string) {
  if (!token.value) return
  linking.value = true
  try {
    edition.value = await authFetch<CompetitionEditionDetail>(
      apiUrl(
        `/tenants/${tenantId.value}/editions/${editionId.value}/tournaments/${tournamentId}`,
      ),
      { method: 'DELETE', headers: { Authorization: `Bearer ${token.value}` } },
    )
    toast.add({ severity: 'success', summary: t('admin.editions.tournament_unlinked'), life: 3000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: getApiErrorMessage(e), life: 5000 })
  } finally {
    linking.value = false
  }
}

onMounted(async () => {
  syncWithStorage()
  if (!loggedIn.value) return
  readEditionPreview()
  await reload()
})
</script>

<template>
  <section class="admin-page space-y-4 sm:space-y-6">
    <AdminDataState
      :loading="pageLoading"
      :error="null"
      :empty="!loading && !edition"
      :content-card="false"
      empty-title="Серия не найдена"
      empty-description="Возможно, серия была удалена или у вас нет доступа."
      empty-icon="pi pi-search"
    >
      <template #loading>
        <div class="space-y-4 sm:space-y-6">
          <div class="admin-toolbar-responsive flex flex-wrap items-center gap-3">
            <Skeleton shape="circle" width="2.25rem" height="2.25rem" />
            <div class="min-w-0 flex-1 space-y-2">
              <Skeleton width="16rem" height="1.25rem" class="rounded-md max-w-[70%]" />
              <Skeleton width="10rem" height="0.875rem" class="rounded-md max-w-[50%]" />
            </div>
            <Skeleton width="8rem" height="2.25rem" class="rounded-lg" />
          </div>

          <div class="grid gap-4 lg:grid-cols-2">
            <div class="rounded-xl border border-surface-200 p-4 dark:border-surface-700">
              <Skeleton width="10rem" height="1rem" class="rounded-md" />
              <div class="mt-4 flex flex-col gap-3">
                <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
                <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
                <div class="grid gap-3 sm:grid-cols-2">
                  <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
                  <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
                  <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
                </div>
              </div>
            </div>
            <div class="rounded-xl border border-surface-200 p-4 dark:border-surface-700">
              <Skeleton width="12rem" height="1rem" class="rounded-md" />
              <div class="mt-4 flex flex-col gap-3">
                <Skeleton width="60%" height="1rem" class="rounded-md" />
                <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
                <div class="grid grid-cols-3 gap-2">
                  <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
                  <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
                  <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-surface-200 p-4 dark:border-surface-700">
            <Skeleton width="10rem" height="1rem" class="rounded-md" />
            <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
              <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
              <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
            </div>
            <Skeleton width="14rem" height="2.5rem" class="rounded-lg mt-4" />
          </div>
        </div>
      </template>

      <div v-if="loading && preview" class="space-y-4 sm:space-y-6">
        <div class="admin-toolbar-responsive flex flex-wrap items-center gap-3">
          <Button icon="pi pi-arrow-left" text severity="secondary" @click="router.push('/admin/editions')" />
          <div class="min-w-0 flex-1">
            <h1 class="truncate text-xl font-bold text-surface-900 dark:text-surface-0 sm:text-2xl">
              {{ headerTitle }}
            </h1>
            <p class="text-sm text-muted-color">/{{ headerSlug }}</p>
          </div>
          <Button :label="t('admin.editions.save')" icon="pi pi-check" disabled />
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <div class="rounded-xl border border-surface-200 p-4 dark:border-surface-700">
            <Skeleton width="10rem" height="1rem" class="rounded-md" />
            <div class="mt-4 flex flex-col gap-3">
              <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
              <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
              <div class="grid gap-3 sm:grid-cols-2">
                <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
                <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
              </div>
            </div>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 dark:border-surface-700">
            <Skeleton width="12rem" height="1rem" class="rounded-md" />
            <div class="mt-4 flex flex-col gap-3">
              <Skeleton width="60%" height="1rem" class="rounded-md" />
              <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-surface-200 p-4 dark:border-surface-700">
          <Skeleton width="10rem" height="1rem" class="rounded-md" />
          <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
            <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
            <Skeleton width="100%" height="2.5rem" class="rounded-lg" />
          </div>
        </div>
      </div>

      <div v-else-if="edition" class="space-y-4 sm:space-y-6">
        <div class="admin-toolbar-responsive flex flex-wrap items-center gap-3">
          <Button icon="pi pi-arrow-left" text severity="secondary" @click="router.push('/admin/editions')" />
          <div class="min-w-0 flex-1">
            <h1 class="truncate text-xl font-bold text-surface-900 dark:text-surface-0 sm:text-2xl">
              {{ headerTitle }}
            </h1>
            <p class="text-sm text-muted-color">/{{ headerSlug }}</p>
          </div>
          <Button :label="t('admin.editions.save')" icon="pi pi-check" :loading="saving" @click="save" />
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <div class="rounded-xl border border-surface-200 p-4 dark:border-surface-700">
        <h2 class="text-base font-semibold">{{ t('admin.editions.section_main') }}</h2>
        <div class="mt-3 flex flex-col gap-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.field_name') }}</label>
            <InputText v-model="form.name" class="w-full" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-muted-color">Slug</label>
            <div class="flex gap-2">
              <InputText v-model="form.slug" class="w-full" :readonly="!slugEditable" />
              <Button
                type="button"
                :icon="slugEditable ? 'pi pi-lock-open' : 'pi pi-lock'"
                severity="secondary"
                text
                rounded
                :aria-label="slugEditable ? 'Заблокировать slug' : 'Разблокировать slug'"
                @click="toggleSlugEditing"
              />
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.field_season') }}</label>
              <Select v-model="form.seasonId" :options="seasons" option-label="name" option-value="id" class="w-full" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.field_competition') }}</label>
              <Select v-model="form.competitionId" :options="competitions" option-label="name" option-value="id" class="w-full" />
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.field_audience') }}</label>
              <Select v-model="form.audience" :options="audienceOptions" option-label="label" option-value="value" class="w-full" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.field_sanction_scope') }}</label>
              <Select v-model="form.sanctionScope" :options="sanctionScopeOptions" option-label="label" option-value="value" class="w-full" />
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.col_status') }}</label>
              <Select v-model="form.status" :options="statusOptions" option-label="label" option-value="value" class="w-full" />
            </div>
            <div class="flex items-end gap-2 pb-1">
              <ToggleSwitch v-model="form.published" :disabled="!canPublishEdition" />
              <span class="text-sm">{{ t('admin.editions.field_published') }}</span>
            </div>
          </div>
          <div v-if="!canPublishEdition" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
            Чтобы активировать или публиковать серию, привяжите хотя бы один турнир со статусом <b>ACTIVE</b> и включённой публикацией.
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              label="Архивировать серию"
              severity="secondary"
              outlined
              :disabled="saving || form.status === 'ARCHIVED'"
              @click="archiveEdition"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.field_description') }}</label>
            <Textarea v-model="form.description" rows="3" class="w-full" auto-resize />
          </div>
        </div>
          </div>

          <div class="rounded-xl border border-surface-200 p-4 dark:border-surface-700">
        <h2 class="text-base font-semibold">{{ t('admin.editions.section_cards') }}</h2>
        <p class="mt-1 text-xs text-muted-color">{{ t('admin.editions.section_cards_hint') }}</p>
        <div class="mt-3 flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <ToggleSwitch v-model="form.cardAutoBanEnabled" />
            <span class="text-sm">{{ t('admin.editions.card_auto_ban') }}</span>
          </div>
          <div v-if="form.cardAutoBanEnabled" class="grid grid-cols-3 gap-2">
            <div>
              <label class="mb-1 block text-xs text-muted-color">{{ t('admin.editions.red_ban') }}</label>
              <InputNumber v-model="form.redCardBanMatches" :min="0" :max="10" class="w-full" />
            </div>
            <div>
              <label class="mb-1 block text-xs text-muted-color">{{ t('admin.editions.yellow_threshold') }}</label>
              <InputNumber v-model="form.yellowAccumulationThreshold" :min="1" :max="10" class="w-full" />
            </div>
            <div>
              <label class="mb-1 block text-xs text-muted-color">{{ t('admin.editions.yellow_ban') }}</label>
              <InputNumber v-model="form.yellowAccumulationBanMatches" :min="0" :max="10" class="w-full" />
            </div>
          </div>
        </div>
          </div>
    </div>

        <div class="rounded-xl border border-surface-200 p-4 dark:border-surface-700">
      <h2 class="text-base font-semibold">{{ t('admin.editions.section_eligibility') }}</h2>
      <p class="mt-1 text-xs text-muted-color">{{ t('admin.editions.section_eligibility_hint') }}</p>
      <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="sm:col-span-2">
          <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.eligibility_age_group') }}</label>
          <Select
            v-model="form.eligibilityAgeGroupId"
            :options="ageGroupOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            show-clear
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.eligibility_min_year') }}</label>
          <InputNumber v-model="form.eligibilityMinBirthYear" :min="1900" :max="2100" :use-grouping="false" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-muted-color">{{ t('admin.editions.eligibility_max_year') }}</label>
          <InputNumber v-model="form.eligibilityMaxBirthYear" :min="1900" :max="2100" :use-grouping="false" class="w-full" />
        </div>
        <div class="flex items-center gap-2 sm:col-span-2">
          <ToggleSwitch v-model="form.eligibilityRequireBirthDate" />
          <span class="text-sm">{{ t('admin.editions.eligibility_require_birth_date') }}</span>
        </div>
      </div>
        </div>

        <div class="rounded-xl border border-surface-200 p-4 dark:border-surface-700">
      <h2 class="text-base font-semibold">{{ t('admin.editions.section_tournaments') }}</h2>
      <p class="mt-1 text-xs text-muted-color">{{ t('admin.editions.section_tournaments_hint') }}</p>

      <div class="mt-3 flex flex-wrap items-end gap-2">
        <div class="min-w-[16rem] flex-1">
          <Select
            v-model="tournamentToLink"
            :options="linkableTournaments"
            option-label="name"
            option-value="id"
            :placeholder="t('admin.editions.link_tournament_placeholder')"
            class="w-full"
            filter
          />
        </div>
        <Button
          :label="t('admin.editions.link_tournament')"
          icon="pi pi-link"
          :disabled="!tournamentToLink"
          :loading="linking"
          @click="linkTournament"
        />
      </div>

      <ul v-if="edition.tournaments.length" class="mt-4 divide-y divide-surface-200 dark:divide-surface-700">
        <li
          v-for="tRow in edition.tournaments"
          :key="tRow.id"
          class="flex flex-wrap items-center justify-between gap-2 py-3"
        >
          <div>
            <NuxtLink :to="`/admin/tournaments/${tRow.id}`" class="font-medium text-primary-500 hover:underline">
              {{ tRow.name }}
            </NuxtLink>
            <p class="text-xs text-muted-color">
              {{ tRow.regulationMode === 'INHERIT' ? t('admin.editions.regulation_inherit') : t('admin.editions.regulation_override') }}
            </p>
          </div>
          <Button
            icon="pi pi-times"
            severity="danger"
            text
            :loading="linking"
            :aria-label="t('admin.editions.unlink_tournament')"
            @click="unlinkTournament(tRow.id)"
          />
        </li>
      </ul>
      <p v-else class="mt-4 text-sm text-muted-color">{{ t('admin.editions.no_tournaments') }}</p>
        </div>
      </div>
    </AdminDataState>
  </section>
</template>

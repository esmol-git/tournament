<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { helpers, required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { NewsTagRow } from '~/types/admin/news-tag'
import type { TournamentNewsRow } from '~/types/admin/tournament-news'
import type { TournamentListResponse, TournamentRow } from '~/types/admin/tournaments-index'
import { getApiErrorMessage } from '~/utils/apiError'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const router = useRouter()
const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()
const toast = useToast()
const { t } = useI18n()

const loading = ref(true)
const tournamentsLoading = ref(false)
const newsTagsLoading = ref(false)
const saving = ref(false)
const items = ref<TournamentNewsRow[]>([])
const tournaments = ref<TournamentRow[]>([])
const newsTags = ref<NewsTagRow[]>([])
const showForm = ref(false)
const editing = ref<TournamentNewsRow | null>(null)
const isEdit = computed(() => !!editing.value)

const tournamentFilter = ref<string | null>(null)
const sectionFilter = ref<string | null>(null)
const tagFilter = ref<string | null>(null)

const sectionOptions = [
  { value: 'ANNOUNCEMENT', label: 'Анонс' },
  { value: 'REPORT', label: 'Отчет' },
  { value: 'INTERVIEW', label: 'Интервью' },
  { value: 'OFFICIAL', label: 'Официально' },
  { value: 'MEDIA', label: 'Медиа' },
]

const coverFileInputRef = ref<HTMLInputElement | null>(null)
const coverUploading = ref(false)
const MAX_COVER_BYTES = 15 * 1024 * 1024
const coverPreviewBroken = ref(false)

const form = reactive({
  tournamentId: null as string | null,
  section: 'ANNOUNCEMENT' as 'ANNOUNCEMENT' | 'REPORT' | 'INTERVIEW' | 'OFFICIAL' | 'MEDIA',
  tagIds: [] as string[],
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  coverImageUrl: '',
  published: false,
  publishedAt: null as Date | null,
  sortOrder: 0,
})
const submitAttempted = ref(false)

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const tournamentSelectOptions = computed(() =>
  tournaments.value.map((x) => ({ label: x.name, value: x.id })),
)
const newsTagSelectOptions = computed(() =>
  newsTags.value.map((x) => ({ label: x.name, value: x.id })),
)
const sectionLabelByValue = computed(() =>
  sectionOptions.reduce<Record<string, string>>((acc, x) => {
    acc[x.value] = x.label
    return acc
  }, {}),
)
const coverPreviewUrl = computed(() => {
  const url = form.coverImageUrl.trim()
  return url && isHttpUrl(url) ? url : ''
})
const rules = computed(() => ({
  title: { required },
  slug: {
    required,
    slug: helpers.withMessage('slug', (v: unknown) => {
      const s = String(v ?? '').trim()
      return !s || SLUG_RE.test(s)
    }),
  },
  coverImageUrl: {
    httpUrl: helpers.withMessage('coverImageUrl', (v: unknown) => {
      const s = String(v ?? '').trim()
      return !s || isHttpUrl(s)
    }),
  },
  tournamentId: {
    requiredWhenPublished: helpers.withMessage(
      'publishedTournament',
      (v: unknown) => !form.published || !!v,
    ),
  },
}))
const v$ = useVuelidate(rules, form, { $autoDirty: true })

const formErrors = computed(() => {
  const title = form.title.trim()
  const slug = form.slug.trim()
  const coverImageUrl = form.coverImageUrl.trim()
  return {
    title: title ? '' : t('admin.news.title_slug_required'),
    slug: !slug
      ? t('admin.news.title_slug_required')
      : !SLUG_RE.test(slug)
        ? t('admin.validation.slug_latin_dash')
        : '',
    coverImageUrl:
      coverImageUrl && !isHttpUrl(coverImageUrl)
        ? t('admin.validation.invalid_url')
        : '',
    publishedTournament:
      form.published && !form.tournamentId ? t('admin.news.publish_requires_tournament') : '',
  }
})
const canSave = computed(
  () =>
    !!token.value &&
    !saving.value &&
    !v$.value.$invalid &&
    !formErrors.value.title &&
    !formErrors.value.slug &&
    !formErrors.value.coverImageUrl &&
    !formErrors.value.publishedTournament,
)
const showTitleError = computed(() => (submitAttempted.value || v$.value.title.$dirty) && !!formErrors.value.title)
const showSlugError = computed(() => (submitAttempted.value || v$.value.slug.$dirty) && !!formErrors.value.slug)
const showCoverError = computed(
  () => (submitAttempted.value || v$.value.coverImageUrl.$dirty) && !!formErrors.value.coverImageUrl,
)
const showPublishedTournamentError = computed(
  () => (submitAttempted.value || v$.value.tournamentId.$dirty) && !!formErrors.value.publishedTournament,
)

function onTournamentFilterChange(v: string | null) {
  tournamentFilter.value = v
  void fetchItems()
}

function onSectionFilterChange(v: string | null) {
  sectionFilter.value = v
  void fetchItems()
}

function onTagFilterChange(v: string | null) {
  tagFilter.value = v
  void fetchItems()
}

async function loadTournaments() {
  if (!token.value) return
  tournamentsLoading.value = true
  try {
    const acc: TournamentRow[] = []
    let page = 1
    const pageSize = 100
    for (;;) {
      const res = await authFetch<TournamentListResponse>(
        apiUrl(`/tenants/${tenantId.value}/tournaments`),
        {
          headers: { Authorization: `Bearer ${token.value}` },
          params: { page, pageSize },
        },
      )
      const batch = res.items ?? []
      acc.push(...batch)
      const total = res.total ?? acc.length
      if (batch.length < pageSize || acc.length >= total) break
      page += 1
    }
    tournaments.value = acc
  } catch {
    tournaments.value = []
  } finally {
    tournamentsLoading.value = false
  }
}

async function loadNewsTags() {
  if (!token.value) return
  newsTagsLoading.value = true
  try {
    newsTags.value = await authFetch<NewsTagRow[]>(
      apiUrl(`/tenants/${tenantId.value}/news-tags`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
      },
    )
  } catch {
    newsTags.value = []
  } finally {
    newsTagsLoading.value = false
  }
}

const fetchItems = async () => {
  if (!token.value) return
  loading.value = true
  try {
    const qs = new URLSearchParams()
    const qTid = tournamentFilter.value
    if (qTid) qs.set('tournamentId', qTid)
    const qSection = sectionFilter.value
    if (qSection) qs.set('section', qSection)
    const qTag = tagFilter.value
    if (qTag) qs.set('tagId', qTag)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    items.value = await authFetch<TournamentNewsRow[]>(
      apiUrl(`/tenants/${tenantId.value}/news${suffix}`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.news.load_error'),
      detail: getApiErrorMessage(e),
      life: 6000,
    })
    items.value = []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  submitAttempted.value = false
  editing.value = null
  coverPreviewBroken.value = false
  form.tournamentId = (route.query.tournament as string) || null
  form.section = 'ANNOUNCEMENT'
  form.tagIds = []
  form.title = ''
  form.slug = ''
  form.excerpt = ''
  form.content = ''
  form.coverImageUrl = ''
  form.published = false
  form.publishedAt = null
  form.sortOrder = 0
  v$.value.$reset()
  showForm.value = true
}

function openCoverPicker() {
  coverFileInputRef.value?.click()
}

async function onCoverFileSelected(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file || !token.value) {
    if (target) target.value = ''
    return
  }
  if (file.size > MAX_COVER_BYTES) {
    toast.add({
      severity: 'warn',
      summary: t('admin.news.cover_too_large'),
      detail: t('admin.news.cover_max_size'),
      life: 4500,
    })
    target.value = ''
    return
  }
  coverUploading.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    const res = await authFetch<{ key: string; url: string }>(
      apiUrl('/upload?folder=news'),
      { method: 'POST', body },
    )
    form.coverImageUrl = res.url
    coverPreviewBroken.value = false
    toast.add({ severity: 'success', summary: t('admin.news.cover_uploaded'), life: 3000 })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.news.cover_upload_error'),
      detail: getApiErrorMessage(err),
      life: 6000,
    })
  } finally {
    coverUploading.value = false
    target.value = ''
  }
}

function clearCover() {
  form.coverImageUrl = ''
  coverPreviewBroken.value = false
}

function openEdit(row: TournamentNewsRow) {
  submitAttempted.value = false
  editing.value = row
  coverPreviewBroken.value = false
  form.tournamentId = row.tournamentId
  form.section = row.section
  form.tagIds = (row.newsTags ?? []).map((x) => x.tag.id)
  form.title = row.title
  form.slug = row.slug
  form.excerpt = row.excerpt ?? ''
  form.content = row.content ?? ''
  form.coverImageUrl = row.coverImageUrl ?? ''
  form.published = row.published
  form.publishedAt = row.publishedAt ? new Date(row.publishedAt) : null
  form.sortOrder = row.sortOrder
  v$.value.$reset()
  showForm.value = true
}

const save = async () => {
  submitAttempted.value = true
  v$.value.$touch()
  const title = form.title.trim()
  const slug = form.slug.trim()
  const coverImageUrl = form.coverImageUrl.trim()
  if (!canSave.value) {
    return
  }
  saving.value = true
  try {
    const body: Record<string, unknown> = {
      title,
      slug,
      section: form.section,
      tagIds: form.tagIds,
      excerpt: form.excerpt.trim() || undefined,
      content: form.content || undefined,
      coverImageUrl: coverImageUrl || undefined,
      published: form.published,
      publishedAt: form.publishedAt ? form.publishedAt.toISOString() : null,
      sortOrder: form.sortOrder,
      tournamentId: form.tournamentId,
    }
    if (isEdit.value) {
      await authFetch(
        apiUrl(`/tenants/${tenantId.value}/news/${editing.value!.id}`),
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token.value}` },
          body,
        },
      )
    } else {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/news`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
    }
    showForm.value = false
    await fetchItems()
    toast.add({ severity: 'success', summary: t('admin.news.saved'), life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.news.save_error'),
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    saving.value = false
  }
}

const remove = async (row: TournamentNewsRow) => {
  if (!token.value) return
  if (!confirm(t('admin.news.delete_confirm', { title: row.title }))) return
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/news/${row.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await fetchItems()
    toast.add({ severity: 'success', summary: t('admin.news.deleted'), life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.news.delete_error'),
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  }
}

onMounted(() => {
  if (process.client) {
    syncWithStorage()
    if (!loggedIn.value) {
      router.push('/admin/login')
      return
    }
    const q = route.query.tournament as string | undefined
    if (q) tournamentFilter.value = q
  }
  void loadTournaments()
  void loadNewsTags()
  void fetchItems()
})
</script>

<template>
  <section class="news-page mx-auto w-full max-w-7xl space-y-4 p-6">
    <header
      class="rounded-2xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
    >
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0">
          <h1 class="text-xl font-semibold tracking-tight">{{ t('admin.news.title') }}</h1>
          <p class="mt-1 max-w-2xl text-sm leading-6 text-muted-color">{{ t('admin.news.intro') }}</p>
        </div>

        <div class="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-[42rem]">
          <div class="min-w-0 sm:min-w-[16rem]">
            <label for="news_tournament_filter" class="mb-1 block text-xs font-medium text-muted-color">
              {{ t('admin.news.filter_tournament') }}
            </label>
            <Select
              :model-value="tournamentFilter"
              input-id="news_tournament_filter"
              class="w-full"
              :options="[
                { label: t('admin.news.filter_all'), value: null },
                ...tournamentSelectOptions,
              ]"
              option-label="label"
              option-value="value"
              :show-clear="false"
              :loading="tournamentsLoading"
              @update:model-value="onTournamentFilterChange"
            />
          </div>
          <div class="min-w-0">
            <label for="news_section_filter" class="mb-1 block text-xs font-medium text-muted-color">
              Раздел
            </label>
            <Select
              :model-value="sectionFilter"
              input-id="news_section_filter"
              class="w-full"
              :options="[{ label: t('admin.news.filter_all'), value: null }, ...sectionOptions]"
              option-label="label"
              option-value="value"
              :show-clear="false"
              @update:model-value="onSectionFilterChange"
            />
          </div>
          <div class="min-w-0 sm:flex sm:items-end sm:gap-2">
            <div class="min-w-0 sm:flex-1">
              <label for="news_tag_filter" class="mb-1 block text-xs font-medium text-muted-color">
                Тег
              </label>
              <Select
                :model-value="tagFilter"
                input-id="news_tag_filter"
                class="w-full"
                :options="[{ label: t('admin.news.filter_all'), value: null }, ...newsTagSelectOptions]"
                option-label="label"
                option-value="value"
                :show-clear="false"
                :loading="newsTagsLoading"
                @update:model-value="onTagFilterChange"
              />
            </div>
            <Button :label="t('admin.news.add')" icon="pi pi-plus" class="mt-2 sm:mt-0 sm:h-[2.65rem]" @click="openCreate" />
          </div>
        </div>
      </div>
    </header>

    <div class="rounded-2xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900">
      <DataTable :value="items" data-key="id" :loading="loading" striped-rows>
      <Column field="title" :header="t('admin.news.col_title')">
        <template #body="{ data }">
          <div class="font-medium text-surface-900 dark:text-surface-100">{{ data.title }}</div>
        </template>
      </Column>
      <Column field="slug" :header="t('admin.news.col_slug')">
        <template #body="{ data }">
          <code class="rounded bg-surface-100 px-1.5 py-0.5 text-xs dark:bg-surface-800">/{{ data.slug }}</code>
        </template>
      </Column>
      <Column header="Раздел" style="width: 8rem">
        <template #body="{ data }">
          <Tag :value="sectionLabelByValue[data.section] ?? data.section" severity="info" />
        </template>
      </Column>
      <Column header="Теги" style="width: 14rem">
        <template #body="{ data }">
          <div class="flex flex-wrap gap-1">
            <Tag
              v-for="row in (data.newsTags ?? [])"
              :key="row.tag.id"
              :value="row.tag.name"
              severity="secondary"
            />
          </div>
        </template>
      </Column>
      <Column :header="t('admin.news.col_tournament')" style="width: 12rem">
        <template #body="{ data }">
          <span v-if="data.tournament?.name" class="text-sm">{{ data.tournament.name }}</span>
          <Tag v-else severity="secondary" :value="t('admin.news.draft_no_tournament')" />
        </template>
      </Column>
      <Column field="sortOrder" :header="t('admin.news.col_order')" style="width: 6rem" />
      <Column :header="t('admin.news.col_status')" style="width: 10rem">
        <template #body="{ data }">
          <Tag
            :value="data.published ? t('admin.news.status_published') : t('admin.news.status_draft')"
            :severity="data.published ? 'success' : 'secondary'"
          />
        </template>
      </Column>
      <Column header="" style="width: 8rem" body-class="!text-end">
        <template #body="{ data }">
          <div class="inline-flex items-center gap-1">
            <Button icon="pi pi-pencil" text rounded severity="secondary" @click="openEdit(data)" />
            <Button icon="pi pi-trash" text rounded severity="danger" @click="remove(data)" />
          </div>
        </template>
      </Column>
      <template #empty>
        <div class="py-10 text-center text-muted-color">{{ t('admin.news.empty') }}</div>
      </template>
      </DataTable>
    </div>

    <Dialog
      :visible="showForm"
      @update:visible="showForm = $event"
      modal
      :header="isEdit ? t('admin.news.dialog_edit') : t('admin.news.dialog_create')"
      :style="{ width: '42rem' }"
    >
      <div class="space-y-3">
        <div>
          <label class="text-sm block mb-1">{{ t('admin.news.field_tournament') }}</label>
          <Select
            v-model="form.tournamentId"
            class="w-full"
            :invalid="showPublishedTournamentError"
            :options="[{ label: t('admin.news.tournament_none'), value: null }, ...tournamentSelectOptions]"
            option-label="label"
            option-value="value"
            :placeholder="t('admin.news.tournament_placeholder')"
            :show-clear="true"
          />
          <p v-if="showPublishedTournamentError" class="mt-0 text-[11px] leading-4 text-red-500">
            {{ formErrors.publishedTournament }}
          </p>
          <p class="text-xs text-muted-color mt-1">{{ t('admin.news.tournament_hint') }}</p>
        </div>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label class="text-sm block mb-1">Раздел</label>
            <Select
              v-model="form.section"
              class="w-full"
              :options="sectionOptions"
              option-label="label"
              option-value="value"
            />
          </div>
          <div>
            <label class="text-sm block mb-1">Теги</label>
            <MultiSelect
              v-model="form.tagIds"
              class="w-full"
              :options="newsTagSelectOptions"
              option-label="label"
              option-value="value"
              display="chip"
              :loading="newsTagsLoading"
              placeholder="Без тегов"
            />
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="text-sm block mb-1">{{ t('admin.news.field_title') }}</label>
            <InputText v-model="form.title" class="w-full" :invalid="showTitleError" />
            <p v-if="showTitleError" class="mt-0 text-[11px] leading-4 text-red-500">
              {{ formErrors.title }}
            </p>
          </div>
          <div>
            <label class="text-sm block mb-1">{{ t('admin.news.field_slug') }}</label>
            <InputText v-model="form.slug" class="w-full" :invalid="showSlugError" />
            <p v-if="showSlugError" class="mt-0 text-[11px] leading-4 text-red-500">
              {{ formErrors.slug }}
            </p>
          </div>
        </div>
        <div>
          <label class="text-sm block mb-1">{{ t('admin.news.field_excerpt') }}</label>
          <InputText v-model="form.excerpt" class="w-full" />
        </div>
        <div>
          <label class="text-sm block mb-1">{{ t('admin.news.field_cover') }}</label>
          <div class="space-y-3">
            <div
              class="relative overflow-hidden rounded-xl border border-surface-200 bg-surface-100 dark:border-surface-600 dark:bg-surface-800"
            >
              <div class="aspect-[16/7] w-full">
                <img
                  v-if="coverPreviewUrl && !coverPreviewBroken"
                  :src="coverPreviewUrl"
                  alt=""
                  class="h-full w-full object-cover"
                  @error="coverPreviewBroken = true"
                  @load="coverPreviewBroken = false"
                />
                <div
                  v-else
                  class="flex h-full w-full items-center justify-center text-muted-color"
                >
                  <div class="flex items-center gap-2 text-sm">
                    <i class="pi pi-image text-base opacity-70" aria-hidden="true" />
                    <span>
                      {{ coverPreviewUrl ? t('admin.news.cover_upload_error') : t('admin.news.field_cover') }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div class="min-w-0 space-y-2">
              <input
                ref="coverFileInputRef"
                type="file"
                accept="image/*"
                class="hidden"
                @change="onCoverFileSelected"
              />
              <div class="flex flex-wrap gap-2">
                <Button
                  type="button"
                  :label="t('admin.news.cover_upload_btn')"
                  icon="pi pi-upload"
                  :loading="coverUploading"
                  :disabled="coverUploading"
                  @click="openCoverPicker"
                />
                <Button
                  v-if="form.coverImageUrl"
                  type="button"
                  :label="t('admin.news.cover_clear')"
                  text
                  severity="secondary"
                  @click="clearCover"
                />
              </div>
              <InputText
                v-model="form.coverImageUrl"
                class="w-full"
                :invalid="showCoverError"
                :placeholder="t('admin.news.field_cover_url_placeholder')"
                @input="coverPreviewBroken = false"
              />
              <p v-if="showCoverError" class="mt-0 text-[11px] leading-4 text-red-500">
                {{ formErrors.coverImageUrl }}
              </p>
              <p class="text-xs text-muted-color">{{ t('admin.news.cover_hint') }}</p>
            </div>
          </div>
        </div>
        <div>
          <label class="text-sm block mb-1">{{ t('admin.news.field_content') }}</label>
          <AdminMarkdownEditor v-model="form.content" :rows="8" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="text-sm block mb-1">{{ t('admin.news.field_order') }}</label>
            <InputNumber v-model="form.sortOrder" class="w-full" :min="0" />
          </div>
          <div>
            <label class="text-sm block mb-1">{{ t('admin.news.field_published_at') }}</label>
            <DatePicker v-model="form.publishedAt" class="w-full" show-time hour-format="24" />
          </div>
        </div>
        <div class="flex items-center gap-2">
          <ToggleSwitch
            v-model="form.published"
            input-id="news_published"
            :disabled="!form.tournamentId"
          />
          <label for="news_published" class="text-sm cursor-pointer">{{
            t('admin.news.field_published')
          }}</label>
        </div>
        <p v-if="!form.tournamentId" class="text-xs text-amber-700 dark:text-amber-300">
          {{ t('admin.news.publish_blocked_hint') }}
        </p>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button :label="t('admin.news.cancel')" text @click="showForm = false" />
          <Button
            :label="t('admin.news.save')"
            icon="pi pi-check"
            :loading="saving"
            :disabled="saving || (submitAttempted && !canSave)"
            @click="save"
          />
        </div>
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.news-page :deep(.p-datatable-thead > tr > th) {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
}
</style>

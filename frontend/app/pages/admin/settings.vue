<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Skeleton from 'primevue/skeleton'
import {
  adminAccentOptions,
  type AdminAccentId,
  type AdminLocaleCode,
  type AdminThemeMode,
} from '~/constants/adminSettings'
import { syncThemeAndAccentFromStore } from '~/composables/useAdminAppearance'
import { useAdminSettingsStore } from '~/stores/adminSettings'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { getApiErrorMessage } from '~/utils/apiError'
import { hasSubscriptionFeature } from '~/utils/subscriptionFeatures'

definePageMeta({
  layout: 'admin',
})

const { t } = useI18n()
const toast = useToast()
const store = useAdminSettingsStore()
const { token, authFetch, user } = useAuth()
const { apiUrl } = useApiUrl()
const saving = ref(false)
const activeTab = ref<'admin' | 'public'>('admin')
const route = useRoute()
const router = useRouter()
let tabSyncing = false

const publicLoading = ref(false)
const publicSaving = ref(false)
const publicLogoUploading = ref(false)
const publicFaviconUploading = ref(false)
const publicForbidden = ref(false)
const publicLoadError = ref('')
const publicSettings = ref({
  publicLogoUrl: '',
  publicFaviconUrl: '',
  publicAccentPrimary: '#123c67',
  publicAccentSecondary: '#c80a48',
  publicThemeMode: 'system' as 'light' | 'dark' | 'system',
  publicTagline: '',
  publicOrganizationDisplayName: '',
  publicContactPhone: '',
  publicContactEmail: '',
  publicContactAddress: '',
  publicContactHours: '',
  publicSeoTitle: '',
  publicSeoDescription: '',
  publicOgImageUrl: '',
  publicDefaultLanding: 'tournaments' as 'about' | 'tournaments' | 'participants' | 'media',
  publicTournamentTabsOrder: 'table,chessboard,progress,playoff',
  publicShowLeaderInFacts: true,
  publicShowTopStats: true,
  publicShowNewsInSidebar: true,
})

const publicThemeOptions = computed(() => [
  { label: 'Светлая', value: 'light' as const },
  { label: 'Темная', value: 'dark' as const },
  { label: 'Системная', value: 'system' as const },
])

const publicLandingOptions = computed(() => [
  { label: 'О лиге', value: 'about' as const },
  { label: 'Турниры', value: 'tournaments' as const },
  { label: 'Участники', value: 'participants' as const },
  { label: 'Медиа', value: 'media' as const },
])

const tournamentTabOptions = computed(() => [
  { label: 'Таблица', value: 'table' as const },
  { label: 'Шахматка', value: 'chessboard' as const },
  { label: 'Прогресс', value: 'progress' as const },
  { label: 'Плей-офф', value: 'playoff' as const },
])

function parseTabOrder(raw: string | null | undefined): Array<'table' | 'chessboard' | 'progress' | 'playoff'> {
  const values = String(raw ?? '')
    .split(',')
    .map(x => x.trim().toLowerCase())
    .filter(Boolean)
  const allowed = ['table', 'chessboard', 'progress', 'playoff'] as const
  const isAllowed = (v: string): v is (typeof allowed)[number] =>
    allowed.includes(v as (typeof allowed)[number])
  const next: Array<'table' | 'chessboard' | 'progress' | 'playoff'> = []
  for (const v of values) {
    if (!isAllowed(v)) continue
    if (!next.includes(v)) next.push(v)
  }
  for (const v of allowed) {
    if (!next.includes(v)) next.push(v)
  }
  return next
}

function serializeTabOrder(order: Array<'table' | 'chessboard' | 'progress' | 'playoff'>): string {
  return parseTabOrder(order.join(',')).join(',')
}

const publicTabsOrderDraft = ref<Array<'table' | 'chessboard' | 'progress' | 'playoff'>>(
  parseTabOrder(publicSettings.value.publicTournamentTabsOrder),
)

const tenantSubscriptionPlan = computed(() => {
  const u = user.value as { tenantSubscription?: { plan?: string | null } | null } | null
  return u?.tenantSubscription?.plan ?? null
})

/** Вкладка «Публичные страницы» — с Premier (Free и Amateur без доступа). */
const canEditPublicSiteSettings = computed(() =>
  hasSubscriptionFeature(tenantSubscriptionPlan.value, 'public_site_admin_settings'),
)

function normalizeHex(value: string, fallback: string) {
  const v = value.trim()
  return /^#[0-9A-Fa-f]{6}$/.test(v) ? v.toLowerCase() : fallback
}

function withHttpProtocol(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function isHttpUrlOrEmpty(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  try {
    const u = new URL(withHttpProtocol(trimmed))
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const publicErrors = computed(() => ({
  publicLogoUrl: isHttpUrlOrEmpty(publicSettings.value.publicLogoUrl) ? '' : 'Некорректный URL логотипа',
  publicFaviconUrl: isHttpUrlOrEmpty(publicSettings.value.publicFaviconUrl) ? '' : 'Некорректный URL favicon',
  publicAccentPrimary: /^#[0-9A-Fa-f]{6}$/.test(publicSettings.value.publicAccentPrimary.trim())
    ? ''
    : 'Формат цвета: #RRGGBB',
  publicAccentSecondary: /^#[0-9A-Fa-f]{6}$/.test(publicSettings.value.publicAccentSecondary.trim())
    ? ''
    : 'Формат цвета: #RRGGBB',
  publicOgImageUrl: isHttpUrlOrEmpty(publicSettings.value.publicOgImageUrl) ? '' : 'Некорректный URL OG-изображения',
}))

const hasPublicErrors = computed(() => Object.values(publicErrors.value).some(Boolean))

function normalizeSettingsTab(raw: unknown): 'admin' | 'public' {
  if (typeof raw !== 'string') return 'admin'
  return raw === 'public' ? 'public' : 'admin'
}

function syncTabFromRoute() {
  const q = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
  let nextTab = normalizeSettingsTab(q)
  if (nextTab === 'public' && !canEditPublicSiteSettings.value) {
    nextTab = 'admin'
  }
  if (activeTab.value === nextTab && q === nextTab) return
  tabSyncing = true
  activeTab.value = nextTab
  if (q !== nextTab) {
    void router.replace({ query: { ...route.query, tab: nextTab } })
  }
  void nextTick(() => {
    tabSyncing = false
  })
}

const themeOptions = computed(() => [
  { label: t('admin.settings.theme.light'), value: 'light' as const },
  { label: t('admin.settings.theme.dark'), value: 'dark' as const },
  { label: t('admin.settings.theme.system'), value: 'system' as const },
])

const localeOptions = computed(() => [
  { label: t('admin.settings.language.ru'), value: 'ru' as const },
  { label: t('admin.settings.language.en'), value: 'en' as const },
])

const themeModel = computed({
  get: () => store.themeMode,
  set: (v: AdminThemeMode) => {
    store.setThemeMode(v)
    void nextTick(() => syncThemeAndAccentFromStore())
  },
})

const localeModel = computed({
  get: () => store.locale,
  set: (v: AdminLocaleCode) => {
    store.setLocale(v)
  },
})

function pickAccent(id: AdminAccentId) {
  store.setAccent(id)
  void nextTick(() => syncThemeAndAccentFromStore())
}

async function saveToServer() {
  saving.value = true
  try {
    await store.syncToServer()
    toast.add({
      severity: 'success',
      summary: t('admin.settings.saved'),
      life: 3000,
    })
  } catch {
    toast.add({
      severity: 'error',
      summary: t('admin.settings.save_error'),
      life: 5000,
    })
  } finally {
    saving.value = false
  }
}

async function loadPublicSettings() {
  if (!token.value) return
  publicLoading.value = true
  publicLoadError.value = ''
  try {
    const res = await authFetch<{
      publicLogoUrl?: string | null
      publicFaviconUrl?: string | null
      publicAccentPrimary?: string | null
      publicAccentSecondary?: string | null
      publicThemeMode?: 'light' | 'dark' | 'system' | null
      publicTagline?: string | null
      publicOrganizationDisplayName?: string | null
      publicContactPhone?: string | null
      publicContactEmail?: string | null
      publicContactAddress?: string | null
      publicContactHours?: string | null
      publicSeoTitle?: string | null
      publicSeoDescription?: string | null
      publicOgImageUrl?: string | null
      publicDefaultLanding?: 'about' | 'tournaments' | 'participants' | 'media' | null
      publicTournamentTabsOrder?: string | null
      publicShowLeaderInFacts?: boolean | null
      publicShowTopStats?: boolean | null
      publicShowNewsInSidebar?: boolean | null
    }>(apiUrl('/users/me/tenant-public-branding'))
    publicSettings.value = {
      publicLogoUrl: res.publicLogoUrl ?? '',
      publicFaviconUrl: res.publicFaviconUrl ?? '',
      publicAccentPrimary: normalizeHex(res.publicAccentPrimary ?? '', '#123c67'),
      publicAccentSecondary: normalizeHex(res.publicAccentSecondary ?? '', '#c80a48'),
      publicThemeMode:
        res.publicThemeMode === 'light' || res.publicThemeMode === 'dark' || res.publicThemeMode === 'system'
          ? res.publicThemeMode
          : 'system',
      publicTagline: res.publicTagline ?? '',
      publicOrganizationDisplayName: res.publicOrganizationDisplayName ?? '',
      publicContactPhone: res.publicContactPhone ?? '',
      publicContactEmail: res.publicContactEmail ?? '',
      publicContactAddress: res.publicContactAddress ?? '',
      publicContactHours: res.publicContactHours ?? '',
      publicSeoTitle: res.publicSeoTitle ?? '',
      publicSeoDescription: res.publicSeoDescription ?? '',
      publicOgImageUrl: res.publicOgImageUrl ?? '',
      publicDefaultLanding:
        res.publicDefaultLanding === 'about' ||
        res.publicDefaultLanding === 'tournaments' ||
        res.publicDefaultLanding === 'participants' ||
        res.publicDefaultLanding === 'media'
          ? res.publicDefaultLanding
          : 'tournaments',
      publicTournamentTabsOrder: serializeTabOrder(parseTabOrder(res.publicTournamentTabsOrder)),
      publicShowLeaderInFacts: res.publicShowLeaderInFacts !== false,
      publicShowTopStats: res.publicShowTopStats !== false,
      publicShowNewsInSidebar: res.publicShowNewsInSidebar !== false,
    }
    publicTabsOrderDraft.value = parseTabOrder(publicSettings.value.publicTournamentTabsOrder)
    publicForbidden.value = false
  } catch (e: unknown) {
    const status = Number((e as { statusCode?: number; status?: number })?.statusCode ?? (e as { status?: number })?.status ?? 0)
    if (status === 403) {
      publicForbidden.value = true
      return
    }
    publicLoadError.value = getApiErrorMessage(e)
  } finally {
    publicLoading.value = false
  }
}

async function uploadPublicAsset(kind: 'logo' | 'favicon') {
  if (!token.value || publicForbidden.value) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = kind === 'favicon' ? 'image/png,image/x-icon,image/svg+xml,image/webp' : 'image/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    if (kind === 'logo') publicLogoUploading.value = true
    else publicFaviconUploading.value = true
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await authFetch<{ key: string; url: string }>(apiUrl('/upload?folder=tenant-branding'), {
        method: 'POST',
        body: form,
      })
      if (kind === 'logo') publicSettings.value.publicLogoUrl = res.url
      else publicSettings.value.publicFaviconUrl = res.url
      toast.add({ severity: 'success', summary: 'Файл загружен', life: 2500 })
    } catch (e: unknown) {
      toast.add({
        severity: 'error',
        summary: 'Не удалось загрузить файл',
        detail: getApiErrorMessage(e),
        life: 5000,
      })
    } finally {
      if (kind === 'logo') publicLogoUploading.value = false
      else publicFaviconUploading.value = false
    }
  }
  input.click()
}

async function savePublicSettings() {
  if (!token.value || hasPublicErrors.value || publicForbidden.value) return
  publicSaving.value = true
  try {
    await authFetch(apiUrl('/users/me/tenant-public-branding'), {
      method: 'PATCH',
      body: {
        publicLogoUrl: withHttpProtocol(publicSettings.value.publicLogoUrl) || null,
        publicFaviconUrl: withHttpProtocol(publicSettings.value.publicFaviconUrl) || null,
        publicAccentPrimary: normalizeHex(publicSettings.value.publicAccentPrimary, '#123c67'),
        publicAccentSecondary: normalizeHex(publicSettings.value.publicAccentSecondary, '#c80a48'),
        publicThemeMode: publicSettings.value.publicThemeMode,
        publicTagline: publicSettings.value.publicTagline.trim() || null,
        publicOrganizationDisplayName: publicSettings.value.publicOrganizationDisplayName.trim() || null,
        publicContactPhone: publicSettings.value.publicContactPhone.trim() || null,
        publicContactEmail: publicSettings.value.publicContactEmail.trim() || null,
        publicContactAddress: publicSettings.value.publicContactAddress.trim() || null,
        publicContactHours: publicSettings.value.publicContactHours.trim() || null,
        publicSeoTitle: publicSettings.value.publicSeoTitle.trim() || null,
        publicSeoDescription: publicSettings.value.publicSeoDescription.trim() || null,
        publicOgImageUrl: withHttpProtocol(publicSettings.value.publicOgImageUrl) || null,
        publicDefaultLanding: publicSettings.value.publicDefaultLanding,
        publicTournamentTabsOrder: serializeTabOrder(publicTabsOrderDraft.value),
        publicShowLeaderInFacts: publicSettings.value.publicShowLeaderInFacts,
        publicShowTopStats: publicSettings.value.publicShowTopStats,
        publicShowNewsInSidebar: publicSettings.value.publicShowNewsInSidebar,
      },
    })
    toast.add({ severity: 'success', summary: 'Публичные настройки сохранены', life: 3000 })
    await loadPublicSettings()
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить публичные настройки',
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    publicSaving.value = false
  }
}

onMounted(() => {
  syncTabFromRoute()
  if (canEditPublicSiteSettings.value) void loadPublicSettings()
})

watch(
  () => canEditPublicSiteSettings.value,
  (ok) => {
    if (!ok && activeTab.value === 'public') {
      activeTab.value = 'admin'
      void router.replace({ query: { ...route.query, tab: 'admin' } })
    }
    if (ok) void loadPublicSettings()
  },
)

watch(
  activeTab,
  (tab) => {
    if (tabSyncing) return
    const q = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
    if (q === tab) return
    void router.replace({ query: { ...route.query, tab } })
  },
)

watch(
  () => route.query.tab,
  () => {
    syncTabFromRoute()
  },
)

</script>

<template>
  <section class="p-6 space-y-6 max-w-3xl">
    <div>
      <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
        {{ t('admin.settings.title') }}
      </h1>
      <p class="mt-1 text-sm text-muted-color">
        {{ t('admin.settings.intro') }}
      </p>
    </div>

    <div class="inline-flex rounded-xl border border-surface-200 bg-surface-0 p-1 dark:border-surface-700 dark:bg-surface-900">
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
        :class="activeTab === 'admin' ? 'bg-primary/15 text-primary' : 'text-muted-color hover:bg-surface-100 dark:hover:bg-surface-800'"
        @click="activeTab = 'admin'"
      >
        {{ t('admin.settings.tab_admin') }}
      </button>
      <button
        v-if="canEditPublicSiteSettings"
        type="button"
        class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
        :class="activeTab === 'public' ? 'bg-primary/15 text-primary' : 'text-muted-color hover:bg-surface-100 dark:hover:bg-surface-800'"
        @click="activeTab = 'public'"
      >
        {{ t('admin.settings.tab_public') }}
      </button>
    </div>
    <p
      v-if="!canEditPublicSiteSettings"
      class="text-sm text-muted-color max-w-xl"
    >
      {{ t('admin.settings.public_tab_locked_hint') }}
    </p>

    <div
      v-if="activeTab === 'admin' && !store.uiSettingsReady"
      class="space-y-6"
      role="status"
      :aria-label="t('admin.settings.loading')"
    >
      <div
        v-for="i in 4"
        :key="i"
        class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-6 space-y-4"
      >
        <Skeleton height="1.25rem" width="28%" class="rounded-md" />
        <Skeleton height="0.875rem" width="85%" class="rounded-md" />
        <Skeleton height="2.75rem" width="100%" class="rounded-lg" />
      </div>
      <div
        class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-6"
      >
        <Skeleton height="3.5rem" width="100%" class="rounded-lg" />
      </div>
    </div>

    <template v-else-if="activeTab === 'admin' && store.uiSettingsReady">
    <Card class="!shadow-none border border-surface-200 dark:border-surface-700">
      <template #title>
        <span class="text-base font-semibold">{{ t('admin.settings.theme.title') }}</span>
      </template>
      <template #content>
        <p class="text-sm text-muted-color mb-4">
          {{ t('admin.settings.theme.hint') }}
        </p>
        <SelectButton
          v-model="themeModel"
          :options="themeOptions"
          option-label="label"
          option-value="value"
        />
      </template>
    </Card>

    <Card class="!shadow-none border border-surface-200 dark:border-surface-700">
      <template #title>
        <span class="text-base font-semibold">{{ t('admin.settings.language.title') }}</span>
      </template>
      <template #content>
        <p class="text-sm text-muted-color mb-4">
          {{ t('admin.settings.language.hint') }}
        </p>
        <Select
          v-model="localeModel"
          :options="localeOptions"
          option-label="label"
          option-value="value"
          class="w-full max-w-xs"
        />
      </template>
    </Card>

    <Card class="!shadow-none border border-surface-200 dark:border-surface-700">
      <template #title>
        <span class="text-base font-semibold">{{ t('admin.settings.accent.title') }}</span>
      </template>
      <template #content>
        <p class="text-sm text-muted-color mb-4">{{ t('admin.settings.accent.hint') }}</p>
        <div class="flex flex-wrap gap-3">
          <button
            v-for="a in adminAccentOptions"
            :key="a.id"
            type="button"
            class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
            :class="
              store.accent === a.id
                ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                : 'border-surface-200 dark:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-800'
            "
            @click="pickAccent(a.id)"
          >
            <span
              class="h-6 w-6 rounded-full border border-surface-200 dark:border-surface-600 shadow-sm"
              :style="{ backgroundColor: a.sample }"
              aria-hidden="true"
            />
            {{ t(`admin.accent.${a.id}`) }}
          </button>
        </div>
      </template>
    </Card>

    <Card class="!shadow-none border border-surface-200 dark:border-surface-700">
      <template #content>
        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="text-sm text-muted-color max-w-xl">
            {{ t('admin.settings.save_hint') }}
          </p>
          <Button
            :label="t('admin.settings.save')"
            icon="pi pi-save"
            :loading="saving"
            class="shrink-0"
            @click="saveToServer"
          />
        </div>
      </template>
    </Card>

    <Message severity="info" :closable="false" class="w-full">
      <div class="text-sm space-y-2">
        <p class="font-medium">{{ t('admin.settings.future.title') }}</p>
        <ul class="list-disc pl-4 space-y-1 text-muted-color">
          <li>{{ t('admin.settings.future.density') }}</li>
        </ul>
      </div>
    </Message>
    </template>

    <template v-else>
      <Card class="!shadow-none border border-surface-200 dark:border-surface-700">
        <template #title>
          <span class="text-base font-semibold">Бренд и тема публичного сайта</span>
        </template>
        <template #content>
          <div v-if="publicLoading" class="space-y-3">
            <Skeleton v-for="i in 5" :key="`public-settings-sk-${i}`" height="2.6rem" width="100%" />
          </div>
          <Message v-else-if="publicForbidden" severity="warn" :closable="false">
            Изменять публичные настройки может только администратор организации.
          </Message>
          <Message v-else-if="publicLoadError" severity="error" :closable="false">
            {{ publicLoadError }}
          </Message>
          <div v-else class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium">Логотип (URL)</label>
              <div class="flex flex-wrap items-center gap-2">
                <InputText
                  v-model="publicSettings.publicLogoUrl"
                  class="w-full md:flex-1"
                  :invalid="!!publicErrors.publicLogoUrl"
                  placeholder="https://.../logo.png"
                />
                <Button
                  label="Загрузить"
                  icon="pi pi-upload"
                  size="small"
                  outlined
                  :loading="publicLogoUploading"
                  @click="uploadPublicAsset('logo')"
                />
              </div>
              <p v-if="publicErrors.publicLogoUrl" class="mt-1 text-xs text-red-500">{{ publicErrors.publicLogoUrl }}</p>
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium">Favicon (URL)</label>
              <div class="flex flex-wrap items-center gap-2">
                <InputText
                  v-model="publicSettings.publicFaviconUrl"
                  class="w-full md:flex-1"
                  :invalid="!!publicErrors.publicFaviconUrl"
                  placeholder="https://.../favicon.ico"
                />
                <Button
                  label="Загрузить"
                  icon="pi pi-upload"
                  size="small"
                  outlined
                  :loading="publicFaviconUploading"
                  @click="uploadPublicAsset('favicon')"
                />
              </div>
              <p v-if="publicErrors.publicFaviconUrl" class="mt-1 text-xs text-red-500">{{ publicErrors.publicFaviconUrl }}</p>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label class="mb-1 block text-sm font-medium">Акцентный цвет 1</label>
                <div class="flex items-center gap-2">
                  <input v-model="publicSettings.publicAccentPrimary" type="color" class="h-10 w-12 rounded border border-surface-200 bg-transparent p-1 dark:border-surface-700" />
                  <InputText
                    v-model="publicSettings.publicAccentPrimary"
                    class="flex-1"
                    :invalid="!!publicErrors.publicAccentPrimary"
                    placeholder="#123c67"
                  />
                </div>
                <p v-if="publicErrors.publicAccentPrimary" class="mt-1 text-xs text-red-500">{{ publicErrors.publicAccentPrimary }}</p>
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium">Акцентный цвет 2</label>
                <div class="flex items-center gap-2">
                  <input v-model="publicSettings.publicAccentSecondary" type="color" class="h-10 w-12 rounded border border-surface-200 bg-transparent p-1 dark:border-surface-700" />
                  <InputText
                    v-model="publicSettings.publicAccentSecondary"
                    class="flex-1"
                    :invalid="!!publicErrors.publicAccentSecondary"
                    placeholder="#c80a48"
                  />
                </div>
                <p v-if="publicErrors.publicAccentSecondary" class="mt-1 text-xs text-red-500">{{ publicErrors.publicAccentSecondary }}</p>
              </div>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium">Режим темы</label>
              <SelectButton
                v-model="publicSettings.publicThemeMode"
                :options="publicThemeOptions"
                option-label="label"
                option-value="value"
              />
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium">Слоган (опционально)</label>
              <InputText
                v-model="publicSettings.publicTagline"
                class="w-full"
                maxlength="160"
                placeholder="Лига и турниры"
              />
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium">Публичное название организации (опционально)</label>
              <InputText
                v-model="publicSettings.publicOrganizationDisplayName"
                class="w-full"
                maxlength="160"
                placeholder="Футбольная лига города"
              />
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label class="mb-1 block text-sm font-medium">Контактный телефон</label>
                <InputText v-model="publicSettings.publicContactPhone" class="w-full" maxlength="60" placeholder="+7 (999) 123-45-67" />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium">Контактный email</label>
                <InputText v-model="publicSettings.publicContactEmail" class="w-full" maxlength="120" placeholder="info@league.ru" />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label class="mb-1 block text-sm font-medium">Адрес</label>
                <InputText v-model="publicSettings.publicContactAddress" class="w-full" maxlength="240" placeholder="г. Москва, ул. Спортивная, 1" />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium">Режим работы</label>
                <InputText v-model="publicSettings.publicContactHours" class="w-full" maxlength="120" placeholder="Пн-Пт 10:00-19:00" />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label class="mb-1 block text-sm font-medium">SEO заголовок</label>
                <InputText v-model="publicSettings.publicSeoTitle" class="w-full" maxlength="120" placeholder="Турниры и результаты" />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium">SEO описание</label>
                <InputText v-model="publicSettings.publicSeoDescription" class="w-full" maxlength="300" placeholder="Расписание, таблицы, статистика и новости турниров." />
              </div>
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium">OG изображение (URL)</label>
              <InputText
                v-model="publicSettings.publicOgImageUrl"
                class="w-full"
                :invalid="!!publicErrors.publicOgImageUrl"
                maxlength="500"
                placeholder="https://.../og-cover.jpg"
              />
              <p v-if="publicErrors.publicOgImageUrl" class="mt-1 text-xs text-red-500">{{ publicErrors.publicOgImageUrl }}</p>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium">Раздел по умолчанию (клик по лого)</label>
              <SelectButton
                v-model="publicSettings.publicDefaultLanding"
                :options="publicLandingOptions"
                option-label="label"
                option-value="value"
              />
            </div>

            <div class="space-y-2">
              <label class="block text-sm font-medium">Порядок вкладок турнира</label>
              <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Select
                  v-for="(slot, idx) in publicTabsOrderDraft"
                  :key="`tab-order-${idx}`"
                  v-model="publicTabsOrderDraft[idx]"
                  :options="tournamentTabOptions"
                  option-label="label"
                  option-value="value"
                  class="w-full"
                  :placeholder="`Позиция ${idx + 1}`"
                />
              </div>
              <p class="text-xs text-muted-color">
                Дубликаты автоматически исправляются при сохранении.
              </p>
            </div>

            <div class="space-y-2 rounded-xl border border-surface-200 p-3 dark:border-surface-700">
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm">Показывать “Лидер/Победитель” в фактах турнира</span>
                <ToggleSwitch v-model="publicSettings.publicShowLeaderInFacts" />
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm">Показывать блок “Топ-3” в правой колонке</span>
                <ToggleSwitch v-model="publicSettings.publicShowTopStats" />
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm">Показывать пункт “Новости” в боковом меню турнира</span>
                <ToggleSwitch v-model="publicSettings.publicShowNewsInSidebar" />
              </div>
            </div>

            <Message severity="secondary" :closable="false">
              Ссылки на соцсети редактируются отдельно во вкладке
              <NuxtLink to="/admin/social-links" class="font-medium underline ml-1">Соцсети</NuxtLink>.
            </Message>

            <div class="flex justify-end pt-1">
              <Button
                label="Сохранить публичные настройки"
                icon="pi pi-save"
                :loading="publicSaving"
                :disabled="publicSaving || hasPublicErrors"
                @click="savePublicSettings"
              />
            </div>

            <Message severity="info" :closable="false" class="w-full">
              <div class="text-sm space-y-2">
                <p class="font-medium">Что еще можно вынести в публичные настройки</p>
                <ul class="list-disc pl-4 space-y-1 text-muted-color">
                  <li>Название организации для публичного хедера и футера (отдельно от tenant slug).</li>
                  <li>Контакты в футере: телефон, email, адрес, режим работы.</li>
                  <li>SEO и превью: meta title/description, og-image для шаринга.</li>
                  <li>Ссылки и порядок соцсетей/мессенджеров в шапке и футере.</li>
                  <li>Настройка домашней публичной страницы и порядка вкладок турнира.</li>
                  <li>Отдельные настройки для карточек: показывать/скрывать лидера, топ-3, новости.</li>
                </ul>
              </div>
            </Message>
          </div>
        </template>
      </Card>
    </template>
  </section>
</template>

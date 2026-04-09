<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Select from 'primevue/select'
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
import { adminTooltip } from '~/utils/adminTooltip'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'
import { hasSubscriptionFeature } from '~/utils/subscriptionFeatures'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
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

/** Публичные флаги отображения — выпадающий список вместо переключателя (удобнее на узком экране). */
const publicShowHideSelectOptions = [
  { label: 'Показывать', value: true },
  { label: 'Скрыть', value: false },
]

const telegramLoading = ref(false)
const telegramSaving = ref(false)
const telegramTesting = ref(false)
const telegramForbidden = ref(false)
const telegramChatLookupLoading = ref(false)
const telegramChatOptions = ref<Array<{ label: string; value: string }>>([])
const telegramDeliveriesLoading = ref(false)
const telegramDeliveries = ref<
  Array<{
    id: string
    channel?: string
    kind: string
    chatId: string
    status: string
    attempts: number
    errorMessage: string | null
    createdAt: string
    sentAt: string | null
  }>
>([])
const telegramSettings = ref({
  telegramNotifyChatId: '',
  telegramNotifyOnMatchRescheduled: true,
  telegramNotifyOnProtocolPublished: true,
  telegramNotifyOnMatchStartingSoon: false,
})
const emailLoading = ref(false)
const emailSaving = ref(false)
const emailTesting = ref(false)
const emailForbidden = ref(false)
const emailSettings = ref({
  emailNotifyRecipients: '',
  emailNotifyEnabled: false,
  emailNotifyOnMatchRescheduled: true,
  emailNotifyOnProtocolPublished: true,
  emailNotifyMatchTeamCoachRole: false,
  emailNotifyMatchTeamAdminRole: false,
})

const shareTableImageLoading = ref(false)
const shareTableImageSaving = ref(false)
const shareTableImageUploading = ref(false)
const shareTableImageForbidden = ref(false)
const shareTableImageSettings = ref({
  shareTableImageLogoUrl: '',
  shareTableImageShowLogo: true,
  shareTableImageFontScale: 1,
})

function clampShareTableFontScale(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 1
  return Math.min(1.25, Math.max(0.55, v))
}

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

const canEditShareTableImageSettings = computed(
  () => user.value?.role === 'TENANT_ADMIN' || user.value?.role === 'SUPER_ADMIN',
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

async function loadShareTableImageSettings() {
  if (!token.value) return
  shareTableImageLoading.value = true
  try {
    const res = await authFetch<{
      shareTableImageLogoUrl?: string | null
      shareTableImageShowLogo?: boolean
      shareTableImageFontScale?: number | null
    }>(apiUrl('/users/me/tenant-share-table-image-settings'))
    shareTableImageSettings.value = {
      shareTableImageLogoUrl: res.shareTableImageLogoUrl ?? '',
      shareTableImageShowLogo: res.shareTableImageShowLogo !== false,
      shareTableImageFontScale: clampShareTableFontScale(
        res.shareTableImageFontScale ?? 1,
      ),
    }
    shareTableImageForbidden.value = false
  } catch (e: unknown) {
    const status = Number((e as { statusCode?: number; status?: number })?.statusCode ?? (e as { status?: number })?.status ?? 0)
    if (status === 403) {
      shareTableImageForbidden.value = true
      return
    }
    toast.add({
      severity: 'error',
      summary: t('admin.settings.share_table_image.save_error'),
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    shareTableImageLoading.value = false
  }
}

async function saveShareTableImageSettings() {
  if (!token.value || !canEditShareTableImageSettings.value || shareTableImageForbidden.value) return
  shareTableImageSaving.value = true
  try {
    await authFetch(apiUrl('/users/me/tenant-share-table-image-settings'), {
      method: 'PATCH',
      body: {
        shareTableImageLogoUrl: withHttpProtocol(shareTableImageSettings.value.shareTableImageLogoUrl) || null,
        shareTableImageShowLogo: shareTableImageSettings.value.shareTableImageShowLogo,
        shareTableImageFontScale: clampShareTableFontScale(
          shareTableImageSettings.value.shareTableImageFontScale,
        ),
      },
    })
    toast.add({ severity: 'success', summary: t('admin.settings.share_table_image.saved'), life: 3000 })
    await loadShareTableImageSettings()
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.settings.share_table_image.save_error'),
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    shareTableImageSaving.value = false
  }
}

async function uploadShareTableLogo() {
  if (!token.value || !canEditShareTableImageSettings.value || shareTableImageForbidden.value) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    shareTableImageUploading.value = true
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await authFetch<{ url: string }>(apiUrl('/upload?folder=tenant-branding'), {
        method: 'POST',
        body: form,
      })
      shareTableImageSettings.value.shareTableImageLogoUrl = res.url
      toast.add({ severity: 'success', summary: t('admin.settings.share_table_image.saved'), life: 2500 })
    } catch (e: unknown) {
      toast.add({
        severity: 'error',
        summary: t('admin.settings.share_table_image.save_error'),
        detail: getApiErrorMessage(e),
        life: 5000,
      })
    } finally {
      shareTableImageUploading.value = false
    }
  }
  input.click()
}

function clearShareTableLogo() {
  shareTableImageSettings.value.shareTableImageLogoUrl = ''
}

async function loadTelegramSettings() {
  if (!token.value) return
  telegramLoading.value = true
  try {
    const res = await authFetch<{
      telegramNotifyChatId?: string | null
      telegramNotifyOnMatchRescheduled?: boolean | null
      telegramNotifyOnProtocolPublished?: boolean | null
      telegramNotifyOnMatchStartingSoon?: boolean | null
    }>(apiUrl('/users/me/tenant-telegram-notifications'))
    telegramSettings.value = {
      telegramNotifyChatId: res.telegramNotifyChatId ?? '',
      telegramNotifyOnMatchRescheduled: res.telegramNotifyOnMatchRescheduled !== false,
      telegramNotifyOnProtocolPublished: res.telegramNotifyOnProtocolPublished !== false,
      telegramNotifyOnMatchStartingSoon: res.telegramNotifyOnMatchStartingSoon === true,
    }
    telegramForbidden.value = false
  } catch (e: unknown) {
    const status = Number((e as { statusCode?: number; status?: number })?.statusCode ?? (e as { status?: number })?.status ?? 0)
    if (status === 403) {
      telegramForbidden.value = true
      return
    }
    toast.add({
      severity: 'error',
      summary: 'Не удалось загрузить Telegram-настройки',
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    telegramLoading.value = false
  }
}

async function saveTelegramSettings() {
  if (!token.value) return
  telegramSaving.value = true
  try {
    await authFetch(apiUrl('/users/me/tenant-telegram-notifications'), {
      method: 'PATCH',
      body: {
        telegramNotifyChatId: telegramSettings.value.telegramNotifyChatId.trim() || null,
        telegramNotifyOnMatchRescheduled: telegramSettings.value.telegramNotifyOnMatchRescheduled,
        telegramNotifyOnProtocolPublished: telegramSettings.value.telegramNotifyOnProtocolPublished,
        telegramNotifyOnMatchStartingSoon: telegramSettings.value.telegramNotifyOnMatchStartingSoon,
      },
    })
    toast.add({ severity: 'success', summary: 'Telegram-настройки сохранены', life: 3000 })
    void loadTelegramDeliveries()
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить Telegram-настройки',
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    telegramSaving.value = false
  }
}

async function sendTelegramTestMessage() {
  if (!token.value) return
  telegramTesting.value = true
  try {
    await authFetch(apiUrl('/users/me/tenant-telegram-notifications/test'), {
      method: 'POST',
    })
    toast.add({ severity: 'success', summary: 'Тестовое сообщение отправлено', life: 3000 })
    void loadTelegramDeliveries()
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось отправить тест',
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    telegramTesting.value = false
  }
}

async function loadTelegramChatsFromBot() {
  if (!token.value) return
  telegramChatLookupLoading.value = true
  try {
    const res = await authFetch<{ items?: Array<{ id: string; type: string; title: string; username: string | null }> }>(
      apiUrl('/users/me/tenant-telegram-notifications/chats'),
    )
    const items = Array.isArray(res?.items) ? res.items : []
    telegramChatOptions.value = items.map((it) => ({
      value: it.id,
      label: `${it.title} (${it.type})${it.username ? ` ${it.username}` : ''} · ${it.id}`,
    }))
    if (!items.length) {
      toast.add({
        severity: 'warn',
        summary: 'Чаты не найдены',
        detail:
          'Отправьте любое сообщение боту или в канал/группу с ботом, затем повторите поиск.',
        life: 5000,
      })
      return
    }
    if (!telegramSettings.value.telegramNotifyChatId.trim()) {
      telegramSettings.value.telegramNotifyChatId = items[0]!.id
    }
    toast.add({ severity: 'success', summary: 'Чаты Telegram обновлены', life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось получить список чатов',
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    telegramChatLookupLoading.value = false
  }
}

async function loadTelegramDeliveries() {
  if (!token.value) return
  telegramDeliveriesLoading.value = true
  try {
    const res = await authFetch<{
      items?: Array<{
        id: string
        channel?: string
        kind: string
        chatId: string
        status: string
        attempts: number
        errorMessage?: string | null
        createdAt: string
        sentAt?: string | null
      }>
    }>(apiUrl('/users/me/tenant-telegram-notifications/deliveries'))
    telegramDeliveries.value = (res.items ?? []).map((it) => ({
      id: it.id,
      channel: it.channel ?? undefined,
      kind: it.kind,
      chatId: it.chatId,
      status: it.status,
      attempts: Number(it.attempts ?? 0),
      errorMessage: it.errorMessage ?? null,
      createdAt: it.createdAt,
      sentAt: it.sentAt ?? null,
    }))
  } catch {
    // non-blocking: deliveries panel is auxiliary
  } finally {
    telegramDeliveriesLoading.value = false
  }
}

async function loadEmailSettings() {
  if (!token.value) return
  emailLoading.value = true
  try {
    const res = await authFetch<{
      emailNotifyRecipients?: string | null
      emailNotifyEnabled?: boolean | null
      emailNotifyOnMatchRescheduled?: boolean | null
      emailNotifyOnProtocolPublished?: boolean | null
      emailNotifyMatchTeamCoachRole?: boolean | null
      emailNotifyMatchTeamAdminRole?: boolean | null
    }>(apiUrl('/users/me/tenant-email-notifications'))
    emailSettings.value = {
      emailNotifyRecipients: res.emailNotifyRecipients ?? '',
      emailNotifyEnabled: res.emailNotifyEnabled === true,
      emailNotifyOnMatchRescheduled: res.emailNotifyOnMatchRescheduled !== false,
      emailNotifyOnProtocolPublished: res.emailNotifyOnProtocolPublished !== false,
      emailNotifyMatchTeamCoachRole: res.emailNotifyMatchTeamCoachRole === true,
      emailNotifyMatchTeamAdminRole: res.emailNotifyMatchTeamAdminRole === true,
    }
    emailForbidden.value = false
  } catch (e: unknown) {
    const status = Number((e as { statusCode?: number; status?: number })?.statusCode ?? (e as { status?: number })?.status ?? 0)
    if (status === 403) {
      emailForbidden.value = true
      return
    }
    toast.add({
      severity: 'error',
      summary: 'Не удалось загрузить email-настройки',
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    emailLoading.value = false
  }
}

async function saveEmailSettings() {
  if (!token.value) return
  emailSaving.value = true
  try {
    await authFetch(apiUrl('/users/me/tenant-email-notifications'), {
      method: 'PATCH',
      body: {
        emailNotifyRecipients: emailSettings.value.emailNotifyRecipients.trim() || null,
        emailNotifyEnabled: emailSettings.value.emailNotifyEnabled,
        emailNotifyOnMatchRescheduled: emailSettings.value.emailNotifyOnMatchRescheduled,
        emailNotifyOnProtocolPublished: emailSettings.value.emailNotifyOnProtocolPublished,
        emailNotifyMatchTeamCoachRole: emailSettings.value.emailNotifyMatchTeamCoachRole,
        emailNotifyMatchTeamAdminRole: emailSettings.value.emailNotifyMatchTeamAdminRole,
      },
    })
    toast.add({ severity: 'success', summary: 'Email-настройки сохранены', life: 3000 })
    void loadTelegramDeliveries()
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить email-настройки',
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    emailSaving.value = false
  }
}

async function sendEmailTestMessage() {
  if (!token.value) return
  emailTesting.value = true
  try {
    await authFetch(apiUrl('/users/me/tenant-email-notifications/test'), { method: 'POST' })
    toast.add({ severity: 'success', summary: 'Тестовое письмо отправлено', life: 3000 })
    void loadTelegramDeliveries()
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось отправить тестовое письмо',
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    emailTesting.value = false
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
  void loadShareTableImageSettings()
  void loadTelegramSettings()
  void loadEmailSettings()
  void loadTelegramDeliveries()
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
  <section class="admin-page mx-auto max-w-3xl space-y-4 sm:space-y-6">
    <div class="min-w-0">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-0 sm:text-2xl">
        {{ t('admin.settings.title') }}
      </h1>
      <p class="mt-1 text-xs text-muted-color sm:text-sm">
        {{ t('admin.settings.intro') }}
      </p>
    </div>

    <div class="inline-flex max-w-full flex-wrap rounded-xl border border-surface-200 bg-surface-0 p-1 dark:border-surface-700 dark:bg-surface-900">
      <button
        type="button"
        class="rounded-lg px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm"
        :class="activeTab === 'admin' ? 'bg-primary/15 text-primary' : 'text-muted-color hover:bg-surface-100 dark:hover:bg-surface-800'"
        @click="activeTab = 'admin'"
      >
        {{ t('admin.settings.tab_admin') }}
      </button>
      <button
        v-if="canEditPublicSiteSettings"
        type="button"
        class="rounded-lg px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm"
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
        <Select
          v-model="themeModel"
          :options="themeOptions"
          option-label="label"
          option-value="value"
          class="w-full max-w-md"
          input-id="admin-theme-mode"
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
      <template #title>
        <span class="text-base font-semibold">{{ t('admin.settings.share_table_image.title') }}</span>
      </template>
      <template #content>
        <div v-if="shareTableImageLoading" class="space-y-3">
          <Skeleton height="2.6rem" width="100%" />
          <Skeleton height="2.6rem" width="100%" />
        </div>
        <Message v-else-if="shareTableImageForbidden" severity="warn" :closable="false">
          {{ t('admin.settings.share_table_image.forbidden') }}
        </Message>
        <div v-else class="space-y-4">
          <p class="text-sm text-muted-color">
            {{ t('admin.settings.share_table_image.hint') }}
          </p>
          <div class="flex flex-wrap items-center gap-3">
            <Checkbox
              v-model="shareTableImageSettings.shareTableImageShowLogo"
              binary
              input-id="settings-share-table-show-logo"
              :disabled="!canEditShareTableImageSettings"
            />
            <label for="settings-share-table-show-logo" class="cursor-pointer text-sm">
              {{ t('admin.settings.share_table_image.show_logo') }}
            </label>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">{{ t('admin.settings.share_table_image.logo_url') }}</label>
            <div class="flex flex-wrap gap-2">
              <InputText
                v-model="shareTableImageSettings.shareTableImageLogoUrl"
                class="min-w-0 flex-1"
                placeholder="https://"
                :disabled="!canEditShareTableImageSettings"
              />
              <Button
                type="button"
                outlined
                severity="secondary"
                icon="pi pi-upload"
                :label="t('admin.settings.share_table_image.upload')"
                :loading="shareTableImageUploading"
                :disabled="!canEditShareTableImageSettings"
                @click="uploadShareTableLogo"
              />
              <Button
                v-if="shareTableImageSettings.shareTableImageLogoUrl"
                type="button"
                text
                severity="secondary"
                :label="t('admin.settings.share_table_image.clear')"
                :disabled="!canEditShareTableImageSettings"
                @click="clearShareTableLogo"
              />
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span
              id="settings-share-table-font-scale-label"
              class="text-sm font-medium"
            >
              {{ t('admin.settings.share_table_image.font_scale') }}
            </span>
            <span
              v-tooltip.top="adminTooltip(t('admin.settings.share_table_image.font_scale_hint'))"
              class="inline-flex cursor-help text-muted-color hover:text-surface-600 dark:hover:text-surface-300"
              tabindex="0"
              role="img"
              :aria-label="t('admin.settings.share_table_image.font_scale_hint')"
            >
              <i class="pi pi-info-circle text-sm leading-none" aria-hidden="true" />
            </span>
            <InputNumber
              v-model="shareTableImageSettings.shareTableImageFontScale"
              input-id="settings-share-table-font-scale"
              class="max-w-[11rem] shrink-0"
              :min="0.55"
              :max="1.25"
              :step="0.05"
              :min-fraction-digits="2"
              :max-fraction-digits="2"
              :disabled="!canEditShareTableImageSettings"
              show-buttons
              button-layout="horizontal"
              aria-labelledby="settings-share-table-font-scale-label"
            />
          </div>
          <Button
            v-if="canEditShareTableImageSettings"
            type="button"
            icon="pi pi-save"
            :label="t('admin.settings.share_table_image.save')"
            :loading="shareTableImageSaving"
            @click="saveShareTableImageSettings"
          />
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

    <Card class="!shadow-none border border-surface-200 dark:border-surface-700">
      <template #title>
        <span class="text-base font-semibold">Telegram-уведомления организации</span>
      </template>
      <template #content>
        <div v-if="telegramLoading" class="space-y-3">
          <Skeleton height="2.6rem" width="100%" />
          <Skeleton height="2.6rem" width="100%" />
          <Skeleton height="2.6rem" width="100%" />
        </div>
        <Message v-else-if="telegramForbidden" severity="warn" :closable="false">
          Управлять Telegram-уведомлениями может только администратор организации.
        </Message>
        <div v-else class="space-y-4">
          <p class="text-sm text-muted-color">
            Укажите chat/channel ID организации и выберите события, которые нужно отправлять в Telegram.
            Используется общий токен бота платформы.
          </p>
          <p class="text-xs text-muted-color">
            Важно: сюда нужно вводить ID чата/канала (например, <code>-100...</code>), а не username бота.
            Сначала добавьте бота в чат/канал и выдайте ему право писать сообщения.
          </p>
          <div>
            <label class="mb-1 block text-sm font-medium">Telegram chat/channel ID</label>
            <div class="flex flex-wrap gap-2">
              <InputText
                v-model="telegramSettings.telegramNotifyChatId"
                class="w-full max-w-lg"
                placeholder="-1001234567890"
              />
              <Button
                label="Найти мои чаты"
                icon="pi pi-search"
                severity="secondary"
                outlined
                :loading="telegramChatLookupLoading"
                @click="loadTelegramChatsFromBot"
              />
            </div>
            <div v-if="telegramChatOptions.length" class="mt-2 max-w-lg">
              <Select
                :model-value="telegramSettings.telegramNotifyChatId"
                :options="telegramChatOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                placeholder="Выберите чат из найденных"
                @update:model-value="(v) => (telegramSettings.telegramNotifyChatId = String(v ?? ''))"
              />
            </div>
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label class="flex items-center justify-between gap-3 rounded-lg border border-surface-200 p-3 dark:border-surface-700">
              <span class="text-sm">Перенос/изменение времени матча</span>
              <ToggleSwitch v-model="telegramSettings.telegramNotifyOnMatchRescheduled" />
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg border border-surface-200 p-3 dark:border-surface-700">
              <span class="text-sm">Публикация протокола</span>
              <ToggleSwitch v-model="telegramSettings.telegramNotifyOnProtocolPublished" />
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg border border-surface-200 p-3 dark:border-surface-700 md:col-span-2">
              <span class="text-sm">Скорый старт матча (резерв под v1.1)</span>
              <ToggleSwitch v-model="telegramSettings.telegramNotifyOnMatchStartingSoon" />
            </label>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <Button
              label="Тестовое сообщение"
              icon="pi pi-send"
              severity="secondary"
              outlined
              :loading="telegramTesting"
              :disabled="telegramTesting || !telegramSettings.telegramNotifyChatId.trim()"
              @click="sendTelegramTestMessage"
            />
            <Button
              label="Сохранить Telegram"
              icon="pi pi-save"
              :loading="telegramSaving"
                @click="saveTelegramSettings"
            />
          </div>
            <div class="rounded-lg border border-surface-200 p-3 dark:border-surface-700">
              <div class="mb-2 flex items-center justify-between gap-2">
                <p class="text-sm font-medium">Последние доставки</p>
                <Button
                  label="Обновить"
                  icon="pi pi-refresh"
                  size="small"
                  text
                  :loading="telegramDeliveriesLoading"
                  @click="loadTelegramDeliveries"
                />
              </div>
              <div v-if="telegramDeliveriesLoading" class="space-y-2">
                <Skeleton height="1.75rem" width="100%" />
                <Skeleton height="1.75rem" width="100%" />
              </div>
              <div v-else-if="!telegramDeliveries.length" class="text-xs text-muted-color">
                Пока нет доставок.
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="d in telegramDeliveries.slice(0, 8)"
                  :key="d.id"
                  class="rounded-md border border-surface-200 px-2 py-1.5 text-xs dark:border-surface-700"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="font-medium">{{ d.kind }}</span>
                    <span
                      :class="
                        d.status === 'SENT'
                          ? 'text-green-600 dark:text-green-400'
                          : d.status === 'FAILED'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                      "
                    >
                      {{ d.status }}
                    </span>
                  </div>
                  <div class="mt-1 text-muted-color">
                    {{ d.channel ?? 'TELEGRAM' }} · target: {{ d.chatId }} · attempts: {{ d.attempts }} ·
                    {{ new Date(d.createdAt).toLocaleString() }}
                  </div>
                  <div v-if="d.errorMessage" class="mt-1 text-red-500 dark:text-red-400">
                    {{ d.errorMessage }}
                  </div>
                </div>
              </div>
            </div>
        </div>
      </template>
    </Card>

    <Card class="!shadow-none border border-surface-200 dark:border-surface-700">
      <template #title>
        <span class="text-base font-semibold">Email-уведомления организации</span>
      </template>
      <template #content>
        <div v-if="emailLoading" class="space-y-3">
          <Skeleton height="2.6rem" width="100%" />
          <Skeleton height="2.6rem" width="100%" />
        </div>
        <Message v-else-if="emailForbidden" severity="warn" :closable="false">
          Управлять email-уведомлениями может только администратор организации.
        </Message>
        <div v-else class="space-y-4">
          <p class="text-sm text-muted-color">
            Укажите базовых получателей через запятую и включите события. Дополнительно можно автоматически
            добавлять роли команд-участниц каждого матча.
          </p>
          <div>
            <label class="mb-1 block text-sm font-medium">Получатели (через запятую)</label>
            <InputText
              v-model="emailSettings.emailNotifyRecipients"
              class="w-full"
              placeholder="ops@example.com, manager@example.com"
            />
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label class="flex items-center justify-between gap-3 rounded-lg border border-surface-200 p-3 dark:border-surface-700">
              <span class="text-sm">Включить email-канал</span>
              <ToggleSwitch v-model="emailSettings.emailNotifyEnabled" />
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg border border-surface-200 p-3 dark:border-surface-700">
              <span class="text-sm">Перенос/изменение времени матча</span>
              <ToggleSwitch v-model="emailSettings.emailNotifyOnMatchRescheduled" />
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg border border-surface-200 p-3 dark:border-surface-700 md:col-span-2">
              <span class="text-sm">Публикация протокола</span>
              <ToggleSwitch v-model="emailSettings.emailNotifyOnProtocolPublished" />
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg border border-surface-200 p-3 dark:border-surface-700">
              <span class="text-sm">Добавлять тренеров участвующих команд</span>
              <ToggleSwitch v-model="emailSettings.emailNotifyMatchTeamCoachRole" />
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg border border-surface-200 p-3 dark:border-surface-700">
              <span class="text-sm">Добавлять администраторов участвующих команд</span>
              <ToggleSwitch v-model="emailSettings.emailNotifyMatchTeamAdminRole" />
            </label>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <Button
              label="Тестовое письмо"
              icon="pi pi-send"
              severity="secondary"
              outlined
              :loading="emailTesting"
              :disabled="emailTesting || !emailSettings.emailNotifyRecipients.trim()"
              @click="sendEmailTestMessage"
            />
            <Button
              label="Сохранить Email"
              icon="pi pi-save"
              :loading="emailSaving"
              @click="saveEmailSettings"
            />
          </div>
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
          <AdminDataState
            :loading="publicLoading"
            :error="publicLoadError.trim() ? publicLoadError : null"
            :empty="false"
            :content-card="false"
            @retry="loadPublicSettings"
          >
            <template #loading>
              <div class="space-y-3">
                <Skeleton v-for="i in 5" :key="`public-settings-sk-${i}`" height="2.6rem" width="100%" />
              </div>
            </template>
          <Message v-if="publicForbidden" severity="warn" :closable="false">
            Изменять публичные настройки может только администратор организации.
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
              <label class="mb-2 block text-sm font-medium" for="public-theme-mode">Режим темы</label>
              <Select
                input-id="public-theme-mode"
                v-model="publicSettings.publicThemeMode"
                :options="publicThemeOptions"
                option-label="label"
                option-value="value"
                class="w-full min-w-0"
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
              <label class="mb-2 block text-sm font-medium" for="public-default-landing">
                Раздел по умолчанию (клик по лого)
              </label>
              <Select
                input-id="public-default-landing"
                v-model="publicSettings.publicDefaultLanding"
                :options="publicLandingOptions"
                option-label="label"
                option-value="value"
                class="w-full min-w-0"
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

            <div
              class="divide-y divide-surface-200 rounded-xl border border-surface-200 dark:divide-surface-700 dark:border-surface-700"
            >
              <div class="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span
                  id="label-public-leader-facts"
                  class="min-w-0 text-sm leading-snug text-surface-800 dark:text-surface-100"
                >
                  Показывать “Лидер/Победитель” в фактах турнира
                </span>
                <Select
                  v-model="publicSettings.publicShowLeaderInFacts"
                  :options="publicShowHideSelectOptions"
                  option-label="label"
                  option-value="value"
                  class="w-full shrink-0 sm:w-44"
                  aria-labelledby="label-public-leader-facts"
                />
              </div>
              <div class="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span
                  id="label-public-top-stats"
                  class="min-w-0 text-sm leading-snug text-surface-800 dark:text-surface-100"
                >
                  Показывать блок “Топ-3” в правой колонке
                </span>
                <Select
                  v-model="publicSettings.publicShowTopStats"
                  :options="publicShowHideSelectOptions"
                  option-label="label"
                  option-value="value"
                  class="w-full shrink-0 sm:w-44"
                  aria-labelledby="label-public-top-stats"
                />
              </div>
              <div class="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span
                  id="label-public-news-sidebar"
                  class="min-w-0 text-sm leading-snug text-surface-800 dark:text-surface-100"
                >
                  Показывать пункт “Новости” в боковом меню турнира
                </span>
                <Select
                  v-model="publicSettings.publicShowNewsInSidebar"
                  :options="publicShowHideSelectOptions"
                  option-label="label"
                  option-value="value"
                  class="w-full shrink-0 sm:w-44"
                  aria-labelledby="label-public-news-sidebar"
                />
              </div>
            </div>

            <Message severity="secondary" :closable="false">
              Ссылки на соцсети редактируются отдельно во вкладке
              <NuxtLink to="/admin/social-links" class="font-medium underline ml-1">Соцсети</NuxtLink>.
            </Message>

            <div class="flex justify-end pt-1">
              <Button
                label="Сохранить"
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
          </AdminDataState>
        </template>
      </Card>
    </template>
  </section>
</template>

<script setup lang="ts">
import {
  ADMIN_NAV_ENTRIES,
  findActiveAdminNavSectionId,
  isNavSection,
} from '~/constants/adminNav'
import { useAdminSidebarCollapsed } from '~/composables/useAdminSidebarCollapsed'
import { useAuth } from '~/composables/useAuth'
import { userRoleLabelRu } from '~/constants/userRoles'
import { formatUserFullNameFromParts } from '~/utils/userDisplayName'
import { useTenantStore } from '~/stores/tenant'
import { storeToRefs } from 'pinia'

const props = withDefaults(
  defineProps<{
    /** В выезжающем меню всегда полные подписи, не «только иконки». */
    forceExpanded?: boolean
    /** Нижний блок (профиль + выход) прижат к низу панели; скролл только у списка ссылок. */
    pinFooter?: boolean
  }>(),
  { forceExpanded: false, pinFooter: false },
)

const emit = defineEmits<{
  'logout-click': []
}>()

const { user, syncWithStorage } = useAuth()
const { mini } = useAdminSidebarCollapsed()
const route = useRoute()
const { t } = useI18n()

const effectiveMini = computed(() =>
  props.forceExpanded ? false : mini.value,
)

const tenantStore = useTenantStore()
const { slug: tenantSlugFromStore } = storeToRefs(tenantStore)

function tenantSlugFromHostname(hostname: string): string | null {
  const host = hostname.toLowerCase()
  const parts = host.split('.')
  if (parts.length < 3) return null
  const sub = parts[0]
  if (!sub || sub === 'www' || sub === 'localhost' || sub === '127.0.0.1') return null
  return sub
}

const clientMounted = ref(false)

const openSectionId = ref<string | null>(null)

watch(
  () => route.path,
  (path) => {
    openSectionId.value = findActiveAdminNavSectionId(path)
  },
  { immediate: true },
)

const siteLink = computed(() => {
  const fromStore = tenantSlugFromStore.value
  const fromHost =
    process.client ? tenantSlugFromHostname(window.location.hostname) : null
  const slug = fromStore || fromHost
  return slug ? `/${slug}/table` : null
})

const userDisplayName = computed(() => {
  const u = (user.value ?? {}) as { email?: string | null }
  const full = formatUserFullNameFromParts(user.value)
  if (full) return full
  const email = u.email ?? ''
  if (!email) return 'Пользователь'
  return email.split('@')[0] || email
})

const userInitials = computed(() => {
  const parts = userDisplayName.value
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
  return parts
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() ?? '')
    .join('')
})

const avatarImageFailed = ref(false)
watch(
  () => (user.value as { id?: string } | null)?.id,
  () => {
    avatarImageFailed.value = false
  },
)

const userAvatarSrc = computed(() => {
  if (avatarImageFailed.value) return undefined
  const u = user.value as { avatarUrl?: string | null; image?: string | null } | null
  if (!u) return undefined
  const src = (u.avatarUrl ?? u.image ?? '').trim()
  return src || undefined
})

function onAvatarImageError() {
  avatarImageFailed.value = true
}

onMounted(async () => {
  clientMounted.value = true
  syncWithStorage()
})
</script>

<template>
  <div
    :class="[
      'flex min-h-0 flex-col',
      pinFooter ? 'h-full' : 'flex-1 justify-between',
      effectiveMini ? 'px-2 py-4' : 'px-5 py-4',
    ]"
  >
    <div class="flex min-h-0 flex-1 flex-col">
      <div
        class="shrink-0 border-b border-surface-200 pb-3 dark:border-surface-700"
        :class="effectiveMini ? 'mb-2 flex w-full justify-center' : 'mb-3'"
      >
        <NuxtLink
          to="/admin"
          class="flex items-center gap-2.5 rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary"
          :class="effectiveMini ? 'mx-auto w-full max-w-[2.75rem] justify-center p-0' : 'gap-3'"
        >
          <img
            src="/logo.png"
            alt="Tournament Platform"
            width="44"
            height="44"
            class="shrink-0 object-contain"
            :class="effectiveMini ? 'h-10 w-10' : 'h-11 w-11'"
          />
          <span
            v-if="!effectiveMini"
            class="truncate text-[15px] font-semibold leading-tight text-surface-900 dark:text-surface-0"
          >
            Tournament Platform
          </span>
        </NuxtLink>
      </div>
      <nav
        class="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-y-contain text-base"
        :class="
          effectiveMini
            ? 'flex flex-col items-center gap-1.5'
            : 'space-y-1.5 [scrollbar-gutter:stable]'
        "
      >
        <div
          v-for="entry in ADMIN_NAV_ENTRIES"
          :key="isNavSection(entry) ? entry.id : entry.to"
          class="contents"
        >
          <AdminNavGroup
            v-if="isNavSection(entry)"
            :section-id="entry.id"
            :label-key="entry.labelKey"
            :icon="entry.icon"
            :items="entry.items"
            :mini="effectiveMini"
            :open-section-id="openSectionId"
            @update:open-section-id="openSectionId = $event"
          />
          <AdminNavLink
            v-else
            :to="entry.to"
            :label-key="entry.labelKey"
            :icon="entry.icon"
            :exact="!!entry.exact"
            :mini="effectiveMini"
          />
        </div>

        <NuxtLink
          v-if="siteLink"
          :to="siteLink"
          class="flex items-center gap-2.5 rounded-lg text-muted-color transition-colors hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-primary"
          :class="
            effectiveMini
              ? 'w-full max-w-[2.75rem] justify-center px-0 py-2.5'
              : 'px-3.5 py-2.5 text-[15px]'
          "
          :title="t('admin.sidebar.to_site')"
        >
          <span
            class="pi pi-external-link inline-flex w-[1.35rem] justify-center leading-none"
            :class="effectiveMini ? 'text-[1.35rem]' : 'text-xs'"
            aria-hidden="true"
          />
          <span v-if="!effectiveMini">{{ t('admin.sidebar.to_site') }}</span>
        </NuxtLink>
      </nav>
    </div>

    <div
      class="mt-4 shrink-0 border-t border-surface-200 dark:border-surface-700 pt-3"
      :class="effectiveMini ? 'flex w-full flex-col items-center' : ''"
    >
      <NuxtLink
        v-if="user && clientMounted"
        to="/admin/profile"
        class="mb-2 flex items-center gap-3 rounded-lg border border-surface-200 bg-surface-50 px-2.5 py-2 no-underline outline-none transition-colors hover:bg-surface-100 focus-visible:ring-2 focus-visible:ring-primary dark:border-surface-700 dark:bg-surface-800/50 dark:hover:bg-surface-800"
        :class="
          effectiveMini
            ? 'w-full max-w-[2.75rem] justify-center border-none bg-transparent px-0 hover:bg-surface-100 dark:hover:bg-surface-800'
            : ''
        "
        :title="t('admin.sidebar.profile_settings')"
        :aria-label="t('admin.sidebar.profile_settings')"
      >
        <span class="inline-flex shrink-0 pointer-events-none" aria-hidden="true">
          <Avatar
            :image="userAvatarSrc"
            :label="userAvatarSrc ? undefined : (userInitials || 'U')"
            shape="circle"
            size="normal"
            class="!h-9 !w-9"
            :pt="{
              root: {
                class: userAvatarSrc
                  ? undefined
                  : 'bg-primary-100 text-primary dark:bg-primary-900/50 dark:text-primary-200',
              },
            }"
            @error="onAvatarImageError"
          />
        </span>
        <div v-if="!effectiveMini" class="min-w-0">
          <p class="truncate text-sm font-medium text-surface-900 dark:text-surface-0">
            {{ userDisplayName }}
          </p>
          <p class="truncate text-xs text-muted-color">
            {{ userRoleLabelRu(String(user.role ?? '')) }}
          </p>
        </div>
      </NuxtLink>
      <Button
        :label="effectiveMini ? undefined : t('admin.sidebar.logout')"
        icon="pi pi-sign-out"
        text
        :class="
          effectiveMini
            ? '!mx-auto !flex !h-10 !w-10 !items-center !justify-center !p-0'
            : 'w-full justify-start !px-3 !py-2'
        "
        :title="effectiveMini ? t('admin.sidebar.logout') : undefined"
        :aria-label="t('admin.sidebar.logout')"
        @click="emit('logout-click')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import type { PublicTenantMeta } from '~/composables/usePublicTournamentFetch'

const props = defineProps<{
  tenant: string
  tenantMeta?: PublicTenantMeta | null
}>()

const mobileMenuOpen = ref(false)
const mediaDropdownOpen = ref(false)
const participantsDropdownOpen = ref(false)
const mediaDropdownRef = ref<HTMLElement | null>(null)
const participantsDropdownRef = ref<HTMLElement | null>(null)
const route = useRoute()
const { fetchTenantMeta } = usePublicTournamentFetch()
const organizationNamesByTenant = useState<Record<string, string>>(
  'public-organization-names-by-tenant',
  () => ({}),
)
type PublicBranding = {
  publicLogoUrl?: string | null
  publicFaviconUrl?: string | null
  publicAccentPrimary?: string | null
  publicAccentSecondary?: string | null
  publicThemeMode?: 'light' | 'dark' | 'system' | string | null
  publicTagline?: string | null
}
type PublicSettings = {
  publicOrganizationDisplayName?: string | null
  publicDefaultLanding?: 'about' | 'tournaments' | 'participants' | 'media' | string | null
}
const brandingByTenant = useState<Record<string, PublicBranding>>(
  'public-branding-by-tenant',
  () => ({}),
)
const settingsByTenant = useState<Record<string, PublicSettings>>(
  'public-settings-by-tenant',
  () => ({}),
)
const organizationName = ref<string>(organizationNamesByTenant.value[props.tenant] ?? '')
const organizationBranding = ref<PublicBranding>(brandingByTenant.value[props.tenant] ?? {})
const organizationSettings = ref<PublicSettings>(settingsByTenant.value[props.tenant] ?? {})

const hasTournamentContext = computed(() => {
  const tid = route.query.tid
  return typeof tid === 'string' && tid.trim().length > 0
})

const inTournamentWorkspace = computed(() => {
  const p = route.path
  const base = `/${props.tenant}`
  const tournamentBase = `${base}/tournaments`
  const workspacePrefixes = [
    `${tournamentBase}/table`,
    `${tournamentBase}/calendar`,
    `${tournamentBase}/scorers`,
    `${tournamentBase}/documents`,
    `${tournamentBase}/participants`,
    `${tournamentBase}/media`,
    `${tournamentBase}/broadcasts`,
    `${base}/table`,
    `${base}/calendar`,
    `${base}/scorers`,
    `${base}/documents`,
    `${base}/participants`,
    `${base}/media`,
    `${base}/broadcasts`,
  ]
  return workspacePrefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))
})

/** Единый список пунктов: десктоп и выезжающее меню */
const navLinks = computed(() => [
  {
    key: 'about' as const,
    label: 'О ЛИГЕ',
    to: `/${props.tenant}/about`,
    activePrefixes: [`/${props.tenant}/about`],
  },
  {
    key: 'tournaments' as const,
    label: 'ТУРНИРЫ',
    to: `/${props.tenant}/tournaments`,
    query:
      typeof route.query.tid === 'string' && route.query.tid.trim()
        ? { tid: route.query.tid.trim() }
        : undefined,
    activePrefixes: [
      `/${props.tenant}/tournaments`,
      `/${props.tenant}/tournaments/table`,
      `/${props.tenant}/tournaments/calendar`,
      `/${props.tenant}/tournaments/scorers`,
      `/${props.tenant}/tournaments/match-`,
      `/${props.tenant}/table`,
      `/${props.tenant}/calendar`,
      `/${props.tenant}/scorers`,
      `/${props.tenant}/match-`,
    ],
  },
  {
    key: 'participants' as const,
    label: 'УЧАСТНИКИ',
    to: `/${props.tenant}/participants-teams`,
    activePrefixes: [`/${props.tenant}/participants-teams`, `/${props.tenant}/participants-players`],
  },
  {
    key: 'media' as const,
    label: 'МЕДИА',
    to: `/${props.tenant}/media-photo`,
    activePrefixes: [`/${props.tenant}/media-photo`, `/${props.tenant}/media-video`],
  },
])

const brandHomeTarget = computed(() => {
  const landing = String(organizationSettings.value.publicDefaultLanding ?? 'tournaments').trim().toLowerCase()
  if (landing === 'about') return { path: `/${props.tenant}/about` }
  if (landing === 'participants') return { path: `/${props.tenant}/participants-teams` }
  if (landing === 'media') return { path: `/${props.tenant}/media-photo` }
  const tid = typeof route.query.tid === 'string' && route.query.tid.trim()
    ? route.query.tid.trim()
    : undefined
  return {
    path: `/${props.tenant}/tournaments/table`,
    query: tid ? { tid } : undefined,
  }
})


const mediaOrgLinks = computed(() => [
  {
    key: 'photo' as const,
    label: 'Фото',
    to: `/${props.tenant}/media-photo`,
    query: undefined,
  },
  {
    key: 'video' as const,
    label: 'Видео',
    to: `/${props.tenant}/media-video`,
    query: undefined,
  },
])

const participantsOrgLinks = computed(() => [
  {
    key: 'teams' as const,
    label: 'Команды',
    to: `/${props.tenant}/participants-teams`,
    query: undefined,
  },
  {
    key: 'players' as const,
    label: 'Игроки',
    to: `/${props.tenant}/participants-players`,
    query: undefined,
  },
])

function closeMobileMenu() {
  mobileMenuOpen.value = false
}

function toggleMediaDropdown() {
  mediaDropdownOpen.value = !mediaDropdownOpen.value
  if (mediaDropdownOpen.value) participantsDropdownOpen.value = false
}

function toggleParticipantsDropdown() {
  participantsDropdownOpen.value = !participantsDropdownOpen.value
  if (participantsDropdownOpen.value) mediaDropdownOpen.value = false
}

function closeAllDesktopDropdowns() {
  mediaDropdownOpen.value = false
  participantsDropdownOpen.value = false
}

function onDropdownFocusOut(event: FocusEvent, kind: 'media' | 'participants') {
  const root = kind === 'media' ? mediaDropdownRef.value : participantsDropdownRef.value
  const next = event.relatedTarget as Node | null
  if (root && next && root.contains(next)) return
  if (kind === 'media') mediaDropdownOpen.value = false
  else participantsDropdownOpen.value = false
}

const isActive = (link: { key: 'about' | 'tournaments' | 'participants' | 'media'; to: string; activePrefixes?: string[] }) => {
  if (hasTournamentContext.value || inTournamentWorkspace.value) {
    if (link.key === 'tournaments') return true
    if (link.key === 'participants' || link.key === 'media') return false
  }
  const prefixes = link.activePrefixes?.length ? link.activePrefixes : [link.to]
  return prefixes.some((prefix) =>
    route.path === prefix ||
    route.path.startsWith(`${prefix}/`) ||
    (prefix.endsWith('-') && route.path.startsWith(prefix)),
  )
}

function normalizeHex(value: unknown, fallback: string) {
  const v = String(value ?? '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback
}

function shiftHex(hex: string, amount: number) {
  const normalized = normalizeHex(hex, '#123c67').slice(1)
  const n = Number.parseInt(normalized, 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + amount))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount))
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount))
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

function resolveThemeMode(raw: unknown): 'light' | 'dark' {
  const mode = String(raw ?? '').trim().toLowerCase()
  if (mode === 'light' || mode === 'dark') return mode
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

const brandPrimary = computed(() =>
  normalizeHex(organizationBranding.value.publicAccentPrimary, '#123c67'),
)
const brandSecondary = computed(() =>
  normalizeHex(organizationBranding.value.publicAccentSecondary, '#c80a48'),
)
const brandTertiary = computed(() => shiftHex(brandPrimary.value, 58))
const brandLogoUrl = computed(() => {
  const raw = String(organizationBranding.value.publicLogoUrl ?? '').trim()
  return raw || '/logo.png'
})
const brandTagline = computed(() => {
  const raw = String(organizationBranding.value.publicTagline ?? '').trim()
  return raw || 'Лига и турниры'
})
const topBarStyle = computed(() => ({
  backgroundColor: brandPrimary.value,
}))
const navBarStyle = computed(() => ({
  backgroundColor: shiftHex(brandPrimary.value, -8),
}))
const activeNavStyle = computed(() => ({
  backgroundColor: brandSecondary.value,
}))
const activeArrowStyle = computed(() => ({
  backgroundColor: brandSecondary.value,
}))
const inactiveNavStyle = computed(() => ({
  backgroundColor: 'transparent',
}))

/** Местное время устройства — для ориентира относительно расписания матчей */
const now = ref(new Date())
let localClockTimer: ReturnType<typeof setInterval> | null = null

const clockIso = computed(() => now.value.toISOString())

const clockDateLabel = computed(() =>
  new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now.value),
)

/** Короче для узкой шапки на телефоне */
const clockDateCompact = computed(() =>
  new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(now.value),
)

const clockTimeLabel = computed(() =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now.value),
)

function applyPublicBranding() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--public-brand-primary', brandPrimary.value)
  root.style.setProperty('--public-brand-secondary', brandSecondary.value)
  root.style.setProperty('--public-accent-primary', brandPrimary.value)
  root.style.setProperty('--public-accent-secondary', brandSecondary.value)
  root.style.setProperty('--public-accent-tertiary', brandTertiary.value)
  root.setAttribute('data-public-theme', resolveThemeMode(organizationBranding.value.publicThemeMode))
  const faviconUrl = String(organizationBranding.value.publicFaviconUrl ?? '').trim()
  if (faviconUrl) {
    let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = faviconUrl
  }
}

function isMediaActive() {
  if (hasTournamentContext.value || inTournamentWorkspace.value) return false
  return (
    route.path === `/${props.tenant}/media-photo` ||
    route.path === `/${props.tenant}/media-video`
  )
}

function isParticipantsActive() {
  if (hasTournamentContext.value || inTournamentWorkspace.value) return false
  return (
    route.path === `/${props.tenant}/participants-teams` ||
    route.path === `/${props.tenant}/participants-players`
  )
}

async function loadOrganizationName() {
  try {
    const meta = await fetchTenantMeta(props.tenant)
    applyMeta(meta)
  } catch {
    organizationName.value = organizationNamesByTenant.value[props.tenant] ?? ''
    organizationBranding.value = brandingByTenant.value[props.tenant] ?? {}
    organizationSettings.value = settingsByTenant.value[props.tenant] ?? {}
    applyPublicBranding()
  }
}

function applyMeta(meta: PublicTenantMeta | null | undefined) {
  const normalized = String(meta?.name ?? '').trim()
  const displayName = String(meta?.publicSettings?.publicOrganizationDisplayName ?? '').trim()
  organizationName.value = displayName || normalized || organizationName.value
  organizationBranding.value = meta?.branding ?? organizationBranding.value
  organizationSettings.value = meta?.publicSettings ?? organizationSettings.value

  if (normalized) {
    organizationNamesByTenant.value = {
      ...organizationNamesByTenant.value,
      [props.tenant]: normalized,
    }
  }
  brandingByTenant.value = {
    ...brandingByTenant.value,
    [props.tenant]: meta?.branding ?? {},
  }
  settingsByTenant.value = {
    ...settingsByTenant.value,
    [props.tenant]: meta?.publicSettings ?? {},
  }
  applyPublicBranding()
}

watch(() => props.tenant, () => {
  organizationName.value = organizationNamesByTenant.value[props.tenant] ?? ''
  organizationBranding.value = brandingByTenant.value[props.tenant] ?? {}
  organizationSettings.value = settingsByTenant.value[props.tenant] ?? {}
  applyPublicBranding()
  if (!props.tenantMeta) void loadOrganizationName()
})

watch(
  () => props.tenantMeta,
  (meta) => {
    if (meta) applyMeta(meta)
  },
  { immediate: true },
)

watch(
  () => route.fullPath,
  () => {
    closeAllDesktopDropdowns()
  },
)

onMounted(() => {
  applyPublicBranding()
  if (props.tenantMeta) applyMeta(props.tenantMeta)
  else void loadOrganizationName()
  now.value = new Date()
  localClockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onBeforeUnmount(() => {
  if (localClockTimer) {
    clearInterval(localClockTimer)
    localClockTimer = null
  }
})
</script>

<template>
  <header class="w-full border-b border-[#d0d7e2] shadow-[0_6px_14px_rgba(15,23,42,0.1)]">
    <div class="text-white" :style="topBarStyle">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <NuxtLink :to="brandHomeTarget" class="flex items-center gap-3 min-w-0">
            <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm">
              <RemoteImage
                :src="brandLogoUrl"
                alt="Tournament Platform"
                fit="contain"
                :lazy="false"
                class="h-full w-full"
              />
            </div>
            <div class="min-w-0">
              <p class="truncate text-lg font-semibold tracking-wide">
                {{ organizationName || 'Tournament Platform' }}
              </p>
              <p class="truncate text-xs text-white/75">{{ brandTagline }}</p>
            </div>
          </NuxtLink>
        </div>
        <div class="flex shrink-0 items-center gap-2 sm:gap-3">
          <div
            class="flex max-w-[min(100%,11.5rem)] flex-col items-end gap-0.5 text-right sm:max-w-none sm:rounded-lg sm:border sm:border-white/15 sm:bg-white/10 sm:px-3 sm:py-2 sm:shadow-sm sm:backdrop-blur-sm"
            aria-live="polite"
            title="Местное время вашего устройства. Сверяйте с расписанием матчей."
          >
            <span class="hidden text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-white/55 sm:inline">
              Местное время
            </span>
            <span class="text-[0.65rem] leading-tight text-white/80 sm:hidden">{{ clockDateCompact }}</span>
            <span class="hidden text-xs leading-snug text-white/80 sm:inline">{{ clockDateLabel }}</span>
            <time
              class="text-base font-semibold tabular-nums tracking-tight text-white sm:text-xl"
              :datetime="clockIso"
            >
              {{ clockTimeLabel }}
            </time>
          </div>
          <Button
            class="md:!hidden !text-white"
            icon="pi pi-bars"
            text
            rounded
            aria-label="Открыть меню"
            @click="mobileMenuOpen = true"
          />
        </div>
      </div>
    </div>

    <div class="border-t border-white/10" :style="navBarStyle">
      <div class="mx-auto hidden max-w-6xl items-stretch px-4 md:flex">
        <template v-for="link in navLinks">
          <div
            v-if="link.key === 'participants'"
            :key="link.to + link.label"
            ref="participantsDropdownRef"
            class="relative"
            @mouseenter="participantsDropdownOpen = true"
            @mouseleave="participantsDropdownOpen = false"
            @focusout="onDropdownFocusOut($event, 'participants')"
          >
            <button
              type="button"
              :aria-expanded="participantsDropdownOpen ? 'true' : 'false'"
              aria-haspopup="menu"
              class="relative min-w-[140px] px-6 py-3 text-center text-xs font-semibold tracking-wide text-white/90 transition-colors"
              :class="isParticipantsActive() ? 'text-white' : 'hover:bg-[#24679e]'"
              :style="isParticipantsActive() ? activeNavStyle : inactiveNavStyle"
              @click="toggleParticipantsDropdown"
              @keydown.escape.prevent="closeAllDesktopDropdowns"
              @keydown.enter.prevent="toggleParticipantsDropdown"
              @keydown.space.prevent="toggleParticipantsDropdown"
              @keydown.arrow-down.prevent="participantsDropdownOpen = true"
            >
              <span>{{ link.label }}</span>
              <span
                v-if="isParticipantsActive()"
                class="pointer-events-none absolute -right-4 top-0 h-full w-4"
                :style="activeArrowStyle"
                style="clip-path: polygon(0 0, 100% 50%, 0 100%)"
              />
            </button>
            <div
              v-if="participantsDropdownOpen"
              role="menu"
              class="absolute left-0 top-full z-30 w-56 overflow-hidden rounded-b-lg border border-[#d6e0ee] bg-white shadow-lg"
            >
              <NuxtLink
                v-for="m in participantsOrgLinks"
                :key="m.key"
                :to="{ path: m.to, query: m.query }"
                class="block px-3 py-2 text-sm text-[#123c67] transition-colors hover:bg-[#f4f7fc]"
              >
                {{ m.label }}
              </NuxtLink>
            </div>
          </div>
          <div
            v-else-if="link.key === 'media'"
            :key="link.to + link.label"
            ref="mediaDropdownRef"
            class="relative"
            @mouseenter="mediaDropdownOpen = true"
            @mouseleave="mediaDropdownOpen = false"
            @focusout="onDropdownFocusOut($event, 'media')"
          >
            <button
              type="button"
              :aria-expanded="mediaDropdownOpen ? 'true' : 'false'"
              aria-haspopup="menu"
              class="relative min-w-[140px] px-6 py-3 text-center text-xs font-semibold tracking-wide text-white/90 transition-colors"
              :class="isMediaActive() ? 'text-white' : 'hover:bg-[#24679e]'"
              :style="isMediaActive() ? activeNavStyle : inactiveNavStyle"
              @click="toggleMediaDropdown"
              @keydown.escape.prevent="closeAllDesktopDropdowns"
              @keydown.enter.prevent="toggleMediaDropdown"
              @keydown.space.prevent="toggleMediaDropdown"
              @keydown.arrow-down.prevent="mediaDropdownOpen = true"
            >
              <span>{{ link.label }}</span>
              <span
                v-if="isMediaActive()"
                class="pointer-events-none absolute -right-4 top-0 h-full w-4"
                :style="activeArrowStyle"
                style="clip-path: polygon(0 0, 100% 50%, 0 100%)"
              />
            </button>
            <div
              v-if="mediaDropdownOpen"
              role="menu"
              class="absolute left-0 top-full z-30 w-56 overflow-hidden rounded-b-lg border border-[#d6e0ee] bg-white shadow-lg"
            >
              <NuxtLink
                v-for="m in mediaOrgLinks"
                :key="m.key"
                :to="{ path: m.to, query: m.query }"
                class="block px-3 py-2 text-sm text-[#123c67] transition-colors hover:bg-[#f4f7fc]"
              >
                {{ m.label }}
              </NuxtLink>
            </div>
          </div>
          <NuxtLink
            v-else
            :key="link.to + link.label"
            :to="{ path: link.to, query: link.query }"
            class="relative min-w-[140px] px-6 py-3 text-center text-xs font-semibold tracking-wide text-white/90 transition-colors"
            :class="isActive(link) ? 'text-white' : 'hover:bg-[#24679e]'"
            :style="isActive(link) ? activeNavStyle : inactiveNavStyle"
          >
            <span>{{ link.label }}</span>
            <span
              v-if="isActive(link)"
              class="pointer-events-none absolute -right-4 top-0 h-full w-4"
              :style="activeArrowStyle"
              style="clip-path: polygon(0 0, 100% 50%, 0 100%)"
            />
          </NuxtLink>
        </template>
      </div>
    </div>

    <Drawer
      :visible="mobileMenuOpen"
      @update:visible="(v) => (mobileMenuOpen = v)"
      position="right"
      header="Разделы"
      class="!w-[min(100vw,18rem)]"
    >
      <nav class="flex flex-col gap-1 text-base font-medium text-surface-800">
        <template v-for="link in navLinks">
          <NuxtLink
            v-if="link.key !== 'media' && link.key !== 'participants'"
            :key="link.to + link.label"
            class="block rounded-lg px-3 py-3 transition-colors"
            :class="
              isActive(link)
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-surface-100'
            "
            :to="{ path: link.to, query: link.query }"
            @click="closeMobileMenu"
          >
            {{ link.label }}
          </NuxtLink>
          <div v-else-if="link.key === 'participants'" :key="link.to + link.label" class="rounded-lg border border-surface-200 p-2">
            <div class="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-color">
              Участники
            </div>
            <NuxtLink
              v-for="m in participantsOrgLinks"
              :key="m.key"
              class="block rounded-lg px-2 py-2 text-sm text-surface-800 transition-colors hover:bg-surface-100"
              :to="{ path: m.to, query: m.query }"
              @click="closeMobileMenu"
            >
              {{ m.label }}
            </NuxtLink>
          </div>
          <div v-else :key="link.to + link.label" class="rounded-lg border border-surface-200 p-2">
            <div class="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-color">
              Медиа
            </div>
            <NuxtLink
              v-for="m in mediaOrgLinks"
              :key="m.key"
              class="block rounded-lg px-2 py-2 text-sm text-surface-800 transition-colors hover:bg-surface-100"
              :to="{ path: m.to, query: m.query }"
              @click="closeMobileMenu"
            >
              {{ m.label }}
            </NuxtLink>
          </div>
        </template>
      </nav>
    </Drawer>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'

const props = defineProps<{
  tenant: string
}>()

const mobileMenuOpen = ref(false)
const mediaDropdownOpen = ref(false)
const participantsDropdownOpen = ref(false)
const route = useRoute()
const { fetchTenantMeta } = usePublicTournamentFetch()
const organizationNamesByTenant = useState<Record<string, string>>(
  'public-organization-names-by-tenant',
  () => ({}),
)
const organizationName = ref<string>(organizationNamesByTenant.value[props.tenant] ?? '')

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
    const normalized = meta?.name?.trim() ?? ''
    organizationName.value = normalized
    if (normalized) {
      organizationNamesByTenant.value = {
        ...organizationNamesByTenant.value,
        [props.tenant]: normalized,
      }
    }
  } catch {
    organizationName.value = organizationNamesByTenant.value[props.tenant] ?? ''
  }
}

watch(() => props.tenant, () => {
  organizationName.value = organizationNamesByTenant.value[props.tenant] ?? ''
  void loadOrganizationName()
})

watch(
  () => route.fullPath,
  () => {
    mediaDropdownOpen.value = false
    participantsDropdownOpen.value = false
  },
)

onMounted(() => {
  void loadOrganizationName()
})
</script>

<template>
  <header class="w-full border-b border-[#d0d7e2] shadow-[0_6px_14px_rgba(15,23,42,0.1)]">
    <div class="bg-[#123c67] text-white">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div class="flex min-w-0 items-center gap-3">
          <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm">
            <img src="/logo.png" alt="Tournament Platform" class="h-full w-full object-contain" />
          </div>
          <div class="min-w-0">
            <p class="truncate text-lg font-semibold tracking-wide">
              {{ organizationName || 'Tournament Platform' }}
            </p>
            <p class="truncate text-xs text-white/75">Лига и турниры</p>
          </div>
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

    <div class="bg-[#1a5a8c] border-t border-white/10">
      <div class="mx-auto hidden max-w-6xl items-stretch px-4 md:flex">
        <template v-for="link in navLinks">
          <div
            v-if="link.key === 'participants'"
            :key="link.to + link.label"
            class="relative"
            @mouseenter="participantsDropdownOpen = true"
            @mouseleave="participantsDropdownOpen = false"
          >
            <button
              type="button"
              class="relative min-w-[140px] px-6 py-3 text-center text-xs font-semibold tracking-wide text-white/90 transition-colors"
              :class="isParticipantsActive() ? 'bg-[#c80a48] text-white' : 'hover:bg-[#24679e]'"
            >
              <span>{{ link.label }}</span>
              <span
                v-if="isParticipantsActive()"
                class="pointer-events-none absolute -right-4 top-0 h-full w-4 bg-[#c80a48]"
                style="clip-path: polygon(0 0, 100% 50%, 0 100%)"
              />
            </button>
            <div
              v-if="participantsDropdownOpen"
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
            class="relative"
            @mouseenter="mediaDropdownOpen = true"
            @mouseleave="mediaDropdownOpen = false"
          >
            <button
              type="button"
              class="relative min-w-[140px] px-6 py-3 text-center text-xs font-semibold tracking-wide text-white/90 transition-colors"
              :class="isMediaActive() ? 'bg-[#c80a48] text-white' : 'hover:bg-[#24679e]'"
            >
              <span>{{ link.label }}</span>
              <span
                v-if="isMediaActive()"
                class="pointer-events-none absolute -right-4 top-0 h-full w-4 bg-[#c80a48]"
                style="clip-path: polygon(0 0, 100% 50%, 0 100%)"
              />
            </button>
            <div
              v-if="mediaDropdownOpen"
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
            :class="isActive(link) ? 'bg-[#c80a48] text-white' : 'hover:bg-[#24679e]'"
          >
            <span>{{ link.label }}</span>
            <span
              v-if="isActive(link)"
              class="pointer-events-none absolute -right-4 top-0 h-full w-4 bg-[#c80a48]"
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

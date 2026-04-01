<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{
  tenant: string
  tid?: string | null
  tournamentName?: string | null
  loading?: boolean
  socialLinks?: {
    websiteUrl?: string | null
    showWebsiteLink?: boolean
    socialYoutubeUrl?: string | null
    showSocialYoutubeLink?: boolean
    socialInstagramUrl?: string | null
    showSocialInstagramLink?: boolean
    socialTelegramUrl?: string | null
    showSocialTelegramLink?: boolean
    socialMaxUrl?: string | null
    showSocialMaxLink?: boolean
  } | null
  standingsPreview?: Array<{
    teamId: string
    teamName: string
    points: number
    played?: number
    goalDiff?: number
    logoUrl?: string | null
  }>
  active: 'table' | 'calendar' | 'players' | 'documents' | 'none'
}>()

const route = useRoute()
const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'
const extraSectionsOpen = ref(true)

function firstQueryValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? '').trim()
  if (typeof value === 'string') return value.trim()
  return ''
}

const baseQuery = computed(() => {
  const q: Record<string, string> = {}
  const tidFromRoute = firstQueryValue(route.query.tid)
  const effectiveTid = props.tid?.trim() || tidFromRoute.trim()
  if (effectiveTid) q.tid = effectiveTid
  return q
})

const tournamentNavLinks = [
  { key: 'calendar' as const, suffix: 'calendar', label: 'Календарь', icon: 'pi-calendar' },
  { key: 'table' as const, suffix: 'table', label: 'Турнирная таблица', icon: 'pi-table' },
  { key: 'players' as const, suffix: 'scorers', label: 'Статистика игроков', icon: 'pi-chart-line' },
  { key: 'documents' as const, suffix: 'documents', label: 'Документы', icon: 'pi-folder-open' },
] as const

const extraNavLinks = [
  {
    key: 'participants' as const,
    to: (tenant: string) => `/${tenant}/tournaments/participants`,
    label: 'Команды',
    icon: 'pi-users',
  },
  {
    key: 'news' as const,
    canonicalTo: (tenant: string) => `/${tenant}/tournaments/news`,
    to: (tenant: string) => `/${tenant}/tournaments/media`,
    query: () => ({ tab: 'news' }),
    label: 'Новости',
    icon: 'pi-megaphone',
  },
  {
    key: 'photo' as const,
    canonicalTo: (tenant: string) => `/${tenant}/tournaments/photo`,
    to: (tenant: string) => `/${tenant}/tournaments/media`,
    query: () => ({ tab: 'gallery' }),
    label: 'Фото',
    icon: 'pi-images',
  },
  {
    key: 'video' as const,
    canonicalTo: (tenant: string) => `/${tenant}/tournaments/video`,
    to: (tenant: string) => `/${tenant}/tournaments/media`,
    query: () => ({ tab: 'video' }),
    label: 'Видео',
    icon: 'pi-video',
  },
  {
    key: 'broadcasts' as const,
    to: (tenant: string) => `/${tenant}/tournaments/broadcasts`,
    label: 'Трансляции',
    icon: 'pi-play-circle',
  },
] as const

const activeTab = computed(() => {
  const raw = firstQueryValue(route.query.tab).toLowerCase()
  if (raw === 'photo' || raw === 'gallery') return 'photo'
  if (raw === 'video') return 'video'
  return 'news'
})

function normalizeMediaTab(value: string | undefined): 'news' | 'photo' | 'video' | '' {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return ''
  if (raw === 'photo' || raw === 'gallery') return 'photo'
  if (raw === 'video') return 'video'
  return 'news'
}

function isExtraLinkActive(link: (typeof extraNavLinks)[number]) {
  const targetPath =
    'canonicalTo' in link && typeof link.canonicalTo === 'function'
      ? link.canonicalTo(props.tenant)
      : link.to(props.tenant)

  if (route.path === targetPath) return true

  const legacyPath = link.to(props.tenant)
  if (route.path !== legacyPath) return false
  const tabValue = 'query' in link && typeof link.query === 'function' ? link.query().tab : ''
  const tab = normalizeMediaTab(tabValue)
  if (!tab) return true
  return tab === activeTab.value
}

const socialLinks = computed(() => {
  const links = props.socialLinks ?? {}
  const all = [
    {
      key: 'website',
      url: links.websiteUrl ?? null,
      enabled: links.showWebsiteLink !== false,
      icon: 'pi-link',
      label: 'Website',
    },
    {
      key: 'youtube',
      url: links.socialYoutubeUrl ?? null,
      enabled: links.showSocialYoutubeLink !== false,
      icon: 'pi-youtube',
      label: 'YouTube',
    },
    {
      key: 'telegram',
      url: links.socialTelegramUrl ?? null,
      enabled: links.showSocialTelegramLink !== false,
      icon: 'pi-send',
      label: 'Telegram',
    },
    {
      key: 'instagram',
      url: links.socialInstagramUrl ?? null,
      enabled: links.showSocialInstagramLink !== false,
      icon: 'pi-instagram',
      label: 'Instagram',
    },
    {
      key: 'max',
      url: links.socialMaxUrl ?? null,
      enabled: links.showSocialMaxLink !== false,
      icon: 'pi-comments',
      label: 'MAX',
    },
  ] as const
  return all.filter((x): x is (typeof all)[number] & { url: string } => {
    return x.enabled && typeof x.url === 'string' && x.url.trim().length > 0
  })
})

const hasStandingsPreview = computed(() => (props.standingsPreview?.length ?? 0) > 0)

function resolveTeamLogo(url: string | null | undefined) {
  const normalized = String(url ?? '').trim()
  return normalized.length ? normalized : TEAM_PLACEHOLDER_SRC
}

function handleTeamLogoError(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLImageElement)) return
  if (target.src.endsWith(TEAM_PLACEHOLDER_SRC)) return
  target.src = TEAM_PLACEHOLDER_SRC
}

function formatGoalDiff(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  if (n > 0) return `+${n}`
  if (n < 0) return String(n)
  return '0'
}

function goalDiffClass(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  if (n > 0) return 'sb-standings-num--positive'
  if (n < 0) return 'sb-standings-num--negative'
  return 'sb-standings-num--neutral'
}
</script>

<template>
  <aside class="self-start h-max overflow-hidden rounded-2xl bg-white shadow-[0_10px_28px_rgba(18,60,103,0.12)] ring-1 ring-white/80 lg:sticky lg:top-4">
    <template v-if="loading">
      <div class="border-b border-[#d6e0ee] bg-[#f4f7fc] p-4">
        <Skeleton width="5.5rem" height="0.75rem" />
        <Skeleton class="mt-2" width="11rem" height="1rem" />
      </div>
      <div class="space-y-2 p-3">
        <Skeleton v-for="i in 5" :key="`sb-main-sk-${i}`" width="100%" height="2.3rem" />
      </div>
      <div class="border-t border-[#d6e0ee] p-3">
        <Skeleton width="6rem" height="0.75rem" />
        <div class="mt-2 space-y-2">
          <Skeleton v-for="i in 4" :key="`sb-extra-sk-${i}`" width="100%" height="2rem" />
        </div>
      </div>
      <div class="border-t border-[#d6e0ee] p-3">
        <div class="flex gap-2">
          <Skeleton v-for="i in 3" :key="`sb-social-sk-${i}`" shape="circle" size="2rem" />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="border-b border-[#d6e0ee] bg-[#f4f7fc] p-4">
        <div class="text-sm uppercase tracking-wide text-[#4f6b8c]">О турнире</div>
        <div class="mt-2 truncate text-lg font-semibold text-[#123c67]">
          {{ tournamentName || 'Турнир' }}
        </div>
      </div>

      <nav class="space-y-1 p-3">
        <NuxtLink
          v-for="link in tournamentNavLinks"
          :key="link.key"
          :to="{ path: `/${tenant}/tournaments/${link.suffix}`, query: baseQuery }"
          class="flex items-center gap-2.5 rounded-xl px-3 py-3 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c80a48]/30"
          :class="
            active === link.key
              ? 'bg-[#c80a48] text-white shadow-sm'
              : 'text-[#123c67] hover:bg-[#f4f7fc]'
          "
        >
          <i :class="['pi', link.icon, 'text-[1rem]']" />
          <span>{{ link.label }}</span>
        </NuxtLink>

        <div class="mt-3 border-t border-[#d6e0ee] pt-2">
          <button
            type="button"
            class="mb-1 flex w-full items-center justify-between rounded-lg px-1.5 py-1 text-left text-sm uppercase tracking-wide text-[#4f6b8c] transition-colors hover:bg-[#f4f7fc]"
            :aria-expanded="extraSectionsOpen"
            @click="extraSectionsOpen = !extraSectionsOpen"
          >
            <span>Разделы</span>
            <i
              class="pi pi-chevron-down text-xs transition-transform duration-200"
              :class="extraSectionsOpen ? 'rotate-0' : '-rotate-90'"
            />
          </button>
          <Transition name="sidebar-collapse">
            <div v-if="extraSectionsOpen" class="sidebar-collapse-wrap space-y-0.5">
              <NuxtLink
                v-for="link in extraNavLinks"
                :key="`${link.label}-${link.icon}`"
                :to="{
                  path:
                    'canonicalTo' in link && typeof link.canonicalTo === 'function'
                      ? link.canonicalTo(tenant)
                      : link.to(tenant),
                  query: { ...baseQuery, ...(link.query ? link.query() : {}) },
                }"
                class="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c80a48]/30"
                :class="
                  isExtraLinkActive(link)
                    ? 'bg-[#c80a48] text-white shadow-sm'
                    : 'text-[#123c67] hover:bg-[#f4f7fc]'
                "
              >
                <i :class="['pi', link.icon, 'text-[1rem]']" />
                <span>{{ link.label }}</span>
              </NuxtLink>
            </div>
          </Transition>
        </div>
      </nav>

      <div v-if="hasStandingsPreview" class="border-t border-[#d6e0ee] p-3">
        <div class="mb-2 px-1 text-sm uppercase tracking-wide text-[#4f6b8c]">Топ-3 таблицы</div>
        <div class="sb-standings-head" aria-hidden="true">
          <span class="sb-standings-head__pad" />
          <span class="sb-standings-head__pad" />
          <span class="sb-standings-head__team"></span>
          <span class="sb-standings-head__num">И</span>
          <span class="sb-standings-head__num">+/-</span>
          <span class="sb-standings-head__num">О</span>
        </div>
        <div class="space-y-1">
          <div
            v-for="(row, idx) in standingsPreview"
            :key="`sb-stand-${row.teamId}`"
            class="sb-standings-row"
          >
            <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#eef5ff] text-[0.68rem] font-semibold text-[#1a5a8c]">
              {{ idx + 1 }}
            </span>
            <img
              :src="resolveTeamLogo(row.logoUrl)"
              :alt="row.teamName"
              class="h-5 w-5 rounded-full object-cover"
              loading="lazy"
              @error="handleTeamLogoError"
            />
            <span class="sb-standings-team truncate">{{ row.teamName }}</span>
            <span class="sb-standings-num">{{ row.played ?? 0 }}</span>
            <span class="sb-standings-num" :class="goalDiffClass(row.goalDiff)">
              {{ formatGoalDiff(row.goalDiff) }}
            </span>
            <span class="sb-standings-num sb-standings-num--points">{{ row.points }}</span>
          </div>
        </div>
      </div>

      <div v-if="socialLinks.length" class="border-t border-[#d6e0ee] p-3">
        <div class="flex items-center justify-start gap-2">
          <a
            v-for="link in socialLinks"
            :key="link.key"
            :href="link.url"
            target="_blank"
            rel="noopener noreferrer"
            class="flex h-8 w-8 items-center justify-center rounded-full border border-[#d6e0ee] text-[#4f6b8c] hover:border-[#c80a48]/30 hover:text-[#c80a48]"
            :aria-label="link.label"
            :title="link.label"
          >
            <i :class="['pi', link.icon]" />
          </a>
        </div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.sb-standings-head {
  display: grid;
  grid-template-columns: 1.45rem 1.2rem minmax(0, 1fr) 2rem 2.4rem 1.8rem;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0.45rem 0.3rem 0.45rem;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #4f6b8c;
}

.sb-standings-head__pad {
  width: 100%;
  height: 1px;
}

.sb-standings-head__team {
  text-align: left;
}

.sb-standings-head__num {
  text-align: center;
}

.sb-standings-row {
  display: grid;
  grid-template-columns: 1.45rem 1.2rem minmax(0, 1fr) 2rem 2.4rem 1.8rem;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid #e4ebf5;
  border-radius: 0.65rem;
  background: #f9fbff;
  padding: 0.4rem 0.45rem;
}

.sb-standings-team {
  min-width: 0;
  font-size: 0.66rem;
  font-weight: 600;
  color: #123c67;
}

.sb-standings-num {
  text-align: center;
  font-size: 0.72rem;
  font-weight: 700;
  color: #1a5a8c;
  font-variant-numeric: tabular-nums;
}

.sb-standings-num--positive {
  color: #047857;
}

.sb-standings-num--negative {
  color: #b91c1c;
}

.sb-standings-num--neutral {
  color: #1a5a8c;
}

.sb-standings-num--points {
  color: #c80a48;
}

.sidebar-collapse-wrap {
  overflow: hidden;
}

.sidebar-collapse-enter-active,
.sidebar-collapse-leave-active {
  transition:
    max-height 0.24s ease,
    opacity 0.2s ease,
    transform 0.2s ease;
}

.sidebar-collapse-enter-from,
.sidebar-collapse-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
}

.sidebar-collapse-enter-to,
.sidebar-collapse-leave-from {
  max-height: 26rem;
  opacity: 1;
  transform: translateY(0);
}
</style>


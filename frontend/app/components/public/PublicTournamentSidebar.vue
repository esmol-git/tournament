<script setup lang="ts">
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import { PUBLIC_AUTO_ANIMATE } from '~/constants/publicMotion'
import { usePublicTournamentSidebarTopStatsStore } from '~/composables/usePublicTournamentSidebarTopStatsStore'

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
  standingsGroupPreview?: Array<{
    groupId: string
    groupName: string
    rows: Array<{
      teamId: string
      teamName: string
      points: number
      played?: number
      goalDiff?: number
      logoUrl?: string | null
    }>
  }>
  active: 'table' | 'calendar' | 'players' | 'documents' | 'none'
  unifiedBottom?: boolean
  sticky?: boolean
  showNewsLink?: boolean
}>()

const route = useRoute()
const { fetchTenantMeta } = usePublicTournamentFetch()
const { read: readTopStats } = usePublicTournamentSidebarTopStatsStore()
const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'
const extraSectionsOpen = ref(true)
const autoShowNewsLink = ref(true)
const autoShowTopStats = ref(true)
const [extraLinksWrapEl] = useAutoAnimate({ ...PUBLIC_AUTO_ANIMATE })
const [socialLinksWrapEl] = useAutoAnimate({ ...PUBLIC_AUTO_ANIMATE })
const [topStatsRowsEl] = useAutoAnimate({ ...PUBLIC_AUTO_ANIMATE })

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

const visibleExtraNavLinks = computed(() =>
  extraNavLinks.filter((link) => {
    if (link.key !== 'news') return true
    const effective = props.showNewsLink ?? autoShowNewsLink.value
    return effective !== false
  }),
)

async function loadSidebarSettings() {
  try {
    const meta = await fetchTenantMeta(props.tenant)
    autoShowNewsLink.value = meta?.publicSettings?.publicShowNewsInSidebar !== false
    autoShowTopStats.value = meta?.publicSettings?.publicShowTopStats !== false
  } catch {
    autoShowNewsLink.value = true
    autoShowTopStats.value = true
  }
}

watch(
  () => props.tenant,
  () => {
    void loadSidebarSettings()
  },
)

onMounted(() => {
  void loadSidebarSettings()
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

const standingsGroupSlideIndex = ref(0)
const hasStandingsPreview = computed(() => (props.standingsPreview?.length ?? 0) > 0)
const hasStandingsGroupPreview = computed(() => (props.standingsGroupPreview?.length ?? 0) > 0)
const hasAnyStandingsPreview = computed(() => hasStandingsGroupPreview.value || hasStandingsPreview.value)
const showStandingsPreviewContent = computed(() => {
  // На вкладке "Турнирная таблица" превью "Топ-3" дублирует основной контент.
  if (props.active === 'table') return false
  return true
})
const activeStandingsGroup = computed(() => {
  const groups = props.standingsGroupPreview ?? []
  if (!groups.length) return null
  const idx = Math.max(0, Math.min(standingsGroupSlideIndex.value, groups.length - 1))
  return groups[idx] ?? null
})

watch(
  () => props.standingsGroupPreview?.length ?? 0,
  (count) => {
    if (count <= 0) {
      standingsGroupSlideIndex.value = 0
      return
    }
    if (standingsGroupSlideIndex.value > count - 1) standingsGroupSlideIndex.value = 0
  },
)

function showPrevStandingsGroup() {
  const count = props.standingsGroupPreview?.length ?? 0
  if (count <= 1) return
  standingsGroupSlideIndex.value =
    standingsGroupSlideIndex.value <= 0 ? count - 1 : standingsGroupSlideIndex.value - 1
}

function showNextStandingsGroup() {
  const count = props.standingsGroupPreview?.length ?? 0
  if (count <= 1) return
  standingsGroupSlideIndex.value =
    standingsGroupSlideIndex.value >= count - 1 ? 0 : standingsGroupSlideIndex.value + 1
}

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

const topStatsSlides = computed(() => {
  const t = props.tenant
  const tid = String(props.tid ?? '').trim()
  if (!t || !tid) return []
  return readTopStats(t, tid).slides ?? []
})

const showTopStats = computed(() => {
  const effective = autoShowTopStats.value
  return effective !== false
})

const showTopStatsCard = computed(() => showTopStats.value && topStatsSlides.value.length > 0)

const topStatsSlideIndex = ref(0)
let topStatsSlideTimer: ReturnType<typeof setInterval> | null = null

const currentTopStatsSlide = computed(() => {
  const slides = topStatsSlides.value
  if (!slides.length) return null
  const idx = Math.max(0, Math.min(topStatsSlideIndex.value, slides.length - 1))
  return slides[idx] ?? null
})

function setTopStatsSlide(index: number) {
  const total = topStatsSlides.value.length
  if (!total) return
  topStatsSlideIndex.value = ((index % total) + total) % total
}

function startTopStatsSlider() {
  if (topStatsSlideTimer) clearInterval(topStatsSlideTimer)
  if (!showTopStatsCard.value) return
  topStatsSlideTimer = setInterval(() => {
    setTopStatsSlide(topStatsSlideIndex.value + 1)
  }, 4500)
}

watch(
  () => props.tid,
  () => {
    topStatsSlideIndex.value = 0
    startTopStatsSlider()
  },
)

watch(showTopStatsCard, () => {
  startTopStatsSlider()
})

onBeforeUnmount(() => {
  if (topStatsSlideTimer) {
    clearInterval(topStatsSlideTimer)
    topStatsSlideTimer = null
  }
})
</script>

<template>
  <aside
    class="self-start h-max overflow-hidden rounded-2xl bg-white shadow-[0_10px_28px_rgba(18,60,103,0.12)] ring-1 ring-white/80"
    :class="[(sticky ?? true) ? 'lg:sticky lg:top-4' : '', unifiedBottom ? 'rounded-b-none' : '']"
  >
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
            <div
              v-if="extraSectionsOpen"
              ref="extraLinksWrapEl"
              class="public-stagger-appear sidebar-collapse-wrap space-y-0.5"
            >
              <NuxtLink
                v-for="link in visibleExtraNavLinks"
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

      <!-- Блок топ-3/таблиц: показываем только на не-`table` вкладках. -->
      <div v-if="hasAnyStandingsPreview && showStandingsPreviewContent" class="border-t border-[#d6e0ee] p-3">
        <div class="min-h-[11.5rem]">
          <div class="mb-2 px-1 text-sm uppercase tracking-wide text-[#4f6b8c]">
            {{ hasStandingsGroupPreview ? 'Таблица по группам' : 'Топ-3 таблицы' }}
          </div>
          <div
            v-if="hasStandingsGroupPreview && activeStandingsGroup"
            class="mb-2 flex items-center justify-between gap-2 px-1"
          >
            <button
              type="button"
              class="flex h-6 w-6 items-center justify-center rounded-full border border-[#d6e0ee] text-[#4f6b8c] hover:bg-[#f4f7fc]"
              aria-label="Предыдущая группа"
              @click="showPrevStandingsGroup"
            >
              <i class="pi pi-chevron-left text-[0.65rem]" />
            </button>
            <div class="min-w-0 text-center text-xs font-semibold text-[#123c67]">
              {{ activeStandingsGroup.groupName }}
            </div>
            <button
              type="button"
              class="flex h-6 w-6 items-center justify-center rounded-full border border-[#d6e0ee] text-[#4f6b8c] hover:bg-[#f4f7fc]"
              aria-label="Следующая группа"
              @click="showNextStandingsGroup"
            >
              <i class="pi pi-chevron-right text-[0.65rem]" />
            </button>
          </div>
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
              v-for="(row, idx) in hasStandingsGroupPreview && activeStandingsGroup ? activeStandingsGroup.rows : standingsPreview"
              :key="`sb-stand-${row.teamId}`"
              class="sb-standings-row"
              :class="idx < 2 ? 'sb-standings-row--top-two' : ''"
            >
              <span
                class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#eef5ff] text-[0.68rem] font-semibold text-[#1a5a8c]"
                :class="idx < 2 ? 'sb-standings-rank--top-two' : ''"
              >
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
          <div
            v-if="hasStandingsGroupPreview && (standingsGroupPreview?.length ?? 0) > 1"
            class="mt-2 flex items-center justify-center gap-1.5"
          >
            <button
              v-for="(group, idx) in standingsGroupPreview"
              :key="`sb-group-dot-${group.groupId}`"
              type="button"
              class="sb-group-dot"
              :class="standingsGroupSlideIndex === idx ? 'sb-group-dot--active' : ''"
              :aria-label="`Показать ${group.groupName}`"
              @click="standingsGroupSlideIndex = idx"
            />
          </div>
        </div>
      </div>

      <div v-if="socialLinks.length" class="border-t border-[#d6e0ee] p-3">
        <div ref="socialLinksWrapEl" class="public-stagger-appear flex items-center justify-start gap-2">
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

      <div v-if="showTopStatsCard && currentTopStatsSlide" class="border-t border-[#d6e0ee] p-3">
        <div
          :class="[
            'public-card stats-slider-card',
            `stats-slider-card--${currentTopStatsSlide.key}`,
          ]"
        >
          <div class="stats-slider-head">
            <span class="info-card__icon stats-slider-head__icon">
              <i :class="['pi', currentTopStatsSlide.icon, 'text-sm']" />
            </span>
            <div class="min-w-0 stats-slider-head__meta">
              <p class="truncate text-sm font-semibold text-[#123c67]">
                {{ currentTopStatsSlide.title }}
              </p>
              <p class="stats-slider-head__count">
                {{ currentTopStatsSlide.rows.length }} игрока
              </p>
            </div>
          </div>
          <div ref="topStatsRowsEl" class="public-stagger-appear mt-3 space-y-2">
            <div
              v-for="(row, idx) in currentTopStatsSlide.rows"
              :key="`${currentTopStatsSlide.key}-${row.playerId}`"
              class="stats-slide-row"
              :class="[
                row.isPlaceholder ? 'stats-slide-row--placeholder' : '',
                `stats-slide-row--${currentTopStatsSlide.key}`,
              ]"
            >
              <span class="stats-slide-rank">{{ idx + 1 }}</span>
              <div class="min-w-0 stats-slide-meta">
                <p class="stats-slide-name" :title="row.fullName">{{ row.fullName }}</p>
                <p
                  class="stats-slide-team"
                  :class="row.isPlaceholder || !row.teamName || row.teamName === '—' ? 'opacity-0' : ''"
                >
                  {{ row.teamName || '—' }}
                </p>
              </div>
              <span class="stats-slide-value" :class="`stats-slide-value--${currentTopStatsSlide.key}`">
                {{ row.isPlaceholder ? '—' : row.value }}
              </span>
            </div>
          </div>
          <div class="mt-3 flex items-center justify-center gap-1.5">
            <button
              v-for="(slide, idx) in topStatsSlides"
              :key="`dot-${slide.key}`"
              type="button"
              class="stats-dot"
              :class="idx === topStatsSlideIndex ? 'stats-dot--active' : ''"
              :aria-label="`Показать слайд ${idx + 1}`"
              @click="setTopStatsSlide(idx)"
            />
          </div>
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

.sb-standings-row--top-two {
  border-color: #bcd4ef;
  background: linear-gradient(180deg, #eff6ff 0%, #f7fbff 100%);
}

.sb-standings-rank--top-two {
  background: #dbeafe;
  color: #1e3a8a;
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

.sb-group-dot {
  width: 0.34rem;
  height: 0.34rem;
  border-radius: 999px;
  border: 0;
  background: #c7d6ea;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sb-group-dot--active {
  width: 0.9rem;
  background: #c80a48;
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

.stats-slider-card {
  border: 1px solid #d6e0ee;
  min-height: 8.2rem;
  padding: 0.85rem 0.9rem;
  position: relative;
  overflow: hidden;
  background: #fff;
}

.stats-slider-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: #c7d6ea;
}

.stats-slider-card--goals::before {
  background: #c80a48;
}

.stats-slider-card--assists::before {
  background: #1a5a8c;
}

.stats-slider-card--yellowCards::before {
  background: #d97706;
}

.stats-slider-card--redCards::before {
  background: #e11d48;
}

.stats-slider-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding-bottom: 0.45rem;
  border-bottom: 1px solid #edf2fa;
}

.stats-slider-head__meta {
  display: flex;
  min-width: 0;
  width: 100%;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.stats-slider-head__count {
  font-size: 0.7rem;
  font-weight: 600;
  color: #4f6b8c;
  white-space: nowrap;
}

.stats-slider-head__icon {
  width: 1.5rem;
  height: 1.5rem;
}

.stats-slide-row {
  display: flex;
  align-items: center;
  gap: 0.62rem;
  border-radius: 0.6rem;
  padding: 0.46rem 0.46rem;
  background: #fff;
  border: 1px solid #e5edf8;
  min-height: 3.15rem;
}

.stats-slide-row--placeholder {
  opacity: 0.62;
}

.stats-slide-meta {
  min-height: 2rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.stats-slide-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.84rem;
  font-weight: 700;
  color: #123c67;
}

.stats-slide-team {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.71rem;
  color: #4f6b8c;
}

.stats-slide-rank {
  width: 1.42rem;
  height: 1.42rem;
  border-radius: 999px;
  background: #edf3fc;
  color: #325a86;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.74rem;
  font-weight: 700;
  flex: 0 0 auto;
}

.stats-slide-value {
  margin-left: auto;
  border-radius: 999px;
  padding: 0.14rem 0.56rem;
  background: #fff2f7;
  color: #c80a48;
  font-weight: 700;
  font-size: 0.82rem;
  line-height: 1;
  min-width: 1.9rem;
  text-align: center;
}

.stats-slide-value--goals {
  background: #ffe4ed;
  color: #c80a48;
}

.stats-slide-value--assists {
  background: #eaf3ff;
  color: #1a5a8c;
}

.stats-slide-value--yellowCards {
  background: #fff3db;
  color: #9a6700;
}

.stats-slide-value--redCards {
  background: #ffe4e9;
  color: #b10f46;
}

.stats-dot {
  width: 0.34rem;
  height: 0.34rem;
  border-radius: 999px;
  border: 0;
  background: #c7d6ea;
  cursor: pointer;
  transition: all 0.15s ease;
}

.stats-dot--active {
  width: 0.85rem;
  background: #c80a48;
}
</style>


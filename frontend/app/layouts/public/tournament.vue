<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import PublicTournamentContextCard from '~/app/components/public/PublicTournamentContextCard.vue'
import PublicTournamentSidebar from '~/app/components/public/PublicTournamentSidebar.vue'
import { publicTournamentWorkspaceKey } from '~/constants/publicTournamentWorkspace'
import { usePublicBackToTop } from '~/composables/usePublicBackToTop'
import { usePublicLayoutSeo } from '~/composables/usePublicLayoutSeo'
import { usePublicLayoutBranding } from '~/composables/usePublicLayoutBranding'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import { usePublicTournamentSelection } from '~/composables/usePublicTournamentSelection'
import { usePublicTournamentSidebarPreviewStore } from '~/composables/usePublicTournamentSidebarPreviewStore'
import { resolvePublicSidebarActive } from '~/utils/publicTournamentSidebarActive'
import { usePublicBrandingTheme } from '~/composables/usePublicBrandingTheme'

const { tenantMeta } = await usePublicLayoutSeo()
usePublicLayoutBranding(tenantMeta)
const { isDark } = usePublicBrandingTheme(tenantMeta)
const { showBackToTop, backToTopStyle, scrollToTop } = usePublicBackToTop()

const route = useRoute()
const { tenantSlug, selectedTid, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const { loadAllTournaments } = usePublicTournamentFetch()

const tenant = computed(() => tenantSlug.value)

const selection = usePublicTournamentSelection({
  tenant,
  selectedTid,
  loadAllTournaments,
})

const {
  tournaments,
  selectedTournamentId,
  selectedTournament,
  loading,
  initializeSelectionFromContext,
  fetchTournaments,
} = selection

const workspaceReady = ref(false)
const pageContentLoading = ref(false)
const sidebarUnifiedBottom = ref(false)

const { read: readSidebarPreview } = usePublicTournamentSidebarPreviewStore()

const sidebarFlat = computed(() => {
  const t = tenant.value
  const id = selectedTournamentId.value
  if (!t || !id) return []
  return readSidebarPreview(t, id).flat
})

const sidebarGroups = computed(() => {
  const t = tenant.value
  const id = selectedTournamentId.value
  if (!t || !id) return []
  return readSidebarPreview(t, id).groups
})

const sidebarActive = computed(() => resolvePublicSidebarActive(route.path, tenant.value))

const tournamentStatusLabel = computed(() => {
  switch (selectedTournament.value?.status) {
    case 'ACTIVE':
      return 'Идет'
    case 'COMPLETED':
      return 'Завершен'
    case 'ARCHIVED':
      return 'Архив'
    case 'DRAFT':
      return 'Черновик'
    default:
      return 'Не указан'
  }
})

const tournamentStatusBadgeClass = computed(() => {
  const dark = isDark.value
  switch (selectedTournament.value?.status) {
    case 'ACTIVE':
      return dark
        ? 'bg-slate-800/95 text-slate-100 ring-1 ring-[#c80a48]/50'
        : 'bg-[#eef5ff] text-[#1a5a8c] ring-1 ring-[#d2e2f7]'
    case 'COMPLETED':
      return dark
        ? 'bg-rose-950/45 text-rose-100 ring-1 ring-rose-800/60'
        : 'bg-[#fff2f7] text-[#b10f46] ring-1 ring-[#f4c8d8]'
    case 'ARCHIVED':
      return dark
        ? 'bg-slate-800/80 text-slate-300 ring-1 ring-slate-600'
        : 'bg-slate-100 text-slate-700 ring-1 ring-slate-300'
    case 'DRAFT':
      return dark
        ? 'bg-amber-950/50 text-amber-100 ring-1 ring-amber-800/70'
        : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
    default:
      return dark
        ? 'bg-slate-800/80 text-slate-300 ring-1 ring-slate-600'
        : 'bg-surface-100 text-surface-700 ring-1 ring-surface-200'
  }
})

const dateLabel = computed(() => {
  const t = selectedTournament.value
  if (!t) return 'Даты не указаны'
  const s = t.startsAt ? new Date(t.startsAt).toLocaleDateString('ru-RU') : null
  const e = t.endsAt ? new Date(t.endsAt).toLocaleDateString('ru-RU') : null
  if (s && e) return `${s} - ${e}`
  if (s) return `С ${s}`
  if (e) return `До ${e}`
  return 'Даты не указаны'
})

const layoutGridClass = computed(() => (selectedTournamentId.value ? 'public-grid' : 'public-container'))

const showSidebarColumn = computed(() => !!selectedTournamentId.value)

// Важно: при переключении внутренних роутов/вкладок турнира
// лейаут не должен "мигать" скелетоном в правом сайдбаре.
// Склеетон сайдбара нужен только на загрузке списка турниров/выбора (loading).
const sidebarLoading = computed(() => loading.value)

const showNewsInSidebar = computed(() => {
  const v = tenantMeta.value?.publicSettings?.publicShowNewsInSidebar
  return v !== false
})

const showTopStatsInSidebar = computed(() => {
  const v = tenantMeta.value?.publicSettings?.publicShowTopStats
  return v !== false
})

provide(publicTournamentWorkspaceKey, {
  ...selection,
  tenant,
  tenantMeta,
  tenantNotFound,
  ensureTenantResolved,
  pageContentLoading,
  workspaceReady,
  sidebarUnifiedBottom,
})

async function bootstrapWorkspace() {
  await ensureTenantResolved()
  if (tenantNotFound.value) {
    workspaceReady.value = true
    return
  }
  initializeSelectionFromContext()
  await fetchTournaments({ onError: () => {} })
  workspaceReady.value = true
}

onMounted(() => {
  void bootstrapWorkspace()
})

watch(
  () => tenantSlug.value,
  () => {
    workspaceReady.value = false
    void bootstrapWorkspace()
  },
)
</script>

<template>
  <div class="min-h-screen bg-transparent">
    <div class="public-shell">
      <PublicHeader :tenant="tenant" :tenant-meta="tenantMeta" />

      <div :class="[layoutGridClass, 'flex-1 min-h-0']">
        <div class="min-w-0 space-y-4 flex flex-col min-h-0">
          <div class="public-stage flex flex-col flex-1 min-h-0 gap-6">
            <PublicTournamentContextCard
              v-model="selectedTournamentId"
              :options="tournaments"
              :loading="loading"
              :title="selectedTournament?.name || `Турнир тенанта ${tenant}`"
              :subtitle="dateLabel"
              :status-label="tournamentStatusLabel"
              :status-class="tournamentStatusBadgeClass"
            />
            <div class="flex-1 min-h-0">
              <slot />
            </div>
          </div>
        </div>

        <div v-if="showSidebarColumn" class="self-start space-y-0 lg:sticky lg:top-4">
          <PublicTournamentSidebar
            :tenant="tenant"
            :tid="selectedTournamentId"
            :tournament-name="selectedTournament?.name"
            :social-links="tenantMeta?.socialLinks ?? null"
            :standings-preview="sidebarFlat"
            :standings-group-preview="sidebarGroups"
            :loading="sidebarLoading"
            :show-news-link="showNewsInSidebar"
            :show-top-stats-in-sidebar="showTopStatsInSidebar"
            :active="sidebarActive"
            :unified-bottom="sidebarUnifiedBottom"
            :sticky="false"
          />
          <!-- Top-stats больше не телепортируется: рендерится внутри `PublicTournamentSidebar.vue`. -->
        </div>
      </div>

      <PublicFooter :tenant-meta="tenantMeta" />
    </div>

    <button
      v-if="showBackToTop"
      type="button"
      class="fixed bottom-20 z-[75] inline-flex items-center gap-1.5 rounded-full border border-[#d2e2f7] bg-white/95 px-3 py-2 text-xs font-semibold text-[#1a5a8c] shadow-lg backdrop-blur transition hover:border-[#c80a48]/40 hover:text-[#c80a48] dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-200 dark:hover:border-[#c80a48]/50 dark:hover:text-[#f472b6]"
      :style="backToTopStyle"
      aria-label="Прокрутить наверх"
      @click="scrollToTop"
    >
      <i class="pi pi-arrow-up text-[0.72rem]" />
      <span>Наверх</span>
    </button>
  </div>
</template>

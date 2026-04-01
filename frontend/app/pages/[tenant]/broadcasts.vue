<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { PublicTenantMeta } from '~/composables/usePublicTournamentFetch'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { usePublicTournamentSelection } from '~/composables/usePublicTournamentSelection'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import PublicTournamentSidebar from '~/app/components/public/PublicTournamentSidebar.vue'
import PublicTournamentContextCard from '~/app/components/public/PublicTournamentContextCard.vue'

definePageMeta({
  layout: 'public',
  path: '/:tenant/tournaments/broadcasts',
  alias: ['/:tenant/broadcasts'],
})

const { loadAllTournaments, fetchTenantMeta } = usePublicTournamentFetch()
const { tenantSlug, selectedTid, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug

const {
  tournaments,
  selectedTournamentId,
  selectedTournament,
  loading,
  syncTidToQuery,
  initializeSelectionFromContext,
  fetchTournaments,
} = usePublicTournamentSelection({
  tenant,
  selectedTid,
  loadAllTournaments,
})

const tenantMeta = ref<PublicTenantMeta | null>(null)
const errorText = ref('')
const pageReady = ref(false)
const isInitializing = ref(true)

const showPageSkeleton = computed(() => !pageReady.value || loading.value)

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
  switch (selectedTournament.value?.status) {
    case 'ACTIVE':
      return 'bg-[#eef5ff] text-[#1a5a8c] ring-1 ring-[#d2e2f7]'
    case 'COMPLETED':
      return 'bg-[#fff2f7] text-[#b10f46] ring-1 ring-[#f4c8d8]'
    case 'ARCHIVED':
      return 'bg-slate-100 text-slate-700 ring-1 ring-slate-300'
    case 'DRAFT':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
    default:
      return 'bg-surface-100 text-surface-700 ring-1 ring-surface-200'
  }
})

watch(selectedTournamentId, () => {
  if (isInitializing.value) return
  syncTidToQuery(selectedTournamentId.value || null)
})

onMounted(async () => {
  try {
    await ensureTenantResolved()
    if (tenantNotFound.value) {
      errorText.value = 'Тенант не найден. Проверьте ссылку.'
      return
    }
    initializeSelectionFromContext()
    tenantMeta.value = await fetchTenantMeta(tenant.value)
    await fetchTournaments({
      onError: (e: any) => {
        const status = e?.response?.status ?? e?.statusCode
        errorText.value =
          status === 404 ? 'Тенант не найден. Проверьте ссылку.' : 'Не удалось загрузить турниры.'
      },
    })
  } finally {
    isInitializing.value = false
    pageReady.value = true
  }
})
</script>

<template>
  <div class="public-shell">
    <PublicHeader :tenant="tenant" />
    <div class="public-grid">
      <div class="space-y-4">
        <div class="public-stage">
        <Transition name="public-fade" mode="out-in">
        <div v-if="showPageSkeleton" key="skeleton" class="space-y-4">
          <div class="public-card">
            <Skeleton width="46%" height="2rem" />
            <Skeleton class="mt-3" width="100%" height="2.75rem" />
          </div>
          <div class="public-card">
            <Skeleton width="40%" height="1rem" />
            <Skeleton class="mt-3" width="100%" height="5rem" />
          </div>
        </div>

        <div v-else key="content" class="space-y-4">
          <PublicTournamentContextCard
            v-model="selectedTournamentId"
            :options="tournaments"
            :loading="loading"
            :title="selectedTournament?.name || 'Трансляции турнира'"
            subtitle="Прямые эфиры и записи матчей выбранного турнира."
            :status-label="tournamentStatusLabel"
            :status-class="tournamentStatusBadgeClass"
          />

          <div v-if="errorText" class="public-error">{{ errorText }}</div>

          <div v-else class="public-card">
            <div class="flex items-center gap-2 text-[#123c67]">
              <i class="pi pi-info-circle" />
              <h2 class="text-lg font-semibold">Раздел в разработке</h2>
            </div>
            <p class="mt-3 text-sm text-[#4f6b8c]">
              Скоро здесь появятся ссылки на трансляции матчей и встроенный плеер.
            </p>
            <p class="mt-2 text-sm text-[#4f6b8c]">
              В админке добавим управление трансляциями по турнирам.
            </p>
          </div>
        </div>
        </Transition>
        </div>
      </div>

      <PublicTournamentSidebar
        :tenant="tenant"
        :tid="selectedTournamentId"
        :tournament-name="selectedTournament?.name"
        :social-links="tenantMeta?.socialLinks ?? null"
        :loading="showPageSkeleton"
        active="none"
      />
    </div>
    <PublicFooter />
  </div>
</template>

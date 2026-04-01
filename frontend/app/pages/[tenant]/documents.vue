<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  usePublicTournamentFetch,
  type PublicReferenceDocumentItem,
  type PublicTenantMeta,
} from '~/composables/usePublicTournamentFetch'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { usePublicTournamentSelection } from '~/composables/usePublicTournamentSelection'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import PublicTournamentSidebar from '~/app/components/public/PublicTournamentSidebar.vue'
import PublicTournamentContextCard from '~/app/components/public/PublicTournamentContextCard.vue'

definePageMeta({
  layout: 'public',
  path: '/:tenant/tournaments/documents',
  alias: ['/:tenant/documents'],
})

const { loadAllTournaments, fetchTournamentDocuments, fetchTenantMeta } = usePublicTournamentFetch()

const { tenantSlug, selectedTid, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug

const loadingDocs = ref(false)
const pageReady = ref(false)
const isInitializing = ref(true)
const errorText = ref('')

const documents = ref<PublicReferenceDocumentItem[]>([])
const tenantMeta = ref<PublicTenantMeta | null>(null)
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

async function fetchDocuments() {
  if (!selectedTournamentId.value) {
    documents.value = []
    return
  }
  loadingDocs.value = true
  errorText.value = ''
  try {
    documents.value = await fetchTournamentDocuments(tenant.value, selectedTournamentId.value)
  } catch {
    documents.value = []
    errorText.value = 'Не удалось загрузить документы турнира.'
  } finally {
    loadingDocs.value = false
  }
}

watch(selectedTournamentId, () => {
  if (isInitializing.value) return
  void fetchDocuments()
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
        documents.value = []
        const status = e?.response?.status ?? e?.statusCode
        errorText.value =
          status === 404 ? 'Тенант не найден. Проверьте ссылку.' : 'Не удалось загрузить турниры.'
      },
    })
    await fetchDocuments()
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
        <PublicTournamentContextCard
          v-model="selectedTournamentId"
          :options="tournaments"
          :loading="loading"
          :title="selectedTournament?.name || 'Документы турнира'"
          subtitle="Общие документы тенанта и документы выбранного турнира."
          :status-label="tournamentStatusLabel"
          :status-class="tournamentStatusBadgeClass"
        />

        <div
          v-if="errorText"
          class="public-error"
        >
          {{ errorText }}
        </div>

        <div class="public-stage">
          <Transition name="public-fade" mode="out-in">
            <div
              v-if="loadingDocs && pageReady"
              key="loading"
              class="public-card"
            >
              <div class="space-y-3">
                <Skeleton v-for="i in 4" :key="`dsk-${i}`" width="100%" height="3rem" />
              </div>
            </div>

            <div
              v-else-if="pageReady && selectedTournamentId && !documents.length"
              key="empty"
              class="public-empty"
            >
              Для выбранного турнира пока нет документов.
            </div>

            <div
              v-else-if="documents.length"
              key="content"
              class="public-card"
            >
              <ul class="space-y-2">
                <li
                  v-for="doc in documents"
                  :key="doc.id"
                  class="rounded-xl border border-surface-200 bg-surface-50 px-3 py-3"
                >
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-surface-900 break-words">{{ doc.title }}</p>
                      <p v-if="doc.note" class="mt-1 text-xs text-muted-color break-words">
                        {{ doc.note }}
                      </p>
                    </div>
                    <a
                      v-if="doc.url"
                      :href="doc.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="public-link shrink-0 text-sm"
                    >
                      Открыть
                    </a>
                  </div>
                </li>
              </ul>
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
        active="documents"
      />
    </div>
    <PublicFooter />
  </div>
</template>

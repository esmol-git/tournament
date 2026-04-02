<script setup lang="ts">
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import { computed, nextTick, ref, watch } from 'vue'
import {
  usePublicTournamentFetch,
  type PublicReferenceDocumentItem,
} from '~/composables/usePublicTournamentFetch'
import { PUBLIC_AUTO_ANIMATE } from '~/constants/publicMotion'
import { usePublicTournamentWorkspace } from '~/composables/usePublicTournamentWorkspace'

definePageMeta({
  layout: 'public-tournament',
  path: '/:tenant/tournaments/documents',
  alias: ['/:tenant/documents'],
})

const { fetchTournamentDocuments } = usePublicTournamentFetch()
const { tenant, selectedTournamentId, loading, workspaceReady, pageContentLoading } =
  usePublicTournamentWorkspace()

const loadingDocs = ref(false)
const isInitializing = ref(true)
const errorText = ref('')

const documents = ref<PublicReferenceDocumentItem[]>([])

const [documentsListRef] = useAutoAnimate({ ...PUBLIC_AUTO_ANIMATE })

const showWorkspaceBootSkeleton = computed(() => !workspaceReady.value || loading.value)

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
})

watch(
  () => showWorkspaceBootSkeleton.value || loadingDocs.value,
  (v) => {
    pageContentLoading.value = v
  },
  { immediate: true },
)

watch(
  workspaceReady,
  async (ready) => {
    if (!ready) return
    try {
      await fetchDocuments()
    } finally {
      isInitializing.value = false
      await nextTick()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="contents">
    <Transition name="public-view-fade" mode="out-in">
      <div v-if="showWorkspaceBootSkeleton" key="skeleton" class="space-y-4 min-h-[65vh]">
        <div class="public-card">
          <Skeleton width="46%" height="2rem" />
          <Skeleton class="mt-3" width="100%" height="2.75rem" />
        </div>
        <div class="public-card">
          <Skeleton width="38%" height="1rem" />
          <Skeleton class="mt-3" width="100%" height="11rem" />
        </div>
      </div>

      <div v-else key="content" class="space-y-4 min-h-[65vh]">
        <div v-if="errorText" class="public-error">
          {{ errorText }}
        </div>

        <div v-else class="public-stage">
          <Transition name="public-fade" mode="out-in">
            <div v-if="loadingDocs" key="loading" class="public-card min-h-[65vh]">
              <div class="space-y-3">
                <Skeleton v-for="i in 4" :key="`dsk-${i}`" width="100%" height="3rem" />
              </div>
            </div>

            <div v-else-if="!selectedTournamentId" key="empty-no-selection" class="public-empty min-h-[65vh]">
              Выберите турнир в карточке выше — здесь появятся документы.
            </div>

            <div v-else-if="selectedTournamentId && !documents.length" key="empty" class="public-empty min-h-[65vh]">
              Для выбранного турнира пока нет документов.
            </div>

            <div v-else key="content" class="public-card min-h-[65vh]">
              <ul ref="documentsListRef" class="public-stagger-appear space-y-2">
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
    </Transition>
  </div>
</template>

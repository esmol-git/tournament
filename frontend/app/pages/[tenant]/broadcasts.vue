<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { usePublicTournamentWorkspace } from '~/composables/usePublicTournamentWorkspace'

definePageMeta({
  layout: 'public-tournament',
  path: '/:tenant/tournaments/broadcasts',
  alias: ['/:tenant/broadcasts'],
})

const { selectedTournamentId, loading, workspaceReady, pageContentLoading } =
  usePublicTournamentWorkspace()
const errorText = ref('')

const showWorkspaceBootSkeleton = computed(() => !workspaceReady.value || loading.value)

watch(
  showWorkspaceBootSkeleton,
  (v) => {
    pageContentLoading.value = v
  },
  { immediate: true },
)

watch(
  workspaceReady,
  async (ready) => {
    if (!ready) return
    await nextTick()
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
          <Skeleton width="40%" height="1rem" />
          <Skeleton class="mt-3" width="100%" height="5rem" />
        </div>
      </div>

      <div v-else key="content" class="space-y-4 min-h-[65vh]">
        <div v-if="errorText" class="public-error">{{ errorText }}</div>

        <div v-else-if="!selectedTournamentId" class="public-empty">
          Выберите турнир в карточке выше — здесь появятся трансляции.
        </div>

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
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AdminTournamentGalleryPanel from '~/app/components/admin/AdminTournamentGalleryPanel.vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import type { TournamentDetails } from '~/types/admin/tournaments-index'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'
import { useAdminAsyncState } from '~/composables/admin/useAdminAsyncState'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const route = useRoute()
const router = useRouter()
const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const { t } = useI18n()

const tournamentId = computed(() => String(route.params.tournamentId ?? ''))

const tournamentName = ref('')
const {
  loading: metaLoading,
  error: metaError,
  run: runMetaLoad,
  retry: retryMetaLoad,
} = useAdminAsyncState({ initialLoading: true })

async function loadTournamentMeta() {
  const id = tournamentId.value
  if (!id || !token.value) {
    metaLoading.value = false
    return
  }
  await runMetaLoad(async () => {
    try {
      const row = await authFetch<TournamentDetails>(apiUrl(`/tournaments/${id}`), {
        headers: { Authorization: `Bearer ${token.value}` },
      })
      tournamentName.value = row.name?.trim() || id
    } catch (e: unknown) {
      tournamentName.value = ''
      throw e
    }
  })
}

function goBack() {
  void router.push('/admin/gallery')
}

onMounted(() => {
  if (process.client) {
    syncWithStorage()
    if (!loggedIn.value) {
      metaLoading.value = false
      void router.push('/admin/login')
      return
    }
  }
  void loadTournamentMeta()
})

watch(tournamentId, () => {
  void loadTournamentMeta()
})
</script>

<template>
  <section class="admin-page space-y-4 sm:space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0 space-y-1">
        <Button
          type="button"
          :label="t('admin.gallery.back_to_hub')"
          icon="pi pi-arrow-left"
          severity="secondary"
          text
          size="small"
          class="!-ms-1 !px-2"
          @click="goBack"
        />

        <AdminDataState
          :loading="metaLoading"
          :error="metaError"
          :empty="false"
          :error-title="t('admin.gallery.meta_load_error_title')"
          :content-card="false"
          @retry="retryMetaLoad"
        >
          <template #loading>
            <div class="gallery-meta-skel space-y-3" aria-busy="true">
              <Skeleton
                height="1.5rem"
                width="min(100%, 18rem)"
                border-radius="0.5rem"
                animation="wave"
                class="gallery-meta-skel-line"
              />
              <Skeleton
                height="0.875rem"
                width="min(100%, 26rem)"
                border-radius="0.375rem"
                animation="wave"
                class="gallery-meta-skel-line gallery-meta-skel-line--2"
              />
            </div>
          </template>
          <h1 class="text-lg font-semibold tracking-tight sm:text-xl">
            {{ tournamentName || tournamentId }}
          </h1>
          <p class="mt-1 max-w-3xl text-xs text-muted-color sm:text-sm">
            {{ t('admin.gallery.detail_intro') }}
          </p>
        </AdminDataState>
      </div>
    </div>

    <AdminTournamentGalleryPanel
      v-if="loggedIn && !metaLoading && !metaError && tournamentId"
      :tournament-id="tournamentId"
    />
  </section>
</template>

<style scoped>
.gallery-meta-skel {
  animation: gallery-meta-enter 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes gallery-meta-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.gallery-meta-skel-line--2 :deep(.p-skeleton::after) {
  animation-delay: 0.1s;
}
</style>

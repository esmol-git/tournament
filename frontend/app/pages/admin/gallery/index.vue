<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { TournamentListResponse, TournamentRow } from '~/types/admin/tournaments-index'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'
import AdminGalleryHubGridSkeleton from '~/app/components/admin/skeletons/AdminGalleryHubGridSkeleton.vue'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const route = useRoute()
const router = useRouter()
const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()
const { t } = useI18n()

if (import.meta.client) {
  const raw = route.query.tournament
  const legacyId = Array.isArray(raw) ? raw[0] : raw
  if (typeof legacyId === 'string' && legacyId.length > 0) {
    await navigateTo({ path: `/admin/gallery/${legacyId}` }, { replace: true })
  }
}

const {
  items: tournaments,
  loading: tournamentsLoading,
  error: tournamentsLoadError,
  isEmpty: tournamentsListEmpty,
  run: runTournamentsLoad,
  retry: retryTournamentsLoad,
} = useAdminAsyncListState<TournamentRow>({
  initialLoading: true,
  clearItemsOnError: true,
})

async function loadTournaments() {
  if (!token.value) {
    tournamentsLoading.value = false
    return
  }
  await runTournamentsLoad(async () => {
    const acc: TournamentRow[] = []
    let page = 1
    const pageSize = 100
    for (;;) {
      const res = await authFetch<TournamentListResponse>(
        apiUrl(`/tenants/${tenantId.value}/tournaments`),
        {
          headers: { Authorization: `Bearer ${token.value}` },
          params: { page, pageSize },
        },
      )
      const batch = res.items ?? []
      acc.push(...batch)
      const total = res.total ?? acc.length
      if (batch.length < pageSize || acc.length >= total) break
      page += 1
    }
    tournaments.value = acc
  })
}

onMounted(() => {
  if (process.client) {
    syncWithStorage()
    if (!loggedIn.value) {
      void router.push('/admin/login')
      return
    }
  }
  void loadTournaments()
})
</script>

<template>
  <section class="admin-page space-y-4 sm:space-y-6">
    <header class="min-w-0 space-y-1 sm:space-y-2">
      <h1 class="text-lg font-semibold sm:text-xl">{{ t('admin.nav.gallery') }}</h1>
      <p class="text-xs text-muted-color max-w-3xl sm:text-sm">{{ t('admin.gallery.hub_intro') }}</p>
    </header>

    <AdminDataState
      :loading="tournamentsLoading"
      :error="tournamentsLoadError"
      :empty="tournamentsListEmpty"
      empty-icon="pi pi-images"
      :empty-title="t('admin.gallery.hub_no_tournaments')"
      :empty-description="t('admin.gallery.hub_empty_lead')"
      :content-card="false"
      @retry="retryTournamentsLoad"
    >
      <template #loading>
        <AdminGalleryHubGridSkeleton :count="8" />
      </template>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <NuxtLink
          v-for="row in tournaments"
          :key="row.id"
          :to="`/admin/gallery/${row.id}`"
          :prefetch="false"
          class="group block overflow-hidden rounded-2xl border border-surface-200 bg-surface-0 text-inherit shadow-sm no-underline outline-none transition hover:border-primary/35 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary dark:border-surface-700 dark:bg-surface-900 dark:hover:border-primary/40"
        >
          <div
            class="relative aspect-[4/3] bg-gradient-to-br from-surface-100 to-surface-200 dark:from-surface-800 dark:to-surface-900"
          >
            <template v-if="(row.galleryPreviewUrls?.length ?? 0) > 0">
              <div class="absolute inset-0 flex items-center justify-center p-3 sm:p-4">
                <div class="relative h-[72%] w-[78%] max-h-[11rem] max-w-[14rem]">
                  <div
                    v-for="(url, idx) in (row.galleryPreviewUrls ?? []).slice(0, 3)"
                    :key="idx"
                    class="absolute left-1/2 top-1/2 h-full w-full overflow-hidden rounded-lg border-2 border-surface-0 shadow-lg dark:border-surface-800"
                    :style="{
                      transform: `translate(-50%, -50%) rotate(${(idx - ((row.galleryPreviewUrls ?? []).length - 1) / 2) * 5}deg) translateY(${idx * -3}px)`,
                      zIndex: 10 - idx,
                    }"
                  >
                    <RemoteImage
                      :src="url"
                      alt=""
                      :draggable="false"
                      class="h-full w-full rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </template>
            <template v-else-if="row.logoUrl">
              <div class="flex h-full items-center justify-center p-6">
                <RemoteImage
                  :src="row.logoUrl"
                  alt=""
                  fit="contain"
                  :draggable="false"
                  class="max-h-full max-w-[55%] opacity-90 drop-shadow-sm"
                />
              </div>
            </template>
            <div
              v-else
              class="flex h-full flex-col items-center justify-center gap-2 text-muted-color"
            >
              <i class="pi pi-images text-4xl opacity-35" aria-hidden="true" />
            </div>

            <div
              class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 pb-3 pt-10"
            >
              <p class="line-clamp-2 text-sm font-semibold leading-snug text-white drop-shadow-sm">
                {{ row.name }}
              </p>
            </div>
          </div>

          <div class="flex items-center justify-between gap-2 border-t border-surface-100 px-3 py-2 dark:border-surface-800">
            <span class="truncate text-xs text-muted-color">/{{ row.slug }}</span>
            <i
              class="pi pi-angle-right text-primary opacity-0 transition group-hover:opacity-100"
              aria-hidden="true"
            />
          </div>
        </NuxtLink>
      </div>
    </AdminDataState>
  </section>
</template>

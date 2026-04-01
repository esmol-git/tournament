<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import PublicTournamentSidebar from '~/app/components/public/PublicTournamentSidebar.vue'
import PublicTournamentContextCard from '~/app/components/public/PublicTournamentContextCard.vue'
import {
  usePublicTournamentFetch,
  type PublicGalleryImageItem,
  type PublicTenantMeta,
  type PublicTournamentNewsItem,
} from '~/composables/usePublicTournamentFetch'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { usePublicTournamentSelection } from '~/composables/usePublicTournamentSelection'
import { renderMarkdownToHtml } from '~/utils/renderMarkdown'

definePageMeta({
  layout: 'public',
  path: '/:tenant/tournaments/media',
  alias: [
    '/:tenant/media',
    '/:tenant/tournaments/news',
    '/:tenant/tournaments/photo',
    '/:tenant/tournaments/video',
  ],
})
const route = useRoute()
const router = useRouter()

const { tenantSlug, selectedTid, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const { loadAllTournaments, fetchTournamentNews, fetchTournamentGallery, fetchTenantMeta } =
  usePublicTournamentFetch()

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

const pageReady = ref(false)
const isInitializing = ref(true)
const loadingMedia = ref(false)
const errorText = ref('')
const tenantMeta = ref<PublicTenantMeta | null>(null)

const newsItems = ref<PublicTournamentNewsItem[]>([])
const galleryImages = ref<PublicGalleryImageItem[]>([])

const showPageSkeleton = computed(
  () => !pageReady.value || loading.value || (loadingMedia.value && !newsItems.value.length && !galleryImages.value.length),
)

const tidFromQuery = computed(() => {
  const raw = route.query.tid
  const value = Array.isArray(raw) ? String(raw[0] ?? '').trim() : String(raw ?? '').trim()
  return value || null
})

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

const mediaNewsCards = computed(() =>
  newsItems.value
    .slice()
    .sort((a, b) => new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime())
    .map((n) => ({
      ...n,
      contentHtml: renderMarkdownToHtml(n.content ?? n.excerpt ?? ''),
      tags: (n.newsTags ?? []).map((x) => x.tag.name),
      publishedLabel: new Date(n.publishedAt ?? n.createdAt).toLocaleDateString('ru-RU'),
    })),
)

const mediaTab = computed<'news' | 'photo' | 'video'>(() => {
  const path = route.path.toLowerCase()
  if (path.endsWith('/tournaments/news')) return 'news'
  if (path.endsWith('/tournaments/photo')) return 'photo'
  if (path.endsWith('/tournaments/video')) return 'video'

  const q = route.query.tab
  const raw = Array.isArray(q) ? String(q[0] ?? '').trim().toLowerCase() : String(q ?? '').trim().toLowerCase()
  if (raw === 'photo' || raw === 'gallery') return 'photo'
  if (raw === 'video') return 'video'
  return 'news'
})

const videoCards = computed(() =>
  mediaNewsCards.value.filter((item) => {
    if (String(item.section).toUpperCase() === 'MEDIA') return true
    const text = `${item.contentHtml ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase()
    return /youtube|youtu\.be|rutube|vimeo|video/.test(text)
  }),
)

async function fetchMediaForTournament() {
  if (!selectedTournamentId.value) {
    newsItems.value = []
    galleryImages.value = []
    return
  }
  loadingMedia.value = true
  errorText.value = ''
  try {
    const [news, gallery] = await Promise.all([
      fetchTournamentNews(tenant.value, selectedTournamentId.value),
      fetchTournamentGallery(tenant.value, selectedTournamentId.value),
    ])
    newsItems.value = news
    galleryImages.value = gallery
  } catch {
    newsItems.value = []
    galleryImages.value = []
    errorText.value = 'Не удалось загрузить медиа турнира.'
  } finally {
    loadingMedia.value = false
  }
}

watch(selectedTournamentId, () => {
  if (isInitializing.value) return
  syncTidToQuery(selectedTournamentId.value || null)
  void fetchMediaForTournament()
})

onMounted(async () => {
  try {
    await ensureTenantResolved()
    if (tenantNotFound.value) {
      errorText.value = 'Тенант не найден. Проверьте ссылку.'
      return
    }

    const path = route.path
    const tournamentMediaBase = `/${tenant.value}/tournaments`
    const isTournamentMediaPath =
      path === `${tournamentMediaBase}/media` ||
      path === `${tournamentMediaBase}/news` ||
      path === `${tournamentMediaBase}/photo` ||
      path === `${tournamentMediaBase}/video`

    // Legacy org-wide media route without tournament context stays org-wide.
    if (!tidFromQuery.value && !isTournamentMediaPath) {
      const targetPath = mediaTab.value === 'video' ? `/${tenant.value}/media-video` : `/${tenant.value}/media-photo`
      await router.replace({ path: targetPath })
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

    if (isTournamentMediaPath) {
      const tabToPath: Record<'news' | 'photo' | 'video', string> = {
        news: `/${tenant.value}/tournaments/news`,
        photo: `/${tenant.value}/tournaments/photo`,
        video: `/${tenant.value}/tournaments/video`,
      }
      const effectiveTid =
        tidFromQuery.value ||
        selectedTournamentId.value ||
        tournaments.value[0]?.id ||
        null
      const expectedPath = tabToPath[mediaTab.value]
      const routeTid = Array.isArray(route.query.tid)
        ? String(route.query.tid[0] ?? '').trim()
        : String(route.query.tid ?? '').trim()

      if (effectiveTid && (route.path !== expectedPath || routeTid !== effectiveTid)) {
        await router.replace({ path: expectedPath, query: { tid: effectiveTid } })
      }
    }

    await fetchMediaForTournament()
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
        <div class="media-stage">
          <Transition name="media-fade" mode="out-in">
            <div v-if="showPageSkeleton" key="skeleton" class="space-y-4">
              <div class="public-card">
                <Skeleton width="46%" height="2rem" />
                <Skeleton class="mt-3" width="100%" height="2.75rem" />
              </div>
              <div class="public-card">
                <Skeleton width="38%" height="1rem" />
                <Skeleton class="mt-3" width="100%" height="11rem" />
              </div>
            </div>

            <div v-else key="content" class="space-y-4">
              <PublicTournamentContextCard
                v-model="selectedTournamentId"
                :options="tournaments"
                :loading="loading"
                :title="selectedTournament?.name || 'Медиа турнира'"
                subtitle="Новости, фото и видео выбранного турнира."
                :status-label="tournamentStatusLabel"
                :status-class="tournamentStatusBadgeClass"
              />

              <div v-if="errorText" class="public-error">{{ errorText }}</div>

              <div v-else-if="!selectedTournamentId" class="public-empty">
                Выберите турнир, чтобы посмотреть медиа.
              </div>

              <div v-else class="space-y-6">
                <Transition name="media-fade" mode="out-in">
                  <section v-if="mediaTab === 'photo'" key="photo" class="public-card overflow-hidden">
                    <h2 class="text-lg font-semibold text-[#123c67]">Фотогалерея</h2>
                    <div v-if="galleryImages.length" class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <figure
                        v-for="img in galleryImages"
                        :key="img.id"
                        class="group overflow-hidden rounded-xl border border-[#d6e0ee] bg-[#f7f9fc]"
                      >
                        <div class="aspect-[4/3] w-full overflow-hidden">
                          <img
                            :src="img.imageUrl"
                            :alt="img.caption ?? ''"
                            class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            loading="lazy"
                          />
                        </div>
                        <figcaption class="space-y-1 border-t border-[#d6e0ee] px-3 py-2">
                          <p class="truncate text-[11px] uppercase tracking-wide text-[#4f6b8c]">
                            {{ selectedTournament?.name || 'Турнир' }}
                          </p>
                          <p v-if="img.caption" class="text-sm text-[#123c67]">
                            {{ img.caption }}
                          </p>
                        </figcaption>
                      </figure>
                    </div>
                    <div v-else class="mt-3 text-sm text-[#4f6b8c]">В этом турнире пока нет фотографий.</div>
                  </section>

                  <section v-else-if="mediaTab === 'news'" key="news" class="space-y-3">
                    <h2 class="text-lg font-semibold text-[#123c67]">Новости</h2>
                    <div v-if="mediaNewsCards.length" class="grid gap-4 md:grid-cols-2">
                      <article v-for="item in mediaNewsCards" :key="item.id" class="public-card h-full">
                        <div class="aspect-[16/9] overflow-hidden rounded-lg bg-surface-100 dark:bg-surface-800">
                          <img
                            v-if="item.coverImageUrl"
                            :src="String(item.coverImageUrl)"
                            alt=""
                            class="h-full w-full object-cover"
                          />
                        </div>
                        <h3 class="mt-3 text-lg font-semibold text-surface-900">{{ item.title }}</h3>
                        <p class="mt-0.5 text-xs text-[#1a5a8c]">{{ item.publishedLabel }}</p>
                        <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span class="rounded-full bg-surface-100 px-2 py-0.5 text-surface-700">{{ item.section }}</span>
                          <span
                            v-for="tag in item.tags"
                            :key="tag"
                            class="rounded-full border border-surface-200 px-2 py-0.5 text-muted-color"
                          >
                            #{{ tag }}
                          </span>
                        </div>
                        <div class="media-news-markdown mt-2 text-sm text-surface-700" v-html="item.contentHtml" />
                      </article>
                    </div>
                    <div v-else class="public-empty">В этом турнире пока нет новостей.</div>
                  </section>

                  <section v-else key="video" class="space-y-3">
                    <h2 class="text-lg font-semibold text-[#123c67]">Видео</h2>
                    <div v-if="videoCards.length" class="grid gap-4 md:grid-cols-2">
                      <article v-for="item in videoCards" :key="item.id" class="public-card h-full">
                        <h3 class="text-lg font-semibold text-surface-900">{{ item.title }}</h3>
                        <p class="mt-0.5 text-xs text-[#1a5a8c]">{{ item.publishedLabel }}</p>
                        <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span class="rounded-full bg-surface-100 px-2 py-0.5 text-surface-700">{{ item.section }}</span>
                          <span
                            v-for="tag in item.tags"
                            :key="tag"
                            class="rounded-full border border-surface-200 px-2 py-0.5 text-muted-color"
                          >
                            #{{ tag }}
                          </span>
                        </div>
                        <div class="media-news-markdown mt-2 text-sm text-surface-700" v-html="item.contentHtml" />
                      </article>
                    </div>
                    <div v-else class="public-empty">В этом турнире пока нет видео-материалов.</div>
                  </section>
                </Transition>
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

<style scoped>
.media-stage {
  min-height: 24rem;
}

.media-fade-enter-active,
.media-fade-leave-active {
  transition: opacity 0.2s ease;
}

.media-fade-enter-from,
.media-fade-leave-to {
  opacity: 0;
}

.media-news-markdown :deep(h1),
.media-news-markdown :deep(h2),
.media-news-markdown :deep(h3) {
  font-weight: 600;
  margin: 0.4rem 0 0.3rem;
}
.media-news-markdown :deep(p) {
  margin: 0 0 0.45rem;
}
.media-news-markdown :deep(ul),
.media-news-markdown :deep(ol) {
  margin: 0 0 0.45rem;
  padding-left: 1.1rem;
}
.media-news-markdown :deep(a) {
  color: var(--p-primary-color);
  text-decoration: underline;
}
.media-news-markdown :deep(code) {
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
  background: var(--p-surface-100);
  padding: 0.05rem 0.25rem;
  border-radius: 0.2rem;
}
.media-news-markdown :deep(pre) {
  overflow-x: auto;
  background: var(--p-surface-100);
  padding: 0.55rem;
  border-radius: 0.35rem;
  margin: 0 0 0.45rem;
}
.media-news-markdown :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 0.35rem;
}
</style>

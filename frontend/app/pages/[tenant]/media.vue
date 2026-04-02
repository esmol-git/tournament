<script setup lang="ts">
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  usePublicTournamentFetch,
  type PublicGalleryImageItem,
  type PublicTournamentNewsItem,
} from '~/composables/usePublicTournamentFetch'
import { PUBLIC_AUTO_ANIMATE } from '~/constants/publicMotion'
import { usePublicTournamentWorkspace } from '~/composables/usePublicTournamentWorkspace'
import { renderMarkdownToHtml } from '~/utils/renderMarkdown'

definePageMeta({
  layout: 'public-tournament',
  path: '/:tenant/tournaments/media',
  alias: [
    '/:tenant/media',
    '/:tenant/tournaments/news',
    '/:tenant/tournaments/photo',
    '/:tenant/tournaments/video',
  ],
})
const route = useRoute()

const { fetchTournamentNews, fetchTournamentGallery } = usePublicTournamentFetch()
const { tenant, selectedTournamentId, selectedTournament, loading, workspaceReady, pageContentLoading } =
  usePublicTournamentWorkspace()

const isInitializing = ref(true)
const loadingMedia = ref(false)
const errorText = ref('')

const newsItems = ref<PublicTournamentNewsItem[]>([])
const galleryImages = ref<PublicGalleryImageItem[]>([])

const [mediaGalleryGridRef] = useAutoAnimate({ ...PUBLIC_AUTO_ANIMATE })
const [mediaNewsGridRef] = useAutoAnimate({ ...PUBLIC_AUTO_ANIMATE })
const [mediaVideoGridRef] = useAutoAnimate({ ...PUBLIC_AUTO_ANIMATE })

const showWorkspaceBootSkeleton = computed(() => !workspaceReady.value || loading.value)
const showMediaSkeleton = computed(
  () =>
    isInitializing.value ||
    (loadingMedia.value && !!selectedTournamentId.value && !newsItems.value.length && !galleryImages.value.length),
)

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
  void fetchMediaForTournament()
})

watch(
  () => showWorkspaceBootSkeleton.value || showMediaSkeleton.value,
  (v) => {
    pageContentLoading.value = v
  },
  { immediate: true },
)

watch(
  workspaceReady,
  async (ready) => {
    if (!ready) return
    isInitializing.value = true
    try {
      await fetchMediaForTournament()
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
        <div v-if="errorText" class="public-error">{{ errorText }}</div>

        <div v-else-if="!selectedTournamentId" class="public-empty">
          Выберите турнир в карточке выше — здесь появятся новости, фото и видео.
        </div>

        <div v-else class="space-y-6">
          <Transition name="media-fade" mode="out-in">
            <section v-if="mediaTab === 'photo'" key="photo" class="public-card overflow-hidden">
                    <h2 class="text-lg font-semibold text-[#123c67]">Фотогалерея</h2>
                    <div
                      v-if="galleryImages.length"
                      ref="mediaGalleryGridRef"
                      class="public-stagger-appear mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
                    >
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
                    <div
                      v-if="mediaNewsCards.length"
                      ref="mediaNewsGridRef"
                      class="public-stagger-appear grid gap-4 md:grid-cols-2"
                    >
                      <article v-for="item in mediaNewsCards" :key="item.id" class="public-card h-full">
                        <div class="aspect-[16/9] overflow-hidden rounded-lg bg-surface-100 dark:bg-surface-800">
                          <img
                            v-if="item.coverImageUrl"
                            :src="String(item.coverImageUrl)"
                            :alt="`Обложка: ${item.title}`"
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
                    <div
                      v-if="videoCards.length"
                      ref="mediaVideoGridRef"
                      class="public-stagger-appear grid gap-4 md:grid-cols-2"
                    >
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

.media-news-markdown :deep(iframe),
.media-news-markdown :deep(video) {
  width: 100%;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  height: auto;
  border: 0;
  border-radius: 0.45rem;
  background: #000;
}

.media-news-markdown :deep(table) {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
}
</style>

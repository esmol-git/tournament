<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import { renderMarkdownToHtml } from '~/utils/renderMarkdown'

definePageMeta({ layout: 'public' })

const { tenantSlug, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const { fetchTenantVideoFeed } = usePublicTournamentFetch()

type VideoItem = {
  id: string
  title: string
  tournamentName: string
  publishedLabel: string
  html: string
}

const loading = ref(true)
const errorText = ref('')
const videos = ref<VideoItem[]>([])

const hasVideos = computed(() => videos.value.length > 0)

function looksLikeVideo(content: string) {
  return /youtube|youtu\.be|rutube|vimeo|video/i.test(content)
}

onMounted(async () => {
  loading.value = true
  errorText.value = ''
  try {
    await ensureTenantResolved()
    if (tenantNotFound.value) {
      errorText.value = 'Тенант не найден. Проверьте ссылку.'
      return
    }
    const rows = await fetchTenantVideoFeed(tenant.value, 180)
    videos.value = rows
      .filter((n) => {
        if (String(n.section).toUpperCase() === 'MEDIA') return true
        const text = `${n.content ?? ''} ${n.excerpt ?? ''}`.toLowerCase()
        return looksLikeVideo(text)
      })
      .map((n) => ({
        id: `${n.tournamentId ?? 'org'}-${n.id}`,
        title: n.title,
        tournamentName: n.tournamentName ?? 'Турнир',
        publishedLabel: new Date(n.publishedAt ?? n.createdAt).toLocaleDateString('ru-RU'),
        html: renderMarkdownToHtml(n.content ?? n.excerpt ?? ''),
      }))
  } catch {
    errorText.value = 'Не удалось загрузить видео организации.'
    videos.value = []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="public-shell">
    <PublicHeader :tenant="tenant" />
    <section class="public-container">
      <div class="public-hero">
        <p class="text-xs font-semibold uppercase tracking-wide text-[#4f6b8c]">Медиа организации</p>
        <h1 class="mt-2 text-2xl font-semibold text-[#123c67]">Видео</h1>
      </div>

      <div v-if="errorText" class="public-error mt-4">{{ errorText }}</div>
      <div v-else class="mt-4 media-stage">
        <Transition name="media-fade" mode="out-in">
          <div v-if="loading" key="loading" class="space-y-3">
            <div v-for="i in 6" :key="`mv-sk-${i}`" class="public-card">
              <Skeleton class="media-video-skeleton-title" width="48%" height="1rem" />
              <Skeleton class="mt-2" width="35%" height="0.8rem" />
              <Skeleton class="mt-3" width="100%" height="5.5rem" />
              <Skeleton class="mt-2" width="84%" height="0.85rem" />
            </div>
          </div>
          <div
            v-else-if="!hasVideos"
            key="empty"
            class="rounded-3xl border border-[#d6e0ee] bg-white px-6 py-10 text-center shadow-sm"
          >
            <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#f4f7fc] ring-1 ring-[#d6e0ee]">
              <i class="pi pi-video text-xl text-[#4f6b8c]" />
            </div>
            <h2 class="text-3xl font-semibold text-[#123c67]">Видео еще не опубликованы</h2>
            <p class="mt-3 text-lg text-[#4f6b8c]">
              Как только в новостях появятся видео-материалы, они сразу отобразятся в этом разделе.
            </p>
          </div>
          <div v-else key="content" class="space-y-3">
            <article v-for="v in videos" :key="v.id" class="public-card">
              <h2 class="text-lg font-semibold text-[#123c67]">{{ v.title }}</h2>
              <p class="mt-1 text-xs text-[#4f6b8c]">{{ v.tournamentName }} · {{ v.publishedLabel }}</p>
              <div class="media-org-video-markdown mt-3 text-sm text-surface-700" v-html="v.html" />
            </article>
          </div>
        </Transition>
      </div>
    </section>
    <PublicFooter />
  </div>
</template>

<style scoped>
.media-org-video-markdown :deep(a) {
  color: var(--p-primary-color);
  text-decoration: underline;
}

.media-org-video-markdown :deep(iframe),
.media-org-video-markdown :deep(video) {
  width: 100%;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  height: auto;
  border: 0;
  border-radius: 0.45rem;
  background: #000;
}

.media-org-video-markdown :deep(table) {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
}

.media-video-skeleton-title {
  border-radius: 0.45rem;
}

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

</style>

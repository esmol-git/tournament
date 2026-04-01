<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'

definePageMeta({ layout: 'public' })

const { tenantSlug, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const { fetchTenantGalleryFeed } = usePublicTournamentFetch()

type GalleryItem = {
  id: string
  tournamentName: string
  imageUrl: string
  caption?: string | null
}

const loading = ref(true)
const errorText = ref('')
const images = ref<GalleryItem[]>([])

const hasImages = computed(() => images.value.length > 0)

onMounted(async () => {
  loading.value = true
  errorText.value = ''
  try {
    await ensureTenantResolved()
    if (tenantNotFound.value) {
      errorText.value = 'Тенант не найден. Проверьте ссылку.'
      return
    }
    const rows = await fetchTenantGalleryFeed(tenant.value, 180)
    images.value = rows.map((img) => ({
      id: img.id,
      tournamentName: img.tournamentName,
      imageUrl: img.imageUrl,
      caption: img.caption ?? null,
    }))
  } catch {
    errorText.value = 'Не удалось загрузить фото организации.'
    images.value = []
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
        <h1 class="mt-2 text-2xl font-semibold text-[#123c67]">Фото</h1>
      </div>

      <div v-if="errorText" class="public-error mt-4">{{ errorText }}</div>
      <div v-else class="mt-4 media-stage">
        <Transition name="media-fade" mode="out-in">
          <div v-if="loading" key="loading" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="i in 9" :key="`mp-sk-${i}`" class="public-card">
              <Skeleton class="media-photo-skeleton-image" width="100%" height="11rem" />
              <Skeleton class="mt-3" width="55%" height="0.85rem" />
              <Skeleton class="mt-2" width="80%" height="0.85rem" />
            </div>
          </div>
          <div
            v-else-if="!hasImages"
            key="empty"
            class="rounded-3xl border border-[#d6e0ee] bg-white px-6 py-10 text-center shadow-sm"
          >
            <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#f4f7fc] ring-1 ring-[#d6e0ee]">
              <i class="pi pi-images text-xl text-[#4f6b8c]" />
            </div>
            <h2 class="text-3xl font-semibold text-[#123c67]">Фотогалерея пока пуста</h2>
            <p class="mt-3 text-lg text-[#4f6b8c]">
              После публикации фото в турнирах они автоматически появятся здесь.
            </p>
          </div>
          <div v-else key="content" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <article v-for="img in images" :key="img.id" class="public-card">
              <div class="aspect-[4/3] w-full overflow-hidden rounded-lg bg-surface-100">
                <img :src="img.imageUrl" :alt="img.caption ?? ''" class="h-full w-full object-cover" loading="lazy" />
              </div>
              <p class="mt-2 text-xs text-[#4f6b8c]">{{ img.tournamentName }}</p>
              <p v-if="img.caption" class="mt-1 text-sm text-[#123c67]">{{ img.caption }}</p>
            </article>
          </div>
        </Transition>
      </div>
    </section>
    <PublicFooter />
  </div>
</template>

<style scoped>
.media-photo-skeleton-image {
  border-radius: 0.75rem;
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

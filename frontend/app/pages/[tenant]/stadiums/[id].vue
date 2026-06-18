<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import ImageCarousel from '~/app/components/admin/ImageCarousel.vue'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import {
  usePublicTournamentFetch,
  type PublicStadiumDetail,
} from '~/composables/usePublicTournamentFetch'
import { stadiumSurfaceTypeLabel } from '~/utils/stadiumSurfaceType'
import type { StadiumSurfaceType } from '~/utils/stadiumSurfaceType'

definePageMeta({ layout: 'public' })

const route = useRoute()
const { tenantSlug, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const { fetchStadium } = usePublicTournamentFetch()
const { t } = useI18n()

const loading = ref(true)
const errorText = ref('')
const stadium = ref<PublicStadiumDetail | null>(null)

const stadiumId = computed(() => String(route.params.id ?? ''))

const galleryImages = computed(() =>
  (stadium.value?.galleryImages ?? []).map((img) => ({
    id: img.id,
    imageUrl: img.imageUrl,
    caption: img.caption,
  })),
)

const surfaceLabel = computed(() =>
  stadiumSurfaceTypeLabel(
    stadium.value?.surfaceType as StadiumSurfaceType | null | undefined,
    stadium.value?.surface,
    t,
  ),
)

const locationLine = computed(() => {
  const s = stadium.value
  if (!s) return ''
  const parts = [s.city, s.address].filter((x) => typeof x === 'string' && x.trim())
  return parts.join(', ')
})

async function loadStadium() {
  loading.value = true
  errorText.value = ''
  stadium.value = null
  try {
    await ensureTenantResolved()
    if (tenantNotFound.value) {
      errorText.value = 'Тенант не найден. Проверьте ссылку.'
      return
    }
    if (!stadiumId.value) {
      errorText.value = 'Площадка не указана.'
      return
    }
    stadium.value = await fetchStadium(tenant.value, stadiumId.value)
  } catch {
    errorText.value = 'Не удалось загрузить карточку площадки.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadStadium()
})

watch(stadiumId, () => {
  void loadStadium()
})
</script>

<template>
  <div class="public-shell">
    <PublicHeader :tenant="tenant" />
    <section class="public-container">
      <div class="mb-4">
        <NuxtLink
          :to="`/${tenant}/stadiums`"
          class="inline-flex items-center gap-1 text-sm text-[#4f6b8c] hover:text-[#123c67]"
        >
          <i class="pi pi-arrow-left text-xs" />
          Все площадки
        </NuxtLink>
      </div>

      <div v-if="errorText" class="public-error">{{ errorText }}</div>
      <div v-else class="public-stage">
        <Transition name="public-fade" mode="out-in">
          <div v-if="loading" key="loading" class="space-y-4">
            <Skeleton height="16rem" class="rounded-xl" />
            <Skeleton width="40%" height="1.5rem" />
            <Skeleton width="70%" height="1rem" />
          </div>
          <article v-else-if="stadium" key="content" class="space-y-6">
            <ImageCarousel
              v-if="galleryImages.length"
              :images="galleryImages"
              aspect-class="aspect-[21/9] max-h-[28rem]"
            />
            <div
              v-else
              class="flex aspect-[21/9] max-h-80 items-center justify-center rounded-xl bg-[#eef2f8] text-[#4f6b8c]"
            >
              <i class="pi pi-image text-4xl opacity-50" />
            </div>

            <div>
              <h1 class="text-3xl font-semibold text-[#123c67]">{{ stadium.name }}</h1>
              <p v-if="locationLine" class="mt-2 text-sm text-[#4f6b8c]">{{ locationLine }}</p>
              <p v-if="stadium.region?.name" class="mt-1 text-sm text-[#4f6b8c]">
                Регион: {{ stadium.region.name }}
              </p>
            </div>

            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div class="public-card">
                <p class="text-xs font-medium uppercase tracking-wide text-[#4f6b8c]">Покрытие</p>
                <p class="mt-1 text-sm font-medium text-[#123c67]">{{ surfaceLabel }}</p>
              </div>
              <div v-if="stadium.pitchCount" class="public-card">
                <p class="text-xs font-medium uppercase tracking-wide text-[#4f6b8c]">Поля</p>
                <p class="mt-1 text-sm font-medium text-[#123c67]">{{ stadium.pitchCount }}</p>
              </div>
              <div v-if="stadium.capacity" class="public-card">
                <p class="text-xs font-medium uppercase tracking-wide text-[#4f6b8c]">Вместимость</p>
                <p class="mt-1 text-sm font-medium text-[#123c67]">{{ stadium.capacity }}</p>
              </div>
            </div>

            <div v-if="stadium.note?.trim()" class="public-card">
              <p class="text-xs font-medium uppercase tracking-wide text-[#4f6b8c]">Описание</p>
              <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#123c67]">
                {{ stadium.note }}
              </p>
            </div>
          </article>
        </Transition>
      </div>
    </section>
    <PublicFooter />
  </div>
</template>

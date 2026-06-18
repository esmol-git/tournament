<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import RemoteImage from '~/app/components/RemoteImage.vue'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import {
  usePublicTournamentFetch,
  type PublicStadiumListItem,
} from '~/composables/usePublicTournamentFetch'
import { stadiumSurfaceTypeLabel } from '~/utils/stadiumSurfaceType'
import type { StadiumSurfaceType } from '~/utils/stadiumSurfaceType'

definePageMeta({ layout: 'public' })

const { tenantSlug, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const { fetchStadiums } = usePublicTournamentFetch()
const { t } = useI18n()

const loading = ref(true)
const errorText = ref('')
const stadiums = ref<PublicStadiumListItem[]>([])

const hasStadiums = computed(() => stadiums.value.length > 0)

function locationLine(s: PublicStadiumListItem) {
  const parts = [s.city, s.address].filter((x) => typeof x === 'string' && x.trim())
  return parts.join(', ')
}

function surfaceLine(s: PublicStadiumListItem) {
  return stadiumSurfaceTypeLabel(
    s.surfaceType as StadiumSurfaceType | null | undefined,
    s.surface,
    t,
  )
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
    const items = await fetchStadiums(tenant.value)
    stadiums.value = items.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  } catch {
    errorText.value = 'Не удалось загрузить список площадок.'
    stadiums.value = []
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
        <p class="text-xs font-semibold uppercase tracking-wide text-[#4f6b8c]">Инфраструктура</p>
        <h1 class="mt-2 text-2xl font-semibold text-[#123c67]">Площадки</h1>
        <p class="mt-2 max-w-2xl text-sm text-[#4f6b8c]">
          Стадионы и поля организации — адреса, покрытие и фотогалерея.
        </p>
      </div>

      <div v-if="errorText" class="public-error mt-4">{{ errorText }}</div>
      <div v-else class="mt-4 public-stage">
        <Transition name="public-fade" mode="out-in">
          <div v-if="loading" key="loading" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="i in 6" :key="`st-sk-${i}`" class="public-card overflow-hidden p-0">
              <Skeleton class="!rounded-none" height="10rem" />
              <div class="p-4">
                <Skeleton width="70%" height="1rem" />
                <Skeleton class="mt-2" width="90%" height="0.85rem" />
              </div>
            </div>
          </div>
          <div
            v-else-if="!hasStadiums"
            key="empty"
            class="rounded-3xl border border-[#d6e0ee] bg-white px-6 py-10 text-center shadow-sm"
          >
            <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#f4f7fc] ring-1 ring-[#d6e0ee]">
              <i class="pi pi-map-marker text-xl text-[#4f6b8c]" />
            </div>
            <h2 class="text-2xl font-semibold text-[#123c67]">Площадок пока нет</h2>
            <p class="mt-3 text-sm text-[#4f6b8c]">
              Когда организация добавит стадионы в справочник, они появятся на этой странице.
            </p>
          </div>
          <div v-else key="content" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NuxtLink
              v-for="stadium in stadiums"
              :key="stadium.id"
              :to="`/${tenant}/stadiums/${stadium.id}`"
              class="public-card stadium-card overflow-hidden p-0 transition-shadow hover:shadow-md"
            >
              <div class="relative aspect-[16/10] bg-[#eef2f8]">
                <RemoteImage
                  v-if="stadium.previewImageUrl"
                  :src="stadium.previewImageUrl"
                  :alt="stadium.name"
                  class="h-full w-full object-cover"
                />
                <div
                  v-else
                  class="flex h-full w-full items-center justify-center text-[#4f6b8c]"
                >
                  <i class="pi pi-image text-3xl opacity-60" />
                </div>
              </div>
              <div class="p-4">
                <h2 class="text-base font-semibold text-[#123c67]">{{ stadium.name }}</h2>
                <p v-if="locationLine(stadium)" class="mt-1 text-xs text-[#4f6b8c]">
                  {{ locationLine(stadium) }}
                </p>
                <p class="mt-2 text-xs text-[#4f6b8c]">{{ surfaceLine(stadium) }}</p>
                <p v-if="stadium.capacity" class="mt-1 text-xs text-[#4f6b8c]">
                  Вместимость: {{ stadium.capacity }}
                </p>
              </div>
            </NuxtLink>
          </div>
        </Transition>
      </div>
    </section>
    <PublicFooter />
  </div>
</template>

<style scoped>
.stadium-card {
  display: block;
  text-decoration: none;
  color: inherit;
}
</style>

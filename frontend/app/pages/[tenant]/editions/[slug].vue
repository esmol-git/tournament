<script setup lang="ts">
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { useApiUrl } from '~/composables/useApiUrl'

definePageMeta({})

const route = useRoute()
const { apiUrl } = useApiUrl()
const { tenantSlug, ready } = usePublicTenantContext()
const editionSlug = computed(() => String(route.params.slug ?? ''))

type PublicEditionDetail = {
  id: string
  name: string
  slug: string
  description: string | null
  season: { name: string }
  competition: { name: string }
  tournaments: Array<{
    id: string
    name: string
    slug: string
    startsAt: string | null
    endsAt: string | null
  }>
}

const { data: edition, pending, error } = await useAsyncData(
  () => `public-edition-${tenantSlug.value}-${editionSlug.value}`,
  async () => {
    if (!tenantSlug.value || !editionSlug.value) return null
    return $fetch<PublicEditionDetail>(
      apiUrl(
        `/public/tenants/${encodeURIComponent(tenantSlug.value)}/editions/${encodeURIComponent(editionSlug.value)}`,
      ),
    )
  },
  { watch: [tenantSlug, editionSlug] },
)
</script>

<template>
  <div v-if="ready" class="mx-auto max-w-4xl px-4 py-8">
    <NuxtLink :to="`/${tenantSlug}/editions`" class="text-sm text-primary-500 hover:underline">
      ← Все серии
    </NuxtLink>

    <div v-if="pending" class="py-12 text-center text-muted-color">Загрузка…</div>
    <p v-else-if="error" class="py-8 text-red-500">Серия не найдена</p>
    <template v-else-if="edition">
      <h1 class="mt-4 text-2xl font-bold text-surface-900 dark:text-surface-0">{{ edition.name }}</h1>
      <p class="mt-1 text-sm text-muted-color">
        {{ edition.season.name }} · {{ edition.competition.name }}
      </p>
      <p v-if="edition.description" class="mt-4 text-surface-700 dark:text-surface-200">
        {{ edition.description }}
      </p>

      <h2 class="mt-8 text-lg font-semibold">Турниры</h2>
      <ul v-if="edition.tournaments.length" class="mt-3 space-y-2">
        <li v-for="t in edition.tournaments" :key="t.id">
          <NuxtLink
            :to="{ path: `/${tenantSlug}/tournaments`, query: { tid: t.id } }"
            class="font-medium text-primary-500 hover:underline"
          >
            {{ t.name }}
          </NuxtLink>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm text-muted-color">Турниры пока не опубликованы.</p>
    </template>
  </div>
</template>

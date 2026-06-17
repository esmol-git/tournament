<script setup lang="ts">
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { useApiUrl } from '~/composables/useApiUrl'

definePageMeta({})

const route = useRoute()
const { apiUrl } = useApiUrl()
const { tenantSlug, ready } = usePublicTenantContext()

type PublicEditionRow = {
  id: string
  name: string
  slug: string
  description: string | null
  season: { name: string }
  competition: { name: string }
  _count: { tournaments: number }
}

const { data: editions, pending, error } = await useAsyncData(
  () => `public-editions-${tenantSlug.value}`,
  async () => {
    if (!tenantSlug.value) return []
    return $fetch<PublicEditionRow[]>(
      apiUrl(`/public/tenants/${encodeURIComponent(tenantSlug.value)}/editions`),
    )
  },
  { watch: [tenantSlug] },
)
</script>

<template>
  <div v-if="ready" class="mx-auto max-w-4xl px-4 py-8">
    <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-0">Зачёты</h1>
    <p class="mt-2 text-sm text-muted-color">Программы соревнований организации</p>

    <div v-if="pending" class="py-12 text-center text-muted-color">Загрузка…</div>
    <p v-else-if="error" class="py-8 text-red-500">Не удалось загрузить список</p>
    <ul v-else-if="editions?.length" class="mt-6 space-y-3">
      <li
        v-for="ed in editions"
        :key="ed.id"
        class="rounded-xl border border-surface-200 p-4 dark:border-surface-700"
      >
        <NuxtLink
          :to="`/${tenantSlug}/editions/${ed.slug}`"
          class="text-lg font-semibold text-primary-500 hover:underline"
        >
          {{ ed.name }}
        </NuxtLink>
        <p class="mt-1 text-sm text-muted-color">
          {{ ed.season.name }} · {{ ed.competition.name }} · {{ ed._count.tournaments }} турнир(ов)
        </p>
        <p v-if="ed.description" class="mt-2 text-sm text-surface-600 dark:text-surface-300">
          {{ ed.description }}
        </p>
      </li>
    </ul>
    <p v-else class="mt-8 text-muted-color">Пока нет опубликованных зачётов.</p>
  </div>
</template>

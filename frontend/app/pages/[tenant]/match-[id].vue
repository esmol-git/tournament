<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'

definePageMeta({
  layout: 'public',
  path: '/:tenant/tournaments/match-:id',
  alias: ['/:tenant/match-:id'],
})

const route = useRoute()
const router = useRouter()

const { tenantSlug, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const matchId = computed(() => route.params.id as string)
const resolving = ref(true)

onMounted(async () => {
  try {
    await ensureTenantResolved()
    if (tenantNotFound.value) return
    if (String(route.params.tenant ?? '') !== tenant.value) {
      await router.replace({ params: { tenant: tenant.value }, query: route.query })
    }
  } finally {
    resolving.value = false
  }
})
</script>

<template>
  <div class="public-shell">
    <PublicHeader :tenant="tenant" />
    <section class="public-container">
      <div class="public-stage">
        <Transition name="public-fade" mode="out-in">
          <div v-if="resolving" key="loading" class="public-card">
            <Skeleton width="12rem" height="1.8rem" />
            <Skeleton class="mt-3" width="18rem" height="1rem" />
            <Skeleton class="mt-6" width="100%" height="10rem" />
          </div>
          <div v-else key="content" class="public-hero">
            <p class="text-sm font-medium uppercase tracking-wide text-[#1a5a8c]">Матч</p>
            <h1 class="mt-2 text-3xl font-semibold text-surface-900">Карточка матча #{{ matchId }}</h1>
            <p class="mt-3 max-w-3xl text-sm leading-6 text-muted-color">
              Подробная страница матча в разработке. Здесь будет состав, ход игры, события и статистика.
            </p>
          </div>
        </Transition>
      </div>
    </section>
    <PublicFooter />
  </div>
</template>


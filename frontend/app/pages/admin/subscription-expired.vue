<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

definePageMeta({
  layout: 'auth',
})

const route = useRoute()
const isBlocked = computed(() => route.query.reason === 'blocked')
</script>

<template>
  <div class="space-y-4 text-center">
    <h1 class="text-xl font-semibold text-surface-900">
      {{ isBlocked ? 'Организация заблокирована' : 'Подписка неактивна' }}
    </h1>
    <p class="text-sm text-surface-600 leading-relaxed">
      <template v-if="isBlocked">
        Доступ к админке для этой организации закрыт администратором платформы.
      </template>
      <template v-else>
        Срок доступа к админке истёк. Продлите подписку или обратитесь в поддержку.
      </template>
    </p>
    <div>
      <NuxtLink
        to="/admin/login"
        class="text-primary font-medium hover:underline"
      >
        На страницу входа
      </NuxtLink>
    </div>
  </div>
</template>

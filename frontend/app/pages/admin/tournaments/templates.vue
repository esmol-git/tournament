<script setup lang="ts">
/**
 * Старый путь: редирект на единую страницу турниров с вкладкой в query.
 */
definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const route = useRoute()
await navigateTo(
  {
    path: '/admin/tournaments',
    query: { ...route.query, tab: 'templates' },
  },
  { replace: true },
)
</script>

<template>
  <div class="hidden" aria-hidden="true" />
</template>

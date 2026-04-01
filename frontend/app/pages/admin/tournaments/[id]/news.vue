<script setup lang="ts">
/**
 * Раздел новостей перенесён в сайдбар: `/admin/news`.
 * Старый URL сохраняем редиректом с предвыбором турнира.
 */
definePageMeta({ layout: 'admin' })

const route = useRoute()

await navigateTo(
  {
    path: '/admin/news',
    query: { tournament: route.params.id as string },
  },
  { replace: true },
)
</script>

<template>
  <div />
</template>

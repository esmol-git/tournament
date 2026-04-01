<script setup lang="ts">
/**
 * Раздел «Фотогалерея» в сайдбаре: `/admin/gallery`.
 * Старый URL ведёт сюда с предвыбором турнира.
 */
definePageMeta({ layout: 'admin' })

const route = useRoute()

await navigateTo(
  {
    path: '/admin/gallery',
    query: { tournament: route.params.id as string },
  },
  { replace: true },
)
</script>

<template>
  <div />
</template>

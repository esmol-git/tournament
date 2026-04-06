<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const route = useRoute()

await navigateTo(`/admin/gallery/${route.params.id as string}`, { replace: true })
</script>

<template>
  <div />
</template>

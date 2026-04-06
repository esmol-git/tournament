<script setup lang="ts">
import { computed } from 'vue'
import AdminGalleryHubTileSkeleton from '~/app/components/admin/skeletons/AdminGalleryHubTileSkeleton.vue'

const props = withDefaults(
  defineProps<{
    count?: number
  }>(),
  { count: 8 },
)

const indices = computed(() => Array.from({ length: props.count }, (_, i) => i))
</script>

<template>
  <div
    class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    aria-busy="true"
  >
    <AdminGalleryHubTileSkeleton v-for="i in indices" :key="i" :index="i" />
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    logoUrl?: string | null
    name?: string
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { size: 'md' },
)

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-8 w-8'
    case 'lg':
      return 'h-12 w-12'
    case 'md':
    default:
      return 'h-10 w-10'
  }
})
</script>

<template>
  <RemoteImage
    :src="logoUrl"
    :alt="name || ''"
    placeholder-icon="users"
    :class="['rounded-lg', sizeClass]"
    fit="cover"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import RemoteImage from '~/app/components/RemoteImage.vue'

const props = withDefaults(
  defineProps<{
    images: Array<{ id?: string; imageUrl: string; caption?: string | null }>
    aspectClass?: string
  }>(),
  {
    aspectClass: 'aspect-[16/10]',
  },
)

const index = ref(0)
const total = computed(() => props.images.length)
const current = computed(() => props.images[index.value] ?? null)

function prev() {
  if (total.value <= 1) return
  index.value = (index.value - 1 + total.value) % total.value
}

function next() {
  if (total.value <= 1) return
  index.value = (index.value + 1) % total.value
}
</script>

<template>
  <div v-if="current" class="relative overflow-hidden rounded-xl bg-surface-100 dark:bg-surface-800">
    <div :class="['relative w-full', aspectClass]">
      <RemoteImage
        :src="current.imageUrl"
        :alt="current.caption || ''"
        class="h-full w-full object-cover"
      />
      <template v-if="total > 1">
        <button
          type="button"
          class="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white hover:bg-black/60"
          :aria-label="$t('admin.image_carousel.prev')"
          @click="prev"
        >
          <i class="pi pi-chevron-left text-sm" />
        </button>
        <button
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white hover:bg-black/60"
          :aria-label="$t('admin.image_carousel.next')"
          @click="next"
        >
          <i class="pi pi-chevron-right text-sm" />
        </button>
        <div
          class="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/40 px-2 py-1"
        >
          <button
            v-for="(img, i) in images"
            :key="img.id ?? img.imageUrl"
            type="button"
            class="h-2 w-2 rounded-full transition-colors"
            :class="i === index ? 'bg-white' : 'bg-white/45 hover:bg-white/70'"
            :aria-label="$t('admin.image_carousel.go_to', { n: i + 1 })"
            @click="index = i"
          />
        </div>
      </template>
    </div>
    <p v-if="current.caption" class="px-3 py-2 text-sm text-muted-color">
      {{ current.caption }}
    </p>
  </div>
</template>

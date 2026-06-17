<script setup lang="ts">
import { computed, ref, useAttrs, watch } from 'vue'
import { resolveStorageUrl } from '~/utils/storageUrl'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    src?: string | null
    alt?: string
    /** Иконка в заглушке (PrimeIcons) */
    placeholderIcon?: 'user' | 'users' | 'image'
    /** Класс размера иконки, напр. `text-lg` / `text-sm` */
    iconClass?: string
    /** Нативный lazy-loading для <img> */
    lazy?: boolean
    /** object-fit для успешно загруженного изображения */
    fit?: 'cover' | 'contain'
    draggable?: boolean
  }>(),
  {
    alt: '',
    placeholderIcon: 'image',
    iconClass: 'text-lg',
    lazy: true,
    fit: 'cover',
    draggable: undefined,
  },
)

const attrs = useAttrs()
const runtimeConfig = useRuntimeConfig()

const loadFailed = ref(false)
/** Поколение загрузки: отсекает @error от снятого с DOM <img> при смене src / remount. */
const loadGeneration = ref(0)

const trimmedSrc = computed(() =>
  resolveStorageUrl(
    props.src,
    String(runtimeConfig.public.apiBase ?? ''),
  ),
)

watch(trimmedSrc, () => {
  loadFailed.value = false
  loadGeneration.value += 1
})

const showImage = computed(() => Boolean(trimmedSrc.value) && !loadFailed.value)

function onImageLoad() {
  loadFailed.value = false
}

function onImageError() {
  const generation = loadGeneration.value
  queueMicrotask(() => {
    if (generation !== loadGeneration.value || !trimmedSrc.value) return
    loadFailed.value = true
  })
}

const piClass = computed(() => {
  switch (props.placeholderIcon) {
    case 'user':
      return 'pi pi-user'
    case 'users':
      return 'pi pi-users'
    default:
      return 'pi pi-image'
  }
})

const placeholderLabel = computed(() => props.alt?.trim() || 'Нет изображения')

const objectFitClass = computed(() =>
  props.fit === 'contain' ? 'object-contain' : 'object-cover',
)
</script>

<template>
  <!-- rounded-* задаётся снаружи; overflow-hidden + inherit на детях даёт ровные углы у img и заглушки -->
  <div class="inline-flex shrink-0 overflow-hidden" v-bind="attrs">
    <img
      v-if="showImage"
      :key="trimmedSrc"
      :src="trimmedSrc"
      :alt="alt"
      :class="['h-full w-full min-h-0 min-w-0 [border-radius:inherit]', objectFitClass]"
      :loading="lazy ? 'lazy' : 'eager'"
      decoding="async"
      referrerpolicy="no-referrer"
      :draggable="draggable === undefined ? undefined : draggable"
      @load="onImageLoad"
      @error="onImageError"
    />
    <div
      v-else
      class="flex h-full min-h-0 w-full min-w-0 items-center justify-center bg-surface-100 text-muted-color [border-radius:inherit] ring-1 ring-inset ring-surface-200 dark:bg-surface-800 dark:ring-surface-600"
      role="img"
      :aria-label="placeholderLabel"
    >
      <i :class="[piClass, iconClass, 'opacity-50']" aria-hidden="true" />
    </div>
  </div>
</template>

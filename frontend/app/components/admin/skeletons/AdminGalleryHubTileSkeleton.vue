<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Каскадное появление в сетке */
    index?: number
  }>(),
  { index: 0 },
)

const enterDelayMs = computed(() => Math.min(props.index, 12) * 72)
</script>

<template>
  <div
    class="admin-gallery-hub-tile-skel overflow-hidden rounded-2xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900"
    :style="{ animationDelay: `${enterDelayMs}ms` }"
    aria-hidden="true"
  >
    <div
      class="relative aspect-[4/3] bg-gradient-to-br from-surface-100 to-surface-200 dark:from-surface-800 dark:to-surface-900"
    >
      <div class="absolute inset-0 flex items-center justify-center p-3 sm:p-4">
        <div class="relative h-[68%] w-[76%] max-h-[10.5rem] max-w-[13rem]">
          <div
            class="admin-gallery-hub-tile-skel__stack admin-gallery-hub-tile-skel__stack--back absolute left-1/2 top-1/2 h-full w-full"
          >
            <Skeleton width="100%" height="100%" border-radius="0.5rem" animation="wave" />
          </div>
          <div
            class="admin-gallery-hub-tile-skel__stack admin-gallery-hub-tile-skel__stack--front absolute left-1/2 top-1/2 h-full w-full"
          >
            <Skeleton width="100%" height="100%" border-radius="0.5rem" animation="wave" />
          </div>
        </div>
      </div>

      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-3 pb-3 pt-10"
      >
        <div class="space-y-2">
          <div
            class="h-3.5 max-w-[85%] rounded-md bg-white/35 dark:bg-white/20 admin-gallery-hub-tile-skel__pulse"
          />
          <div
            class="h-3 max-w-[55%] rounded-md bg-white/25 dark:bg-white/15 admin-gallery-hub-tile-skel__pulse admin-gallery-hub-tile-skel__pulse--delayed"
          />
        </div>
      </div>
    </div>

    <div
      class="flex items-center justify-between gap-2 border-t border-surface-100 px-3 py-2 dark:border-surface-800"
    >
      <Skeleton height="0.75rem" width="42%" border-radius="0.25rem" animation="wave" />
      <Skeleton shape="circle" width="1.15rem" height="1.15rem" animation="wave" />
    </div>
  </div>
</template>

<style scoped>
.admin-gallery-hub-tile-skel {
  animation: admin-gallery-hub-tile-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes admin-gallery-hub-tile-rise {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.988);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.admin-gallery-hub-tile-skel__stack {
  transform: translate(-50%, -50%);
}

.admin-gallery-hub-tile-skel__stack--back {
  transform: translate(-50%, -50%) rotate(-5deg) translateY(5px);
  opacity: 0.88;
}

.admin-gallery-hub-tile-skel__stack--front {
  transform: translate(-50%, -50%) rotate(3deg) translateY(-2px);
  z-index: 1;
}

.admin-gallery-hub-tile-skel__pulse {
  animation: admin-gallery-hub-title-pulse 1.35s ease-in-out infinite;
}

.admin-gallery-hub-tile-skel__pulse--delayed {
  animation-delay: 0.2s;
}

@keyframes admin-gallery-hub-title-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 0.95;
  }
}

.admin-gallery-hub-tile-skel :deep(.p-skeleton::after) {
  animation-duration: 1.3s;
}
</style>

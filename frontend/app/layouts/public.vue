<script setup lang="ts">
import { usePublicBackToTop } from '~/composables/usePublicBackToTop'
import { usePublicLayoutSeo } from '~/composables/usePublicLayoutSeo'
import { usePublicLayoutBranding } from '~/composables/usePublicLayoutBranding'

const { tenantMeta } = await usePublicLayoutSeo()
usePublicLayoutBranding(tenantMeta)
const { showBackToTop, backToTopStyle, scrollToTop } = usePublicBackToTop()
</script>

<template>
  <div class="min-h-screen bg-transparent">
    <slot />
    <button
      v-if="showBackToTop"
      type="button"
      class="fixed bottom-20 z-[75] inline-flex items-center gap-1.5 rounded-full border border-[#d2e2f7] bg-white/95 px-3 py-2 text-xs font-semibold text-[#1a5a8c] shadow-lg backdrop-blur transition hover:border-[#c80a48]/40 hover:text-[#c80a48]"
      :style="backToTopStyle"
      aria-label="Прокрутить наверх"
      @click="scrollToTop"
    >
      <i class="pi pi-arrow-up text-[0.72rem]" />
      <span>Наверх</span>
    </button>
  </div>
</template>


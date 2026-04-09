<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const { t } = useI18n()

const visible = ref(false)
/** Узкий экран / тач: кнопка раньше; десктоп: только после заметного скролла */
const SCROLL_THRESHOLD_NARROW = 120
const SCROLL_THRESHOLD_DESKTOP = 1000
const DESKTOP_MEDIA = '(min-width: 1024px)'

let mainEl: HTMLElement | null = null
let rafRecompute = 0

function findAdminScrollMain(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return (
    (document.querySelector('main.overflow-y-auto') as HTMLElement | null) ??
    (document.querySelector('main') as HTMLElement | null)
  )
}

function bindMain() {
  mainEl = findAdminScrollMain()
  return !!mainEl
}

/**
 * Скролл часто идёт во вложенном блоке (вкладка, таблица), а не в `<main>` — тогда `main.scrollTop` = 0.
 */
function getScrollThreshold(): number {
  if (typeof window === 'undefined') return SCROLL_THRESHOLD_NARROW
  return window.matchMedia(DESKTOP_MEDIA).matches ? SCROLL_THRESHOLD_DESKTOP : SCROLL_THRESHOLD_NARROW
}

function recomputeScrolledDown(): boolean {
  const th = getScrollThreshold()
  if ((window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) > th) {
    return true
  }
  if (!mainEl) mainEl = findAdminScrollMain()
  const main = mainEl
  if (!main) return false
  if (main.scrollTop > th) return true
  for (const el of main.querySelectorAll<HTMLElement>('*')) {
    if (el.scrollHeight <= el.clientHeight + 1) continue
    if (el.scrollTop > th) return true
  }
  return false
}

function scheduleRecompute() {
  if (typeof requestAnimationFrame === 'undefined') return
  if (rafRecompute) cancelAnimationFrame(rafRecompute)
  rafRecompute = requestAnimationFrame(() => {
    rafRecompute = 0
    visible.value = recomputeScrolledDown()
  })
}

function onScrollCapture() {
  scheduleRecompute()
}

/** scroll не везде доходит до window; wheel при прокрутке колёсиком/тачпадом всегда есть */
function onWheelCapture() {
  scheduleRecompute()
}

function onResize() {
  scheduleRecompute()
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
  document.documentElement.scrollTo({ top: 0, behavior: 'smooth' })
  const m = mainEl ?? findAdminScrollMain()
  m?.scrollTo({ top: 0, behavior: 'smooth' })
  if (m) {
    for (const el of m.querySelectorAll<HTMLElement>('*')) {
      if (el.scrollTop <= 0 || el.scrollHeight <= el.clientHeight + 1) continue
      const st = getComputedStyle(el)
      if (st.overflowY === 'auto' || st.overflowY === 'scroll' || st.overflowY === 'overlay') {
        el.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
  }
}

onMounted(() => {
  if (typeof window === 'undefined') return
  void nextTick(() => {
    bindMain()
    requestAnimationFrame(() => {
      bindMain()
      scheduleRecompute()
    })
    setTimeout(() => {
      bindMain()
      scheduleRecompute()
    }, 100)
  })
  window.addEventListener('scroll', onScrollCapture, { capture: true, passive: true })
  window.addEventListener('wheel', onWheelCapture, { capture: true, passive: true })
  window.addEventListener('resize', onResize, { passive: true })
  scheduleRecompute()
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('scroll', onScrollCapture, true)
    window.removeEventListener('wheel', onWheelCapture, true)
    window.removeEventListener('resize', onResize)
  }
  if (rafRecompute) cancelAnimationFrame(rafRecompute)
  mainEl = null
})
</script>

<template>
  <Teleport to="body">
    <Button
      v-show="visible"
      type="button"
      rounded
      severity="secondary"
      icon="pi pi-arrow-up"
      class="admin-scroll-top-fab pointer-events-auto !p-0 shadow-lg"
      :aria-label="t('admin.tournament_page.scroll_to_top_aria')"
      :title="t('admin.tournament_page.scroll_to_top')"
      @click="scrollToTop"
    />
  </Teleport>
</template>

<style scoped>
.admin-scroll-top-fab {
  position: fixed;
  z-index: 500;
  inset-inline-end: 1rem;
  inset-block-end: calc(1rem + env(safe-area-inset-bottom, 0px));
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
}
</style>

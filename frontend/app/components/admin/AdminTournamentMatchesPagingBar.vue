<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    matchesHasMore: boolean
    matchesLoadingMore: boolean
    loadMoreMatches?: () => void | Promise<void>
    /** false — вкладка скрыта (PrimeVue TabView), observer не нужен */
    tabVisible?: boolean
    loadedCount: number
    totalCount: number
  }>(),
  { tabVisible: true },
)

const { t } = useI18n()

const sentinelRef = ref<HTMLElement | null>(null)
let scrollObserver: IntersectionObserver | null = null
let resizeObserver: ResizeObserver | null = null
const scrollCleanups: Array<() => void> = []
let scrollCheckRaf = 0

const MATCHES_INFINITE_PREFETCH_PX = 260

function isVerticallyScrollable(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight + 1
}

function gatherVerticalScrollTargets(from: HTMLElement | null): HTMLElement[] {
  const out = new Set<HTMLElement>()
  if (!from || typeof document === 'undefined') return []

  let el: HTMLElement | null = from.parentElement
  while (el && el !== document.documentElement) {
    const { overflowY } = getComputedStyle(el)
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      if (isVerticallyScrollable(el) || el.tagName === 'MAIN') {
        out.add(el)
      }
    }
    el = el.parentElement
  }

  const main = document.querySelector('main')
  if (main instanceof HTMLElement) {
    const oy = getComputedStyle(main).overflowY
    if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
      out.add(main)
    }
  }

  return [...out]
}

function isSentinelInLoadZone(sentinel: HTMLElement): boolean {
  const sr = sentinel.getBoundingClientRect()
  const vh = window.innerHeight
  if (sr.bottom <= 0) return false
  return sr.top < vh + MATCHES_INFINITE_PREFETCH_PX
}

function scheduleProximityCheck() {
  if (typeof requestAnimationFrame === 'undefined') return
  if (scrollCheckRaf) cancelAnimationFrame(scrollCheckRaf)
  scrollCheckRaf = requestAnimationFrame(() => {
    scrollCheckRaf = 0
    if (!infiniteScrollActive()) return
    if (props.matchesLoadingMore || !props.matchesHasMore) return
    const el = sentinelRef.value
    if (!el) return
    if (!isSentinelInLoadZone(el)) return
    void props.loadMoreMatches?.()
  })
}

function teardownInfiniteScroll() {
  scrollObserver?.disconnect()
  scrollObserver = null
  resizeObserver?.disconnect()
  resizeObserver = null
  for (const u of scrollCleanups) u()
  scrollCleanups.length = 0
  if (scrollCheckRaf && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(scrollCheckRaf)
    scrollCheckRaf = 0
  }
}

function infiniteScrollActive() {
  return (
    !!props.loadMoreMatches && props.matchesHasMore && props.tabVisible !== false
  )
}

function setupInfiniteScroll() {
  teardownInfiniteScroll()
  if (!infiniteScrollActive()) return
  void nextTick(() => {
    if (typeof window === 'undefined') return
    const el = sentinelRef.value
    if (!el) return
    const scrollElements = gatherVerticalScrollTargets(el)

    const onScroll = () => scheduleProximityCheck()
    for (const root of scrollElements) {
      root.addEventListener('scroll', onScroll, { passive: true })
      scrollCleanups.push(() => root.removeEventListener('scroll', onScroll))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    scrollCleanups.push(() => window.removeEventListener('scroll', onScroll))

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => scheduleProximityCheck())
      resizeObserver.observe(el)
    }

    if (typeof IntersectionObserver !== 'undefined') {
      const ioRoot =
        scrollElements.find((r) => r.tagName === 'MAIN') ??
        scrollElements.find((r) => isVerticallyScrollable(r)) ??
        null
      scrollObserver = new IntersectionObserver(
        (entries) => {
          const hit = entries.some((e) => e.isIntersecting)
          if (!hit || props.matchesLoadingMore || !props.matchesHasMore) return
          const node = sentinelRef.value
          if (!node || !isSentinelInLoadZone(node)) return
          void props.loadMoreMatches?.()
        },
        {
          root: ioRoot,
          rootMargin: ioRoot
            ? `0px 0px ${MATCHES_INFINITE_PREFETCH_PX}px 0px`
            : `0px 0px ${MATCHES_INFINITE_PREFETCH_PX + 40}px 0px`,
          threshold: 0.01,
        },
      )
      scrollObserver.observe(el)
    }

    void nextTick(() => scheduleProximityCheck())
  })
}

watch(
  () =>
    [
      props.matchesHasMore,
      props.tabVisible,
      props.loadedCount,
      props.matchesLoadingMore,
    ] as const,
  () => setupInfiniteScroll(),
  { flush: 'post', immediate: true },
)

onMounted(() => {
  void nextTick(() => setupInfiniteScroll())
})

watch(
  () => props.matchesLoadingMore,
  (loading, was) => {
    if (was && !loading && infiniteScrollActive()) {
      void nextTick(() => setupInfiniteScroll())
    }
  },
)

onBeforeUnmount(() => teardownInfiniteScroll())
</script>

<template>
  <div
    ref="sentinelRef"
    class="mt-2 flex flex-col gap-3 rounded-lg border border-dashed border-surface-300 bg-surface-50/80 px-3 py-3 dark:border-surface-600 dark:bg-surface-800/50 sm:flex-row sm:items-center sm:justify-between"
    aria-live="polite"
  >
    <div class="min-w-0 space-y-1">
      <p class="text-xs font-medium text-surface-800 dark:text-surface-100">
        {{
          t('admin.tournament_page.matches_paging_status', {
            loaded: loadedCount,
            total: totalCount,
          })
        }}
      </p>
      <p class="text-xs text-muted-color">
        {{ t('admin.tournament_page.matches_scroll_hint') }}
      </p>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <Button
        type="button"
        size="small"
        outlined
        severity="secondary"
        icon="pi pi-arrow-down"
        :label="t('admin.tournament_page.matches_load_more_button')"
        :loading="matchesLoadingMore"
        :disabled="matchesLoadingMore"
        @click="loadMoreMatches?.()"
      />
    </div>
  </div>
</template>

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const SCROLL_TOP_THRESHOLD = 320

export function usePublicBackToTop() {
  const showBackToTop = ref(false)
  let scrollPollTimer: ReturnType<typeof setInterval> | null = null

  const backToTopStyle = computed(() => ({
    right: import.meta.dev ? '0.5rem' : '0.5rem',
  }))

  function currentScrollTop() {
    if (typeof window === 'undefined') return 0
    const doc = document.documentElement
    const body = document.body
    const shell = document.querySelector('.public-shell') as HTMLElement | null
    return Math.max(
      Number(window.scrollY || 0),
      Number(doc?.scrollTop || 0),
      Number(body?.scrollTop || 0),
      Number(shell?.scrollTop || 0),
    )
  }

  function handleWindowScroll() {
    showBackToTop.value = currentScrollTop() > SCROLL_TOP_THRESHOLD
  }

  function scrollToTop() {
    if (typeof window === 'undefined') return
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  onMounted(() => {
    if (typeof window === 'undefined') return
    handleWindowScroll()
    window.addEventListener('scroll', handleWindowScroll, { passive: true })
    document.addEventListener('scroll', handleWindowScroll, { passive: true, capture: true })
    scrollPollTimer = setInterval(handleWindowScroll, 250)
  })

  onBeforeUnmount(() => {
    if (typeof window === 'undefined') return
    window.removeEventListener('scroll', handleWindowScroll)
    document.removeEventListener('scroll', handleWindowScroll, { capture: true } as EventListenerOptions)
    if (scrollPollTimer) {
      clearInterval(scrollPollTimer)
      scrollPollTimer = null
    }
  })

  return { showBackToTop, backToTopStyle, scrollToTop }
}

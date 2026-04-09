import {
  computed,
  onBeforeUnmount,
  onMounted,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue'
import type { PublicTenantMeta } from '~/composables/usePublicTournamentFetch'

function resolvePublicThemeMode(meta: PublicTenantMeta | null): 'light' | 'dark' | 'system' {
  const m = String(meta?.branding?.publicThemeMode ?? '').trim().toLowerCase()
  if (m === 'light' || m === 'dark' || m === 'system') return m
  return 'light'
}

function isDarkResolved(mode: 'light' | 'dark' | 'system'): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return false
}

/**
 * Тема публичного сайта только из брендинга организации (`publicThemeMode` в API / админке).
 */
export function usePublicBrandingTheme(
  tenantMeta: Ref<PublicTenantMeta | null> | ComputedRef<PublicTenantMeta | null>,
) {
  const themeMode = computed(() => resolvePublicThemeMode(tenantMeta.value))
  const isDark = computed(() => isDarkResolved(themeMode.value))

  function applyDom() {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.classList.toggle('dark-mode', isDark.value)
    root.setAttribute('data-public-theme', themeMode.value)
  }

  let mq: MediaQueryList | null = null
  let mqListener: ((this: MediaQueryList, ev: MediaQueryListEvent) => void) | null = null

  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    mq = window.matchMedia('(prefers-color-scheme: dark)')
    mqListener = () => {
      if (themeMode.value === 'system') applyDom()
    }
    mq.addEventListener('change', mqListener!)
  })

  watch(themeMode, applyDom, { immediate: true })

  onBeforeUnmount(() => {
    if (mq && mqListener) mq.removeEventListener('change', mqListener)
    mq = null
    mqListener = null
  })

  return { themeMode, isDark }
}

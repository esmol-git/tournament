import { computed, watchEffect, type Ref } from 'vue'
import type { PublicTenantMeta } from '~/composables/usePublicTournamentFetch'

function normalizeHex(value: unknown, fallback: string) {
  const v = String(value ?? '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback
}

function shiftHex(hex: string, amount: number) {
  const normalized = normalizeHex(hex, '#123c67').slice(1)
  const n = Number.parseInt(normalized, 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + amount))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount))
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount))
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Применяет брендинг/тему/фавикон из настроек тенанта на уровне layout.
 * Так все публичные страницы получают одинаковый внешний вид без "флэша" дефолтов.
 */
export function usePublicLayoutBranding(tenantMeta: Ref<PublicTenantMeta | null>) {
  const brandPrimary = computed(() =>
    normalizeHex(tenantMeta.value?.branding?.publicAccentPrimary, '#123c67'),
  )
  const brandSecondary = computed(() =>
    normalizeHex(tenantMeta.value?.branding?.publicAccentSecondary, '#c80a48'),
  )
  const brandTertiary = computed(() => shiftHex(brandPrimary.value, 58))

  const faviconHref = computed(() => {
    const raw = String(tenantMeta.value?.branding?.publicFaviconUrl ?? '').trim()
    return raw || undefined
  })

  useHead({
    link: () => (faviconHref.value ? [{ rel: 'icon', href: faviconHref.value }] : []),
  })

  watchEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.style.setProperty('--public-brand-primary', brandPrimary.value)
    root.style.setProperty('--public-brand-secondary', brandSecondary.value)
    root.style.setProperty('--public-accent-primary', brandPrimary.value)
    root.style.setProperty('--public-accent-secondary', brandSecondary.value)
    root.style.setProperty('--public-accent-tertiary', brandTertiary.value)
  })

  return { brandPrimary, brandSecondary, brandTertiary, faviconHref }
}


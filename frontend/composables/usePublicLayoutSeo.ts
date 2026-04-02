import { computed, type Ref } from 'vue'
import { usePublicTournamentFetch, type PublicTenantMeta } from '~/composables/usePublicTournamentFetch'

/**
 * Общий SEO по тенанту для всех публичных лейаутов (`public`, `public-tournament`).
 */
export async function usePublicLayoutSeo() {
  const route = useRoute()
  const { fetchTenantMeta } = usePublicTournamentFetch()

  const tenantSlug = computed(() => String(route.params.tenant ?? '').trim())
  const publicLayoutSeoKey = computed(() => `public-layout-seo:${tenantSlug.value}:${route.path}`)
  const { data: tenantMeta } = await useAsyncData(
    publicLayoutSeoKey,
    async () => {
      if (!tenantSlug.value) return null
      try {
        return await fetchTenantMeta(tenantSlug.value)
      } catch {
        return null
      }
    },
    { watch: [tenantSlug] },
  )

  const seoTitle = computed(() => {
    const custom = String(tenantMeta.value?.publicSettings?.publicSeoTitle ?? '').trim()
    if (custom) return custom
    const displayName = String(tenantMeta.value?.publicSettings?.publicOrganizationDisplayName ?? '').trim()
    const fallbackName = displayName || String(tenantMeta.value?.name ?? '').trim() || 'Tournament Platform'
    return `${fallbackName} — турниры и результаты`
  })
  const seoDescription = computed(() => {
    const custom = String(tenantMeta.value?.publicSettings?.publicSeoDescription ?? '').trim()
    if (custom) return custom
    return 'Расписание, таблицы, новости и статистика турниров.'
  })
  const seoImage = computed(() => {
    const og = String(tenantMeta.value?.publicSettings?.publicOgImageUrl ?? '').trim()
    if (og) return og
    const logo = String(tenantMeta.value?.branding?.publicLogoUrl ?? '').trim()
    return logo || undefined
  })

  useSeoMeta({
    title: () => seoTitle.value,
    description: () => seoDescription.value,
    ogTitle: () => seoTitle.value,
    ogDescription: () => seoDescription.value,
    ogImage: () => seoImage.value,
    twitterCard: 'summary_large_image',
  })

  return { tenantMeta: tenantMeta as Ref<PublicTenantMeta | null> }
}

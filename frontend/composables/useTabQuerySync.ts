import { nextTick, type Ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * Держит `activeIndex` TabView в sync с `?tab=<slug>` для обновления страницы и шаринга ссылки.
 */
export function useTabQuerySync(
  activeTab: Ref<number>,
  tabSlugs: readonly string[],
  options?: { queryKey?: string },
) {
  const route = useRoute()
  const router = useRouter()
  const queryKey = options?.queryKey ?? 'tab'
  let syncing = false

  function slugToIndex(slug: string | undefined | null) {
    if (slug == null || slug === '') return 0
    const i = tabSlugs.indexOf(String(slug).toLowerCase())
    return i >= 0 ? i : 0
  }

  function indexToSlug(i: number) {
    return tabSlugs[i] ?? tabSlugs[0]
  }

  function syncFromRoute() {
    const next = slugToIndex(route.query[queryKey] as string | undefined)
    const slug = indexToSlug(next)
    const q = route.query[queryKey] as string | undefined
    if (activeTab.value === next && q === slug) return

    syncing = true
    activeTab.value = next
    if (q !== slug) {
      void router.replace({ query: { ...route.query, [queryKey]: slug } })
    }
    nextTick(() => {
      syncing = false
    })
  }

  watch(activeTab, (i) => {
    if (syncing) return
    const slug = indexToSlug(i)
    if ((route.query[queryKey] as string | undefined) === slug) return
    void router.replace({ query: { ...route.query, [queryKey]: slug } })
  })

  watch(() => route.query[queryKey], () => {
    syncFromRoute()
  })

  return { syncFromRoute }
}

import type { RouterConfig } from '@nuxt/schema'

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    // 1) Back/forward should restore position.
    if (savedPosition) return savedPosition

    // 2) If only query/hash changes (same path), keep scroll position.
    // This is critical for pages like `/tournaments/table` that sync `tid/view`
    // via `router.replace()` — otherwise you can briefly see the footer "flash".
    if (to.path === from.path) return false

    // 3) Default: new page starts at top.
    return { left: 0, top: 0 }
  },
}


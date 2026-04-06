import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { Pinia } from 'pinia'
import { watch } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { ADMIN_TENANT_QUERY_STALE_MS } from '~/composables/admin/adminTenantQueryKeys'

export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: ADMIN_TENANT_QUERY_STALE_MS,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  })

  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient })

  if (import.meta.client && nuxtApp.$pinia) {
    const authStore = useAuthStore(nuxtApp.$pinia as Pinia)
    watch(
      () => authStore.token,
      (next, prev) => {
        if (prev && !next) {
          void queryClient.clear()
        }
      },
    )
  }
})

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

  /**
   * Публичные страницы `/{tenant}/…` (без JWT): баланс кэша и актуальности.
   * Счёт/протокол меняются с мобилки — пользователь не должен вручную сбрасывать кэш,
   * но и не нужен постоянный polling. Обновление при возврате на вкладку и после сети
   * даёт «свежие» данные без лишней нагрузки, пока вкладка в фоне.
   */
  queryClient.setQueryDefaults(['public'], {
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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

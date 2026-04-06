import { ref } from 'vue'
import { getApiErrorMessage } from '~/utils/apiError'
import { sleepRemainingAfter } from '~/utils/minimumLoadingDelay'

export type UseAdminAsyncStateOptions = {
  minLoadingMs?: number
  initialLoading?: boolean
}

/**
 * Асинхронная операция в админке без списка: loading / error / «Повторить».
 * Для таблиц и списков предпочтительнее {@link useAdminAsyncListState}.
 */
export function useAdminAsyncState(options?: UseAdminAsyncStateOptions) {
  const loading = ref(options?.initialLoading === true)
  const error = ref<string | null>(null)
  let lastTask: (() => Promise<void>) | null = null
  const minMs = options?.minLoadingMs ?? 0

  async function run(task: () => Promise<void>): Promise<void> {
    lastTask = task
    const started = Date.now()
    error.value = null
    loading.value = true
    try {
      await task()
    } catch (e: unknown) {
      error.value = getApiErrorMessage(e) || 'Не удалось загрузить данные'
    } finally {
      if (minMs > 0) {
        await sleepRemainingAfter(minMs, started)
      }
      loading.value = false
    }
  }

  async function retry() {
    if (lastTask) await run(lastTask)
  }

  function clearError() {
    error.value = null
  }

  return { loading, error, run, retry, clearError }
}

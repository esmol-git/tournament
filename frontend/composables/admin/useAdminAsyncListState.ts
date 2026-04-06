import { computed, ref, type Ref } from 'vue'
import { getApiErrorMessage } from '~/utils/apiError'
import { sleepRemainingAfter } from '~/utils/minimumLoadingDelay'

export type UseAdminAsyncListStateOptions = {
  /** Начальное значение списка. */
  initial?: unknown[]
  /**
   * Минимальная длительность флага loading (скелетон), мс.
   * `0` — без искусственной задержки.
   */
  minLoadingMs?: number
  /** После ошибки загрузки обнулить список (как при «пустом» ответе). */
  clearItemsOnError?: boolean
  /**
   * Стартовать с `loading: true` (первый кадр — скелетон до `run`), как в справочниках на `onMounted`.
   * Если `run` не вызвали (редирект на логин), сбросьте `loading.value = false` вручную.
   */
  initialLoading?: boolean
}

/**
 * Состояние загрузки списка в админке: loading / error / данные.
 * Тело `run()` выполняется в try/catch; внутри обычно присваивают `items.value`.
 */
export function useAdminAsyncListState<T>(options?: UseAdminAsyncListStateOptions) {
  const items = ref([]) as Ref<T[]>
  if (options?.initial?.length) {
    items.value = options.initial as T[]
  }

  const loading = ref(options?.initialLoading === true)
  const error = ref<string | null>(null)
  let lastTask: (() => Promise<void>) | null = null

  const minMs = options?.minLoadingMs ?? 0
  const clearOnErr = options?.clearItemsOnError === true

  const isEmpty = computed(() => !loading.value && !error.value && items.value.length === 0)
  const showContent = computed(() => !loading.value && !error.value && items.value.length > 0)

  async function run(task: () => Promise<void>): Promise<void> {
    lastTask = task
    const started = Date.now()
    error.value = null
    loading.value = true
    try {
      await task()
    } catch (e: unknown) {
      if (clearOnErr) items.value = []
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

  return { items, loading, error, isEmpty, showContent, run, retry, clearError }
}

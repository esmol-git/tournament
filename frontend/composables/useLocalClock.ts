import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Местное время устройства с обновлением раз в секунду (как в `PublicHeader`).
 */
export function useLocalClock() {
  const { locale } = useI18n()
  const now = ref(new Date())
  let timer: ReturnType<typeof setInterval> | null = null

  const localeTag = computed(() => {
    const l = locale.value
    if (l === 'en') return 'en-US'
    if (l === 'ru') return 'ru-RU'
    return l || 'en-US'
  })

  const clockIso = computed(() => now.value.toISOString())

  const clockDateLabel = computed(() =>
    new Intl.DateTimeFormat(localeTag.value, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now.value),
  )

  const clockDateCompact = computed(() =>
    new Intl.DateTimeFormat(localeTag.value, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(now.value),
  )

  const clockTimeLabel = computed(() =>
    new Intl.DateTimeFormat(localeTag.value, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(now.value),
  )

  onMounted(() => {
    if (!import.meta.client) return
    timer = setInterval(() => {
      now.value = new Date()
    }, 1000)
  })

  onBeforeUnmount(() => {
    if (timer != null) {
      clearInterval(timer)
      timer = null
    }
  })

  return {
    clockIso,
    clockDateLabel,
    clockDateCompact,
    clockTimeLabel,
  }
}

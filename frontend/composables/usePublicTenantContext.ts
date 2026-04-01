import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useApiUrl } from '~/composables/useApiUrl'

/**
 * Публичные страницы используют `/{tenant}/...`.
 *
 * В практике бывает, что в `tenant` попадает строка вида:
 *   `<tenantSlug>/<tournamentId>`
 * (например из-за того, как формируется ссылка; в UI это видно как слеш).
 *
 * Тогда:
 * - `tenantSlug` берём до первого `/`
 * - `tournamentId` (tid) берём после первого `/` (если query.tid не задан)
 */
export function usePublicTenantContext() {
  const route = useRoute()

  const { apiUrl } = useApiUrl()
  const selectedTidByTenant = useState<Record<string, string | null>>(
    'public-selected-tid-by-tenant',
    () => ({}),
  )

  const rawTenant = computed(() => {
    const v = route.params.tenant
    return typeof v === 'string' && v.trim() ? v : ''
  })

  const parsed = computed(() => {
    const parts = rawTenant.value.split('/')
    const tenantSlug = parts[0] || ''
    const tidFromRaw = parts.length > 1 ? parts.slice(1).join('/') : null
    return { tenantSlug, tidFromRaw }
  })

  const tenantSlugPrimary = computed(() => parsed.value.tenantSlug)
  const tidFromRaw = computed(() => parsed.value.tidFromRaw)

  // Резолвим реальный slug через запрос к бэкенду: так любые “кривые” ссылки
  // (где tenantParam содержит /) начинают работать автоматически.
  const tenantSlug = ref<string>(tenantSlugPrimary.value)
  const tidFallback = ref<string | null>(tidFromRaw.value)
  const resolved = ref(false)
  const tenantNotFound = ref(false)

  const tidFromQuery = computed(() => {
    const v = route.query.tid
    return typeof v === 'string' && v.trim() ? v : null
  })

  const selectedTid = computed(() => {
    const q = tidFromQuery.value
    if (q) return q
    const byTenant = selectedTidByTenant.value[tenantSlug.value] ?? null
    return byTenant ?? tidFallback.value ?? null
  })

  async function ensureTenantResolved() {
    if (resolved.value) return

    const primary = tenantSlugPrimary.value
    const alt = tidFromRaw.value

    // Try candidates in order: (1) primary slug, (2) alt segment.
    // Важно: публичные страницы не должны "молчаливо" подменять tenant на `default`.
    // Если тенант не найден — лучше вернуть 404 на backend, чтобы не отдавать данные другого тенанта.
    const candidates = Array.from(
      new Set([primary, alt].filter((x): x is string => !!x && !!x.trim())),
    )

    tenantNotFound.value = false
    if (!candidates.length) {
      tenantNotFound.value = true
      resolved.value = true
      tenantSlug.value = primary
      tidFallback.value = alt ?? null
      return
    }

    for (const c of candidates) {
      try {
        const meta = await $fetch<{ slug: string }>(
          apiUrl(`/public/tenants/${encodeURIComponent(c)}`),
        )
        tenantSlug.value = meta?.slug ?? c

        // If we resolved tenant from the primary segment, tid comes from the rest.
        if (c === primary) {
          tidFallback.value = alt ?? null
        } else if (c === alt) {
          // If we resolved tenant from the alt segment, tid is the primary segment.
          tidFallback.value = primary ?? null
        } else {
          tidFallback.value = alt ?? null
        }

        resolved.value = true
        tenantNotFound.value = false
        return
      } catch (e: any) {
        const status = e?.response?.status ?? e?.statusCode
        // Tenant not found -> try next candidate.
        if (status === 404) continue
        // Other failures: keep trying candidates anyway.
        continue
      }
    }

    // Не смогли резолвить ни один кандидат -> прекращаем работу.
    tenantSlug.value = primary
    tidFallback.value = alt ?? null
    resolved.value = true
    tenantNotFound.value = true
  }

  watch(
    () => rawTenant.value,
    () => {
      tenantSlug.value = tenantSlugPrimary.value
      tidFallback.value = tidFromRaw.value
      resolved.value = false
      tenantNotFound.value = false
    },
  )

  watch(
    [() => tenantSlug.value, () => tidFromQuery.value] as const,
    ([slug, tid]) => {
      const key = String(slug || '').trim()
      if (!key) return
      if (tid && tid.trim()) {
        selectedTidByTenant.value[key] = tid.trim()
      }
    },
    { immediate: true },
  )

  return { rawTenant, tenantSlug, selectedTid, ensureTenantResolved, tenantNotFound }
}


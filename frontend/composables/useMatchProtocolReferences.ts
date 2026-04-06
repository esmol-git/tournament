import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useI18n } from '#imports'
import { computed } from 'vue'
import {
  adminTenantQueryKeys,
  ADMIN_TENANT_QUERY_STALE_MS,
} from '~/composables/admin/adminTenantQueryKeys'
import { useApiUrl } from '~/composables/useApiUrl'
import { useAuth } from '~/composables/useAuth'
import { useTenantId } from '~/composables/useTenantId'
import type { MatchScheduleReasonRow } from '~/types/admin/match-schedule-reason'
import type { ProtocolEventTypeRow } from '~/types/admin/protocol-event-type'
import { BUILTIN_EVENT_TYPE_VALUES } from '~/utils/tournamentAdminUi'

export type EventKindOption = {
  value: string
  label: string
  type: string
  protocolEventTypeId: string | null
}

export function useMatchProtocolReferences() {
  const { t, locale } = useI18n()
  const { token, authFetch } = useAuth()
  const { apiUrl } = useApiUrl()
  const tenantId = useTenantId()
  const queryClient = useQueryClient()

  const refsEnabled = computed(() => !!token.value && !!tenantId.value)

  const authHeader = () => ({
    headers: { Authorization: `Bearer ${token.value!}` },
  })

  const protocolQuery = useQuery({
    queryKey: computed(() => adminTenantQueryKeys.protocolEventTypes(tenantId.value)),
    enabled: refsEnabled,
    staleTime: ADMIN_TENANT_QUERY_STALE_MS,
    queryFn: async (): Promise<ProtocolEventTypeRow[]> => {
      try {
        return await authFetch<ProtocolEventTypeRow[]>(
          apiUrl(`/tenants/${tenantId.value}/protocol-event-types`),
          authHeader(),
        )
      } catch {
        return []
      }
    },
  })

  const scheduleReasonsQuery = useQuery({
    queryKey: computed(() => adminTenantQueryKeys.matchScheduleReasons(tenantId.value)),
    enabled: refsEnabled,
    staleTime: ADMIN_TENANT_QUERY_STALE_MS,
    queryFn: async (): Promise<MatchScheduleReasonRow[]> => {
      try {
        return await authFetch<MatchScheduleReasonRow[]>(
          apiUrl(`/tenants/${tenantId.value}/match-schedule-reasons`),
          authHeader(),
        )
      } catch {
        return []
      }
    },
  })

  const protocolEventTypes = computed(() => protocolQuery.data.value ?? [])
  const scheduleReasons = computed(() => scheduleReasonsQuery.data.value ?? [])

  /** Явная подгрузка (как раньше loadRefs); с устаревшим кэшем не дублирует запросы. */
  async function loadRefs() {
    if (!token.value || !tenantId.value) return
    const tid = tenantId.value
    const h = authHeader()
    await Promise.all([
      queryClient.fetchQuery({
        queryKey: adminTenantQueryKeys.protocolEventTypes(tid),
        staleTime: ADMIN_TENANT_QUERY_STALE_MS,
        queryFn: async () => {
          try {
            return await authFetch<ProtocolEventTypeRow[]>(
              apiUrl(`/tenants/${tid}/protocol-event-types`),
              h,
            )
          } catch {
            return []
          }
        },
      }),
      queryClient.fetchQuery({
        queryKey: adminTenantQueryKeys.matchScheduleReasons(tid),
        staleTime: ADMIN_TENANT_QUERY_STALE_MS,
        queryFn: async () => {
          try {
            return await authFetch<MatchScheduleReasonRow[]>(
              apiUrl(`/tenants/${tid}/match-schedule-reasons`),
              h,
            )
          } catch {
            return []
          }
        },
      }),
    ])
  }

  const eventKindOptions = computed<EventKindOption[]>(() => {
    void locale.value
    const customs = protocolEventTypes.value
      .filter((p) => p.active)
      .map((p) => ({
        value: `pet:${p.id}`,
        label: p.name,
        type: p.mapsToType,
        protocolEventTypeId: p.id,
      }))
    const builtins = BUILTIN_EVENT_TYPE_VALUES.map((value) => ({
      value: `builtin:${value}`,
      label: t(`admin.tournament_page.builtin_event_${value}`),
      type: value,
      protocolEventTypeId: null as string | null,
    }))
    return [...customs, ...builtins]
  })

  const postponeReasonOptions = computed(() =>
    scheduleReasons.value
      .filter((r) => r.active && (r.scope === 'POSTPONE' || r.scope === 'BOTH'))
      .map((r) => ({ label: r.name, value: r.id })),
  )

  const cancelReasonOptions = computed(() =>
    scheduleReasons.value
      .filter((r) => r.active && (r.scope === 'CANCEL' || r.scope === 'BOTH'))
      .map((r) => ({ label: r.name, value: r.id })),
  )

  function getEventKindKey(e: { type: string; protocolEventTypeId?: string | null }) {
    if (e.protocolEventTypeId) return `pet:${e.protocolEventTypeId}`
    return `builtin:${e.type}`
  }

  function applyEventKindKey(
    e: { type: string; protocolEventTypeId?: string | null },
    key: string,
  ) {
    if (key.startsWith('pet:')) {
      const id = key.slice(4)
      const pet = protocolEventTypes.value.find((x) => x.id === id)
      if (pet) {
        e.type = pet.mapsToType
        e.protocolEventTypeId = pet.id
      }
    } else if (key.startsWith('builtin:')) {
      e.type = key.slice(8)
      e.protocolEventTypeId = null
    }
  }

  return {
    protocolEventTypes,
    scheduleReasons,
    loadRefs,
    eventKindOptions,
    postponeReasonOptions,
    cancelReasonOptions,
    getEventKindKey,
    applyEventKindKey,
  }
}

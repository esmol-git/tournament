import { computed, ref } from 'vue'
import type { MatchScheduleReasonRow } from '~/types/admin/match-schedule-reason'
import type { ProtocolEventTypeRow } from '~/types/admin/protocol-event-type'
import { eventTypeOptions } from '~/utils/tournamentAdminUi'

export type EventKindOption = {
  value: string
  label: string
  type: string
  protocolEventTypeId: string | null
}

export function useMatchProtocolReferences() {
  const protocolEventTypes = ref<ProtocolEventTypeRow[]>([])
  const scheduleReasons = ref<MatchScheduleReasonRow[]>([])

  async function loadRefs(
    authFetch: <T>(url: string, opts?: Record<string, unknown>) => Promise<T>,
    apiUrl: (path: string) => string,
    token: string,
    tenantId: string,
  ) {
    try {
      const [t, r] = await Promise.all([
        authFetch<ProtocolEventTypeRow[]>(
          apiUrl(`/tenants/${tenantId}/protocol-event-types`),
          { headers: { Authorization: `Bearer ${token}` } },
        ),
        authFetch<MatchScheduleReasonRow[]>(
          apiUrl(`/tenants/${tenantId}/match-schedule-reasons`),
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      ])
      protocolEventTypes.value = t
      scheduleReasons.value = r
    } catch {
      protocolEventTypes.value = []
      scheduleReasons.value = []
    }
  }

  const eventKindOptions = computed<EventKindOption[]>(() => {
    const customs = protocolEventTypes.value
      .filter((p) => p.active)
      .map((p) => ({
        value: `pet:${p.id}`,
        label: p.name,
        type: p.mapsToType,
        protocolEventTypeId: p.id,
      }))
    const builtins = eventTypeOptions.map((o) => ({
      value: `builtin:${o.value}`,
      label: o.label,
      type: o.value,
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

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import type { PublicTenantMeta } from '~/composables/usePublicTournamentFetch'

const props = defineProps<{
  tenantMeta?: PublicTenantMeta | null
}>()

const currentYear = new Date().getFullYear()
const route = useRoute()
const { fetchTenantMeta } = usePublicTournamentFetch()

type PublicBranding = {
  publicLogoUrl?: string | null
  publicAccentPrimary?: string | null
  publicAccentSecondary?: string | null
  publicTagline?: string | null
}
type PublicSettings = {
  publicOrganizationDisplayName?: string | null
  publicContactPhone?: string | null
  publicContactEmail?: string | null
  publicContactAddress?: string | null
  publicContactHours?: string | null
}

const footerBranding = ref<PublicBranding>({})
const footerSettings = ref<PublicSettings>({})
const footerName = ref('Tournament Platform')

const pendingDocuments = [
  'Политика конфиденциальности',
  'Пользовательское соглашение',
  'Политика обработки персональных данных',
  'Согласие на обработку персональных данных',
]

function normalizeHex(value: unknown, fallback: string) {
  const v = String(value ?? '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback
}

const brandPrimary = computed(() => normalizeHex(footerBranding.value.publicAccentPrimary, '#123c67'))
const brandSecondary = computed(() => normalizeHex(footerBranding.value.publicAccentSecondary, '#c80a48'))
const logoUrl = computed(() => String(footerBranding.value.publicLogoUrl ?? '').trim() || '/logo.png')
const tagline = computed(() => String(footerBranding.value.publicTagline ?? '').trim() || 'Современная платформа турниров')
const footerContacts = computed(() => {
  const phone = String(footerSettings.value.publicContactPhone ?? '').trim()
  const email = String(footerSettings.value.publicContactEmail ?? '').trim()
  const address = String(footerSettings.value.publicContactAddress ?? '').trim()
  const hours = String(footerSettings.value.publicContactHours ?? '').trim()
  return { phone, email, address, hours }
})
const hasFooterContacts = computed(() =>
  Boolean(
    footerContacts.value.phone ||
      footerContacts.value.email ||
      footerContacts.value.address ||
      footerContacts.value.hours,
  ),
)
const footerStyle = computed(() => ({
  backgroundColor: brandPrimary.value,
  borderTopColor: brandSecondary.value,
}))

async function loadFooterBranding() {
  const tenant = String(route.params.tenant ?? '').trim()
  if (!tenant) return
  try {
    const meta = props.tenantMeta ?? (await fetchTenantMeta(tenant))
    applyMeta(meta)
  } catch {
    footerName.value = 'Tournament Platform'
    footerBranding.value = {}
    footerSettings.value = {}
  }
}

function applyMeta(meta: PublicTenantMeta | null | undefined) {
  const displayName = String(meta?.publicSettings?.publicOrganizationDisplayName ?? '').trim()
  footerName.value = displayName || String(meta?.name ?? '').trim() || footerName.value || 'Tournament Platform'
  footerBranding.value = meta?.branding ?? footerBranding.value
  footerSettings.value = meta?.publicSettings ?? footerSettings.value
}

watch(() => route.params.tenant, () => {
  void loadFooterBranding()
})

watch(
  () => props.tenantMeta,
  (meta) => {
    if (meta) applyMeta(meta)
  },
  { immediate: true },
)

onMounted(() => {
  void loadFooterBranding()
})
</script>

<template>
  <footer class="mt-auto border-t-4 text-white" :style="footerStyle">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <img :src="logoUrl" alt="Tournament Platform" class="h-9 w-auto object-contain" loading="lazy" />
          <div>
            <p class="text-sm font-semibold tracking-wide">{{ footerName }}</p>
            <p class="text-xs text-white/70">{{ tagline }}</p>
          </div>
        </div>
        <p class="text-xs text-white/80">© {{ currentYear }} {{ footerName }}. Все права защищены.</p>
      </div>

      <div class="rounded-xl border border-white/20 bg-white/5 p-3">
        <div v-if="hasFooterContacts" class="mb-3 grid grid-cols-1 gap-2 text-xs text-white/85 sm:grid-cols-2">
          <div v-if="footerContacts.phone">Телефон: {{ footerContacts.phone }}</div>
          <div v-if="footerContacts.email">Email: {{ footerContacts.email }}</div>
          <div v-if="footerContacts.address">Адрес: {{ footerContacts.address }}</div>
          <div v-if="footerContacts.hours">Часы работы: {{ footerContacts.hours }}</div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span
            v-for="doc in pendingDocuments"
            :key="doc"
            class="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs text-white/90"
          >
            {{ doc }}
            <i class="pi pi-clock ml-1 text-[0.65rem] text-white/70" />
          </span>
        </div>
        <p class="mt-2 text-xs text-white/70">Документы появятся после загрузки в систему.</p>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AdminTournamentGalleryPanel from '~/app/components/admin/AdminTournamentGalleryPanel.vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { TournamentListResponse, TournamentRow } from '~/types/admin/tournaments-index'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const router = useRouter()
const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()
const { t } = useI18n()

const tournamentsLoading = ref(false)
const tournaments = ref<TournamentRow[]>([])
const selectedTournamentId = ref<string | null>(null)

const tournamentSelectOptions = computed(() =>
  tournaments.value.map((x) => ({ label: x.name, value: x.id })),
)

async function loadTournaments() {
  if (!token.value) return
  tournamentsLoading.value = true
  try {
    const acc: TournamentRow[] = []
    let page = 1
    const pageSize = 100
    for (;;) {
      const res = await authFetch<TournamentListResponse>(
        apiUrl(`/tenants/${tenantId.value}/tournaments`),
        {
          headers: { Authorization: `Bearer ${token.value}` },
          params: { page, pageSize },
        },
      )
      const batch = res.items ?? []
      acc.push(...batch)
      const total = res.total ?? acc.length
      if (batch.length < pageSize || acc.length >= total) break
      page += 1
    }
    tournaments.value = acc
  } catch {
    tournaments.value = []
  } finally {
    tournamentsLoading.value = false
  }
}

function onTournamentChange(v: string | null) {
  selectedTournamentId.value = v
  if (v) {
    void router.replace({ query: { ...route.query, tournament: v } })
  } else {
    const next = { ...route.query }
    delete next.tournament
    void router.replace({ query: next })
  }
}

onMounted(() => {
  if (process.client) {
    syncWithStorage()
    if (!loggedIn.value) {
      router.push('/admin/login')
      return
    }
    const q = route.query.tournament as string | undefined
    if (q) selectedTournamentId.value = q
  }
  void loadTournaments()
})
</script>

<template>
  <section class="p-6 space-y-6">
    <header class="space-y-2">
      <h1 class="text-xl font-semibold">{{ t('admin.nav.gallery') }}</h1>
      <p class="text-sm text-muted-color max-w-3xl">{{ t('admin.gallery.hub_intro') }}</p>
    </header>

    <div class="max-w-md">
      <FloatLabel variant="on">
        <Select
          :model-value="selectedTournamentId"
          input-id="hub_gallery_tournament"
          class="w-full"
          :options="[
            { label: t('admin.gallery.select_tournament_placeholder'), value: null },
            ...tournamentSelectOptions,
          ]"
          option-label="label"
          option-value="value"
          :show-clear="true"
          :loading="tournamentsLoading"
          @update:model-value="onTournamentChange"
        />
        <label for="hub_gallery_tournament">{{ t('admin.gallery.field_tournament') }}</label>
      </FloatLabel>
    </div>

    <div
      v-if="!selectedTournamentId"
      class="rounded-xl border border-dashed border-surface-300 bg-surface-50 px-6 py-12 text-center text-sm text-muted-color dark:border-surface-600 dark:bg-surface-900/40"
    >
      {{ t('admin.gallery.hub_empty') }}
    </div>

    <AdminTournamentGalleryPanel v-else :tournament-id="selectedTournamentId" />
  </section>
</template>

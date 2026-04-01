<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'

definePageMeta({ layout: 'public' })

type OrgTeam = {
  id: string
  name: string
  logoUrl: string | null
  category: string | null
  tournaments: string[]
}

const { tenantSlug, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const { loadAllTournaments, fetchRoster } = usePublicTournamentFetch()

const loading = ref(true)
const errorText = ref('')
const teams = ref<OrgTeam[]>([])
const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'

const hasTeams = computed(() => teams.value.length > 0)

function resolveImageUrl(url: string | null | undefined, fallback: string) {
  if (typeof url !== 'string') return fallback
  const normalized = url.trim()
  return normalized.length > 0 ? normalized : fallback
}

function handleImageError(event: Event, fallback: string) {
  const target = event.target
  if (!(target instanceof HTMLImageElement)) return
  if (target.src.endsWith(fallback)) return
  target.src = fallback
}

onMounted(async () => {
  loading.value = true
  errorText.value = ''
  try {
    await ensureTenantResolved()
    if (tenantNotFound.value) {
      errorText.value = 'Тенант не найден. Проверьте ссылку.'
      return
    }
    const tournaments = await loadAllTournaments(tenant.value)
    const rosterChunks = await Promise.all(
      tournaments.slice(0, 20).map(async (t) => ({
        tournamentName: t.name,
        roster: await fetchRoster(tenant.value, t.id),
      })),
    )

    const byId = new Map<string, OrgTeam>()
    for (const chunk of rosterChunks) {
      for (const team of chunk.roster) {
        const existing = byId.get(team.teamId)
        if (!existing) {
          byId.set(team.teamId, {
            id: team.teamId,
            name: team.teamName,
            logoUrl: team.logoUrl ?? null,
            category: team.category ?? null,
            tournaments: [chunk.tournamentName],
          })
          continue
        }
        if (!existing.tournaments.includes(chunk.tournamentName)) {
          existing.tournaments.push(chunk.tournamentName)
        }
      }
    }

    teams.value = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  } catch {
    errorText.value = 'Не удалось загрузить команды организации.'
    teams.value = []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="public-shell">
    <PublicHeader :tenant="tenant" />
    <section class="public-container">
      <div class="public-hero">
        <p class="text-xs font-semibold uppercase tracking-wide text-[#4f6b8c]">Участники организации</p>
        <h1 class="mt-2 text-2xl font-semibold text-[#123c67]">Команды</h1>
      </div>

      <div v-if="errorText" class="public-error mt-4">{{ errorText }}</div>
      <div v-else class="mt-4 public-stage">
        <Transition name="public-fade" mode="out-in">
          <div v-if="loading" key="loading" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="i in 6" :key="`pt-sk-${i}`" class="public-card">
              <Skeleton shape="circle" size="3rem" />
              <Skeleton class="mt-2" width="65%" height="1rem" />
              <Skeleton class="mt-2" width="90%" height="0.85rem" />
            </div>
          </div>
          <div
            v-else-if="!hasTeams"
            key="empty"
            class="rounded-3xl border border-[#d6e0ee] bg-white px-6 py-10 text-center shadow-sm"
          >
            <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#f4f7fc] ring-1 ring-[#d6e0ee]">
              <i class="pi pi-users text-xl text-[#4f6b8c]" />
            </div>
            <h2 class="text-3xl font-semibold text-[#123c67]">Команд пока нет</h2>
            <p class="mt-3 text-lg text-[#4f6b8c]">
              После публикации турниров и заявок здесь автоматически появится список команд организации.
            </p>
          </div>
          <div v-else key="content" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <article v-for="team in teams" :key="team.id" class="public-card">
              <div class="flex items-center gap-3">
                <div class="h-12 w-12 overflow-hidden rounded-full">
                  <img
                    :src="resolveImageUrl(team.logoUrl, TEAM_PLACEHOLDER_SRC)"
                    :alt="team.name"
                    class="h-full w-full object-cover"
                    loading="lazy"
                    @error="(e) => handleImageError(e, TEAM_PLACEHOLDER_SRC)"
                  />
                </div>
                <div class="min-w-0">
                  <p class="truncate text-base font-semibold text-[#123c67]">{{ team.name }}</p>
                  <p v-if="team.category" class="truncate text-xs text-[#4f6b8c]">{{ team.category }}</p>
                </div>
              </div>
              <p class="mt-3 text-xs text-[#4f6b8c]">
                Турниров: {{ team.tournaments.length }}
              </p>
            </article>
          </div>
        </Transition>
      </div>
    </section>
    <PublicFooter />
  </div>
</template>

<script setup lang="ts">
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import { computed, onMounted, ref } from 'vue'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import { PUBLIC_AUTO_ANIMATE } from '~/constants/publicMotion'
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
const { fetchOrganizationTeams } = usePublicTournamentFetch()

const loading = ref(true)
const errorText = ref('')
const teams = ref<OrgTeam[]>([])
const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'

const [teamsGridRef] = useAutoAnimate({ ...PUBLIC_AUTO_ANIMATE })

const hasTeams = computed(() => teams.value.length > 0)

function resolveImageUrl(url: string | null | undefined, fallback: string) {
  if (typeof url !== 'string') return fallback
  const normalized = url.trim()
  return normalized.length > 0 ? normalized : fallback
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
    const items = await fetchOrganizationTeams(tenant.value)
    teams.value = (items as OrgTeam[]).slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'))
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
          <div
            v-else
            key="content"
            ref="teamsGridRef"
            class="public-stagger-appear grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <article v-for="team in teams" :key="team.id" class="public-card teams-card">
              <div class="teams-card__head">
                <RemoteImage
                  :src="resolveImageUrl(team.logoUrl, TEAM_PLACEHOLDER_SRC)"
                  :alt="team.name"
                  placeholder-icon="users"
                  class="h-12 w-12 shrink-0 rounded-full"
                />
                <div class="min-w-0">
                  <p class="team-name-clamp text-base font-semibold text-[#123c67]">{{ team.name }}</p>
                  <p v-if="team.category" class="team-category-clamp text-xs text-[#4f6b8c]">{{ team.category }}</p>
                </div>
              </div>
              <p class="teams-card__meta text-xs text-[#4f6b8c]">
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

<style scoped>
.teams-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 7.4rem;
}

.teams-card__head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 3rem;
}

.teams-card__meta {
  margin-top: 0.75rem;
}

.team-name-clamp {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  line-height: 1.2;
  max-height: 2.4em;
}

.team-category-clamp {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  line-height: 1.2;
  max-height: 2.4em;
}
</style>

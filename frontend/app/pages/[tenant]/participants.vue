<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { PublicRosterTeam } from '~/composables/usePublicTournamentFetch'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import { usePublicTournamentWorkspace } from '~/composables/usePublicTournamentWorkspace'

definePageMeta({
  layout: 'public-tournament',
  path: '/:tenant/tournaments/participants',
  alias: ['/:tenant/participants'],
})

const { fetchRoster } = usePublicTournamentFetch()
const { tenant, selectedTournamentId, loading, workspaceReady, pageContentLoading } =
  usePublicTournamentWorkspace()

const errorText = ref('')
const loadingRoster = ref(false)
const isInitializing = ref(true)
const roster = ref<PublicRosterTeam[]>([])
const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'
const PLAYER_PLACEHOLDER_SRC = '/placeholders/player.svg'

const showWorkspaceBootSkeleton = computed(() => !workspaceReady.value || loading.value)
const showRosterSkeleton = computed(() => loadingRoster.value && !!selectedTournamentId.value && !roster.value.length)

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

async function fetchParticipants() {
  if (!selectedTournamentId.value) {
    roster.value = []
    return
  }
  loadingRoster.value = true
  errorText.value = ''
  try {
    roster.value = await fetchRoster(tenant.value, selectedTournamentId.value)
  } catch {
    roster.value = []
    errorText.value = 'Не удалось загрузить состав участников.'
  } finally {
    loadingRoster.value = false
  }
}

watch(selectedTournamentId, () => {
  if (isInitializing.value) return
  void fetchParticipants()
})

watch(
  () => showWorkspaceBootSkeleton.value || showRosterSkeleton.value,
  (v) => {
    pageContentLoading.value = v
  },
  { immediate: true },
)

watch(
  workspaceReady,
  async (ready) => {
    if (!ready) return
    try {
      await fetchParticipants()
    } finally {
      isInitializing.value = false
      await nextTick()
    }
  },
  { immediate: true },
)

onMounted(() => {
  // no-op: layout bootstraps workspace
})
</script>

<template>
  <div class="contents">
    <Transition name="public-view-fade" mode="out-in">
      <div
        v-if="showWorkspaceBootSkeleton"
        key="skeleton"
        class="space-y-4 min-h-[65vh]"
      >
        <div class="public-card">
          <Skeleton width="46%" height="2rem" />
          <Skeleton class="mt-3" width="100%" height="2.75rem" />
        </div>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div v-for="i in 4" :key="`p-sk-${i}`" class="public-card">
            <Skeleton width="58%" height="1rem" />
            <Skeleton class="mt-3" width="100%" height="0.9rem" />
            <Skeleton class="mt-2" width="65%" height="0.9rem" />
          </div>
        </div>
      </div>

      <div v-else key="content" class="space-y-4 min-h-[65vh] overflow-hidden">
        <div v-if="errorText" class="public-error">
          {{ errorText }}
        </div>

        <div v-else-if="!selectedTournamentId" class="public-empty">
          Выберите турнир в карточке выше — здесь появятся команды и игроки.
        </div>

        <template v-else>
          <div v-if="showRosterSkeleton" class="public-card">
            <Skeleton width="42%" height="1rem" />
            <Skeleton class="mt-3" width="100%" height="12rem" />
          </div>

          <div v-else-if="!roster.length" class="public-empty">
            В выбранном турнире пока нет команд.
          </div>

          <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2 public-stagger-appear">
            <article v-for="team in roster" :key="team.teamId" class="public-card">
              <div class="flex items-start justify-between gap-3">
                <div class="flex min-w-0 items-start gap-3">
                  <div class="h-12 w-12 shrink-0 overflow-hidden rounded-full">
                    <img
                      :src="resolveImageUrl(team.logoUrl, TEAM_PLACEHOLDER_SRC)"
                      :alt="team.teamName"
                      class="h-full w-full object-cover"
                      loading="lazy"
                      @error="(e) => handleImageError(e, TEAM_PLACEHOLDER_SRC)"
                    />
                  </div>
                  <div class="min-w-0">
                    <h2 class="truncate text-base font-semibold text-[#123c67]">{{ team.teamName }}</h2>
                    <p class="mt-1 text-xs text-[#4f6b8c]">
                      {{ team.category || 'Категория не указана' }}
                    </p>
                  </div>
                </div>
                <span class="rounded-full bg-[#f4f7fc] px-2 py-1 text-xs font-semibold text-[#123c67]">
                  Игроков: {{ team.players.length }}
                </span>
              </div>
              <p v-if="team.coachName" class="mt-3 text-sm text-[#4f6b8c]">
                Тренер: <span class="font-medium text-[#123c67]">{{ team.coachName }}</span>
              </p>

              <div v-if="team.players.length" class="mt-3 rounded-xl border border-[#d6e0ee] bg-[#f7f9fc] p-2">
                <ul class="space-y-2">
                  <li
                    v-for="player in team.players"
                    :key="player.id"
                    class="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5"
                  >
                    <div class="flex min-w-0 items-center gap-2">
                      <div class="h-8 w-8 shrink-0 overflow-hidden rounded-full">
                        <img
                          :src="resolveImageUrl(player.photoUrl, PLAYER_PLACEHOLDER_SRC)"
                          :alt="`${player.lastName} ${player.firstName}`"
                          class="h-full w-full object-cover"
                          loading="lazy"
                          @error="(e) => handleImageError(e, PLAYER_PLACEHOLDER_SRC)"
                        />
                      </div>
                      <span class="truncate text-sm text-[#123c67]">
                        {{ player.lastName }} {{ player.firstName }}
                      </span>
                    </div>
                    <span class="shrink-0 text-xs text-[#4f6b8c]">
                      <template v-if="player.jerseyNumber !== null">#{{ player.jerseyNumber }}</template>
                      <template v-if="player.position"> · {{ player.position }}</template>
                    </span>
                  </li>
                </ul>
              </div>
            </article>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

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
const rosterDialogTeam = ref<PublicRosterTeam | null>(null)
/** Голов в публичном roster нет — сортировка: алфавит или номер в заявке. */
const rosterSortMode = ref<'alpha' | 'jersey'>('alpha')
const ROSTER_PREVIEW = 3
const TEAM_PLACEHOLDER_SRC = '/placeholders/team.svg'
const PLAYER_PLACEHOLDER_SRC = '/placeholders/player.svg'

function sortedPlayers(players: PublicRosterTeam['players']) {
  const arr = players.slice()
  if (rosterSortMode.value === 'alpha') {
    arr.sort((a, b) => {
      const ln = a.lastName.localeCompare(b.lastName, 'ru')
      if (ln !== 0) return ln
      return a.firstName.localeCompare(b.firstName, 'ru')
    })
  } else {
    arr.sort((a, b) => {
      const an = a.jerseyNumber ?? 10_000
      const bn = b.jerseyNumber ?? 10_000
      if (an !== bn) return an - bn
      const ln = a.lastName.localeCompare(b.lastName, 'ru')
      if (ln !== 0) return ln
      return a.firstName.localeCompare(b.firstName, 'ru')
    })
  }
  return arr
}

function previewPlayers(team: PublicRosterTeam) {
  const s = sortedPlayers(team.players)
  return team.players.length > ROSTER_PREVIEW ? s.slice(0, ROSTER_PREVIEW) : s
}

function openRosterDialog(team: PublicRosterTeam) {
  rosterDialogTeam.value = team
}

function closeRosterDialog() {
  rosterDialogTeam.value = null
}

const showWorkspaceBootSkeleton = computed(() => !workspaceReady.value || loading.value)
const showRosterSkeleton = computed(() => loadingRoster.value && !!selectedTournamentId.value && !roster.value.length)

function resolveImageUrl(url: string | null | undefined, fallback: string) {
  if (typeof url !== 'string') return fallback
  const normalized = url.trim()
  return normalized.length > 0 ? normalized : fallback
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

          <template v-else>
          <div class="public-card !p-3 flex flex-wrap items-center justify-between gap-3">
            <span class="public-text-muted text-sm font-medium">Порядок в составах</span>
            <div class="inline-flex rounded-xl border border-[#d6e0ee] bg-[#f8fbff] p-1">
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm"
                :class="
                  rosterSortMode === 'alpha'
                    ? 'bg-white public-text-primary shadow-sm'
                    : 'public-text-muted hover:bg-white/80'
                "
                @click="rosterSortMode = 'alpha'"
              >
                По фамилии
              </button>
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm"
                :class="
                  rosterSortMode === 'jersey'
                    ? 'bg-white public-text-primary shadow-sm'
                    : 'public-text-muted hover:bg-white/80'
                "
                @click="rosterSortMode = 'jersey'"
              >
                По номеру
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 public-stagger-appear">
            <article v-for="team in roster" :key="team.teamId" class="public-card flex flex-col">
              <div class="flex items-start gap-3">
                <RemoteImage
                  :src="resolveImageUrl(team.logoUrl, TEAM_PLACEHOLDER_SRC)"
                  :alt="team.teamName"
                  placeholder-icon="users"
                  class="h-12 w-12 shrink-0 rounded-full"
                />
                <div class="min-w-0">
                  <h2 class="public-text-primary truncate text-base font-semibold">{{ team.teamName }}</h2>
                  <p class="public-text-muted mt-1 text-xs">
                    {{ team.category || 'Категория не указана' }}
                  </p>
                </div>
              </div>
              <p v-if="team.coachName" class="public-text-muted mt-3 text-sm">
                Тренер: <span class="public-text-primary font-medium">{{ team.coachName }}</span>
              </p>

              <div
                v-if="team.players.length"
                class="public-roster-preview-wrap mt-3 rounded-xl border border-[#d6e0ee] bg-[#f7f9fc] p-2"
              >
                <ul class="space-y-2">
                  <li
                    v-for="player in previewPlayers(team)"
                    :key="player.id"
                    class="public-roster-preview-row flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5"
                  >
                    <div class="flex min-w-0 items-center gap-2">
                      <RemoteImage
                        :src="resolveImageUrl(player.photoUrl, PLAYER_PLACEHOLDER_SRC)"
                        :alt="`${player.lastName} ${player.firstName}`"
                        placeholder-icon="user"
                        icon-class="text-sm"
                        class="h-8 w-8 shrink-0 rounded-full"
                      />
                      <span class="public-text-primary truncate text-sm">
                        {{ player.lastName }} {{ player.firstName }}
                      </span>
                    </div>
                    <span class="public-text-muted shrink-0 text-xs">
                      <template v-if="player.jerseyNumber !== null">#{{ player.jerseyNumber }}</template>
                      <template v-if="player.position"> · {{ player.position }}</template>
                    </span>
                  </li>
                </ul>
              </div>

              <div v-if="team.players.length > ROSTER_PREVIEW" class="mt-4">
                <Button
                  type="button"
                  size="small"
                  outlined
                  icon="pi pi-users"
                  :label="`Все игроки (${team.players.length})`"
                  class="public-roster-all-players-btn public-btn-outline-accent"
                  :aria-label="`Полный состав команды ${team.teamName}`"
                  @click="openRosterDialog(team)"
                />
              </div>
            </article>
          </div>
          </template>
        </template>
      </div>
    </Transition>

    <Dialog
      :visible="rosterDialogTeam !== null"
      modal
      :draggable="false"
      :dismissable-mask="true"
      :style="{ width: 'min(32rem, 96vw)' }"
      :header="rosterDialogTeam?.teamName ?? 'Состав'"
      class="public-roster-dialog"
      @update:visible="(v) => !v && closeRosterDialog()"
    >
      <div v-if="rosterDialogTeam" class="space-y-3">
        <p v-if="rosterDialogTeam.category" class="public-text-muted text-sm">
          {{ rosterDialogTeam.category }}
        </p>
        <p v-if="rosterDialogTeam.coachName" class="public-text-muted text-sm">
          Тренер:
          <span class="public-text-primary font-medium">{{ rosterDialogTeam.coachName }}</span>
        </p>
        <div
          v-if="rosterDialogTeam.players.length"
          class="public-roster-dialog-scroll max-h-[min(28rem,70vh)] overflow-y-auto rounded-xl border border-[#d6e0ee] bg-[#f7f9fc] p-2"
        >
          <ul class="space-y-2">
            <li
              v-for="player in sortedPlayers(rosterDialogTeam.players)"
              :key="player.id"
              class="public-roster-dialog-player-row flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5"
            >
              <div class="flex min-w-0 items-center gap-2">
                <RemoteImage
                  :src="resolveImageUrl(player.photoUrl, PLAYER_PLACEHOLDER_SRC)"
                  :alt="`${player.lastName} ${player.firstName}`"
                  placeholder-icon="user"
                  icon-class="text-sm"
                  class="h-8 w-8 shrink-0 rounded-full"
                />
                <span class="public-text-primary truncate text-sm">
                  {{ player.lastName }} {{ player.firstName }}
                </span>
              </div>
              <span class="public-text-muted shrink-0 text-xs">
                <template v-if="player.jerseyNumber !== null">#{{ player.jerseyNumber }}</template>
                <template v-if="player.position"> · {{ player.position }}</template>
              </span>
            </li>
          </ul>
        </div>
        <p v-else class="public-text-muted text-sm">В заявке пока нет игроков.</p>
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import type { TournamentRow } from '~/types/admin/tournaments-index'

defineProps<{
  tournament: TournamentRow
  formatLabel: string
  statusLabel: string
  statusClass: string
}>()

const emit = defineEmits<{
  (e: 'open', tournament: TournamentRow): void
  (e: 'edit', tournament: TournamentRow): void
  (e: 'delete', tournament: TournamentRow): void
  (e: 'news', tournament: TournamentRow): void
  (e: 'gallery', tournament: TournamentRow): void
}>()

</script>

<template>
  <div
    class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-start gap-5">
        <div
          class="w-40 h-40 shrink-0 rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-100 dark:bg-surface-800 overflow-hidden"
        >
          <img
            v-if="tournament.logoUrl"
            :src="tournament.logoUrl"
            alt="Логотип"
            class="block h-full w-full object-cover"
          />
          <div v-else class="h-full w-full" aria-label="Нет логотипа"></div>
        </div>
        <div class="min-w-0">
          <button class="text-primary hover:underline text-left" @click="emit('open', tournament)">
            <div class="text-base font-medium truncate">{{ tournament.name || 'Открыть турнир' }}</div>
          </button>
          <div class="text-xs text-muted-color">/{{ tournament.slug }}</div>

          <div class="mt-3 space-y-2 text-sm">
            <div class="flex items-baseline gap-2">
              <div class="w-20 text-xs text-muted-color">Формат</div>
              <div class="font-medium text-surface-900 dark:text-surface-100">{{ formatLabel }}</div>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-20 shrink-0 text-xs text-muted-color">Статус</div>
              <span
                class="inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide"
                :class="statusClass"
              >
                {{ statusLabel }}
              </span>
            </div>
            <div class="flex items-baseline gap-2">
              <div class="w-20 text-xs text-muted-color">Команд</div>
              <div class="font-medium text-surface-900 dark:text-surface-100">{{ tournament.teamsCount }}</div>
            </div>
            <div class="flex items-baseline gap-2">
              <div class="w-20 text-xs text-muted-color">Даты</div>
              <div class="font-medium text-surface-900 dark:text-surface-100">
                <span v-if="tournament.startsAt">{{ new Date(tournament.startsAt).toLocaleDateString() }}</span>
                <span v-else class="text-muted-color">—</span>
                <span class="text-muted-color"> → </span>
                <span v-if="tournament.endsAt">{{ new Date(tournament.endsAt).toLocaleDateString() }}</span>
                <span v-else class="text-muted-color">—</span>
              </div>
            </div>
            <div class="flex items-baseline gap-2">
              <div class="w-20 text-xs text-muted-color">Сезон</div>
              <div class="font-medium text-surface-900 dark:text-surface-100">
                <span v-if="tournament.season?.name">{{ tournament.season.name }}</span>
                <span v-else class="text-muted-color">—</span>
              </div>
            </div>
            <div class="flex items-baseline gap-2">
              <div class="w-20 text-xs text-muted-color">Тип</div>
              <div class="font-medium text-surface-900 dark:text-surface-100">
                <span v-if="tournament.competition?.name">{{ tournament.competition.name }}</span>
                <span v-else class="text-muted-color">—</span>
              </div>
            </div>
            <div class="flex items-baseline gap-2">
              <div class="w-20 text-xs text-muted-color">Возраст</div>
              <div class="font-medium text-surface-900 dark:text-surface-100">
                <span v-if="tournament.ageGroup?.shortLabel || tournament.ageGroup?.name">{{
                  tournament.ageGroup?.shortLabel || tournament.ageGroup?.name
                }}</span>
                <span v-else class="text-muted-color">—</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2 shrink-0 items-end">
        <Button icon="pi pi-external-link" text size="small" @click="emit('open', tournament)" aria-label="Открыть" />
        <Button icon="pi pi-megaphone" text size="small" @click="emit('news', tournament)" aria-label="Новости" />
        <Button icon="pi pi-images" text size="small" @click="emit('gallery', tournament)" aria-label="Фотогалерея" />
        <Button icon="pi pi-pencil" text size="small" @click="emit('edit', tournament)" aria-label="Редактировать" />
        <Button
          icon="pi pi-trash"
          text
          severity="danger"
          size="small"
          @click="emit('delete', tournament)"
          aria-label="Удалить"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MenuItem } from 'primevue/menuitem'
import type { TournamentRow } from '~/types/admin/tournaments-index'
import { resolveTournamentCalendarStripeColor } from '~/utils/tournamentCalendarColor'

const props = defineProps<{
  tournament: TournamentRow
  formatLabel: string
  statusLabel: string
  statusClass: string
  /** id турнира, для которого сейчас идёт PATCH published — остальные кнопки активны */
  publishSavingTournamentId?: string | null
  /** Глобальный модератор: только открыть карточку турнира, без правок и медиа. */
  readOnly?: boolean
}>()

const emit = defineEmits<{
  (e: 'open', tournament: TournamentRow): void
  (e: 'edit', tournament: TournamentRow): void
  (e: 'delete', tournament: TournamentRow): void
  (e: 'news', tournament: TournamentRow): void
  (e: 'gallery', tournament: TournamentRow): void
  (e: 'togglePublished', tournament: TournamentRow): void
}>()

const { t, locale } = useI18n()

const toolbarAriaLabel = computed(() =>
  t('admin.tournaments_list.card_toolbar_aria', {
    name: props.tournament.name?.trim() || t('admin.tournaments_list.card_name_untitled'),
  }),
)

const isReadOnlyCard = computed(() => props.readOnly === true)

const publishBlockedByDraft = computed(
  () => !props.tournament.published && props.tournament.status === 'DRAFT',
)

const anyPublishSaving = computed(
  () =>
    props.publishSavingTournamentId != null && props.publishSavingTournamentId !== '',
)

const publishButtonDisabled = computed(
  () => publishBlockedByDraft.value || anyPublishSaving.value,
)

const publishLoading = computed(
  () => props.publishSavingTournamentId === props.tournament.id,
)

const publishTooltip = computed(() => {
  if (publishBlockedByDraft.value) {
    return t('admin.tournament_page.list_card_publish_draft_tooltip')
  }
  return props.tournament.published
    ? t('admin.tournament_page.list_card_unpublish_aria')
    : t('admin.tournament_page.list_card_publish_aria')
})

const publishAriaLabel = computed(() =>
  props.tournament.published
    ? t('admin.tournament_page.list_card_unpublish_aria')
    : t('admin.tournament_page.list_card_publish_aria'),
)

function onTogglePublished() {
  if (publishButtonDisabled.value) return
  emit('togglePublished', props.tournament)
}

const actionsMenuRef = ref<{ toggle: (e: Event) => void } | null>(null)

function toggleActionsMenu(event: Event) {
  actionsMenuRef.value?.toggle(event)
}

const mobileMenuItems = computed((): MenuItem[] => {
  const tourn = props.tournament
  if (props.readOnly) {
    return [
      {
        label: t('admin.tournaments_list.card_open_aria'),
        icon: 'pi pi-external-link',
        command: () => emit('open', tourn),
      },
    ]
  }
  const items: MenuItem[] = []

  if (tourn.published !== undefined) {
    items.push({
      label: tourn.published
        ? t('admin.tournaments_list.card_menu_unpublish')
        : t('admin.tournaments_list.card_menu_publish'),
      icon: tourn.published ? 'pi pi-eye-slash' : 'pi pi-globe',
      disabled: publishButtonDisabled.value || publishLoading.value,
      command: () => {
        if (!publishButtonDisabled.value) onTogglePublished()
      },
    })
  }

  items.push(
    {
      label: t('admin.tournaments_list.card_open_aria'),
      icon: 'pi pi-external-link',
      command: () => emit('open', tourn),
    },
    {
      label: t('admin.tournaments_list.card_news_aria'),
      icon: 'pi pi-megaphone',
      command: () => emit('news', tourn),
    },
    {
      label: t('admin.tournaments_list.card_gallery_aria'),
      icon: 'pi pi-images',
      command: () => emit('gallery', tourn),
    },
    {
      label: t('admin.tournaments_list.card_edit_aria'),
      icon: 'pi pi-pencil',
      command: () => emit('edit', tourn),
    },
    { separator: true },
    {
      label: t('admin.tournaments_list.card_delete_aria'),
      icon: 'pi pi-trash',
      class: 'text-red-600 dark:text-red-400',
      command: () => emit('delete', tourn),
    },
  )

  return items
})

const hasCalendarAccent = computed(
  () =>
    !!props.tournament.calendarColor &&
    /^#[0-9A-Fa-f]{6}$/.test(props.tournament.calendarColor!.trim()),
)

const accentBorderStyle = computed(() =>
  hasCalendarAccent.value
    ? { borderLeftColor: props.tournament.calendarColor!.trim() }
    : undefined,
)

const dateRangeText = computed(() => {
  const loc = locale.value
  const fmt = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString(loc) : null
  const start = fmt(props.tournament.startsAt)
  const end = fmt(props.tournament.endsAt)
  const ph = t('admin.tournaments_list.card_date_placeholder')
  const sep = t('admin.tournaments_list.card_date_range_sep')
  if (!start && !end) return ph
  return `${start ?? ph} ${sep} ${end ?? ph}`
})

/** Сезон / соревнование / возраст — одной строкой, только если что-то задано. */
const contextSubtitle = computed(() => {
  const bits: string[] = []
  const season = props.tournament.season?.name?.trim()
  if (season) bits.push(season)
  const comp = props.tournament.competition?.name?.trim()
  if (comp) bits.push(comp)
  const age =
    props.tournament.ageGroup?.shortLabel?.trim() ||
    props.tournament.ageGroup?.name?.trim()
  if (age) bits.push(age)
  return bits.length ? bits.join(' · ') : ''
})

const siteLabel = computed(() => {
  if (props.tournament.published === undefined) return ''
  return props.tournament.published
    ? t('admin.tournaments_list.card_site_published')
    : t('admin.tournaments_list.card_site_hidden')
})
</script>

<template>
  <div
    class="rounded-lg border border-l-[5px] border-surface-200 bg-surface-0 sm:rounded-xl dark:border-surface-700 dark:bg-surface-900"
    :style="accentBorderStyle"
  >
    <div class="flex gap-2 p-2.5 sm:gap-4 sm:p-3.5">
      <RemoteImage
        :src="tournament.logoUrl"
        :alt="t('admin.tournaments_list.card_logo_alt')"
        placeholder-icon="image"
        icon-class="text-base sm:text-3xl"
        class="h-10 w-10 shrink-0 rounded-md border border-surface-200 bg-surface-100 dark:border-surface-600 dark:bg-surface-800 sm:h-[4.75rem] sm:w-[4.75rem] sm:rounded-lg"
      />

      <div class="flex min-w-0 flex-1 flex-col gap-1.5 sm:gap-2">
        <div
          class="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
        >
          <div
            class="flex min-w-0 w-full items-start gap-2 sm:block sm:flex-1 sm:basis-0"
          >
            <div class="min-w-0 flex-1">
              <button
                type="button"
                data-testid="tournament-card-open"
                class="block w-full text-left text-primary hover:underline"
                @click="emit('open', tournament)"
              >
                <span
                  class="text-pretty text-sm font-semibold leading-snug text-surface-900 sm:line-clamp-2 sm:text-base dark:text-surface-0"
                >
                  {{ tournament.name || t('admin.tournaments_list.card_open_fallback') }}
                </span>
              </button>
              <div
                class="mt-0.5 max-w-full break-all font-mono text-[11px] leading-tight text-muted-color sm:text-xs"
              >
                /{{ tournament.slug }}
              </div>
            </div>
            <div v-if="!readOnly" class="shrink-0 pt-0.5 sm:hidden">
              <Button
                type="button"
                icon="pi pi-ellipsis-v"
                text
                rounded
                size="small"
                class="!h-9 !w-9 !min-w-9"
                :aria-label="t('admin.tournaments_list.card_actions_menu_aria')"
                aria-haspopup="true"
                @click="toggleActionsMenu($event)"
              />
              <Menu
                ref="actionsMenuRef"
                :model="mobileMenuItems"
                :popup="true"
                append-to="body"
              />
            </div>
            <div v-else-if="isReadOnlyCard" class="shrink-0 pt-0.5 sm:hidden">
              <Button
                type="button"
                icon="pi pi-external-link"
                text
                rounded
                size="small"
                class="!h-9 !w-9 !min-w-9"
                :aria-label="t('admin.tournaments_list.card_open_aria')"
                @click="emit('open', tournament)"
              />
            </div>
          </div>

          <div
            class="admin-tournament-card-actions hidden w-auto shrink-0 flex-wrap justify-end gap-0.5 sm:flex"
            role="toolbar"
            :aria-label="toolbarAriaLabel"
          >
            <Button
              v-if="!isReadOnlyCard && tournament.published !== undefined"
              v-tooltip.top="publishTooltip"
              :icon="tournament.published ? 'pi pi-eye-slash' : 'pi pi-globe'"
              text
              rounded
              size="small"
              :disabled="publishButtonDisabled"
              :loading="publishLoading"
              :aria-label="publishAriaLabel"
              @click="onTogglePublished"
            />
            <Button
              icon="pi pi-external-link"
              text
              rounded
              size="small"
              :aria-label="t('admin.tournaments_list.card_open_aria')"
              @click="emit('open', tournament)"
            />
            <Button
              v-if="!isReadOnlyCard"
              icon="pi pi-megaphone"
              text
              rounded
              size="small"
              :aria-label="t('admin.tournaments_list.card_news_aria')"
              @click="emit('news', tournament)"
            />
            <Button
              v-if="!isReadOnlyCard"
              icon="pi pi-images"
              text
              rounded
              size="small"
              :aria-label="t('admin.tournaments_list.card_gallery_aria')"
              @click="emit('gallery', tournament)"
            />
            <Button
              v-if="!isReadOnlyCard"
              icon="pi pi-pencil"
              text
              rounded
              size="small"
              :aria-label="t('admin.tournaments_list.card_edit_aria')"
              @click="emit('edit', tournament)"
            />
            <Button
              v-if="!isReadOnlyCard"
              icon="pi pi-trash"
              text
              rounded
              severity="danger"
              size="small"
              :aria-label="t('admin.tournaments_list.card_delete_aria')"
              @click="emit('delete', tournament)"
            />
          </div>
        </div>

        <div
          class="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs sm:mt-2 sm:gap-x-2 sm:gap-y-1.5 sm:text-sm"
        >
          <span
            class="inline-flex max-w-full items-center rounded-full border px-2 py-px text-[11px] font-semibold tracking-wide sm:px-2.5 sm:py-0.5 sm:text-xs"
            :class="statusClass"
          >
            {{ statusLabel }}
          </span>

          <template v-if="tournament.published !== undefined">
            <span class="text-muted-color max-sm:hidden" aria-hidden="true">·</span>
            <span class="font-medium text-surface-700 dark:text-surface-200">
              {{ siteLabel }}
            </span>
          </template>

          <span class="text-muted-color max-sm:hidden" aria-hidden="true">·</span>

          <span
            class="max-w-full truncate rounded bg-surface-100 px-1.5 py-px font-medium text-surface-800 dark:bg-surface-800 dark:text-surface-100 sm:rounded-md sm:px-2 sm:py-0.5"
          >
            {{ formatLabel }}
          </span>

          <span class="text-muted-color max-sm:hidden" aria-hidden="true">·</span>

          <span class="text-surface-800 dark:text-surface-100">
            {{ t('admin.tournaments_list.card_teams', { n: tournament.teamsCount }) }}
          </span>

          <span class="text-muted-color max-sm:hidden" aria-hidden="true">·</span>

          <span
            class="tabular-nums text-surface-700 dark:text-surface-200"
          >
            {{ dateRangeText }}
          </span>
        </div>

        <p
          v-if="contextSubtitle"
          class="mt-1.5 border-t border-surface-100 pt-1.5 text-[11px] leading-snug text-muted-color sm:text-xs dark:border-surface-800"
        >
          {{ contextSubtitle }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
type Option = { label: string; value: string }

const props = defineProps<{
  tournamentsTotal: number
  tournamentsLoaded: number
  tournamentsSearch: string
  statusFilter: string
  statusTabOptions: { label: string; value: string }[]
  seasonFilter: string
  seasonFilterOptions: Option[]
  seasonsLoading: boolean
  competitionFilter: string
  competitionFilterOptions: Option[]
  competitionsLoading: boolean
  ageGroupFilter: string
  ageGroupFilterOptions: Option[]
  ageGroupsLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:statusFilter', value: string): void
  (e: 'update:seasonFilter', value: string): void
  (e: 'update:competitionFilter', value: string): void
  (e: 'update:ageGroupFilter', value: string): void
  (e: 'searchInput', value: string): void
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="flex flex-col gap-2 rounded-lg border border-surface-200 bg-surface-0 px-3 py-2.5 dark:border-surface-700 dark:bg-surface-900 sm:gap-3 sm:rounded-xl sm:px-4 sm:py-3"
  >
    <!-- Строка 1: только статусы (как раньше), на всю ширину -->
    <div
      class="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
    >
      <span
        class="shrink-0 text-sm font-medium text-surface-700 dark:text-surface-200"
      >
        {{ t('admin.tournaments_list.filters_status') }}
      </span>
      <Select
        :modelValue="props.statusFilter"
        :options="props.statusTabOptions"
        option-label="label"
        option-value="value"
        class="w-full min-w-0 sm:hidden"
        @update:modelValue="(v) => emit('update:statusFilter', v)"
      />
      <div
        class="hidden min-w-0 overflow-x-auto pb-0.5 sm:block [-webkit-overflow-scrolling:touch]"
      >
        <SelectButton
          :modelValue="props.statusFilter"
          :options="props.statusTabOptions"
          option-label="label"
          option-value="value"
          class="tournament-status-filter inline-flex w-max max-w-none [&_.p-togglebutton]:shrink-0 [&_.p-togglebutton-label]:whitespace-nowrap"
          @update:modelValue="(v) => emit('update:statusFilter', v)"
        />
      </div>
    </div>

    <!-- Строка 2+: селекты и поиск — в одну линию насколько хватает ширины, перенос по необходимости -->
    <div
      class="grid min-w-0 items-end gap-2 sm:gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%_,13.5rem),1fr))]"
    >
      <FloatLabel
        v-if="props.seasonFilterOptions.length > 1"
        variant="on"
        class="min-w-0"
      >
        <Select
          :modelValue="props.seasonFilter"
          :options="props.seasonFilterOptions"
          option-label="label"
          option-value="value"
          class="w-full min-w-0"
          :loading="props.seasonsLoading"
          @update:modelValue="(v) => emit('update:seasonFilter', v)"
        />
        <label>{{ t('admin.tournaments_list.filters_season') }}</label>
      </FloatLabel>

      <FloatLabel
        v-if="props.competitionFilterOptions.length > 1"
        variant="on"
        class="min-w-0"
      >
        <Select
          :modelValue="props.competitionFilter"
          :options="props.competitionFilterOptions"
          option-label="label"
          option-value="value"
          class="w-full min-w-0"
          :loading="props.competitionsLoading"
          @update:modelValue="(v) => emit('update:competitionFilter', v)"
        />
        <label>{{ t('admin.tournaments_list.filters_competition') }}</label>
      </FloatLabel>

      <FloatLabel
        v-if="props.ageGroupFilterOptions.length > 1"
        variant="on"
        class="min-w-0"
      >
        <Select
          :modelValue="props.ageGroupFilter"
          :options="props.ageGroupFilterOptions"
          option-label="label"
          option-value="value"
          class="w-full min-w-0"
          :loading="props.ageGroupsLoading"
          @update:modelValue="(v) => emit('update:ageGroupFilter', v)"
        />
        <label>{{ t('admin.tournaments_list.filters_age_group') }}</label>
      </FloatLabel>

      <div class="min-w-0">
        <InputText
          :model-value="props.tournamentsSearch"
          class="w-full min-w-0"
          :placeholder="t('admin.tournaments_list.filters_search_placeholder')"
          @update:model-value="(v) => emit('searchInput', typeof v === 'string' ? v : '')"
        />
      </div>
    </div>

    <!-- Отдельно от поиска: сводка по загруженным элементам списка -->
    <div
      class="border-t border-surface-200 pt-2 dark:border-surface-700 sm:pt-2.5"
    >
      <p
        class="text-start text-[11px] leading-tight text-muted-color sm:text-xs"
      >
        {{
          t('admin.tournaments_list.filters_loaded', {
            loaded: props.tournamentsLoaded,
            total: props.tournamentsTotal,
          })
        }}
      </p>
    </div>
  </div>
</template>

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
</script>

<template>
  <div
    class="flex flex-col gap-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 px-4 py-3"
  >
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span class="text-sm font-medium text-surface-700 dark:text-surface-200">Статус</span>
      <SelectButton
        :modelValue="props.statusFilter"
        :options="props.statusTabOptions"
        option-label="label"
        option-value="value"
        class="tournament-status-filter w-full sm:w-auto [&_.p-button]:flex-1 sm:[&_.p-button]:flex-initial"
        @update:modelValue="(v) => emit('update:statusFilter', v)"
      />
    </div>
    <FloatLabel v-if="props.seasonFilterOptions.length > 1" variant="on" class="min-w-0">
      <Select
        :modelValue="props.seasonFilter"
        :options="props.seasonFilterOptions"
        option-label="label"
        option-value="value"
        class="w-full"
        :loading="props.seasonsLoading"
        @update:modelValue="(v) => emit('update:seasonFilter', v)"
      />
      <label>Сезон в списке</label>
    </FloatLabel>
    <FloatLabel v-if="props.competitionFilterOptions.length > 1" variant="on" class="min-w-0">
      <Select
        :modelValue="props.competitionFilter"
        :options="props.competitionFilterOptions"
        option-label="label"
        option-value="value"
        class="w-full"
        :loading="props.competitionsLoading"
        @update:modelValue="(v) => emit('update:competitionFilter', v)"
      />
      <label>Тип соревнования в списке</label>
    </FloatLabel>
    <FloatLabel v-if="props.ageGroupFilterOptions.length > 1" variant="on" class="min-w-0">
      <Select
        :modelValue="props.ageGroupFilter"
        :options="props.ageGroupFilterOptions"
        option-label="label"
        option-value="value"
        class="w-full"
        :loading="props.ageGroupsLoading"
        @update:modelValue="(v) => emit('update:ageGroupFilter', v)"
      />
      <label>Возрастная группа в списке</label>
    </FloatLabel>
    <InputText
      :model-value="props.tournamentsSearch"
      class="w-full"
      placeholder="Поиск турнира по названию"
      @update:model-value="(v) => emit('searchInput', v)"
    />
    <div class="text-xs text-muted-color">
      Загружено {{ props.tournamentsLoaded }} из {{ props.tournamentsTotal }}
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: string
    options: Array<{ id: string; name: string }>
    loading?: boolean
    title: string
    subtitle?: string
    statusLabel?: string
    statusClass?: string
    emptyText?: string
  }>(),
  {
    loading: false,
    subtitle: '',
    statusLabel: '',
    statusClass: '',
    emptyText: 'Пока нет опубликованных турниров.',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const onUpdate = (value: string) => {
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="public-card">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <h1 class="public-title truncate">{{ title }}</h1>
        <p v-if="subtitle" class="public-subtitle">{{ subtitle }}</p>
      </div>

      <span
        v-if="statusLabel"
        class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
        :class="statusClass"
      >
        <i class="pi pi-circle-fill text-[0.5rem]" />
        {{ statusLabel }}
      </span>
    </div>

    <div class="mt-3 max-w-md">
      <FloatLabel v-if="options.length" variant="on">
        <Select
          :model-value="modelValue"
          :options="options"
          optionLabel="name"
          optionValue="id"
          class="w-full"
          :loading="loading"
          placeholder="Выберите турнир"
          @update:model-value="onUpdate"
        />
        <label>Турнир</label>
      </FloatLabel>
      <div
        v-else
        class="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-muted-color"
      >
        {{ emptyText }}
      </div>
    </div>
  </div>
</template>

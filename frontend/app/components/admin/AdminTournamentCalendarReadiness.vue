<script setup lang="ts">
defineProps<{
  items: { id: string; ok: boolean; label: string }[]
  allOk: boolean
  title: string
  summaryOk: string
  summaryWarn: string
}>()
</script>

<template>
  <div
    v-if="items.length"
    class="rounded-xl border px-4 py-3 text-left"
    :class="
      allOk
        ? 'border-green-200 bg-green-50/90 dark:border-green-900/60 dark:bg-green-950/35'
        : 'border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-900/60'
    "
  >
    <div class="flex items-start gap-2">
      <i
        class="pi mt-0.5 shrink-0 text-base"
        :class="
          allOk
            ? 'pi-check-circle text-green-600 dark:text-green-400'
            : 'pi-info-circle text-muted-color'
        "
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium text-surface-900 dark:text-surface-0">
          {{ title }}
        </div>
        <p
          class="mt-1 text-xs leading-relaxed"
          :class="allOk ? 'text-green-800 dark:text-green-200/90' : 'text-muted-color'"
        >
          {{ allOk ? summaryOk : summaryWarn }}
        </p>
        <ul class="mt-2 space-y-1.5">
          <li
            v-for="it in items"
            :key="it.id"
            class="flex items-start gap-2 text-sm"
          >
            <i
              class="pi mt-0.5 shrink-0 text-xs"
              :class="
                it.ok
                  ? 'pi-check text-green-600 dark:text-green-400'
                  : 'pi-times text-red-500 dark:text-red-400'
              "
              aria-hidden="true"
            />
            <span
              :class="
                it.ok ? 'text-muted-color' : 'text-surface-800 dark:text-surface-100'
              "
            >
              {{ it.label }}
            </span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

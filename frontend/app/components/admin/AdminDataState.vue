<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    loading: boolean
    error: string | null
    empty: boolean
    emptyTitle?: string
    emptyDescription?: string
    /** Класс иконки PrimeIcons, напр. `pi pi-inbox` */
    emptyIcon?: string
    errorTitle?: string
    transitionName?: string
    /** Обёртка для контента (таблица): граница и скругление как у admin-карточек */
    contentCard?: boolean
  }>(),
  {
    emptyTitle: 'Пока нет записей',
    emptyDescription: '',
    emptyIcon: 'pi pi-inbox',
    errorTitle: 'Не удалось загрузить',
    transitionName: 'admin-data-state-fade',
    contentCard: true,
  },
)

defineEmits<{
  retry: []
}>()

/** При `content-card=false` слот `#loading` обычно сам рисует карточку таблицы — без второй тяжёлой оболочки. */
const loadingWrapperClass = computed(() =>
  props.contentCard
    ? 'rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900 overflow-hidden min-h-[16rem]'
    : 'min-h-0 overflow-hidden',
)
</script>

<template>
  <Transition :name="transitionName" mode="out-in">
    <div
      v-if="loading"
      key="loading"
      :class="loadingWrapperClass"
      aria-busy="true"
    >
      <slot name="loading">
        <div class="flex flex-col items-center justify-center gap-4 px-6 py-16">
          <Skeleton width="12rem" height="1rem" class="rounded-md" />
          <Skeleton width="100%" height="2.5rem" class="rounded-lg max-w-md" />
          <Skeleton width="100%" height="2.5rem" class="rounded-lg max-w-md" />
          <Skeleton width="80%" height="2.5rem" class="rounded-lg max-w-md" />
        </div>
      </slot>
    </div>

    <div
      v-else-if="error"
      key="error"
      class="rounded-xl border border-red-200 bg-red-50/90 px-6 py-10 text-center dark:border-red-900/50 dark:bg-red-950/30"
      role="alert"
    >
      <div
        class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
      >
        <i class="pi pi-exclamation-circle text-2xl" aria-hidden="true" />
      </div>
      <h2 class="mt-4 text-lg font-semibold text-surface-900 dark:text-surface-0">
        {{ errorTitle }}
      </h2>
      <p class="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-surface-700 dark:text-surface-200">
        {{ error }}
      </p>
      <Button
        class="mt-6"
        label="Повторить"
        icon="pi pi-refresh"
        severity="danger"
        outlined
        @click="$emit('retry')"
      />
    </div>

    <div
      v-else-if="empty"
      key="empty"
      class="rounded-xl border border-dashed border-surface-300 bg-surface-0/60 px-6 py-14 text-center dark:border-surface-600 dark:bg-surface-900/40"
    >
      <div
        class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner"
      >
        <i :class="[emptyIcon, 'text-3xl']" aria-hidden="true" />
      </div>
      <h2 class="mt-5 text-lg font-semibold text-surface-900 dark:text-surface-0">
        {{ emptyTitle }}
      </h2>
      <p
        v-if="emptyDescription"
        class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-color"
      >
        {{ emptyDescription }}
      </p>
      <div
        v-if="$slots['empty-actions']"
        class="mt-6 flex flex-wrap justify-center gap-2"
      >
        <slot name="empty-actions" />
      </div>
    </div>

    <div
      v-else
      key="content"
      :class="
        contentCard
          ? 'rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900 admin-datatable-scroll'
          : ''
      "
    >
      <slot />
    </div>
  </Transition>
</template>

<style scoped>
.admin-data-state-fade-enter-active,
.admin-data-state-fade-leave-active {
  transition: opacity 0.2s ease;
}
.admin-data-state-fade-enter-from,
.admin-data-state-fade-leave-to {
  opacity: 0;
}
</style>

<script setup lang="ts">
import { useAdminSidebarCollapsed } from '~/composables/useAdminSidebarCollapsed'

const emit = defineEmits<{
  'logout-click': []
}>()

const { mini, toggleMini } = useAdminSidebarCollapsed()
const { t } = useI18n()
</script>

<template>
  <aside
    :class="[
      'relative sticky top-0 z-20 hidden h-screen flex-col border-r border-surface-200 bg-surface-0 shadow-[2px_0_14px_rgba(15,23,42,0.06)] transition-[width] duration-200 ease-out dark:border-surface-700 dark:bg-surface-900 dark:shadow-[2px_0_16px_rgba(0,0,0,0.35)] lg:flex lg:flex-col',
      mini ? 'w-[4.5rem]' : 'w-80',
    ]"
  >
    <AdminSidebarNav @logout-click="emit('logout-click')" />

    <button
      type="button"
      class="absolute left-full top-1/2 z-30 flex h-11 w-7 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-surface-200 bg-surface-0 text-muted-color shadow-[2px_0_10px_rgba(15,23,42,0.1)] transition hover:border-primary/35 hover:bg-surface-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-surface-600 dark:bg-surface-800 dark:shadow-[2px_0_14px_rgba(0,0,0,0.45)] dark:hover:border-primary/40 dark:hover:bg-surface-700"
      :title="mini ? t('admin.sidebar.expand') : t('admin.sidebar.collapse')"
      :aria-label="mini ? t('admin.sidebar.expand') : t('admin.sidebar.collapse')"
      @click="toggleMini"
    >
      <i
        class="pi text-sm"
        :class="mini ? 'pi-angle-right' : 'pi-angle-left'"
        aria-hidden="true"
      />
    </button>
  </aside>
</template>

<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()

const isTemplatesTab = computed(() => {
  const tab = route.query.tab
  if (tab === 'templates') return true
  if (Array.isArray(tab)) return tab.includes('templates')
  return false
})

const listTo = computed(() => ({ path: '/admin/tournaments' }))
const templatesTo = computed(() => ({ path: '/admin/tournaments', query: { tab: 'templates' } }))

const tabClass = (on: boolean) =>
  [
    'inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:w-auto sm:justify-start sm:py-2',
    on
      ? 'bg-primary text-primary-contrast shadow-sm'
      : 'text-muted-color hover:bg-surface-100 hover:text-surface-900 dark:hover:bg-surface-800 dark:hover:text-surface-0',
  ].join(' ')
</script>

<template>
  <nav
    class="flex flex-col gap-1 rounded-lg border border-surface-200 bg-surface-0 p-1 sm:flex-row sm:flex-wrap sm:rounded-xl dark:border-surface-700 dark:bg-surface-900"
    :aria-label="t('admin.tournament_templates.tabs.aria')"
  >
    <NuxtLink :to="listTo" :class="tabClass(!isTemplatesTab)">
      <i class="pi pi-sitemap text-sm opacity-90" aria-hidden="true" />
      {{ t('admin.tournament_templates.tabs.tournaments') }}
    </NuxtLink>
    <NuxtLink :to="templatesTo" :class="tabClass(isTemplatesTab)">
      <i class="pi pi-clone text-sm opacity-90" aria-hidden="true" />
      {{ t('admin.tournament_templates.tabs.templates') }}
    </NuxtLink>
  </nav>
</template>

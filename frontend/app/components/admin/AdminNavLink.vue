<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** Целевой маршрут (при `locked` переход отключён). */
    to: string
    /** Ключ i18n, например `admin.nav.dashboard` */
    labelKey: string
    icon: string
    /** true — только точное совпадение path (для /admin) */
    exact?: boolean
    /** только иконка + title (компактный сайдбар) */
    mini?: boolean
    /** Нет доступа по тарифу — неактивный вид, без перехода */
    locked?: boolean
  }>(),
  { exact: false, mini: false, locked: false },
)

const { t } = useI18n()
const label = computed(() => t(props.labelKey))

const route = useRoute()

const pathForActive = computed(() => props.to)

const active = computed(() => {
  if (props.locked) return false
  const p = route.path
  const base = pathForActive.value
  if (props.exact) return p === base
  if (p === base) return true
  return p.startsWith(`${base}/`)
})

const linkClass = computed(() =>
  active.value
    ? 'bg-surface-100 dark:bg-surface-800 text-primary font-medium'
    : 'text-muted-color hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-primary',
)

const lockedTooltip = computed(() => t('admin.nav.subscription_locked_tooltip'))
</script>

<template>
  <span
    v-if="locked"
    class="flex items-center gap-2.5 rounded-lg transition-colors cursor-not-allowed text-muted-color opacity-75 hover:opacity-90"
    :class="[
      mini
        ? 'w-full max-w-[2.75rem] justify-center px-0 py-2.5'
        : 'px-3.5 py-2.5 text-[15px]',
    ]"
    role="presentation"
    v-tooltip.top="lockedTooltip"
    :title="mini ? label : undefined"
  >
    <span
      :class="[
        icon,
        mini ? 'inline-flex w-[1.35rem] justify-center text-[1.35rem] leading-none' : 'text-sm',
      ]"
      aria-hidden="true"
    />
    <span
      v-if="!mini"
      class="inline-flex min-w-0 flex-1 items-center gap-1.5"
    >
      <span class="min-w-0 truncate">{{ label }}</span>
      <span class="pi pi-lock shrink-0 text-xs opacity-70" aria-hidden="true" />
    </span>
  </span>
  <NuxtLink
    v-else
    :to="to"
    class="flex items-center gap-2.5 rounded-lg transition-colors"
    :class="[
      linkClass,
      mini
        ? 'w-full max-w-[2.75rem] justify-center px-0 py-2.5'
        : 'px-3.5 py-2.5 text-[15px]',
    ]"
    v-tooltip.top="mini ? label : undefined"
    :title="mini ? label : undefined"
  >
    <span
      :class="[
        icon,
        mini ? 'inline-flex w-[1.35rem] justify-center text-[1.35rem] leading-none' : 'text-sm',
      ]"
      aria-hidden="true"
    />
    <span
      v-if="!mini"
      class="inline-flex min-w-0 flex-1 items-center gap-1.5"
    >
      <span class="min-w-0 truncate">{{ label }}</span>
    </span>
  </NuxtLink>
</template>

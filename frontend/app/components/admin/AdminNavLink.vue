<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    to: string
    /** Ключ i18n, например `admin.nav.dashboard` */
    labelKey: string
    icon: string
    /** true — только точное совпадение path (для /admin) */
    exact?: boolean
    /** только иконка + title (компактный сайдбар) */
    mini?: boolean
  }>(),
  { exact: false, mini: false },
)

const { t } = useI18n()
const label = computed(() => t(props.labelKey))

const route = useRoute()

const active = computed(() => {
  const p = route.path
  if (props.exact) return p === props.to
  if (p === props.to) return true
  return p.startsWith(`${props.to}/`)
})

const linkClass = computed(() =>
  active.value
    ? 'bg-surface-100 dark:bg-surface-800 text-primary font-medium'
    : 'text-muted-color hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-primary',
)
</script>

<template>
  <NuxtLink
    :to="to"
    class="flex items-center gap-2.5 rounded-lg transition-colors"
    :class="[
      linkClass,
      mini
        ? 'w-full max-w-[2.75rem] justify-center px-0 py-2.5'
        : 'px-3.5 py-2.5 text-[15px]',
    ]"
    :title="mini ? label : undefined"
  >
    <span
      :class="[
        icon,
        mini ? 'inline-flex w-[1.35rem] justify-center text-[1.35rem] leading-none' : 'text-sm',
      ]"
      aria-hidden="true"
    />
    <span v-if="!mini">{{ label }}</span>
  </NuxtLink>
</template>

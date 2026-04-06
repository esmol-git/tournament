<script setup lang="ts">
import { computed } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { normalizeSubscriptionPlanCode } from '~/utils/subscriptionFeatures'

withDefaults(
  defineProps<{
    /** Карточка в сайдбаре или иконка в mini. */
    variant?: 'card' | 'mini'
  }>(),
  { variant: 'card' },
)

const { user } = useAuth()
const { t, locale } = useI18n()

type TenantSub = {
  plan?: string | null
  status?: string | null
  endsAt?: string | null
  active?: boolean
} | null

const sub = computed((): TenantSub => {
  const u = user.value as { tenantSubscription?: TenantSub } | null
  return u?.tenantSubscription ?? null
})

const hasSub = computed(() => !!sub.value?.plan)

const planCode = computed(() => normalizeSubscriptionPlanCode(sub.value?.plan ?? null))

const planLabel = computed(() => t(`admin.subscription.plan.${planCode.value}`))

const endsAt = computed(() => {
  const raw = sub.value?.endsAt
  if (raw == null || raw === '') return null
  const d = new Date(String(raw))
  return Number.isNaN(d.getTime()) ? null : d
})

const endsAtFormatted = computed(() => {
  if (!endsAt.value) return null
  const loc = locale.value === 'en' ? 'en-GB' : 'ru-RU'
  return new Intl.DateTimeFormat(loc, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(endsAt.value)
})

const endsLine = computed(() => {
  if (!endsAtFormatted.value) return t('admin.subscription.no_end_date')
  return t('admin.subscription.valid_until', { date: endsAtFormatted.value })
})

const miniTooltip = computed(() => {
  const parts = [planLabel.value, endsLine.value]
  if (sub.value && sub.value.active === false) {
    parts.push(t('admin.subscription.inactive_hint'))
  }
  return parts.join(' · ')
})

const tagSeverity = computed(() => {
  if (sub.value && sub.value.active === false) return 'warn' as const
  return 'info' as const
})
</script>

<template>
  <div v-if="hasSub" class="contents">
    <!-- Mini sidebar: иконка + тултип -->
    <NuxtLink
      v-if="variant === 'mini'"
      to="/admin/profile"
      class="mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/5 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-primary/30 dark:bg-primary/10 dark:hover:bg-primary/15"
      v-tooltip.right="miniTooltip"
      :aria-label="planLabel"
    >
      <i class="pi pi-sparkles text-lg" aria-hidden="true" />
    </NuxtLink>

    <!-- Полная карточка над профилем в сайдбаре -->
    <NuxtLink
      v-else
      to="/admin/profile"
      class="mb-2 block rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 via-surface-0 to-surface-0 p-3 no-underline shadow-[0_1px_0_rgba(15,23,42,0.04)] outline-none ring-primary/20 transition-[box-shadow,transform] hover:shadow-md focus-visible:ring-2 dark:from-primary/10 dark:via-surface-900 dark:to-surface-900 dark:shadow-[0_1px_0_rgba(0,0,0,0.2)] dark:ring-primary/30"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-medium uppercase tracking-wide text-muted-color">
            {{ t('admin.subscription.title') }}
          </p>
          <p class="mt-1 truncate text-sm font-semibold text-surface-900 dark:text-surface-0">
            {{ planLabel }}
          </p>
        </div>
        <Tag
          :value="sub?.active === false ? t('admin.subscription.status_inactive') : t('admin.subscription.status_ok')"
          :severity="tagSeverity"
          rounded
          class="shrink-0 !px-2 !py-0.5 !text-[10px]"
        />
      </div>
      <p class="mt-2 text-xs leading-snug text-muted-color">
        {{ endsLine }}
      </p>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useTenantLimits } from '~/composables/useTenantLimits'

const props = withDefaults(
  defineProps<{
    /** Всего турниров организации (как в ответе списка, `total`). */
    tournamentsCount: number
    /** `page` — блок как на списке; `inline` — компактно в диалоге создания. */
    variant?: 'page' | 'inline'
  }>(),
  { variant: 'page' },
)

const { t } = useI18n()

const { limits, limitsResolved, tournamentsLeft, usagePercent, nextPlanTournaments } =
  useTenantLimits({
    tournamentsCount: toRef(props, 'tournamentsCount'),
  })

const hasCap = computed(() => limits.value.maxTournaments !== null)

const messageSeverity = computed(() =>
  tournamentsLeft.value !== null && tournamentsLeft.value <= 0 ? 'warn' : 'info',
)

const upgradeSentence = computed(() => {
  if (nextPlanTournaments.value === null) {
    return t('admin.tournaments_list.limits.upgrade_unlimited')
  }
  return t('admin.tournaments_list.limits.upgrade_numeric', {
    n: nextPlanTournaments.value,
  })
})

const showUpgradeHint = computed(
  () => hasCap.value && tournamentsLeft.value !== null && tournamentsLeft.value <= 0,
)
</script>

<template>
  <div
    v-if="limitsResolved && !hasCap && variant === 'page'"
    class="rounded-lg border border-surface-200 bg-surface-0 px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-900 sm:rounded-xl sm:px-4 sm:py-3"
  >
    <p class="leading-relaxed text-surface-700 dark:text-surface-200">
      {{ t('admin.tournaments_list.limits.unlimited_plan_line', { current: tournamentsCount }) }}
    </p>
  </div>

  <div v-else-if="hasCap" :class="variant === 'inline' ? 'space-y-2' : ''">
    <Message
      v-if="variant === 'page'"
      :severity="messageSeverity"
      :closable="false"
      class="text-sm"
    >
      <div class="space-y-2">
        <p class="leading-relaxed">
          {{
            t('admin.tournaments_list.limits.usage_line', {
              current: tournamentsCount,
              max: limits.maxTournaments,
            })
          }}
          <span v-if="tournamentsLeft !== null" class="text-muted-color">
            {{
              t('admin.tournaments_list.limits.slots_left', {
                left: tournamentsLeft,
              })
            }}
          </span>
        </p>
        <p v-if="showUpgradeHint" class="text-sm">
          <span class="text-surface-800 dark:text-surface-100">{{ upgradeSentence }}</span>
          <NuxtLink
            to="/admin/settings"
            class="ms-1 font-medium text-primary underline-offset-2 hover:underline"
          >
            {{ t('admin.tournaments_list.limits.open_settings') }}
          </NuxtLink>
        </p>
        <div
          class="h-2 w-full max-w-md overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700"
          role="progressbar"
          :aria-valuenow="usagePercent"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="t('admin.tournaments_list.limits.progress_aria')"
        >
          <div
            class="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            :style="{ width: `${usagePercent}%` }"
          />
        </div>
      </div>
    </Message>

    <div
      v-else
      class="rounded-lg border border-surface-200 bg-surface-50/80 px-3 py-2.5 text-xs dark:border-surface-600 dark:bg-surface-800/60"
    >
      <p class="text-surface-700 dark:text-surface-200">
        {{
          t('admin.tournaments_list.limits.usage_line', {
            current: tournamentsCount,
            max: limits.maxTournaments,
          })
        }}
        <span v-if="tournamentsLeft !== null" class="text-muted-color">
          ·
          {{
            t('admin.tournaments_list.limits.slots_left', {
              left: tournamentsLeft,
            })
          }}
        </span>
      </p>
      <p v-if="showUpgradeHint" class="mt-1 text-muted-color">
        {{ upgradeSentence }}
        <NuxtLink
          to="/admin/settings"
          class="ms-1 font-medium text-primary underline-offset-2 hover:underline"
        >
          {{ t('admin.tournaments_list.limits.open_settings') }}
        </NuxtLink>
      </p>
      <div
        class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700"
        role="progressbar"
        :aria-valuenow="usagePercent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="t('admin.tournaments_list.limits.progress_aria')"
      >
        <div
          class="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          :style="{ width: `${usagePercent}%` }"
        />
      </div>
    </div>
  </div>

  <p
    v-else-if="limitsResolved && !hasCap && variant === 'inline'"
    class="text-xs leading-relaxed text-muted-color"
  >
    {{ t('admin.tournaments_list.limits.unlimited_plan_line_short', { current: tournamentsCount }) }}
  </p>
</template>

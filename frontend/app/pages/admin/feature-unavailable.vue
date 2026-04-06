<script setup lang="ts">
import {
  allSubscriptionFeatures,
  type SubscriptionFeature,
} from '~/utils/subscriptionFeatures'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const route = useRoute()
const { t } = useI18n()

const reason = computed(() => String(route.query.reason ?? '').trim())

const isTenantAdminOnly = computed(() => reason.value === 'tenant_admin_only')

const isModeratorScope = computed(() => reason.value === 'moderator_scope')

const featureKey = computed((): SubscriptionFeature | null => {
  const raw = String(route.query.feature ?? '').trim()
  if (!raw) return null
  const all = allSubscriptionFeatures()
  return all.includes(raw as SubscriptionFeature) ? (raw as SubscriptionFeature) : null
})

const featureLabel = computed(() => {
  if (!featureKey.value) return null
  return t(`admin.settings.subscription.features.${featureKey.value}`)
})
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 px-4 py-8">
    <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-0">
      {{
        isModeratorScope
          ? t('admin.feature_unavailable.moderator_scope.title')
          : isTenantAdminOnly
            ? t('admin.feature_unavailable.tenant_admin.title')
            : t('admin.settings.subscription.feature_unavailable.title')
      }}
    </h1>
    <p class="text-sm leading-relaxed text-muted-color">
      {{
        isModeratorScope
          ? t('admin.feature_unavailable.moderator_scope.lead')
          : isTenantAdminOnly
            ? t('admin.feature_unavailable.tenant_admin.lead')
            : t('admin.settings.subscription.feature_unavailable.lead')
      }}
    </p>
    <p
      v-if="featureLabel && !isTenantAdminOnly && !isModeratorScope"
      class="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-800 dark:border-surface-700 dark:bg-surface-800/60 dark:text-surface-100"
    >
      {{ featureLabel }}
    </p>
    <p class="text-sm leading-relaxed text-muted-color">
      {{
        isModeratorScope
          ? t('admin.feature_unavailable.moderator_scope.hint')
          : isTenantAdminOnly
            ? t('admin.feature_unavailable.tenant_admin.hint')
            : t('admin.settings.subscription.feature_unavailable.hint')
      }}
    </p>
    <div class="flex flex-wrap gap-2 pt-2">
      <NuxtLink to="/admin">
        <Button :label="t('admin.settings.subscription.feature_unavailable.back')" outlined />
      </NuxtLink>
      <NuxtLink v-if="!isTenantAdminOnly && !isModeratorScope" to="/admin/settings">
        <Button :label="t('admin.settings.subscription.feature_unavailable.open_settings')" />
      </NuxtLink>
    </div>
  </div>
</template>

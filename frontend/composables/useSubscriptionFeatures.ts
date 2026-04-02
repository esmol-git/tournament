import { computed, type Ref } from 'vue'
import {
  allSubscriptionFeatures,
  hasSubscriptionFeature,
  type SubscriptionFeature,
} from '~/utils/subscriptionFeatures'

/**
 * Матрица «возможности × тариф» для выбранного значения плана (в т.ч. черновик в селекте).
 */
export function useSubscriptionFeatureMatrix(planRef: Ref<string>) {
  const featureMatrix = computed(() =>
    allSubscriptionFeatures().map((key) => ({
      key,
      enabled: hasSubscriptionFeature(planRef.value, key),
    })),
  )

  function can(feature: SubscriptionFeature) {
    return hasSubscriptionFeature(planRef.value, feature)
  }

  return { featureMatrix, can }
}

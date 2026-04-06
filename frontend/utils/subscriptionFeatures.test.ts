import { describe, expect, it } from 'vitest'
import {
  hasSubscriptionFeature,
  maxTournamentsForSubscriptionPlan,
  normalizeSubscriptionPlanCode,
  subscriptionPlanFromAuthUser,
  subscriptionPlanIndex,
} from '~/utils/subscriptionFeatures'

describe('subscriptionFeatures', () => {
  it('normalizeSubscriptionPlanCode maps aliases and defaults', () => {
    expect(normalizeSubscriptionPlanCode('WORLD_CLUB')).toBe('WORLD_CUP')
    expect(normalizeSubscriptionPlanCode('unknown')).toBe('FREE')
    expect(normalizeSubscriptionPlanCode('PREMIER')).toBe('PREMIER')
  })

  it('subscriptionPlanFromAuthUser reads tenantSubscription.plan', () => {
    expect(
      subscriptionPlanFromAuthUser({
        tenantSubscription: { plan: 'PREMIER' },
      }),
    ).toBe('PREMIER')
  })

  it('subscriptionPlanFromAuthUser reads legacy tenant.subscriptionPlan', () => {
    expect(
      subscriptionPlanFromAuthUser({
        tenant: { subscriptionPlan: 'AMATEUR' },
      }),
    ).toBe('AMATEUR')
  })

  it('subscriptionPlanIndex orders plans', () => {
    expect(subscriptionPlanIndex('FREE')).toBe(0)
    expect(subscriptionPlanIndex('WORLD_CUP')).toBe(4)
  })

  it('hasSubscriptionFeature gates by plan tier', () => {
    expect(hasSubscriptionFeature('FREE', 'core_tournaments')).toBe(true)
    expect(hasSubscriptionFeature('FREE', 'public_custom_branding')).toBe(false)
    expect(hasSubscriptionFeature('PREMIER', 'public_custom_branding')).toBe(true)
  })

  it('maxTournamentsForSubscriptionPlan matches tier limits', () => {
    expect(maxTournamentsForSubscriptionPlan('FREE')).toBe(1)
    expect(maxTournamentsForSubscriptionPlan('AMATEUR')).toBe(3)
    expect(maxTournamentsForSubscriptionPlan('WORLD_CUP')).toBeNull()
  })
})

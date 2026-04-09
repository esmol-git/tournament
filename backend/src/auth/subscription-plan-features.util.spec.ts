import { SubscriptionPlan } from '@prisma/client';
import {
  canonicalSubscriptionPlan,
  maxTeamsPerTenant,
  maxTournamentsForPlan,
  subscriptionPlanIncludedFeatures,
  subscriptionPlanIndex,
  tenantHasSubscriptionPlanFeature,
  tenantSubscriptionLimits,
} from './subscription-plan-features.util';

describe('subscription-plan-features.util', () => {
  describe('canonicalSubscriptionPlan', () => {
    it('maps WORLD_CLUB alias to WORLD_CUP', () => {
      expect(canonicalSubscriptionPlan('WORLD_CLUB')).toBe(
        SubscriptionPlan.WORLD_CUP,
      );
    });

    it('trims and uppercases', () => {
      expect(canonicalSubscriptionPlan('  premier  ')).toBe(
        SubscriptionPlan.PREMIER,
      );
    });

    it('falls back to FREE for unknown strings', () => {
      expect(canonicalSubscriptionPlan('unknown-plan')).toBe(
        SubscriptionPlan.FREE,
      );
    });
  });

  describe('subscriptionPlanIndex', () => {
    it('returns 0 for FREE and 4 for WORLD_CUP', () => {
      expect(subscriptionPlanIndex(SubscriptionPlan.FREE)).toBe(0);
      expect(subscriptionPlanIndex(SubscriptionPlan.WORLD_CUP)).toBe(4);
    });
  });

  describe('tenantHasSubscriptionPlanFeature', () => {
    it('FREE has no reference_directory_basic or audit_log', () => {
      expect(
        tenantHasSubscriptionPlanFeature('FREE', 'reference_directory_basic'),
      ).toBe(false);
      expect(tenantHasSubscriptionPlanFeature('FREE', 'audit_log')).toBe(false);
    });

    it('AMATEUR has reference_directory_basic but not audit_log', () => {
      expect(
        tenantHasSubscriptionPlanFeature(
          'AMATEUR',
          'reference_directory_basic',
        ),
      ).toBe(true);
      expect(tenantHasSubscriptionPlanFeature('AMATEUR', 'audit_log')).toBe(
        false,
      );
    });

    it('WORLD_CUP has audit_log', () => {
      expect(tenantHasSubscriptionPlanFeature('WORLD_CUP', 'audit_log')).toBe(
        true,
      );
    });
  });

  describe('subscriptionPlanIncludedFeatures', () => {
    it('returns keys for PREMIER including standard tier, not audit_log', () => {
      const keys = subscriptionPlanIncludedFeatures('PREMIER');
      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toContain('reference_directory_basic');
      expect(keys).toContain('reference_directory_standard');
      expect(keys).not.toContain('audit_log');
    });
  });

  describe('limits', () => {
    it('FREE has numeric caps; WORLD_CUP nulls', () => {
      expect(maxTournamentsForPlan('FREE')).toBe(1);
      expect(maxTournamentsForPlan('WORLD_CUP')).toBeNull();
      expect(maxTeamsPerTenant('FREE')).toBe(8);
      expect(maxTeamsPerTenant('WORLD_CUP')).toBeNull();
    });

    it('tenantSubscriptionLimits includes teamsPerTenant product', () => {
      const row = tenantSubscriptionLimits('AMATEUR');
      expect(row.tournaments).toBe(3);
      expect(row.teamsPerTournament).toBe(16);
      expect(row.teamsPerTenant).toBe(48);
    });
  });
});

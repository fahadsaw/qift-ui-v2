// Merchant plan capability map — frontend mirror of
// apps/api/src/stores/merchant-plans.ts. Keep tier names + keys
// in sync; capability checks should be cheap pure-function reads,
// never API roundtrips per render.
//
// We deliberately do NOT model billing / upgrade flow / expiry
// here. Self-serve upgrades are out of scope today (see the
// `project_merchant_platform_direction` memory). The /store-
// dashboard/plan page is informational only — admins assign
// plans via PATCH /admin/stores/:id/plan.

export const MERCHANT_PLANS = ['starter', 'pro', 'enterprise'] as const
export type MerchantPlan = (typeof MERCHANT_PLANS)[number]

export function isMerchantPlan(value: string): value is MerchantPlan {
  return (MERCHANT_PLANS as readonly string[]).includes(value)
}

export type MerchantCapability =
  | 'core_storefront'
  | 'api_integrations'
  | 'shipping_integrations'
  | 'priority_placement'
  | 'campaigns'
  | 'automation'
  | 'advanced_analytics'
  | 'branded_gifting'
  | 'sla_support'
  | 'split_payment'

const CAPABILITIES_BY_PLAN: Record<MerchantPlan, MerchantCapability[]> = {
  starter: ['core_storefront'],
  pro: [
    'core_storefront',
    'api_integrations',
    'shipping_integrations',
    'priority_placement',
    'campaigns',
    'automation',
    'advanced_analytics',
  ],
  enterprise: [
    'core_storefront',
    'api_integrations',
    'shipping_integrations',
    'priority_placement',
    'campaigns',
    'automation',
    'advanced_analytics',
    'branded_gifting',
    'sla_support',
    'split_payment',
  ],
}

export function capabilitiesFor(
  plan: string | null | undefined,
): Set<MerchantCapability> {
  const safe = plan && isMerchantPlan(plan) ? plan : 'starter'
  return new Set(CAPABILITIES_BY_PLAN[safe])
}

export function planHas(
  plan: string | null | undefined,
  capability: MerchantCapability,
): boolean {
  return capabilitiesFor(plan).has(capability)
}

// Minimum plan that unlocks a given capability. Used by the UI
// to render hints like "Available on Pro" without hardcoding the
// tier strings everywhere.
export function minPlanFor(
  capability: MerchantCapability,
): MerchantPlan {
  for (const plan of MERCHANT_PLANS) {
    if (CAPABILITIES_BY_PLAN[plan].includes(capability)) {
      return plan
    }
  }
  return 'enterprise'
}

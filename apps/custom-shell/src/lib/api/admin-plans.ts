import { createServerFn } from "@tanstack/react-start"
import { createErrorMessage } from "./error-message"
import { z } from "zod"

import type { PlanFeatures } from "@/lib/billing/plan-features"
import {
  archivePlan,
  archivePlans,
  createPlan,
  listPlans,
  updatePlan,
} from "@/server/billing/plans"
import { adminGet, adminPost } from "@/server/guards"

export type AdminPlan = {
  id: string
  slug: string
  name: string
  description: string
  priceMonthlyCents: number
  priceYearlyCents: number
  currency: string
  stripePriceIdMonthly: string | null
  stripePriceIdYearly: string | null
  trialDays: number
  features: PlanFeatures
  isDefault: boolean
  isPublic: boolean
  sortOrder: number
  active: boolean
  createdAt: string
}

export const getPlanErrorMessage = createErrorMessage(
  {
    PLAN_NOT_FOUND: "That plan no longer exists.",
    PLAN_SLUG_REQUIRED: "Give the plan a short id, like `pro`.",
    PLAN_NAME_REQUIRED: "Give the plan a name.",
    DEFAULT_PLAN_MUST_BE_FREE: "The default plan everyone starts on must cost nothing.",
    DEFAULT_PLAN_REQUIRED: "You cannot archive the default plan.",
    PLAN_STRIPE_PRICE_REQUIRED:
      "A public paid plan needs at least one Stripe price id.",
    PLAN_MONTHLY_PRICE_REQUIRED:
      "Add the Stripe price id for the monthly price, or set the monthly price to 0.",
    PLAN_YEARLY_PRICE_REQUIRED:
      "Add the Stripe price id for the yearly price, or set the yearly price to 0.",
    FEATURES_INVALID: "Features must be valid JSON, like {\"seats\": 3}.",
    duplicate: "Another plan already uses that id or Stripe price.",
  },
  "We could not save that plan. Please try again."
)

const planInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "PLAN_SLUG_REQUIRED"),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  priceMonthlyCents: z.number().int().min(0).max(10_000_000),
  priceYearlyCents: z.number().int().min(0).max(100_000_000),
  currency: z.string().trim().min(1).max(10).default("usd"),
  stripePriceIdMonthly: z.string().trim().max(120).nullable().default(null),
  stripePriceIdYearly: z.string().trim().max(120).nullable().default(null),
  trialDays: z.number().int().min(0).max(365).default(0),
  features: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()])
    )
    .default({}),
  isDefault: z.boolean().default(false),
  isPublic: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
})

export type PlanFormInput = z.input<typeof planInputSchema>

const listPlansFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => {
    const plans = await listPlans()
    return plans.map(serializePlan)
  })

const createPlanFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(planInputSchema)
  .handler(async ({ data }) => {
    const plan = await createPlan(data)
    return serializePlan(plan)
  })

const updatePlanFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ planId: z.string().min(1).max(36), plan: planInputSchema })
  )
  .handler(async ({ data }) => {
    const { plan } = await updatePlan(data.planId, data.plan)
    return serializePlan(plan)
  })

const archivePlanFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ planId: z.string().min(1).max(36) }))
  .handler(async ({ data }) => {
    const plan = await archivePlan(data.planId)
    return serializePlan(plan)
  })

const archivePlansFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ planIds: z.array(z.string().min(1).max(36)).min(1).max(100) })
  )
  .handler(async ({ data }) => {
    return archivePlans(data.planIds)
  })

export function loadAdminPlans() {
  return listPlansFn()
}

export function createAdminPlan(plan: PlanFormInput) {
  return createPlanFn({ data: plan })
}

export function updateAdminPlan(planId: string, plan: PlanFormInput) {
  return updatePlanFn({ data: { planId, plan } })
}

export function archiveAdminPlan(planId: string) {
  return archivePlanFn({ data: { planId } })
}

export function archiveAdminPlans(planIds: string[]) {
  return archivePlansFn({ data: { planIds } })
}

function serializePlan(plan: {
  id: string
  slug: string
  name: string
  description: string
  priceMonthlyCents: number
  priceYearlyCents: number
  currency: string
  stripePriceIdMonthly: string | null
  stripePriceIdYearly: string | null
  trialDays: number
  features: PlanFeatures
  isDefault: boolean
  isPublic: boolean
  sortOrder: number
  active: boolean
  createdAt: Date
}): AdminPlan {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    priceMonthlyCents: plan.priceMonthlyCents,
    priceYearlyCents: plan.priceYearlyCents,
    currency: plan.currency,
    stripePriceIdMonthly: plan.stripePriceIdMonthly,
    stripePriceIdYearly: plan.stripePriceIdYearly,
    trialDays: plan.trialDays,
    features: plan.features ?? {},
    isDefault: plan.isDefault,
    isPublic: plan.isPublic,
    sortOrder: plan.sortOrder,
    active: plan.active,
    createdAt: plan.createdAt.toISOString(),
  }
}

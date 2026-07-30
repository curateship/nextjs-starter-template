import { asc, eq, or } from "drizzle-orm"

import type { PlanFeatures } from "@/lib/plan-features"
import { db, type CustomShellDb } from "@/server/db"
import { customShellPlans, type CustomShellPlan } from "@/server/schema"
import { now, uuid } from "@/server/security"

export type PlanInput = {
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
}

export async function listPlans(database: CustomShellDb = db) {
  return database
    .select()
    .from(customShellPlans)
    .orderBy(asc(customShellPlans.sortOrder), asc(customShellPlans.name))
}

export async function listPurchasablePlans(database: CustomShellDb = db) {
  const plans = await listPlans(database)
  return plans.filter((plan) => plan.active && plan.isPublic)
}

export async function getPlan(planId: string, database: CustomShellDb = db) {
  const [plan] = await database
    .select()
    .from(customShellPlans)
    .where(eq(customShellPlans.id, planId))
    .limit(1)

  return plan ?? null
}

export async function getPlanBySlug(slug: string, database: CustomShellDb = db) {
  const [plan] = await database
    .select()
    .from(customShellPlans)
    .where(eq(customShellPlans.slug, slug))
    .limit(1)

  return plan ?? null
}

/** The plan applied to everyone without an active paid subscription. */
export async function getDefaultPlan(database: CustomShellDb = db) {
  const [plan] = await database
    .select()
    .from(customShellPlans)
    .where(eq(customShellPlans.isDefault, true))
    .limit(1)

  return plan ?? null
}

export async function findPlanByStripePrice(
  priceId: string,
  database: CustomShellDb = db
) {
  const [plan] = await database
    .select()
    .from(customShellPlans)
    .where(
      or(
        eq(customShellPlans.stripePriceIdMonthly, priceId),
        eq(customShellPlans.stripePriceIdYearly, priceId)
      )
    )
    .limit(1)

  return plan ?? null
}

export function planIntervalForPrice(plan: CustomShellPlan, priceId: string) {
  return plan.stripePriceIdYearly === priceId ? "yearly" : "monthly"
}

export function stripePriceIdFor(
  plan: CustomShellPlan,
  interval: "monthly" | "yearly"
) {
  return interval === "yearly"
    ? plan.stripePriceIdYearly
    : plan.stripePriceIdMonthly
}

export function isPaidPlan(plan: CustomShellPlan) {
  return plan.priceMonthlyCents > 0 || plan.priceYearlyCents > 0
}

export async function createPlan(
  input: PlanInput,
  database: CustomShellDb = db
) {
  validatePlanInput(input)

  return database.transaction(async (tx) => {
    if (input.isDefault) {
      await clearDefaultPlan(tx)
    }

    const createdAt = now()
    const [plan] = await tx
      .insert(customShellPlans)
      .values({ id: uuid(), ...normalizePlanInput(input), createdAt, updatedAt: createdAt })
      .returning()

    return plan
  })
}

/**
 * Returns the fields that actually changed alongside the plan, so the audit
 * trail can say what an edit did instead of only that one happened.
 */
export async function updatePlan(
  planId: string,
  input: PlanInput,
  database: CustomShellDb = db
) {
  validatePlanInput(input)

  return database.transaction(async (tx) => {
    const before = await getPlan(planId, tx)
    if (!before) {
      throw new Error("PLAN_NOT_FOUND")
    }

    if (input.isDefault) {
      await clearDefaultPlan(tx)
    }

    const values = normalizePlanInput(input)
    const [plan] = await tx
      .update(customShellPlans)
      .set({ ...values, updatedAt: now() })
      .where(eq(customShellPlans.id, planId))
      .returning()

    if (!plan) {
      throw new Error("PLAN_NOT_FOUND")
    }

    return { plan, changedFields: changedPlanFields(before, values) }
  })
}

/** What each plan field is called in the activity log, in plain words. */
const planFieldLabels: Record<keyof PlanInput, string> = {
  slug: "id",
  name: "name",
  description: "description",
  priceMonthlyCents: "monthly price",
  priceYearlyCents: "yearly price",
  currency: "currency",
  stripePriceIdMonthly: "monthly Stripe price",
  stripePriceIdYearly: "yearly Stripe price",
  trialDays: "trial length",
  features: "features",
  isDefault: "default plan",
  isPublic: "visibility",
  sortOrder: "order",
  active: "archived state",
}

function changedPlanFields(
  before: CustomShellPlan,
  after: ReturnType<typeof normalizePlanInput>
) {
  return (Object.keys(planFieldLabels) as (keyof PlanInput)[])
    .filter((field) =>
      field === "features"
        ? featuresFingerprint(before.features) !==
          featuresFingerprint(after.features)
        : before[field] !== after[field]
    )
    .map((field) => planFieldLabels[field])
}

/**
 * Postgres stores jsonb with its own key order, so the features read back are
 * rarely in the order they were typed. Compare them sorted, or saving a plan
 * without touching its features still reports a features change.
 */
function featuresFingerprint(features: PlanFeatures | null | undefined) {
  return JSON.stringify(
    Object.entries(features ?? {}).sort(([a], [b]) => a.localeCompare(b))
  )
}

/**
 * Plans are archived, never deleted: existing subscriptions still point at them
 * and their price history has to stay readable.
 */
export async function archivePlan(planId: string, database: CustomShellDb = db) {
  const plan = await getPlan(planId, database)
  if (!plan) {
    throw new Error("PLAN_NOT_FOUND")
  }
  if (plan.isDefault) {
    throw new Error("DEFAULT_PLAN_REQUIRED")
  }

  const [archived] = await database
    .update(customShellPlans)
    .set({ active: false, isPublic: false, updatedAt: now() })
    .where(eq(customShellPlans.id, planId))
    .returning()

  return archived
}

function validatePlanInput(input: PlanInput) {
  if (!input.slug.trim()) {
    throw new Error("PLAN_SLUG_REQUIRED")
  }
  if (!input.name.trim()) {
    throw new Error("PLAN_NAME_REQUIRED")
  }
  if (input.isDefault && (input.priceMonthlyCents > 0 || input.priceYearlyCents > 0)) {
    throw new Error("DEFAULT_PLAN_MUST_BE_FREE")
  }

  const paid = input.priceMonthlyCents > 0 || input.priceYearlyCents > 0
  const hasPrice = Boolean(input.stripePriceIdMonthly || input.stripePriceIdYearly)
  if (paid && input.isPublic && !hasPrice) {
    throw new Error("PLAN_STRIPE_PRICE_REQUIRED")
  }
  if (input.priceMonthlyCents > 0 && !input.stripePriceIdMonthly && input.isPublic) {
    throw new Error("PLAN_MONTHLY_PRICE_REQUIRED")
  }
  if (input.priceYearlyCents > 0 && !input.stripePriceIdYearly && input.isPublic) {
    throw new Error("PLAN_YEARLY_PRICE_REQUIRED")
  }
}

function normalizePlanInput(input: PlanInput) {
  return {
    slug: input.slug.trim().toLowerCase().slice(0, 50),
    name: input.name.trim().slice(0, 120),
    description: input.description.trim(),
    priceMonthlyCents: input.priceMonthlyCents,
    priceYearlyCents: input.priceYearlyCents,
    currency: input.currency.trim().toLowerCase().slice(0, 10) || "usd",
    stripePriceIdMonthly: emptyToNull(input.stripePriceIdMonthly),
    stripePriceIdYearly: emptyToNull(input.stripePriceIdYearly),
    trialDays: input.trialDays,
    features: input.features,
    isDefault: input.isDefault,
    isPublic: input.isPublic,
    sortOrder: input.sortOrder,
    active: input.active,
  }
}

function emptyToNull(value: string | null) {
  const trimmed = (value ?? "").trim()
  return trimmed ? trimmed.slice(0, 120) : null
}

async function clearDefaultPlan(database: Pick<CustomShellDb, "update">) {
  await database
    .update(customShellPlans)
    .set({ isDefault: false, updatedAt: now() })
    .where(eq(customShellPlans.isDefault, true))
}

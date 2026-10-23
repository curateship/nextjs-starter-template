import { and, asc, eq, inArray, isNotNull, ne, or } from "drizzle-orm"

import type { PlanFeatures } from "@/lib/billing/plan-features"
import { isUsageMeter } from "@/lib/billing/usage-meter"
import { db, type CustomShellDb } from "@/server/db"
import { customShellPlans, type CustomShellPlan } from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

export type PlanInput = {
  slug: string
  name: string
  description: string
  priceMonthlyCents: number
  priceYearlyCents: number
  currency: string
  stripePriceIdMonthly: string | null
  stripePriceIdYearly: string | null
  usageMeter?: string | null
  trialDays: number
  features: PlanFeatures
  isDefault: boolean
  isPublic: boolean
  sortOrder: number
  highlightBadgeText?: string | null
  checkoutButtonText?: string | null
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
    const values = normalizePlanInput(input)
    await ensureHighlightIsAvailable(values.highlightBadgeText, tx)

    if (input.isDefault) {
      await clearDefaultPlan(tx)
    }

    const createdAt = now()
    const [plan] = await tx
      .insert(customShellPlans)
      .values({ id: uuid(), ...values, createdAt, updatedAt: createdAt })
      .returning()

    return plan
  })
}

export async function updatePlan(
  planId: string,
  input: PlanInput,
  database: CustomShellDb = db
) {
  validatePlanInput(input)

  return database.transaction(async (tx) => {
    // Checked before clearDefaultPlan, so a bad id cannot unset the default.
    const before = await getPlan(planId, tx)
    if (!before) {
      throw new Error("PLAN_NOT_FOUND")
    }

    const values = normalizePlanInput(input)
    await ensureHighlightIsAvailable(values.highlightBadgeText, tx, planId)

    if (input.isDefault) {
      await clearDefaultPlan(tx)
    }

    const [plan] = await tx
      .update(customShellPlans)
      .set({ ...values, updatedAt: now() })
      .where(eq(customShellPlans.id, planId))
      .returning()

    if (!plan) {
      throw new Error("PLAN_NOT_FOUND")
    }

    return { plan }
  })
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

/**
 * Bulk archive for the table's multi-selection action. Same guards as archiving
 * one, in a single statement: the default plan everyone falls back to is left
 * alone, as is a plan that is already archived or no longer there. The caller is
 * told exactly which ids went so a run that only got part way can say so.
 */
export async function archivePlans(
  planIds: string[],
  database: CustomShellDb = db
): Promise<{ archived: string[]; kept: string[] }> {
  const rows = await database
    .update(customShellPlans)
    .set({ active: false, isPublic: false, updatedAt: now() })
    .where(
      and(
        inArray(customShellPlans.id, planIds),
        eq(customShellPlans.isDefault, false),
        eq(customShellPlans.active, true)
      )
    )
    .returning({ id: customShellPlans.id })

  const wentThrough = new Set(rows.map((row) => row.id))
  return {
    archived: [...wentThrough],
    kept: planIds.filter((id) => !wentThrough.has(id)),
  }
}

function validatePlanInput(input: PlanInput) {
  if (!input.slug.trim()) {
    throw new Error("PLAN_SLUG_REQUIRED")
  }
  if (!input.name.trim()) {
    throw new Error("PLAN_NAME_REQUIRED")
  }
  if (input.usageMeter && !isUsageMeter(input.usageMeter.trim())) {
    throw new Error("PLAN_USAGE_METER_INVALID")
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
    usageMeter: emptyToNull(input.usageMeter, 100),
    trialDays: input.trialDays,
    features: input.features,
    isDefault: input.isDefault,
    isPublic: input.isPublic,
    sortOrder: input.sortOrder,
    highlightBadgeText: emptyToNull(input.highlightBadgeText, 50),
    checkoutButtonText: emptyToNull(input.checkoutButtonText, 60),
    active: input.active,
  }
}

function emptyToNull(value: string | null | undefined, maxLength = 120) {
  const trimmed = (value ?? "").trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

async function ensureHighlightIsAvailable(
  highlightBadgeText: string | null,
  database: CustomShellDb,
  planId?: string
) {
  if (!highlightBadgeText) return

  const conditions = [isNotNull(customShellPlans.highlightBadgeText)]
  if (planId) conditions.push(ne(customShellPlans.id, planId))

  const [highlightedPlan] = await database
    .select({ name: customShellPlans.name })
    .from(customShellPlans)
    .where(and(...conditions))
    .limit(1)

  if (highlightedPlan) {
    throw new Error(`PLAN_HIGHLIGHT_ALREADY_SET:${highlightedPlan.name}`)
  }
}

async function clearDefaultPlan(database: Pick<CustomShellDb, "update">) {
  await database
    .update(customShellPlans)
    .set({ isDefault: false, updatedAt: now() })
    .where(eq(customShellPlans.isDefault, true))
}

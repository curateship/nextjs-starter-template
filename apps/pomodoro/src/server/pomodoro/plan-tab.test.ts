import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { loadPlanTab, type NextPaymentPreview } from "@/server/pomodoro/plan-tab"
import { customShellPlans, customShellSubscriptions } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Settings → Plan (payments task 04) against a real database, with Stripe's
 * preview of the next bill replaced by a stand-in. The rules worth a test:
 * the next payment is Stripe's figure and is only asked for when a charge is
 * coming, a failed ask leaves the rest of the tab standing, and each kind of
 * account reads as what it is.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  vi.stubEnv("CUSTOM_SHELL_BILLING_ENABLED", "true")
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await client.close()
})

/** A period end far enough ahead that the plan is live whenever this runs. */
const PERIOD_END = new Date("2099-11-14T12:00:00Z")

/** Stripe's answer, discounted, so a figure worked out from the price fails. */
const preview = vi.fn<NextPaymentPreview>(async () => ({
  amountCents: 450,
  currency: "usd",
}))

async function member(
  subscription: Partial<typeof customShellSubscriptions.$inferInsert> | null,
  role: "member" | "admin" = "member"
) {
  const user = await insertUser(db, { role })
  if (!subscription) return user.id
  const timestamp = new Date()
  await db
    .insert(customShellPlans)
    .values({
      id: "pro-test",
      slug: "pro-test",
      name: "Pro",
      priceMonthlyCents: 900,
      priceYearlyCents: 7800,
      currency: "usd",
      stripePriceIdMonthly: "price_pro",
      features: {},
      isDefault: false,
      isPublic: true,
      sortOrder: 1,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing()
  await db.insert(customShellSubscriptions).values({
    id: crypto.randomUUID(),
    userId: user.id,
    planId: "pro-test",
    stripeCustomerId: `cus_${user.id.slice(0, 8)}`,
    stripeSubscriptionId: `sub_${user.id.slice(0, 8)}`,
    status: "active",
    interval: "monthly",
    source: "stripe",
    currentPeriodEnd: PERIOD_END,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...subscription,
  })
  return user.id
}

beforeEach(() => {
  preview.mockClear()
})

describe("loadPlanTab", () => {
  it("reads a free account as free, with no credits or space and nothing asked of Stripe", async () => {
    const plan = await loadPlanTab(await member(null), preview)
    expect(plan.kind).toBe("free")
    expect(plan.credits).toBeNull()
    expect(plan.space).toBeNull()
    expect(plan.canManageBilling).toBe(false)
    expect(preview).not.toHaveBeenCalled()
  })

  it("gives a monthly Pro member Stripe's figure for the next payment, on the renewal day", async () => {
    const plan = await loadPlanTab(await member({}), preview)
    expect(plan.kind).toBe("pro")
    expect(plan.interval).toBe("monthly")
    expect(plan.nextPayment).toEqual({
      amountCents: 450,
      currency: "usd",
      on: PERIOD_END.toISOString(),
    })
    expect(plan.canManageBilling).toBe(true)
    expect(plan.credits?.backgrounds.limit).toBeGreaterThan(0)
    expect(plan.space?.limitBytes).toBeGreaterThan(0)
  })

  it("says when Pro ends, and asks Stripe nothing, once it is set to stop", async () => {
    const plan = await loadPlanTab(await member({ cancelAtPeriodEnd: true }), preview)
    expect(plan.endsAt).toBe(PERIOD_END.toISOString())
    expect(plan.nextPayment).toBeNull()
    expect(preview).not.toHaveBeenCalled()
  })

  it("dates a trial's first charge to the trial's end", async () => {
    const trialEndsAt = new Date("2099-10-20T12:00:00Z")
    const plan = await loadPlanTab(
      await member({ status: "trialing", trialEndsAt }),
      preview
    )
    expect(plan.trialEndsAt).toBe(trialEndsAt.toISOString())
    expect(plan.nextPayment?.on).toBe(trialEndsAt.toISOString())
  })

  it("flags a declined card and shows no next payment while Stripe retries", async () => {
    const plan = await loadPlanTab(await member({ status: "past_due" }), preview)
    expect(plan.kind).toBe("pro")
    expect(plan.cardDeclined).toBe(true)
    expect(plan.nextPayment).toBeNull()
  })

  it("keeps the tab when Stripe cannot be asked, and says so", async () => {
    const failing = vi.fn<NextPaymentPreview>(async () => {
      throw new Error("Stripe is down")
    })
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {})
    const plan = await loadPlanTab(await member({}), failing)
    quiet.mockRestore()
    expect(plan.kind).toBe("pro")
    expect(plan.nextPayment).toBeNull()
    expect(plan.nextPaymentUnknown).toBe(true)
  })

  it("reads an admin with no plan as Pro by role, with nothing billed", async () => {
    const plan = await loadPlanTab(await member(null, "admin"), preview)
    expect(plan.kind).toBe("admin")
    expect(plan.credits).not.toBeNull()
    expect(plan.canManageBilling).toBe(false)
  })

  it("reads a plan an admin granted as granted, never billed", async () => {
    const plan = await loadPlanTab(
      await member({ source: "manual", stripeCustomerId: null, stripeSubscriptionId: null }),
      preview
    )
    expect(plan.granted).toBe(true)
    expect(plan.nextPayment).toBeNull()
    expect(preview).not.toHaveBeenCalled()
  })
})

import type { PGlite } from "@electric-sql/pglite"
import Stripe from "stripe"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { changePlan, previewPlanChange } from "@/server/billing/plan-change"
import { applyStripeEvent } from "@/server/billing/stripe"
import { loadEntitlements } from "@/server/billing/entitlements"
import { customShellPlans, customShellSubscriptions } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"

let client: PGlite
let database: TestDatabase
let userId: string
let subscription: Stripe.Subscription
let target: Stripe.Price
let invoice: Stripe.Invoice
const choice = { planSlug: "switch-target", interval: "monthly" as const }

function api() {
  return {
    key: "test-signing-key",
    retrieve: vi.fn(async () => structuredClone(subscription)),
    price: vi.fn(async () => target),
    preview: vi
      .fn<
        (params: Stripe.InvoiceCreatePreviewParams) => Promise<Stripe.Invoice>
      >()
      .mockImplementation(async () => invoice),
    update: vi
      .fn<
        (
          id: string,
          params: Stripe.SubscriptionUpdateParams,
          options: Stripe.RequestOptions
        ) => Promise<Stripe.Subscription>
      >()
      .mockImplementation(async () => subscription),
  }
}

beforeEach(async () => {
  vi.stubEnv("CUSTOM_SHELL_BILLING_ENABLED", "true")
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  userId = (await insertUser(database)).id
  const now = new Date()
  await database.insert(customShellPlans).values([
    {
      id: "switch-source",
      slug: "switch-source",
      name: "Original",
      priceMonthlyCents: 2000,
      stripePriceIdMonthly: "price_old",
      features: { seats: 2 },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "switch-target",
      slug: "switch-target",
      name: "Larger",
      priceMonthlyCents: 4000,
      stripePriceIdMonthly: "price_new",
      stripePriceIdYearly: "price_year",
      features: { seats: 8 },
      active: true,
      isPublic: true,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await database.insert(customShellSubscriptions).values({
    id: "switch-sub",
    userId,
    planId: "switch-source",
    stripeCustomerId: "cus_switch",
    stripeSubscriptionId: "sub_switch",
    source: "stripe",
    status: "active",
    interval: "monthly",
    currentPeriodEnd: new Date(Date.now() + 86400_000),
    createdAt: now,
    updatedAt: now,
  })
  target = {
    id: "price_new",
    active: true,
    currency: "usd",
    billing_scheme: "per_unit",
    unit_amount: 4000,
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
  } as Stripe.Price
  subscription = {
    id: "sub_switch",
    customer: "cus_switch",
    status: "active",
    metadata: { userId },
    latest_invoice: { id: "in_paid", status: "paid" },
    cancel_at_period_end: false,
    items: {
      has_more: false,
      data: [
        {
          id: "si_switch",
          quantity: 1,
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          price: {
            ...structuredClone(target),
            id: "price_old",
            unit_amount: 2000,
          },
        },
      ],
    },
  } as unknown as Stripe.Subscription
  invoice = {
    currency: "usd",
    total: 5000,
    amount_due: 5000,
    lines: {
      has_more: false,
      data: [
        {
          amount: -1000,
          parent: { subscription_item_details: { proration: true } },
        },
        {
          amount: 2000,
          parent: { subscription_item_details: { proration: true } },
        },
        {
          amount: 4000,
          parent: { subscription_item_details: { proration: false } },
        },
      ],
    },
  } as Stripe.Invoice
})

afterEach(async () => {
  await client.close()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("in-app plan changes", () => {
  it("previews and confirms the same proration, then changes access only through the webhook", async () => {
    const stripe = api()
    const preview = await previewPlanChange(userId, choice, database, stripe)
    expect(preview).toMatchObject({
      planName: "Larger",
      prorationAmount: 1000,
      amountDue: 5000,
      billsNow: false,
    })
    expect(stripe.update).not.toHaveBeenCalled()
    await changePlan(userId, preview.token, database, stripe)
    expect(stripe.update).toHaveBeenCalledWith(
      "sub_switch",
      {
        items: [{ id: "si_switch", price: "price_new", quantity: 1 }],
        proration_behavior: "create_prorations",
        payment_behavior: "error_if_incomplete",
        proration_date:
          stripe.preview.mock.calls[0][0].subscription_details?.proration_date,
      },
      { idempotencyKey: expect.stringMatching(/^plan-change:/) }
    )
    expect(
      (await loadEntitlements(userId, database)).entitlements.features.seats
    ).toBe(2)
    subscription.items.data[0].price = target
    const event = {
      id: "evt_switch",
      type: "customer.subscription.updated",
      data: { object: subscription },
    } as Stripe.Event
    expect(await applyStripeEvent(event, database)).toBe(true)
    expect(await applyStripeEvent(event, database)).toBe(false)
    expect(
      (await loadEntitlements(userId, database)).entitlements.features.seats
    ).toBe(8)
  })

  it("returns a downgrade credit and preserves the subscription quantity", async () => {
    const stripe = api()
    subscription.items.data[0].quantity = 3
    target.unit_amount = 1000
    invoice.lines.data[1].amount = 500
    const preview = await previewPlanChange(userId, choice, database, stripe)
    expect(preview.prorationAmount).toBe(-500)
    expect(preview.recurringAmount).toBe(3000)
    await changePlan(userId, preview.token, database, stripe)
    expect(stripe.update.mock.calls[0][1].items?.[0].quantity).toBe(3)
  })

  it("describes an interval switch as billing today and preserves an existing trial", async () => {
    target.id = "price_year"
    target.recurring!.interval = "year"
    const yearly = { ...choice, interval: "yearly" as const }
    expect(
      (await previewPlanChange(userId, yearly, database, api())).billsNow
    ).toBe(true)
    subscription.status = "trialing"
    subscription.trial_end = Math.floor(Date.now() / 1000) + 86400
    const preview = await previewPlanChange(userId, yearly, database, api())
    expect(preview.billsNow).toBe(false)
    expect(preview.trialEndsAt).not.toBeNull()
  })

  it("rejects another member's quote, tampering, expiry, and a key or mode change", async () => {
    const stripe = api()
    const preview = await previewPlanChange(userId, choice, database, stripe)
    await expect(
      changePlan("another-user", preview.token, database, stripe)
    ).rejects.toThrow("PLAN_PREVIEW_EXPIRED")
    await expect(
      changePlan(userId, `x${preview.token}`, database, stripe)
    ).rejects.toThrow("PLAN_PREVIEW_EXPIRED")
    await expect(
      changePlan(userId, `${preview.token}.`, database, stripe)
    ).rejects.toThrow("PLAN_PREVIEW_EXPIRED")
    await expect(
      changePlan(userId, preview.token, database, {
        ...stripe,
        key: "other-key",
      })
    ).rejects.toThrow("PLAN_PREVIEW_EXPIRED")
    const currentTime = Date.now()
    vi.spyOn(Date, "now").mockReturnValue(currentTime + 301_000)
    await expect(
      changePlan(userId, preview.token, database, stripe)
    ).rejects.toThrow("PLAN_PREVIEW_EXPIRED")
    expect(stripe.update).not.toHaveBeenCalled()
  })

  it("rejects a portal change and an invoice amount that changed after preview", async () => {
    const stripe = api()
    const preview = await previewPlanChange(userId, choice, database, stripe)
    subscription.items.data[0].quantity = 2
    await expect(
      changePlan(userId, preview.token, database, stripe)
    ).rejects.toThrow("PLAN_PREVIEW_EXPIRED")
    subscription.items.data[0].quantity = 1
    invoice.amount_due += 100
    await expect(
      changePlan(userId, preview.token, database, stripe)
    ).rejects.toThrow("PLAN_PREVIEW_EXPIRED")
    expect(stripe.update).not.toHaveBeenCalled()
  })

  it.each(["past_due", "unpaid", "paused", "canceled", "incomplete"])(
    "refuses a %s subscription",
    async (status) => {
      subscription.status = status as Stripe.Subscription.Status
      await expect(
        previewPlanChange(userId, choice, database, api())
      ).rejects.toThrow("PLAN_CHANGE_UNAVAILABLE")
    }
  )

  it("refuses unpaid invoices, paused collection, scheduled cancellation and schedules", async () => {
    const stripe = api()
    subscription.latest_invoice = { status: "open" } as Stripe.Invoice
    await expect(
      previewPlanChange(userId, choice, database, stripe)
    ).rejects.toThrow("PLAN_CHANGE_UNPAID")
    subscription.latest_invoice = null
    subscription.pause_collection = { behavior: "void", resumes_at: null }
    await expect(
      previewPlanChange(userId, choice, database, stripe)
    ).rejects.toThrow("PLAN_CHANGE_UNAVAILABLE")
    subscription.pause_collection = null
    subscription.cancel_at_period_end = true
    await expect(
      previewPlanChange(userId, choice, database, stripe)
    ).rejects.toThrow("PLAN_CHANGE_UNAVAILABLE")
    subscription.cancel_at_period_end = false
    subscription.schedule = "sub_sched"
    await expect(
      previewPlanChange(userId, choice, database, stripe)
    ).rejects.toThrow("PLAN_CHANGE_UNAVAILABLE")
  })

  it("refuses private plans, manual grants, and a mismatched Stripe customer", async () => {
    const stripe = api()
    subscription.customer = "cus_other"
    await expect(
      previewPlanChange(userId, choice, database, stripe)
    ).rejects.toThrow("SUBSCRIPTION_NOT_FOUND")
    subscription.customer = "cus_switch"
    await database
      .update(customShellPlans)
      .set({ isPublic: false })
      .where(eq(customShellPlans.id, "switch-target"))
    await expect(
      previewPlanChange(userId, choice, database, stripe)
    ).rejects.toThrow("PLAN_NOT_PURCHASABLE")
    await database
      .update(customShellSubscriptions)
      .set({ source: "manual" })
      .where(eq(customShellSubscriptions.userId, userId))
    await expect(
      previewPlanChange(userId, choice, database, stripe)
    ).rejects.toThrow("SUBSCRIPTION_NOT_FOUND")
  })

  it("refuses metered prices, currency changes, incomplete line lists, and the current price", async () => {
    const stripe = api()
    target.recurring!.usage_type = "metered"
    await expect(
      previewPlanChange(userId, choice, database, stripe)
    ).rejects.toThrow("PLAN_CHANGE_UNSUPPORTED")
    target.recurring!.usage_type = "licensed"
    target.currency = "cad"
    await expect(
      previewPlanChange(userId, choice, database, stripe)
    ).rejects.toThrow("PLAN_CHANGE_UNSUPPORTED")
    target.currency = "usd"
    invoice.lines.has_more = true
    await expect(
      previewPlanChange(userId, choice, database, stripe)
    ).rejects.toThrow("PLAN_CHANGE_UNSUPPORTED")
    subscription.items.data[0].price.id = "price_new"
    await expect(
      previewPlanChange(userId, choice, database, stripe)
    ).rejects.toThrow("PLAN_ALREADY_CURRENT")
  })

  it("leaves access unchanged when payment fails and uses the same retry identifier", async () => {
    const stripe = api()
    const preview = await previewPlanChange(userId, choice, database, stripe)
    stripe.update.mockRejectedValue(
      new Stripe.errors.StripeCardError({
        message: "Declined",
        type: "card_error",
      })
    )
    await expect(
      changePlan(userId, preview.token, database, stripe)
    ).rejects.toThrow("PLAN_CHANGE_PAYMENT_FAILED")
    await expect(
      changePlan(userId, preview.token, database, stripe)
    ).rejects.toThrow("PLAN_CHANGE_PAYMENT_FAILED")
    expect(stripe.update.mock.calls[0][2]).toEqual(
      stripe.update.mock.calls[1][2]
    )
    expect(
      (await loadEntitlements(userId, database)).entitlements.features.seats
    ).toBe(2)
  })

  it("checks the billing switch before contacting Stripe", async () => {
    vi.stubEnv("CUSTOM_SHELL_BILLING_ENABLED", "false")
    const stripe = api()
    await expect(
      previewPlanChange(userId, choice, database, stripe)
    ).rejects.toThrow("BILLING_DISABLED")
    expect(stripe.retrieve).not.toHaveBeenCalled()
  })
})

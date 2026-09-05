import type Stripe from "stripe"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { freeMonthCreditCents } from "@/lib/billing/referrals"
import { type CustomShellDb } from "@/server/db"
import {
  applyReferralStripeEvent,
  grantReferralReward,
  loadAdminReferrals,
  loadMemberReferrals,
  markReferralJoined,
  recordReferralConversion,
  recordReferralRegistration,
  revokeRefundedReferralReward,
  validateReferralRegistration,
  type ReferralBalanceApi,
  type ReferralInvoicePaymentApi,
} from "@/server/billing/referrals"
import {
  customShellPlans,
  customShellReferrals,
  customShellSubscriptions,
  customShellUsers,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { signInWithGoogle } from "@/server/auth/google"
import { createAuthToken } from "@/server/auth/security"
import { consumeSignInLink } from "@/server/auth/sign-in-link"

let database: CustomShellDb
let closeDatabase: () => Promise<void>

beforeEach(async () => {
  const created = await createTestDatabase()
  database = created.db
  closeDatabase = () => created.client.close()
})

afterEach(async () => {
  await closeDatabase()
})

function paidInvoice(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "in_first",
    amount_paid: 4900,
    billing_reason: "subscription_create",
    customer: "cus_referred",
    parent: {
      type: "subscription_details",
      subscription_details: { metadata: { userId } },
    },
    payments: {
      data: [
        {
          payment: {
            type: "payment_intent",
            payment_intent: "pi_first",
          },
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Invoice
}

async function referralPair(verified = false) {
  const referrer = await insertUser(database, {
    email: "referrer@example.test",
    name: "Referrer",
  })
  const referred = await insertUser(database, {
    email: "friend@example.test",
    name: "Friend",
    emailVerifiedAt: verified ? new Date("2026-08-30T10:00:00.000Z") : null,
  })
  await recordReferralRegistration(
    referrer.referralCode,
    referred,
    database,
    new Date("2026-08-30T10:00:00.000Z")
  )
  return { referrer, referred }
}

describe("referral attribution", () => {
  it("gives every account a stable unique referral code", async () => {
    const first = await insertUser(database)
    const second = await insertUser(database)

    expect(first.referralCode).toMatch(/^[a-f0-9]{32}$/)
    expect(second.referralCode).toMatch(/^[a-f0-9]{32}$/)
    expect(second.referralCode).not.toBe(first.referralCode)
  })

  it("refuses unknown and self-owned invite links", async () => {
    const referrer = await insertUser(database, {
      email: "same@example.test",
    })

    await expect(
      validateReferralRegistration("0".repeat(32), "new@example.test", database)
    ).rejects.toThrow("REFERRAL_NOT_FOUND")
    await expect(
      validateReferralRegistration(
        referrer.referralCode,
        "same@example.test",
        database
      )
    ).rejects.toThrow("SELF_REFERRAL")
  })

  it("moves an unverified signup from invited to joined", async () => {
    const { referrer, referred } = await referralPair()

    let summary = await loadMemberReferrals(referrer.id, database)
    expect(summary.items[0]).toMatchObject({
      status: "invited",
      rewardStatus: "not_earned",
    })

    await markReferralJoined(
      referred.id,
      database,
      new Date("2026-08-30T11:00:00.000Z")
    )

    summary = await loadMemberReferrals(referrer.id, database)
    expect(summary.items[0]).toMatchObject({ status: "joined" })
    expect(summary).toMatchObject({ total: 1, invited: 0, joined: 1 })
  })

  it("keeps attribution when a new member registers with Google", async () => {
    const referrer = await insertUser(database)
    const { user } = await signInWithGoogle(
      {
        subject: "referred-google-account",
        email: "google-friend@example.test",
        emailVerified: true,
        name: "Google Friend",
      },
      { userAgent: null, ipAddress: null },
      database,
      referrer.referralCode
    )

    const [referral] = await database.select().from(customShellReferrals)
    expect(referral).toMatchObject({
      referrerUserId: referrer.id,
      referredUserId: user.id,
      status: "joined",
    })
  })

  it("does not let an invite block an existing Google account from signing in", async () => {
    const existing = await insertUser(database, {
      email: "existing-google@example.test",
    })

    const { user } = await signInWithGoogle(
      {
        subject: "existing-google-account",
        email: existing.email,
        emailVerified: true,
        name: existing.name,
      },
      { userAgent: null, ipAddress: null },
      database,
      existing.referralCode
    )

    expect(user.id).toBe(existing.id)
    expect(await database.select().from(customShellReferrals)).toHaveLength(0)
  })

  it("marks an invited member joined when an emailed sign-in link verifies them", async () => {
    const { referrer, referred } = await referralPair()
    const token = await createAuthToken(referred.id, "login", database)

    await consumeSignInLink(
      token,
      { userAgent: null, ipAddress: null },
      database
    )

    const summary = await loadMemberReferrals(referrer.id, database)
    expect(summary.items[0].status).toBe("joined")
  })

  it("keeps the ledger intact when either account is deleted", async () => {
    const { referrer, referred } = await referralPair(true)

    await database
      .delete(customShellUsers)
      .where(eq(customShellUsers.id, referred.id))
    let [saved] = await database.select().from(customShellReferrals)
    expect(saved).toMatchObject({
      referrerUserId: referrer.id,
      referredUserId: null,
      referredEmail: "friend@example.test",
    })

    await database
      .delete(customShellUsers)
      .where(eq(customShellUsers.id, referrer.id))
    ;[saved] = await database.select().from(customShellReferrals)
    expect(saved).toMatchObject({
      referrerUserId: null,
      referredUserId: null,
      referrerEmail: "referrer@example.test",
    })
  })
})

describe("referral conversion and rewards", () => {
  it("values a yearly free month at one twelfth of the annual price", () => {
    expect(
      freeMonthCreditCents({
        interval: "yearly",
        priceMonthlyCents: 4900,
        priceYearlyCents: 49_000,
      })
    ).toBe(4083)
  })

  it("converts once on the first real subscription payment", async () => {
    const { referrer, referred } = await referralPair(true)

    expect(
      await recordReferralConversion(
        paidInvoice(referred.id, { amount_paid: 0, id: "in_zero" }),
        database
      )
    ).toBeNull()
    expect(
      await recordReferralConversion(paidInvoice(referred.id), database)
    ).toBeTruthy()
    expect(
      await recordReferralConversion(
        paidInvoice(referred.id, { id: "in_second" }),
        database
      )
    ).toBeNull()

    const summary = await loadMemberReferrals(referrer.id, database)
    expect(summary.converted).toBe(1)
    expect(summary.items[0]).toMatchObject({
      status: "converted",
      rewardStatus: "pending",
    })
  })

  it("ignores a paid invoice that did not come from a subscription", async () => {
    const { referred } = await referralPair(true)

    expect(
      await recordReferralConversion(
        paidInvoice(referred.id, { billing_reason: "manual", parent: null }),
        database
      )
    ).toBeNull()
  })

  it("loads and saves the payment intent when Stripe omits expanded payments", async () => {
    const { referred } = await referralPair(true)
    const invoice = paidInvoice(referred.id, { payments: undefined })
    const paymentIntentForInvoice = vi.fn().mockResolvedValue("pi_loaded")
    const invoicePaymentApi: ReferralInvoicePaymentApi = {
      paymentIntentForInvoice,
      paymentIntentFullyRefunded: vi.fn().mockResolvedValue(false),
    }
    const event = {
      type: "invoice.payment_succeeded",
      data: { object: invoice },
    } as Stripe.Event

    await applyReferralStripeEvent(
      event,
      database,
      { adjust: vi.fn() },
      invoicePaymentApi
    )
    await applyReferralStripeEvent(
      event,
      database,
      { adjust: vi.fn() },
      invoicePaymentApi
    )

    const [converted] = await database.select().from(customShellReferrals)
    expect(converted.stripePaymentIntentId).toBe("pi_loaded")
    expect(paymentIntentForInvoice).toHaveBeenCalledTimes(1)
  })

  it("closes the reward when the payment was refunded before its invoice event", async () => {
    const { referred } = await referralPair(true)
    const invoicePaymentApi: ReferralInvoicePaymentApi = {
      paymentIntentForInvoice: vi.fn().mockResolvedValue("pi_first"),
      paymentIntentFullyRefunded: vi.fn().mockResolvedValue(true),
    }

    await applyReferralStripeEvent(
      {
        type: "invoice.payment_succeeded",
        data: { object: paidInvoice(referred.id) },
      } as Stripe.Event,
      database,
      { adjust: vi.fn() },
      invoicePaymentApi
    )

    const [referral] = await database.select().from(customShellReferrals)
    expect(referral).toMatchObject({
      status: "converted",
      rewardStatus: "revoked",
    })
  })

  it("adds one monthly plan price to the referrer's Stripe balance", async () => {
    const { referrer, referred } = await referralPair(true)
    await recordReferralConversion(paidInvoice(referred.id), database)

    const [plan] = await database
      .update(customShellPlans)
      .set({ priceMonthlyCents: 4900, currency: "usd" })
      .where(eq(customShellPlans.slug, "pro"))
      .returning()
    await database.insert(customShellSubscriptions).values({
      id: "sub-local",
      userId: referrer.id,
      planId: plan.id,
      stripeCustomerId: "cus_referrer",
      stripeSubscriptionId: "sub_stripe",
      status: "active",
      interval: "monthly",
      source: "stripe",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const adjust = vi.fn().mockResolvedValue("cbtxn_reward")
    const api: ReferralBalanceApi = { adjust }
    const [reward] = await database.select().from(customShellReferrals)
    const grantedAt = new Date("2026-08-30T12:00:00.000Z")
    const first = await grantReferralReward(reward.id, database, api, grantedAt)
    const repeated = await grantReferralReward(reward.id, database, api)

    expect(first).toEqual({
      granted: true,
      amountCents: 4900,
      currency: "usd",
      grantedAt: grantedAt.toISOString(),
    })
    expect(repeated).toEqual(first)
    expect(adjust).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_referrer",
        amountCents: -4900,
        currency: "usd",
        idempotencyKey: `referral-reward:${reward.id}`,
      })
    )
    expect(adjust).toHaveBeenCalledTimes(1)
    const [granted] = await database.select().from(customShellReferrals)
    expect(granted).toMatchObject({
      rewardStatus: "granted",
      rewardAmountCents: 4900,
      stripeBalanceTransactionId: "cbtxn_reward",
    })
  })

  it("leaves the reward waiting when the referrer has no paid Stripe plan", async () => {
    const { referred } = await referralPair(true)
    await recordReferralConversion(paidInvoice(referred.id), database)
    const [reward] = await database.select().from(customShellReferrals)

    await expect(
      grantReferralReward(reward.id, database, { adjust: vi.fn() })
    ).rejects.toThrow("REFERRER_NOT_BILLABLE")
    const [stillPending] = await database.select().from(customShellReferrals)
    expect(stillPending.rewardStatus).toBe("pending")
  })

  it("reverses only a fully refunded source payment", async () => {
    const { referred } = await referralPair(true)
    await recordReferralConversion(paidInvoice(referred.id), database)
    const adjust = vi.fn()

    expect(
      await revokeRefundedReferralReward(
        { refunded: false, payment_intent: "pi_first" } as Stripe.Charge,
        database,
        { adjust }
      )
    ).toBeNull()
    expect(
      await revokeRefundedReferralReward(
        { refunded: true, payment_intent: "pi_first" } as Stripe.Charge,
        database,
        { adjust }
      )
    ).toBeTruthy()
    expect(adjust).not.toHaveBeenCalled()
    const [revoked] = await database.select().from(customShellReferrals)
    expect(revoked.rewardStatus).toBe("revoked")
  })

  it("debits a granted reward after the source payment is fully refunded", async () => {
    const { referrer, referred } = await referralPair(true)
    await recordReferralConversion(paidInvoice(referred.id), database)
    const [plan] = await database
      .select()
      .from(customShellPlans)
      .where(eq(customShellPlans.slug, "pro"))
    await database
      .update(customShellPlans)
      .set({ priceMonthlyCents: 4900 })
      .where(eq(customShellPlans.id, plan.id))
    await database.insert(customShellSubscriptions).values({
      id: "sub-for-refund",
      userId: referrer.id,
      planId: plan.id,
      stripeCustomerId: "cus_refund_referrer",
      stripeSubscriptionId: "sub_refund",
      status: "active",
      interval: "monthly",
      source: "stripe",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const adjust = vi
      .fn()
      .mockResolvedValueOnce("cbtxn_credit")
      .mockResolvedValueOnce("cbtxn_debit")
    const [reward] = await database.select().from(customShellReferrals)
    await grantReferralReward(reward.id, database, { adjust })

    await revokeRefundedReferralReward(
      { refunded: true, payment_intent: "pi_first" } as Stripe.Charge,
      database,
      { adjust }
    )

    expect(adjust).toHaveBeenLastCalledWith(
      expect.objectContaining({
        amountCents: 4900,
        idempotencyKey: `referral-reward-reversal:${reward.id}`,
      })
    )
    const [revoked] = await database.select().from(customShellReferrals)
    expect(revoked.rewardStatus).toBe("revoked")
  })

  it("shows the same activity to admins", async () => {
    const { referred } = await referralPair(true)
    await recordReferralConversion(paidInvoice(referred.id), database)

    const activity = await loadAdminReferrals(database)
    expect(activity).toMatchObject({
      total: 1,
      converted: 1,
      pendingRewards: 1,
    })
    expect(activity.items[0]).toMatchObject({
      referrerName: "Referrer",
      referredName: "Friend",
      joinedAt: expect.any(String),
      convertedAt: expect.any(String),
    })
  })
})

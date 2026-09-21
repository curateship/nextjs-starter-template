import type Stripe from "stripe"
import { and, desc, eq, isNull, sql } from "drizzle-orm"

import {
  freeMonthCreditCents,
  readReferralCode,
  referralRewardStatus,
  referralStatus,
  type ReferralRewardStatus,
  type ReferralStatus,
} from "@/lib/billing/referrals"
import { appUrlFor } from "@/server/app-url"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { subscriptionIsLive } from "@/server/billing/entitlements"
import { stripe } from "@/server/billing/stripe"
import {
  customShellPlans,
  customShellReferrals,
  customShellSubscriptions,
  customShellUsers,
  type CustomShellUser,
} from "@/server/schema"

const MEMBER_REFERRALS_SHOWN = 20
const ADMIN_REFERRALS_SHOWN = 100

type ReferredAccount = Pick<
  CustomShellUser,
  "id" | "name" | "email" | "emailVerifiedAt"
>

/** Refuses an unknown invite or one owned by the address being registered. */
export async function validateReferralRegistration(
  codeValue: unknown,
  referredEmail: string,
  database: CustomShellDb = db
) {
  const code = readReferralCode(codeValue)
  if (!code) throw new Error("REFERRAL_NOT_FOUND")

  const [referrer] = await database
    .select({ id: customShellUsers.id, email: customShellUsers.email })
    .from(customShellUsers)
    .where(
      and(
        eq(customShellUsers.referralCode, code),
        eq(customShellUsers.status, "active")
      )
    )
    .limit(1)
  if (!referrer) throw new Error("REFERRAL_NOT_FOUND")
  if (referrer.email === referredEmail.trim().toLowerCase()) {
    throw new Error("SELF_REFERRAL")
  }
  return referrer
}

/**
 * Connects a newly created account to the owner of the invite code.
 *
 * The lookup and insert belong inside the caller's account-creation
 * transaction. A bad or self-owned link refuses the whole registration rather
 * than quietly creating an account whose promised reward can never appear.
 */
export async function recordReferralRegistration(
  codeValue: unknown,
  referred: ReferredAccount,
  database: CustomShellDb = db,
  timestamp = now()
) {
  const code = readReferralCode(codeValue)
  if (!code) {
    throw new Error("REFERRAL_NOT_FOUND")
  }

  const [referrer] = await database
    .select({
      id: customShellUsers.id,
      name: customShellUsers.name,
      email: customShellUsers.email,
    })
    .from(customShellUsers)
    .where(
      and(
        eq(customShellUsers.referralCode, code),
        eq(customShellUsers.status, "active")
      )
    )
    .limit(1)

  if (!referrer) {
    throw new Error("REFERRAL_NOT_FOUND")
  }
  if (referrer.id === referred.id || referrer.email === referred.email) {
    throw new Error("SELF_REFERRAL")
  }

  const joined = Boolean(referred.emailVerifiedAt)
  const [referral] = await database
    .insert(customShellReferrals)
    .values({
      id: uuid(),
      referrerUserId: referrer.id,
      referredUserId: referred.id,
      referrerName: referrer.name,
      referrerEmail: referrer.email,
      referredName: referred.name,
      referredEmail: referred.email,
      status: joined ? "joined" : "invited",
      rewardStatus: "not_earned",
      createdAt: timestamp,
      joinedAt: joined ? timestamp : null,
      updatedAt: timestamp,
    })
    .returning({ id: customShellReferrals.id })

  return referral
}

/** Email verification is the point an invited signup becomes a joined member. */
export async function markReferralJoined(
  referredUserId: string,
  database: CustomShellDb = db,
  timestamp = now()
) {
  const [joined] = await database
    .update(customShellReferrals)
    .set({ status: "joined", joinedAt: timestamp, updatedAt: timestamp })
    .where(
      and(
        eq(customShellReferrals.referredUserId, referredUserId),
        eq(customShellReferrals.status, "invited")
      )
    )
    .returning({ id: customShellReferrals.id })

  return Boolean(joined)
}

export type MemberReferralItem = {
  id: string
  status: ReferralStatus
  rewardStatus: ReferralRewardStatus
  createdAt: string
  joinedAt: string | null
  convertedAt: string | null
  grantedAt: string | null
}

export type MemberReferralSummary = {
  inviteLink: string
  total: number
  invited: number
  joined: number
  converted: number
  items: MemberReferralItem[]
}

/** The signed-in member's link, counts, and latest referrals. */
export async function loadMemberReferrals(
  userId: string,
  database: CustomShellDb = db
): Promise<MemberReferralSummary> {
  const [user] = await database
    .select({ referralCode: customShellUsers.referralCode })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .limit(1)
  if (!user) throw new Error("AUTH_REQUIRED")

  const [counts, rows] = await Promise.all([
    database
      .select({
        total: sql<number>`count(*)::int`,
        invited: sql<number>`count(*) filter (where ${customShellReferrals.status} = 'invited')::int`,
        joined: sql<number>`count(*) filter (where ${customShellReferrals.status} = 'joined')::int`,
        converted: sql<number>`count(*) filter (where ${customShellReferrals.status} = 'converted')::int`,
      })
      .from(customShellReferrals)
      .where(eq(customShellReferrals.referrerUserId, userId)),
    database
      .select({
        id: customShellReferrals.id,
        status: customShellReferrals.status,
        rewardStatus: customShellReferrals.rewardStatus,
        createdAt: customShellReferrals.createdAt,
        joinedAt: customShellReferrals.joinedAt,
        convertedAt: customShellReferrals.convertedAt,
        grantedAt: customShellReferrals.grantedAt,
      })
      .from(customShellReferrals)
      .where(eq(customShellReferrals.referrerUserId, userId))
      .orderBy(desc(customShellReferrals.createdAt))
      .limit(MEMBER_REFERRALS_SHOWN),
  ])

  const count = counts[0] ?? { total: 0, invited: 0, joined: 0, converted: 0 }
  return {
    inviteLink: appUrlFor(`/register?ref=${user.referralCode}`),
    ...count,
    items: rows.map((row) => ({
      id: row.id,
      status: referralStatus(row.status),
      rewardStatus: referralRewardStatus(row.rewardStatus),
      createdAt: row.createdAt.toISOString(),
      joinedAt: row.joinedAt?.toISOString() ?? null,
      convertedAt: row.convertedAt?.toISOString() ?? null,
      grantedAt: row.grantedAt?.toISOString() ?? null,
    })),
  }
}

/**
 * Records the first non-zero subscription payment for an invited account.
 * Later invoice events match nothing because the reward is no longer
 * `not_earned`, which is the one-reward rule as an atomic database update.
 */
export async function recordReferralConversion(
  invoice: Stripe.Invoice,
  database: CustomShellDb = db,
  timestamp = now()
) {
  if (
    !invoice.id ||
    invoice.amount_paid <= 0 ||
    !subscriptionInvoice(invoice)
  ) {
    return null
  }

  const referredUserId = await invoiceUserId(invoice, database)
  if (!referredUserId) return null

  const [converted] = await database
    .update(customShellReferrals)
    .set({
      status: "converted",
      rewardStatus: "pending",
      stripeInvoiceId: invoice.id,
      stripePaymentIntentId: invoicePaymentIntentId(invoice),
      joinedAt: sql`coalesce(${customShellReferrals.joinedAt}, ${timestamp})`,
      convertedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(customShellReferrals.referredUserId, referredUserId),
        eq(customShellReferrals.rewardStatus, "not_earned")
      )
    )
    .returning({ id: customShellReferrals.id })

  return converted ?? null
}

function subscriptionInvoice(invoice: Stripe.Invoice) {
  return (
    invoice.parent?.type === "subscription_details" ||
    invoice.billing_reason === "subscription" ||
    invoice.billing_reason?.startsWith("subscription_")
  )
}

async function invoiceUserId(invoice: Stripe.Invoice, database: CustomShellDb) {
  const fromMetadata = invoice.parent?.subscription_details?.metadata?.userId
  if (fromMetadata) return fromMetadata

  const customerId = stripeId(invoice.customer)
  if (!customerId) return null
  const [subscription] = await database
    .select({ userId: customShellSubscriptions.userId })
    .from(customShellSubscriptions)
    .where(eq(customShellSubscriptions.stripeCustomerId, customerId))
    .limit(1)
  return subscription?.userId ?? null
}

function invoicePaymentIntentId(invoice: Stripe.Invoice) {
  for (const payment of invoice.payments?.data ?? []) {
    const id = stripeId(payment.payment.payment_intent)
    if (id) return id
  }
  return null
}

function stripeId(value: { id: string } | string | null | undefined) {
  if (!value) return null
  return typeof value === "string" ? value : value.id
}

type BalanceAdjustment = {
  customerId: string
  amountCents: number
  currency: string
  description: string
  rewardId: string
  idempotencyKey: string
}

export type ReferralBalanceApi = {
  adjust: (adjustment: BalanceAdjustment) => Promise<string>
}

export type ReferralInvoicePaymentApi = {
  paymentIntentForInvoice: (invoiceId: string) => Promise<string | null>
  paymentIntentFullyRefunded: (paymentIntentId: string) => Promise<boolean>
}

const stripeBalanceApi: ReferralBalanceApi = {
  adjust: async (adjustment) => {
    const transaction = await (
      await stripe()
    ).customers.createBalanceTransaction(
      adjustment.customerId,
      {
        amount: adjustment.amountCents,
        currency: adjustment.currency,
        description: adjustment.description,
        metadata: { referralRewardId: adjustment.rewardId },
      },
      { idempotencyKey: adjustment.idempotencyKey }
    )
    return transaction.id
  },
}

const stripeInvoicePaymentApi: ReferralInvoicePaymentApi = {
  paymentIntentForInvoice: async (invoiceId) => {
    const payments = await (
      await stripe()
    ).invoicePayments.list({ invoice: invoiceId, status: "paid", limit: 10 })
    for (const payment of payments.data) {
      const id = stripeId(payment.payment.payment_intent)
      if (id) return id
    }
    return null
  },
  paymentIntentFullyRefunded: async (paymentIntentId) => {
    const client = await stripe()
    const paymentIntent = await client.paymentIntents.retrieve(
      paymentIntentId,
      {
        expand: ["latest_charge"],
      }
    )
    const latestCharge = paymentIntent.latest_charge
    if (!latestCharge) return false
    const charge =
      typeof latestCharge === "string"
        ? await client.charges.retrieve(latestCharge)
        : latestCharge
    return charge.refunded
  },
}

/** Applies one pending free-month reward to the referrer's next Stripe bill. */
export async function grantReferralReward(
  referralId: string,
  database: CustomShellDb = db,
  api: ReferralBalanceApi = stripeBalanceApi,
  timestamp = now()
) {
  return database.transaction(async (tx) => {
    // Granting and refund handling lock the same ledger row. Stripe may answer
    // while the transaction is open, but a refund cannot slip between the
    // credit and the saved status and leave an untracked customer credit.
    const [row] = await tx
      .select({
        referral: customShellReferrals,
        subscription: customShellSubscriptions,
        plan: customShellPlans,
      })
      .from(customShellReferrals)
      .leftJoin(
        customShellSubscriptions,
        eq(customShellSubscriptions.userId, customShellReferrals.referrerUserId)
      )
      .leftJoin(
        customShellPlans,
        eq(customShellPlans.id, customShellSubscriptions.planId)
      )
      .where(eq(customShellReferrals.id, referralId))
      .limit(1)
      .for("update", { of: customShellReferrals })

    if (!row) throw new Error("REFERRAL_NOT_FOUND")
    if (row.referral.rewardStatus === "granted") {
      if (
        !row.referral.rewardAmountCents ||
        !row.referral.rewardCurrency ||
        !row.referral.grantedAt
      ) {
        throw new Error("REFERRAL_REWARD_INCOMPLETE")
      }
      return {
        granted: true,
        amountCents: row.referral.rewardAmountCents,
        currency: row.referral.rewardCurrency,
        grantedAt: row.referral.grantedAt.toISOString(),
      }
    }
    if (row.referral.rewardStatus !== "pending") {
      throw new Error("REWARD_NOT_PENDING")
    }
    if (
      !row.subscription ||
      !row.plan ||
      row.subscription.source !== "stripe" ||
      !row.subscription.stripeCustomerId ||
      !subscriptionIsLive(row.subscription)
    ) {
      throw new Error("REFERRER_NOT_BILLABLE")
    }

    const amountCents = freeMonthCreditCents({
      interval: row.subscription.interval,
      priceMonthlyCents: row.plan.priceMonthlyCents,
      priceYearlyCents: row.plan.priceYearlyCents,
    })
    if (!amountCents) throw new Error("REFERRER_NOT_BILLABLE")

    const customerId = row.subscription.stripeCustomerId
    const currency = row.plan.currency.toLowerCase()
    const balanceTransactionId = await api.adjust({
      customerId,
      amountCents: -amountCents,
      currency,
      description: "One free month for a referral",
      rewardId: row.referral.id,
      idempotencyKey: `referral-reward:${row.referral.id}`,
    })

    await tx
      .update(customShellReferrals)
      .set({
        rewardStatus: "granted",
        rewardAmountCents: amountCents,
        rewardCurrency: currency,
        stripeCustomerId: customerId,
        stripeBalanceTransactionId: balanceTransactionId,
        grantedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(customShellReferrals.id, row.referral.id))

    return {
      granted: true,
      amountCents,
      currency,
      grantedAt: timestamp.toISOString(),
    }
  })
}

/**
 * Takes an earned reward back only after Stripe says the source charge was
 * fully refunded. A pending reward is simply closed. A granted one gets an
 * equal debit because Stripe balance transactions are immutable.
 */
export async function revokeRefundedReferralReward(
  charge: Stripe.Charge,
  database: CustomShellDb = db,
  api: ReferralBalanceApi = stripeBalanceApi,
  timestamp = now()
) {
  const paymentIntentId = stripeId(charge.payment_intent)
  if (!charge.refunded || !paymentIntentId) return null

  return revokeReferralByPaymentIntent(
    paymentIntentId,
    database,
    api,
    timestamp
  )
}

async function revokeReferralByPaymentIntent(
  paymentIntentId: string,
  database: CustomShellDb,
  api: ReferralBalanceApi,
  timestamp: Date
) {
  return database.transaction(async (tx) => {
    const [referral] = await tx
      .select()
      .from(customShellReferrals)
      .where(eq(customShellReferrals.stripePaymentIntentId, paymentIntentId))
      .limit(1)
      .for("update")
    if (!referral || referral.rewardStatus === "revoked") return null

    if (referral.rewardStatus === "granted") {
      if (
        !referral.rewardAmountCents ||
        !referral.rewardCurrency ||
        !referral.stripeCustomerId
      ) {
        throw new Error("REFERRAL_REWARD_INCOMPLETE")
      }
      await api.adjust({
        customerId: referral.stripeCustomerId,
        amountCents: referral.rewardAmountCents,
        currency: referral.rewardCurrency,
        description: "Referral reward reversed after a full refund",
        rewardId: referral.id,
        idempotencyKey: `referral-reward-reversal:${referral.id}`,
      })
    } else if (referral.rewardStatus !== "pending") {
      return null
    }

    const [revoked] = await tx
      .update(customShellReferrals)
      .set({
        rewardStatus: "revoked",
        revokedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(customShellReferrals.id, referral.id))
      .returning({ id: customShellReferrals.id })
    return revoked ?? null
  })
}

async function saveInvoicePaymentIntent(
  invoice: Stripe.Invoice,
  converted: { id: string } | null,
  database: CustomShellDb,
  api: ReferralInvoicePaymentApi
) {
  if (!invoice.id) return null

  const [referral] = converted
    ? await database
        .select({
          id: customShellReferrals.id,
          stripePaymentIntentId: customShellReferrals.stripePaymentIntentId,
        })
        .from(customShellReferrals)
        .where(eq(customShellReferrals.id, converted.id))
        .limit(1)
    : await database
        .select({
          id: customShellReferrals.id,
          stripePaymentIntentId: customShellReferrals.stripePaymentIntentId,
        })
        .from(customShellReferrals)
        .where(eq(customShellReferrals.stripeInvoiceId, invoice.id))
        .limit(1)

  if (!referral) return null
  if (referral.stripePaymentIntentId) {
    return {
      id: referral.id,
      paymentIntentId: referral.stripePaymentIntentId,
    }
  }

  const paymentIntentId = await api.paymentIntentForInvoice(invoice.id)
  if (!paymentIntentId) return { id: referral.id, paymentIntentId: null }

  await database
    .update(customShellReferrals)
    .set({ stripePaymentIntentId: paymentIntentId, updatedAt: now() })
    .where(
      and(
        eq(customShellReferrals.id, referral.id),
        isNull(customShellReferrals.stripePaymentIntentId)
      )
    )
  return { id: referral.id, paymentIntentId }
}

/** Runs only the Stripe events the referral ledger owns. */
export async function applyReferralStripeEvent(
  event: Stripe.Event,
  database: CustomShellDb = db,
  api: ReferralBalanceApi = stripeBalanceApi,
  invoicePaymentApi: ReferralInvoicePaymentApi = stripeInvoicePaymentApi
) {
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice
    const converted = await recordReferralConversion(invoice, database)
    const referralPayment = await saveInvoicePaymentIntent(
      invoice,
      converted,
      database,
      invoicePaymentApi
    )
    if (
      referralPayment?.paymentIntentId &&
      (await invoicePaymentApi.paymentIntentFullyRefunded(
        referralPayment.paymentIntentId
      ))
    ) {
      await revokeReferralByPaymentIntent(
        referralPayment.paymentIntentId,
        database,
        api,
        now()
      )
    }
    return converted ?? (referralPayment ? { id: referralPayment.id } : null)
  }
  if (event.type === "charge.refunded") {
    return revokeRefundedReferralReward(
      event.data.object as Stripe.Charge,
      database,
      api
    )
  }
  return null
}

export type AdminReferralItem = {
  id: string
  referrerUserId: string | null
  referredUserId: string | null
  referrerName: string
  referrerEmail: string
  referredName: string
  referredEmail: string
  status: ReferralStatus
  rewardStatus: ReferralRewardStatus
  createdAt: string
  joinedAt: string | null
  convertedAt: string | null
  grantedAt: string | null
  revokedAt: string | null
  rewardAmountCents: number | null
  rewardCurrency: string | null
}

export type AdminReferralSummary = {
  total: number
  invited: number
  joined: number
  converted: number
  pendingRewards: number
  items: AdminReferralItem[]
}

/** Latest platform-wide referral activity for an administrator. */
export async function loadAdminReferrals(
  database: CustomShellDb = db
): Promise<AdminReferralSummary> {
  const [counts, rows] = await Promise.all([
    database
      .select({
        total: sql<number>`count(*)::int`,
        invited: sql<number>`count(*) filter (where ${customShellReferrals.status} = 'invited')::int`,
        joined: sql<number>`count(*) filter (where ${customShellReferrals.status} = 'joined')::int`,
        converted: sql<number>`count(*) filter (where ${customShellReferrals.status} = 'converted')::int`,
        pendingRewards: sql<number>`count(*) filter (where ${customShellReferrals.rewardStatus} = 'pending')::int`,
      })
      .from(customShellReferrals),
    database
      .select()
      .from(customShellReferrals)
      .orderBy(desc(customShellReferrals.createdAt))
      .limit(ADMIN_REFERRALS_SHOWN),
  ])
  const count = counts[0] ?? {
    total: 0,
    invited: 0,
    joined: 0,
    converted: 0,
    pendingRewards: 0,
  }

  return {
    ...count,
    items: rows.map((row) => ({
      id: row.id,
      referrerUserId: row.referrerUserId,
      referredUserId: row.referredUserId,
      referrerName: row.referrerName,
      referrerEmail: row.referrerEmail,
      referredName: row.referredName,
      referredEmail: row.referredEmail,
      status: referralStatus(row.status),
      rewardStatus: referralRewardStatus(row.rewardStatus),
      createdAt: row.createdAt.toISOString(),
      joinedAt: row.joinedAt?.toISOString() ?? null,
      convertedAt: row.convertedAt?.toISOString() ?? null,
      grantedAt: row.grantedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      rewardAmountCents: row.rewardAmountCents,
      rewardCurrency: row.rewardCurrency,
    })),
  }
}

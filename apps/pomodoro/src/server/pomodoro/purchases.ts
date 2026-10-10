import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm"
import type Stripe from "stripe"

import { appUrlFor } from "@/server/app-url"
import { findSubscription } from "@/server/billing/entitlements"
import { requireBilling, stripe } from "@/server/billing/stripe"
import { db } from "@/server/db"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import { boughtCredits, monthlyLimitFor } from "@/server/pomodoro/generation"
import {
  pomodoroPackUsage,
  pomodoroPurchases,
  type PomodoroPurchase,
} from "@/server/pomodoro/schema"
import {
  PURCHASES,
  SPACE_PRODUCT,
  type PurchaseProduct,
} from "@/lib/pomodoro/purchases"

/**
 * One-off purchases for Pro members (uploads-and-sharing task 07): a pack of
 * AI credits, or 10 GB more space for a year. See "Buying more" in
 * `workspace/docs/pro-perks.md`.
 *
 * Built in the app, not the shell: the shell's checkout sells one subscription
 * per member and its webhook writes that one row, so these are Stripe
 * Checkout in payment mode with an amount from `PURCHASES`, never from the
 * browser. The shell's webhook still receives these sessions and leaves them
 * alone: a payment-mode session has no subscription, so `applyStripeEvent`
 * only records the event id, and the referral handler only acts on invoice
 * payments and their refunds, which these are not.
 *
 * A purchase becomes paid in two ways, whichever comes first: the member's
 * return from Stripe (`confirmPurchase`), or the purchases worker asking
 * Stripe about a session nobody came back from. The same worker notices a
 * refund made in Stripe and takes back what the purchase gave.
 */

/**
 * Stripe's product tax code for the Pomoder account's Managed Payments, the
 * same one the Pro product carries: software as a service for personal use.
 * Without one Checkout refuses with "the product tax code is missing".
 */
const TAX_CODE = "txcd_10103001"

/** The two Stripe reads this module makes, injectable for tests. */
export type PurchaseStripeApi = {
  createSession: (
    params: Stripe.Checkout.SessionCreateParams
  ) => Promise<{ id: string; url: string | null }>
  loadSession: (sessionId: string) => Promise<Stripe.Checkout.Session>
  /** Whether the payment was refunded in full. */
  paymentRefunded: (paymentIntentId: string) => Promise<boolean>
}

const stripeApi: PurchaseStripeApi = {
  createSession: async (params) => (await stripe()).checkout.sessions.create(params),
  loadSession: async (sessionId) => (await stripe()).checkout.sessions.retrieve(sessionId),
  paymentRefunded: async (paymentIntentId) => {
    const intent = await (await stripe()).paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    })
    const charge = intent.latest_charge
    return typeof charge === "object" && charge !== null && charge.refunded
  },
}

/**
 * May this member buy this? Credits need a plan that allows that kind of AI
 * at all, and space needs uploading: a pack is a top-up for Pro, not a way
 * round it.
 */
async function assertCanBuy(userId: string, product: PurchaseProduct) {
  const entitlements = await loadPomodoroEntitlements(userId)
  const item = PURCHASES[product]
  const allowed =
    "kind" in item
      ? monthlyLimitFor(entitlements, item.kind) > 0
      : entitlements.canUploadMedia
  if (!allowed) throw new Error("PRO_REQUIRED")
}

/**
 * Start a checkout for one product and hand back Stripe's page. The row is
 * written first, so the session always has a row to come back to, and Stripe
 * returns the member to `returnPath` with the session id on it.
 */
export async function startPurchase(
  user: { id: string; email: string },
  product: PurchaseProduct,
  returnPath: string,
  api: PurchaseStripeApi = stripeApi
) {
  requireBilling()
  await assertCanBuy(user.id, product)
  const item = PURCHASES[product]

  const [row] = await db
    .insert(pomodoroPurchases)
    .values({ userId: user.id, product, amountCents: item.amountCents })
    .returning({ id: pomodoroPurchases.id })

  const customer = (await findSubscription(user.id))?.stripeCustomerId || undefined
  const joiner = returnPath.includes("?") ? "&" : "?"
  const metadata = { pomodoroPurchaseId: row.id, userId: user.id, product }
  let session: { id: string; url: string | null }
  try {
    session = await api.createSession({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: item.amountCents,
            product_data: { name: `Pomoder: ${item.label}`, tax_code: TAX_CODE },
          },
        },
      ],
      customer,
      customer_email: customer ? undefined : user.email,
      client_reference_id: user.id,
      metadata,
      payment_intent_data: { metadata },
      success_url: appUrlFor(`${returnPath}${joiner}purchase={CHECKOUT_SESSION_ID}`),
      cancel_url: appUrlFor(returnPath),
    })
  } catch (error) {
    await db.delete(pomodoroPurchases).where(eq(pomodoroPurchases.id, row.id))
    throw error
  }
  if (!session.url) throw new Error("CHECKOUT_FAILED")

  await db
    .update(pomodoroPurchases)
    .set({ stripeSessionId: session.id, updatedAt: new Date() })
    .where(eq(pomodoroPurchases.id, row.id))
  return { url: session.url }
}

/**
 * The member is back from Stripe: ask Stripe about that session and record it
 * paid. The id came from the address bar, so a session that is not this
 * member's own is treated as not found. Safe to run twice: only a pending row
 * turns paid.
 */
export async function confirmPurchase(
  userId: string,
  sessionId: string,
  api: PurchaseStripeApi = stripeApi
) {
  const [row] = await db
    .select()
    .from(pomodoroPurchases)
    .where(
      and(
        eq(pomodoroPurchases.stripeSessionId, sessionId),
        eq(pomodoroPurchases.userId, userId)
      )
    )
    .limit(1)
  if (!row) throw new Error("PURCHASE_NOT_FOUND")
  if (row.status !== "pending")
    return { product: row.product as PurchaseProduct, status: row.status }

  const session = await api.loadSession(sessionId)
  if (session.metadata?.userId !== userId) throw new Error("PURCHASE_NOT_FOUND")
  const status = await settleFromSession(row, session)
  return { product: row.product as PurchaseProduct, status }
}

/** Write what Stripe said about a pending row's session. */
async function settleFromSession(row: PomodoroPurchase, session: Stripe.Checkout.Session) {
  if (session.payment_status === "paid") {
    await markPaid(row, idOf(session.payment_intent), session.livemode === true)
    return "paid"
  }
  if (session.status === "expired") {
    await db
      .update(pomodoroPurchases)
      .set({ status: "expired", checkedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(pomodoroPurchases.id, row.id), eq(pomodoroPurchases.status, "pending")))
    return "expired"
  }
  await markChecked(row.id)
  return "pending"
}

async function markChecked(id: string) {
  await db
    .update(pomodoroPurchases)
    .set({ checkedAt: new Date() })
    .where(eq(pomodoroPurchases.id, id))
}

/** Only the message: a Stripe error can carry request details. */
function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "unknown error"
}

/**
 * Paid: credits count from now, and space runs twelve months from now. Only a
 * pending row changes, so the return page and the worker landing together
 * record one purchase.
 */
async function markPaid(
  row: Pick<PomodoroPurchase, "id" | "product">,
  paymentIntentId: string | null,
  livemode: boolean
) {
  const paidAt = new Date()
  const endsAt =
    row.product === SPACE_PRODUCT
      ? addMonths(paidAt, PURCHASES.space_10gb.months)
      : null
  await db
    .update(pomodoroPurchases)
    .set({
      status: "paid",
      paidAt,
      endsAt,
      stripePaymentIntentId: paymentIntentId,
      livemode,
      checkedAt: paidAt,
      updatedAt: paidAt,
    })
    .where(and(eq(pomodoroPurchases.id, row.id), eq(pomodoroPurchases.status, "pending")))
}

/**
 * Past Stripe's own 24-hour expiry a session is still pending only when its
 * payment is slow to arrive (a bank debit), so it is asked about hourly
 * rather than every minute, and it is marked expired only once Stripe says
 * so (audit, 10 Oct 2026). A blind give-up could expire money on its way.
 */
const SLOW_SESSION_MS = 25 * 60 * 60 * 1000
/** A pending session is asked about at most this often. */
const PENDING_CHECK_MS = 60 * 1000
/** A paid purchase is asked about refunds at most this often. */
const REFUND_CHECK_MS = 60 * 60 * 1000
/** Refunds are looked for this long after paying, a little over a year. */
const REFUND_WINDOW_MS = 400 * 24 * 60 * 60 * 1000
/** Stripe calls per worker pass. */
const CHECKS_PER_PASS = 5

/**
 * The `pomodoro-purchases` worker pass, on the shell's fifteen-second loop:
 * settle sessions nobody came back from, and take back what a refund in
 * Stripe took back. At most five Stripe calls a pass.
 */
export async function settlePurchases(api: PurchaseStripeApi = stripeApi) {
  const now = Date.now()
  const pending = await db
    .select()
    .from(pomodoroPurchases)
    .where(
      and(
        eq(pomodoroPurchases.status, "pending"),
        sql`${pomodoroPurchases.stripeSessionId} is not null`,
        lt(pomodoroPurchases.createdAt, new Date(now - PENDING_CHECK_MS)),
        or(
          isNull(pomodoroPurchases.checkedAt),
          and(
            gt(pomodoroPurchases.createdAt, new Date(now - SLOW_SESSION_MS)),
            lt(pomodoroPurchases.checkedAt, new Date(now - PENDING_CHECK_MS))
          ),
          lt(pomodoroPurchases.checkedAt, new Date(now - REFUND_CHECK_MS))
        )
      )
    )
    .orderBy(pomodoroPurchases.createdAt)
    .limit(CHECKS_PER_PASS)

  for (const row of pending) {
    // One session Stripe cannot answer for (a key switched from sandbox to
    // live, say) waits its minute like the rest instead of blocking them.
    await settleFromSession(row, await api.loadSession(row.stripeSessionId!)).catch(
      async (error: unknown) => {
        console.error("purchase session check failed", row.id, messageOf(error))
        await markChecked(row.id)
      }
    )
  }

  const paid = await db
    .select()
    .from(pomodoroPurchases)
    .where(
      and(
        eq(pomodoroPurchases.status, "paid"),
        sql`${pomodoroPurchases.stripePaymentIntentId} is not null`,
        gt(pomodoroPurchases.paidAt, new Date(now - REFUND_WINDOW_MS)),
        or(
          isNull(pomodoroPurchases.checkedAt),
          lt(pomodoroPurchases.checkedAt, new Date(now - REFUND_CHECK_MS))
        )
      )
    )
    .orderBy(pomodoroPurchases.checkedAt)
    .limit(Math.max(0, CHECKS_PER_PASS - pending.length))

  for (const row of paid) {
    const refunded = await api
      .paymentRefunded(row.stripePaymentIntentId!)
      .catch((error: unknown) => {
        console.error("purchase refund check failed", row.id, messageOf(error))
        return false
      })
    if (refunded) await markRefunded(row)
    else await markChecked(row.id)
  }
}

/**
 * A refund in Stripe takes back what the purchase gave. For a credit pack
 * that is the unspent credits only: anything already used from it is
 * forgiven, so a later pack starts full rather than paying off the refunded
 * one (audit, 10 Oct 2026; `pro-perks.md`, Buying more).
 */
async function markRefunded(row: PomodoroPurchase) {
  const item = PURCHASES[row.product as PurchaseProduct]
  await db.transaction(async (tx) => {
    const [changed] = await tx
      .update(pomodoroPurchases)
      .set({ status: "refunded", refundedAt: new Date(), checkedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(pomodoroPurchases.id, row.id), eq(pomodoroPurchases.status, "paid")))
      .returning({ id: pomodoroPurchases.id })
    if (!changed || !("kind" in item)) return
    const [usage] = await tx
      .select()
      .from(pomodoroPackUsage)
      .where(and(eq(pomodoroPackUsage.userId, row.userId), eq(pomodoroPackUsage.kind, item.kind)))
      .for("update")
    if (!usage) return
    const spent = usage.reserved - usage.refunded
    const stillPaid = await boughtCredits(tx, row.userId, item.kind)
    if (spent <= stillPaid) return
    await tx
      .update(pomodoroPackUsage)
      .set({ refunded: usage.refunded + (spent - stillPaid), updatedAt: new Date() })
      .where(and(eq(pomodoroPackUsage.userId, row.userId), eq(pomodoroPackUsage.kind, item.kind)))
  })
}

function idOf(value: string | { id: string } | null) {
  if (!value) return null
  return typeof value === "string" ? value : value.id
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

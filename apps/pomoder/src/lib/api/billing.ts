import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { localPomoderUrl } from "@/lib/app-port"

import { billingEnabled, stripe } from "@/server/billing"
import { db } from "@/server/db"
import { getEntitlements } from "@/server/entitlements"
import { requireAppOrigin } from "@/server/origin"
import { subscriptions } from "@/server/schema"
import { requireUser } from "@/server/security"

const checkoutFn = createServerFn({ method: "POST" }).inputValidator(z.object({ interval: z.enum(["monthly", "yearly"]) })).handler(async ({ data }) => {
  requireAppOrigin()
  if (!billingEnabled()) throw new Error("BILLING_DISABLED")
  const user = await requireUser()
  const existing = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1)
  const price = data.interval === "monthly" ? process.env.STRIPE_MONTHLY_PRICE_ID : process.env.STRIPE_YEARLY_PRICE_ID
  if (!price) throw new Error("BILLING_NOT_CONFIGURED")
  const session = await stripe().checkout.sessions.create({ mode: "subscription", line_items: [{ price, quantity: 1 }], customer: existing[0]?.stripeCustomerId, customer_email: existing.length ? undefined : user.email, client_reference_id: user.id, metadata: { userId: user.id }, subscription_data: { metadata: { userId: user.id } }, success_url: `${appUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${appUrl()}/pricing` })
  if (!session.url) throw new Error("CHECKOUT_FAILED")
  return { url: session.url }
})

const portalFn = createServerFn({ method: "POST" }).handler(async () => {
  requireAppOrigin()
  const user = await requireUser()
  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1)
  if (!subscription) throw new Error("SUBSCRIPTION_NOT_FOUND")
  const session = await stripe().billingPortal.sessions.create({ customer: subscription.stripeCustomerId, return_url: `${appUrl()}/settings` })
  return { url: session.url }
})

const entitlementsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1)
  return getEntitlements(subscription || null)
})

export const createCheckout = (interval: "monthly" | "yearly") => checkoutFn({ data: { interval } })
export const createBillingPortal = () => portalFn()
export const loadEntitlements = () => entitlementsFn()

function appUrl() { return (process.env.POMODER_APP_URL || localPomoderUrl).replace(/\/$/, "") }
